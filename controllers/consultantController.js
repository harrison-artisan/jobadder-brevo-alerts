/**
 * Consultant Newsletter Controller
 *
 * Workflow:
 *   1. GET  /api/consultant/list        — returns consultant list for dropdown
 *   2. GET  /api/consultant/profile/:id — returns full profile for a consultant
 *   3. POST /api/consultant/profile/:id — saves updated profile to consultants.json
 *   4. POST /api/consultant/parse       — validates Gemini JSON, merges with config, saves state
 *   5. GET  /api/consultant/state       — returns current state for dashboard
 *   6. GET  /api/preview/consultant     — renders HTML preview
 *   7. POST /api/consultant/send-test   — sends test email to TEST_EMAIL
 *   8. POST /api/consultant/send        — sends to selected segment/list
 *   9. POST /api/consultant/reset       — clears state
 */

const fs = require("fs");
const path = require("path");
const https = require("https");
const http = require("http");
const axios = require("axios");
const brevoService = require("../services/brevoService");
const modeService = require("../services/modeService");
const jobadderService = require("../services/jobadderService");
const candidateService = require("../services/candidateService");

const ALIST_STATE_FILE = path.join(__dirname, "..", ".alist-state.json");
const WP_API = "https://artisan.com.au/wp-json/wp/v2";
const WP_ARTICLE_CATEGORY = 6; // 'Article' category ID

const { OpenAI } = require("openai");
const client = new OpenAI();

// ============================================================
// Fetch 3 latest Creative Community articles from WordPress
// ============================================================
async function fetchWordPressArticles() {
    try {
        const response = await axios.get(`${WP_API}/posts?categories=${WP_ARTICLE_CATEGORY}&per_page=3&orderby=date&order=desc&_fields=id,title,link,featured_media`, { timeout: 5000 });
        const posts = response.data;
        const articles = await Promise.all(posts.map(async (p) => {
            let image = "https://artisan.com.au/wp-content/uploads/2024/03/artisan_A_RGB_artisan-A-Red.png";
            if (p.featured_media) {
                try {
                    const mediaRes = await axios.get(`${WP_API}/media/${p.featured_media}?_fields=source_url`, { timeout: 3000 });
                    if (mediaRes.data.source_url) image = mediaRes.data.source_url;
                } catch (e) { /* use fallback */ }
            }
            return {
                title: p.title && p.title.rendered ? p.title.rendered : "",
                image,
                link: p.link || "https://artisan.com.au/creative-community/"
            };
        }));
        console.log(`✅ Fetched ${articles.length} WordPress articles`);
        return articles;
    } catch (e) {
        console.warn("⚠️  WordPress article fetch failed:", e.message);
        return [];
    }
}

// ============================================================
// Fetch Instagram post data
// ============================================================
async function fetchInstagramPostData(url) {
    try {
        const cheerio = require("cheerio");
        const response = await axios.get(url, {
            headers: {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36"
            },
            timeout: 5000
        });
        const $ = cheerio.load(response.data);
        const imageUrl = $("meta[property=\"og:image\"]").attr("content");
        const caption = $("meta[property=\"og:description\"]").attr("content");
        const handleMatch = caption ? caption.match(/on Instagram: "([^"]+)"/) : null;
        const handle = handleMatch ? handleMatch[1] : null;

        return { imageUrl, caption, handle };
    } catch (e) {
        console.warn(`⚠️  Instagram scrape failed for ${url}: ${e.message}`);
        return { imageUrl: null, caption: null, handle: null };
    }
}

// ============================================================
// Auto-pull first candidate from A-List state or live JobAdder
// ============================================================
function getAListCandidateFromState() {
    try {
        if (!fs.existsSync(ALIST_STATE_FILE)) return null;
        const state = JSON.parse(fs.readFileSync(ALIST_STATE_FILE, "utf8"));
        if (!state || !state.candidates || state.candidates.length === 0) return null;
        const c = state.candidates[0];
        return {
            title: c.title || c.currentJobTitle || "",
            image_url: c.photo || c.image_url || c.avatar_url || "https://artisan.com.au/wp-content/uploads/2024/03/artisan_A_RGB_artisan-A-Red.png",
            mailto_link: c.mailto_link || `mailto:?subject=A-List Talent Request: ${c.title}&body=Hi, I am interested in viewing the folio for ${c.title}.`,
            candidateId: c.candidateId || ""
        };
    } catch (e) {
        console.warn("⚠️  Could not read A-List state:", e.message);
        return null;
    }
}

async function fetchAListCandidateLive() {
    try {
        console.log("🔍 Fetching live candidate from JobAdder...");
        const candidates = await jobadderService.getAListCandidates();
        if (!candidates || candidates.length === 0) {
            console.log("ℹ️  No recent candidates found in JobAdder");
            return null;
        }
        const c = candidates[0];
        return {
            title: c.currentJobTitle || "Creative Professional",
            image_url: c.photo || "https://artisan.com.au/wp-content/uploads/2024/03/artisan_A_RGB_artisan-A-Red.png",
            mailto_link: `mailto:?subject=A-List Talent Request: ${c.currentJobTitle}&body=Hi, I am interested in viewing the folio for this candidate.`,
            candidateId: c.candidateId || ""
        };
    } catch (e) {
        console.warn("⚠️  Live candidate fetch failed:", e.message);
        return null;
    }
}

async function fetchLiveJob() {
    for (let attempt = 1; attempt <= 2; attempt++) {
        try {
            console.log(`📋 Fetching live job from JobAdder (attempt ${attempt})...`);
            const liveJobs = await jobadderService.getLiveJobs();
            if (!liveJobs || liveJobs.length === 0) return null;
            
            const job = liveJobs[0];
            const formatted = jobadderService.formatJobForEmail(job);
            console.log(`✅ Live job fetched: ${formatted.job_title}`);
            return {
                title: formatted.job_title || "",
                type: formatted.job_type || "Full Time",
                location: formatted.location || "",
                description: formatted.job_description || "",
                link: formatted.apply_url || "https://clientapps.jobadder.com/67514/artisan"
            };
        } catch (e) {
            console.warn(`⚠️  Live job fetch attempt ${attempt} failed: ${e.message}`);
            if (attempt < 2) await new Promise(r => setTimeout(r, 2000));
        }
    }
    return null;
}

const STATE_FILE = path.join(__dirname, "..", ".consultant-state.json");
const CONSULTANTS_FILE = path.join(__dirname, "..", "config", "consultants.json");
const TEMPLATE_FILE = path.join(__dirname, "..", "templates", "brevo_consultant_for_brevo.html");

function readState() {
    if (!fs.existsSync(STATE_FILE)) return { state: "EMPTY" };
    try { return JSON.parse(fs.readFileSync(STATE_FILE, "utf8")); } catch (e) { return { state: "EMPTY" }; }
}

function writeState(data) {
    fs.writeFileSync(STATE_FILE, JSON.stringify(data, null, 2));
}

function loadConsultants() {
    try {
        return JSON.parse(fs.readFileSync(CONSULTANTS_FILE, "utf8"));
    } catch (e) {
        throw new Error("Could not load consultants config.");
    }
}

// ============================================================
// Controller Methods
// ============================================================

function getState(req, res) {
    res.json({ success: true, state: readState() });
}

function getConsultantList(req, res) {
    try {
        const consultants = loadConsultants();
        const list = Object.keys(consultants).map(id => ({
            id,
            name: consultants[id].name,
            newsletter_name: consultants[id].newsletter_name || consultants[id].name
        }));
        res.json({ consultants: list });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
}

function getProfile(req, res) {
    try {
        const consultants = loadConsultants();
        const profile = consultants[req.params.id];
        if (!profile) return res.status(404).json({ success: false, message: "Consultant not found" });
        res.json({ success: true, profile });
    } catch (e) {
        res.status(500).json({ success: false, message: e.message });
    }
}

function saveProfile(req, res) {
    try {
        const id = req.params.id;
        const consultants = loadConsultants();
        if (!consultants[id]) return res.status(404).json({ success: false, message: "Consultant not found" });
        Object.assign(consultants[id], req.body);
        fs.writeFileSync(CONSULTANTS_FILE, JSON.stringify(consultants, null, 2));
        res.json({ success: true, profile: consultants[id] });
    } catch (e) {
        res.status(500).json({ success: false, message: e.message });
    }
}

async function parseJSON(req, res) {
    const { json } = req.body;
    let parsed;
    try { parsed = JSON.parse(json); } catch (e) { return res.status(400).json({ success: false, message: "Invalid JSON" }); }

    const consultants = loadConsultants();
    const consultantConfig = consultants[parsed.consultant];
    if (!consultantConfig) return res.status(400).json({ success: false, message: "Unknown consultant" });

    const wpArticles = await fetchWordPressArticles();
    const articles = [parsed.article1 || wpArticles[0] || {}, parsed.article2 || wpArticles[1] || {}, parsed.article3 || wpArticles[2] || {}];
    const alistCandidate = getAListCandidateFromState() || await fetchAListCandidateLive();
    const liveJob = await fetchLiveJob();

    const templateParams = buildTemplateParams(consultantConfig, parsed, parsed.media || [], articles, alistCandidate, liveJob);
    const state = {
        state: "GENERATED",
        generatedAt: new Date().toISOString(),
        consultant: consultantConfig,
        content: { ...parsed, articles, alist_candidate: alistCandidate, live_job: liveJob },
        templateParams
    };
    writeState(state);
    res.json({ success: true, state });
}

// ============================================================
// Parse CSV
// ============================================================
async function parseCsv(req, res) {
    try {
        if (!req.file) return res.status(400).json({ success: false, message: "No CSV file uploaded." });

        const csv = req.file.buffer.toString("utf8");
        const Papa = require("papaparse");
        const results = Papa.parse(csv, { header: true, skipEmptyLines: true });
        const data = results.data;

        if (data.length === 0) return res.status(400).json({ success: false, message: "CSV is empty or could not be parsed." });

        const consultants = loadConsultants();
        const consultantId = req.body.consultantId; // Get consultantId from form data
        const consultantConfig = consultants[consultantId];
        if (!consultantConfig) return res.status(400).json({ success: false, message: "Unknown consultant." });

        // --- Extract Data from CSV --- //
        let parsedContent = {};
        let mediaArray = [];
        let articles = [];
        let instagram_grid = [];
        let instagram_caption = "";
        let life_update_images = [];
        let events = [];

        // Helper to find a value by header, case-insensitive
        const findValue = (row, headers) => {
            for (const header of headers) {
                const key = Object.keys(row).find(k => k.toLowerCase() === header.toLowerCase());
                if (key && row[key]) return row[key];
            }
            return "";
        };

        // Process each row
        data.forEach(row => {
            const section = findValue(row, ["Section"]);
            const type = findValue(row, ["Type"]);

            if (section.toLowerCase() === "industry insight") {
                parsedContent.industry_insight_heading = findValue(row, ["Heading", "Title"]);
                parsedContent.industry_insight_body = findValue(row, ["Body", "Content"]);
            } else if (section.toLowerCase() === "life update") {
                parsedContent.life_update_heading = findValue(row, ["Heading", "Title"]);
                parsedContent.life_update_body = findValue(row, ["Body", "Content"]);
                const imageUrl = findValue(row, ["Image URL", "Image"]);
                if (imageUrl) life_update_images.push(imageUrl);
            } else if (section.toLowerCase() === "media") {
                const mediaItem = {
                    type: type.toLowerCase(),
                    title: findValue(row, ["Title"]),
                    description: findValue(row, ["Description"]),
                    url: findValue(row, ["URL", "Link"]),
                    thumbnail: findValue(row, ["Thumbnail", "Image"])
                };
                if (mediaItem.url) mediaArray.push(mediaItem);
            } else if (section.toLowerCase() === "instagram") {
                const imageUrl = findValue(row, ["Image URL", "Image"]);
                if (imageUrl) instagram_grid.push(imageUrl);
                const caption = findValue(row, ["Caption"]);
                if (caption) instagram_caption = caption; // Assuming one caption for all images
            } else if (section.toLowerCase() === "worth reading") {
                const articleItem = {
                    title: findValue(row, ["Title"]),
                    image: findValue(row, ["Image URL", "Image"]),
                    link: findValue(row, ["URL", "Link"])
                };
                if (articleItem.link) articles.push(articleItem);
            } else if (section.toLowerCase() === "events") {
                const eventItem = {
                    title: findValue(row, ["Title"]),
                    description: findValue(row, ["Description"]),
                    date: findValue(row, ["Date"]),
                    day: findValue(row, ["Day"]),
                    month: findValue(row, ["Month"]),
                    link: findValue(row, ["URL", "Link"])
                };
                if (eventItem.title) events.push(eventItem);
            }
        });

        // Fetch dynamic content
        const wpArticles = await fetchWordPressArticles();
        // Only use WP articles if no articles were provided in CSV
        if (articles.length === 0) {
            articles = [wpArticles[0] || {}, wpArticles[1] || {}, wpArticles[2] || {}];
        }

        const alistCandidate = getAListCandidateFromState() || await fetchAListCandidateLive();
        const liveJob = await fetchLiveJob();

        // Determine section visibility based on parsed content
        const sections = {
            industry_insight: !!parsedContent.industry_insight_heading || !!parsedContent.industry_insight_body,
            life_update: !!parsedContent.life_update_heading || !!parsedContent.life_update_body || life_update_images.length > 0,
            media: mediaArray.length > 0,
            instagram: instagram_grid.length > 0,
            events: events.length > 0,
            alist: !!alistCandidate,
            job: !!liveJob,
            articles: articles.length > 0
        };

        const templateParams = buildTemplateParams(
            consultantConfig,
            { ...parsedContent, life_update_images, instagram_caption, instagram_grid, events }, // Pass all parsed content
            mediaArray,
            articles,
            alistCandidate,
            liveJob,
            sections
        );

        const state = {
            state: "GENERATED",
            generatedAt: new Date().toISOString(),
            consultant: consultantConfig,
            content: { ...parsedContent, articles, alist_candidate: alistCandidate, live_job: liveJob, media: mediaArray, instagram_grid, instagram_caption, life_update_images, events },
            sections: sections, // Store sections in state
            templateParams
        };
        writeState(state);
        res.json({ success: true, state });

    } catch (e) {
        console.error("Error parsing CSV:", e);
        res.status(500).json({ success: false, message: e.message });
    }
}

// ============================================================
// Build Template Params
// ============================================================
function buildTemplateParams(consultant, content, mediaArray, articles, alistCandidate, liveJob, sections) {
    const fallbackImg = "https://artisan.com.au/wp-content/uploads/2024/03/artisan_A_RGB_artisan-A-Red.png";

    // Ensure content.events is an array
    const contentEvents = Array.isArray(content.events) ? content.events : [];

    // Combine events from content and any passed directly
    const finalEvents = [...contentEvents, ...(Array.isArray(events) ? events : [])];

    // Ensure instagram_grid is an array
    const instagram_grid_final = Array.isArray(content.instagram_grid) ? content.instagram_grid : [];
    const instagram_caption_final = (content.instagram_caption || "").replace(/\n/g, "<br>");
    const insta_img_1 = instagram_grid_final[0] || "";
    const insta_img_2 = instagram_grid_final[1] || "";
    const insta_img_3 = instagram_grid_final[2] || "";
    const insta_img_4 = instagram_grid_final[3] || "";

    // Ensure sections object is properly structured
    const finalSections = {
        industry_insight: sections.industry_insight || false,
        life_update: sections.life_update || false,
        media: sections.media || false,
        instagram: sections.instagram || false,
        events: sections.events || false,
        alist: sections.alist || false,
        job: sections.job || false,
        articles: sections.articles || false,
    };

    return {
        consultant: {
            ...consultant,
            newsletter_name: consultant.newsletter_name || `${consultant.name}'s Newsletter`,
            linkedin: consultant.linkedin || "#",
            calendar_link: consultant.calendar_link || "#"
        },
        sections: finalSections,
        content: {
            preheader_text: content.preheader_text || "Your weekly dose of creative industry insights.",
            industry_insight_heading: content.industry_insight_heading || "",
            industry_insight_body: content.industry_insight_body || "",
            life_update_heading: content.life_update_heading || "",
            life_update_body: content.life_update_body || "",
            life_update_images: content.life_update_images || [],
        },
        mediaArray: (mediaArray || []).map(m => ({
            type: m.type || "video",
            title: m.title || "",
            description: m.description || "",
            url: m.url || "#",
            thumbnail: m.thumbnail || fallbackImg
        })),
        instagram_grid: instagram_grid_final,
        insta_img_1: insta_img_1,
        insta_img_2: insta_img_2,
        insta_img_3: insta_img_3,
        insta_img_4: insta_img_4,
        instagram_caption: instagram_caption_final,
        job: {
            has_job: !!(liveJob && liveJob.title),
            title: liveJob ? liveJob.title : "",
            type: liveJob ? liveJob.type : "Full Time",
            location: liveJob ? liveJob.location : "",
            description: liveJob ? liveJob.description : "",
            link: liveJob ? liveJob.link : "https://clientapps.jobadder.com/67514/artisan"
        },
        alist: {
            has_candidate: !!alistCandidate,
            title: alistCandidate ? alistCandidate.title : "",
            image: alistCandidate ? (alistCandidate.image_url || fallbackImg) : fallbackImg,
            link: alistCandidate ? alistCandidate.mailto_link : ""
        },
        articles: (articles || []).slice(0, 3).map(a => ({
            title: a.title || "",
            image: a.image || fallbackImg,
            link: a.link || "https://artisan.com.au/creative-community/"
        })),
        events: (finalEvents || []).map(e => {
            const day = e.day || "";
            const month = (e.month || "").toUpperCase();
            const link = e.link || e.url || "";
            
            let finalDay = day;
            let finalMonth = month;
            if (e.date && (!day || !month)) {
                const parts = e.date.trim().split(/\s+/);
                if (parts.length >= 2) {
                    finalDay = parts[0];
                    finalMonth = parts[1].toUpperCase();
                }
            }

            return {
                ...e,
                day: finalDay,
                month: finalMonth,
                link: link,
                url: link
            };
        })
    };
}

async function previewConsultant(req, res) {
    try {
        const state = readState();
        if (state.state === "EMPTY" || !state.templateParams) {
            return res.send("<div style=\"padding:40px;text-align:center;\"><h2>No content yet</h2></div>");
        }
        const emailPreviewService = require("../services/emailPreviewService");
        const templateHtml = fs.readFileSync(TEMPLATE_FILE, "utf8");
        const html = emailPreviewService.replaceTemplateVariables(templateHtml, { params: state.templateParams });
        res.send(html);
    } catch (e) {
        res.status(500).send(e.message);
    }
}

async function sendTest(req, res) {
    try {
        const state = readState();
        if (state.state === "EMPTY") return res.status(400).json({ success: false, message: "No content to test. Please parse or build first." });
        
        const testEmail = process.env.TEST_EMAIL || "test@artisan.com.au";
        const templateId = state.consultant.brevo_template_id;
        
        if (!templateId) {
            return res.status(400).json({ success: false, message: "No Brevo template ID found for this consultant." });
        }

        await brevoService.sendBatchEmail([{ email: testEmail }], parseInt(templateId), state.templateParams);
        
        res.json({ success: true, message: `Test email sent to ${testEmail}` });
    } catch (e) {
        console.error("Error in sendTest:", e);
        res.status(500).json({ success: false, message: e.message });
    }
}

async function sendToAll(req, res) {
    try {
        const state = readState();
        if (state.state === "EMPTY") return res.status(400).json({ success: false, message: "No content to send." });

        const { recipientType, recipientId } = req.body;
        let recipients = [];
        if (recipientType === "segment") recipients = await brevoService.getSegmentContacts(recipientId);
        else if (recipientType === "list") recipients = await brevoService.getListContacts(recipientId);

        if (recipients.length === 0) {
            return res.status(400).json({ success: false, message: "No recipients found." });
        }

        const templateId = state.consultant.brevo_template_id;
        if (!templateId) {
            return res.status(400).json({ success: false, message: "No Brevo template ID found." });
        }

        await brevoService.sendBatchEmail(recipients, parseInt(templateId), state.templateParams);
        
        res.json({ success: true, message: `Newsletter sent successfully to ${recipients.length} recipients.` });
    } catch (e) {
        console.error("Error in sendToAll:", e);
        res.status(500).json({ success: false, message: e.message });
    }
}

async function updateSections(req, res) {
    try {
        const { consultantId, sections, content, events, media, instagram_grid, life_update_images } = req.body;
        const state = readState();
        if (state.state === "EMPTY") return res.status(400).json({ success: false, message: "Empty state" });

        // Re-verify consultant metadata if missing or changed
        if (consultantId && (!state.consultant || state.consultant.id !== consultantId)) {
            const consultants = loadConsultants();
            if (consultants[consultantId]) {
                state.consultant = consultants[consultantId];
            }
        }

        // 1. Update Section Visibility
        if (sections) {
            state.sections = {
                industry_insight: !!sections.industry_insight,
                life_update: !!sections.life_update,
                media: !!sections.media,
                instagram: !!sections.instagram || !!sections.instagram_grid,
                events: !!sections.events,
                alist: !!sections.alist,
                job: !!sections.job,
                articles: !!sections.articles
            };
            state.content.sections = state.sections;
        }
        
        // 2. Update Content Fields (Mapping from dashboard fields)
        if (content) {
            if (content.industry_insight) {
                state.content.industry_insight_heading = content.industry_insight.title || content.industry_insight.heading || "";
                state.content.industry_insight_body = content.industry_insight.body || "";
                // Sync legacy objects for buildTemplateParams
                state.content.industry_insight = {
                    heading: state.content.industry_insight_heading,
                    body: state.content.industry_insight_body
                };
            }
            if (content.personal_update) {
                state.content.life_update_heading = content.personal_update.title || content.personal_update.heading || "";
                state.content.life_update_body = content.personal_update.body || "";
                // Sync legacy objects for buildTemplateParams
                state.content.life_update = {
                    heading: state.content.life_update_heading,
                    body: state.content.life_update_body,
                    images: state.content.life_update_images || []
                };
            }
            if (content.instagram) {
                state.content.instagram_caption = String(content.instagram.caption || "");
                state.content.instagram_grid = (instagram_grid && instagram_grid.length > 0) ? instagram_grid : (state.content.instagram_grid || []);
            }
        }
        
        // 3. Update Arrays with safety stripping of base64 data: URLs (Brevo doesn't support them)
        if (events) {
            state.content.events = events.map(e => ({
                ...e,
                image: (e.image && e.image.startsWith("data:")) ? "" : e.image
            }));
        }
        if (media) {
            state.content.media = media.map(m => ({
                ...m,
                url: (m.url && m.url.startsWith("data:")) ? "" : m.url,
                thumbnail: (m.thumbnail && m.thumbnail.startsWith("data:")) ? "" : m.thumbnail
            }));
        }
        state.content.instagram_grid = (instagram_grid || state.content.instagram_grid || []).filter(url => url && !url.startsWith("data:"));
        state.content.life_update_images = (life_update_images || state.content.life_update_images || []).filter(url => url && !url.startsWith("data:"));

        // 4. Rebuild templateParams using the same logic as initial build
        state.templateParams = buildTemplateParams(
            state.consultant,
            state.content,
            state.content.media,
            state.content.articles,
            state.content.alist_candidate,
            state.content.live_job,
            state.sections
        );
        
        writeState(state);
        res.json({ success: true, state });
    } catch (e) {
        console.error("Error in updateSections:", e);
        res.status(500).json({ success: false, message: e.message });
    }
}

function resetState(req, res) {
    writeState({ state: "EMPTY" });
    res.json({ success: true });
}

module.exports = {
    getState,
    getConsultantList,
    getProfile,
    saveProfile,
    parseJSON,
    parseCsv,
    previewConsultant,
    sendTest,
    sendToAll,
    resetState,
    updateSections
};
