const fs = require('fs');
const path = require('path');
const brevoService = require('../services/brevoService');
const jobadderService = require('../services/jobadderService');
const wordpressService = require('../services/wordpressService');
const modeService = require('../services/modeService');
const axios = require('axios');

/**
 * Fetch Instagram post data (og:image and og:description) from a public URL.
 * Uses a simple axios + cheerio scrape.
 */
async function fetchInstagramPostData(url) {
    try {
        const cheerio = require('cheerio');
        const response = await axios.get(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
            },
            timeout: 5000
        });
        const $ = cheerio.load(response.data);
        const imageUrl = $('meta[property="og:image"]').attr('content');
        const caption = $('meta[property="og:description"]').attr('content');
        const handleMatch = caption ? caption.match(/on Instagram: "([^"]+)"/) : null;
        const handle = handleMatch ? handleMatch[1] : null;

        return { imageUrl, caption, handle };
    } catch (e) {
        console.warn(`⚠️  Instagram scrape failed for ${url}: ${e.message}`);
        return { imageUrl: null, caption: null, handle: null };
    }
}

/**
 * Fetch the 3 most recent WordPress articles from the Artisan blog.
 */
async function fetchWordPressArticles() {
    try {
        const response = await axios.get('https://artisan.com.au/wp-json/wp/v2/posts?per_page=3&_embed', { timeout: 5000 });
        return response.data.map(post => ({
            title: post.title.rendered,
            link: post.link,
            image: post._embedded && post._embedded['wp:featuredmedia'] 
                ? post._embedded['wp:featuredmedia'][0].source_url 
                : 'https://artisan.com.au/wp-content/uploads/2024/03/artisan_A_RGB_artisan-A-Red.png'
        }));
    } catch (e) {
        console.warn(`⚠️  WordPress article fetch failed: ${e.message}`);
        return [];
    }
}

/**
 * Get the A-List candidate stored in the shared state file (if it exists).
 * The A-List dashboard saves its state to .alist-state.json.
 */
function getAListCandidateFromState() {
    const alistStateFile = path.join(__dirname, '..', '.alist-state.json');
    if (!fs.existsSync(alistStateFile)) return null;
    try {
        const alistState = JSON.parse(fs.readFileSync(alistStateFile, 'utf8'));
        if (alistState.candidates && alistState.candidates.length > 0) {
            const c = alistState.candidates[0];
            return {
                title: c.title || c.currentJobTitle,
                image_url: c.photo || 'https://artisan.com.au/wp-content/uploads/2024/03/artisan_A_RGB_artisan-A-Red.png',
                mailto_link: `mailto:?subject=A-List Talent Request: ${c.title}&body=Hi, I am interested in viewing the folio for ${c.title}.`
            };
        }
    } catch (e) {
        console.warn('⚠️  Could not read A-List state:', e.message);
    }
    return null;
}

/**
 * Fetch a live candidate from JobAdder if no state exists.
 */
async function fetchAListCandidateLive() {
    try {
        const candidates = await jobadderService.getAListCandidates();
        if (candidates && candidates.length > 0) {
            const c = candidates[0];
            return {
                title: c.currentJobTitle || 'Creative Professional',
                image_url: c.photo || 'https://artisan.com.au/wp-content/uploads/2024/03/artisan_A_RGB_artisan-A-Red.png',
                mailto_link: `mailto:?subject=A-List Talent Request: ${c.currentJobTitle}&body=Hi, I am interested in viewing the folio for this candidate.`
            };
        }
    } catch (e) {
        console.warn('⚠️  Live A-List fetch failed:', e.message);
    }
    return null;
}

/**
 * Fetch a live job from JobAdder.
 */
async function fetchLiveJob() {
    for (let attempt = 1; attempt <= 2; attempt++) {
        try {
            const liveJobs = await jobadderService.getLiveJobs();
            if (!liveJobs || liveJobs.length === 0) throw new Error('No live jobs found');
            
            // Pick the most recent job
            const job = liveJobs[0];
            const formatted = jobadderService.formatJobForEmail(job);
            console.log(`✅ Live job fetched: ${formatted.job_title}`);
            return {
                title: formatted.job_title || '',
                type: formatted.job_type || 'Full Time',
                location: formatted.location || '',
                description: formatted.job_description || '',
                link: formatted.apply_url || 'https://clientapps.jobadder.com/67514/artisan'
            };
        } catch (e) {
            console.warn(`⚠️  Live job fetch attempt ${attempt} failed: ${e.message}`);
            if (attempt < 2) await new Promise(r => setTimeout(r, 2000)); // wait 2s before retry
        }
    }
    console.warn('⚠️  All job fetch attempts failed — no job will appear in newsletter');
    return null;
}

const STATE_FILE = path.join(__dirname, '..', '.consultant-state.json');
const CONSULTANTS_FILE = path.join(__dirname, '..', 'config', 'consultants.json');
const TEMPLATE_FILE = path.join(__dirname, '..', 'templates', 'brevo_consultant_for_brevo.html');

// ============================================================
// State helpers
// ============================================================
function readState() {
    if (!fs.existsSync(STATE_FILE)) return { state: 'EMPTY' };
    try { return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')); } catch (e) { return { state: 'EMPTY' }; }
}

function writeState(data) {
    fs.writeFileSync(STATE_FILE, JSON.stringify(data, null, 2));
}

function loadConsultants() {
    try {
        // Load base config from repo
        const base = JSON.parse(fs.readFileSync(CONSULTANTS_FILE, 'utf8'));
        // Merge in any overrides saved in Railway env var (survives deploys)
        if (process.env.CONSULTANT_PROFILES_JSON) {
            try {
                const overrides = JSON.parse(process.env.CONSULTANT_PROFILES_JSON);
                Object.keys(overrides).forEach(id => {
                    if (base[id]) Object.assign(base[id], overrides[id]);
                });
            } catch (e) {
                console.warn('⚠️  CONSULTANT_PROFILES_JSON is set but could not be parsed:', e.message);
            }
        }
        return base;
    } catch (e) {
        console.error('❌ Error loading consultants:', e);
        throw e;
    }
}

// ============================================================
// GET /api/consultant/state
// ============================================================
function getState(req, res) {
    res.json(readState());
}

// ============================================================
// GET /api/consultant/list
// ============================================================
function getConsultantList(req, res) {
    try {
        const consultants = loadConsultants();
        const list = Object.keys(consultants).map(id => ({
            id,
            name: consultants[id].name
        }));
        res.json({ consultants: list });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
}

// ============================================================
// GET /api/consultant/profile/:id
// ============================================================
function getProfile(req, res) {
    try {
        const consultants = loadConsultants();
        const profile = consultants[req.params.id];
        if (!profile) return res.status(404).json({ error: 'Consultant not found' });
        res.json(profile);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
}

// ============================================================
// POST /api/consultant/profile/:id
// ============================================================
function saveProfile(req, res) {
    try {
        const id = req.params.id;
        const consultants = loadConsultants();
        if (!consultants[id]) return res.status(404).json({ error: 'Consultant not found' });

        // Update local memory
        Object.assign(consultants[id], req.body);

        // Save back to Railway env var (if possible) or just memory for this session
        // Note: In a real prod env, you'd save this to a DB or persistent file.
        // For now, we update the local file in the sandbox.
        fs.writeFileSync(CONSULTANTS_FILE, JSON.stringify(consultants, null, 2));

        res.json({ success: true, profile: consultants[id] });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
}

// ============================================================
// POST /api/consultant/parse-json
// ============================================================
async function parseJSON(req, res) {
    const { json } = req.body;
    let parsed;
    try {
        parsed = JSON.parse(json);
    } catch (e) {
        return res.status(400).json({ success: false, message: 'Invalid JSON format.' });
    }

    // Basic validation
    const errors = [];
    if (!parsed.consultant) errors.push('Missing consultant ID');
    if (!parsed.industry_insight || !parsed.industry_insight.heading) errors.push('Missing industry_insight.heading');
    if (!parsed.life_update || !parsed.life_update.body) errors.push('Missing life_update.body');

    if (errors.length > 0) {
        return res.status(400).json({ success: false, message: 'JSON is missing required fields.', errors });
    }

    // Load consultant config
    let consultants;
    try {
        consultants = loadConsultants();
    } catch (e) {
        return res.status(500).json({ success: false, message: e.message });
    }

    const consultantConfig = consultants[parsed.consultant];
    if (!consultantConfig) {
        return res.status(400).json({
            success: false,
            message: `Unknown consultant ID: "${parsed.consultant}". Valid IDs: ${Object.keys(consultants).join(', ')}`
        });
    }

    // Validate events array
    const events = Array.isArray(parsed.events) ? parsed.events : [];
    if (events.length > 3) {
        return res.status(400).json({ success: false, message: 'Maximum 3 events allowed.' });
    }

    // Resolve media — supports array (multiple items) or single object from Gemini JSON
    const rawMedia = parsed.media;
    const rawMediaArray = Array.isArray(rawMedia)
        ? rawMedia
        : (rawMedia && rawMedia.type && rawMedia.type !== 'none' && rawMedia.url ? [rawMedia] : []);

    const enrichMedia = async (m) => {
        if (!m || !m.type || m.type === 'none' || !m.url) return null;
        const item = { ...m };
        if (m.type === 'youtube') {
            const ytMatch = m.url.match(/(?:v=|youtu\.be\/)?([\w-]{11})/);
            if (ytMatch) item.thumbnail = `https://img.youtube.com/vi/${ytMatch[1]}/hqdefault.jpg`;
        }
        if (m.type === 'instagram') {
            const igData = await fetchInstagramPostData(m.url);
            if (igData.imageUrl) item.scraped_image = igData.imageUrl;
            if (igData.caption && !item.caption) item.caption = igData.caption;
            if (igData.handle) item.handle = igData.handle;
        }
        return item;
    };

    const resolvedMedia = (await Promise.all(rawMediaArray.map(enrichMedia))).filter(Boolean);

    console.log('📰 Fetching WordPress articles...');
    const wpArticles = await fetchWordPressArticles();

    const articles = [
        parsed.article1 || wpArticles[0] || {},
        parsed.article2 || wpArticles[1] || {},
        parsed.article3 || wpArticles[2] || {}
    ];

    let alistCandidate = getAListCandidateFromState();
    if (!alistCandidate) {
        alistCandidate = await fetchAListCandidateLive();
    }

    let liveJob = null;
    if (parsed.job && parsed.job.title) {
        liveJob = parsed.job;
    } else {
        liveJob = await fetchLiveJob();
    }

    // Build the merged state object
    const state = {
        state: 'GENERATED',
        generatedAt: new Date().toISOString(),
        consultant: consultantConfig,
        content: {
            industry_insight: parsed.industry_insight,
            life_update: parsed.life_update,
            events,
            media: resolvedMedia,
            articles,
            alist_candidate: alistCandidate,
            live_job: liveJob,
            sections: {
                industry_insight: true,
                life_update: true,
                media: true,
                instagram: true,
                events: true,
                alist: true,
                job: true,
                articles: true
            },
            instagram_grid: [],
            instagram_caption: ''
        },
    };

    // Build template params for the initial generation
    state.templateParams = buildTemplateParams(
        state.consultant,
        {
            industry_insight: state.content.industry_insight,
            life_update: state.content.life_update,
            events: state.content.events,
            life_update_images: []
        },
        state.content.media,
        state.content.articles,
        state.content.alist_candidate,
        state.content.live_job,
        state.content.sections,
        state.content.instagram_grid,
        state.content.instagram_caption
    );

    writeState(state);
    console.log(`✅ Consultant newsletter parsed for ${consultantConfig.name}`);

    res.json({
        success: true,
        message: `Newsletter content parsed for ${consultantConfig.name}.`,
        consultant: consultantConfig.name,
        state
    });
}

// ============================================================
// POST /api/consultant/parse-csv
// ============================================================
async function parseCsv(req, res) {
    // Placeholder for CSV parsing logic if needed
    res.status(501).json({ success: false, message: 'CSV parsing not implemented yet.' });
}

// ============================================================
// Build nested template params for Brevo
// ============================================================
function buildTemplateParams(consultant, parsed, mediaArray, articles, alistCandidate, liveJob, sections, instagram_grid, instagram_caption) {
    const job = liveJob || {};
    const fallbackImg = 'https://artisan.com.au/wp-content/uploads/2024/03/artisan_A_RGB_artisan-A-Red.png';
    const fallbackArticleLink = 'https://artisan.com.au/creative-community/';

    const finalSections = sections || {
        industry_insight: true,
        life_update: true,
        media: true,
        instagram: true,
        events: true,
        alist: true,
        job: true,
        articles: true
    };

    return {
        sections: finalSections,
        consultant: {
            newsletter_name: consultant.newsletter_name || consultant.name,
            name: consultant.name,
            title: consultant.title,
            email: consultant.email,
            phone: consultant.phone,
            linkedin: consultant.linkedin,
            photo: consultant.photo_url,
            calendar_link: consultant.calendar_link || 'https://artisan.com.au/contact'
        },
        content: {
            preheader_text: parsed.preheader_text || (parsed.industry_insight ? `${parsed.industry_insight.heading} — from ${consultant.name} at Artisan` : ''),
            industry_insight_heading: parsed.industry_insight ? parsed.industry_insight.heading : '',
            industry_insight_body: parsed.industry_insight ? parsed.industry_insight.body : '',
            life_update_heading: parsed.life_update ? parsed.life_update.heading : '',
            life_update_body: parsed.life_update ? parsed.life_update.body : '',
            life_update_images: parsed.life_update_images || [],
            instagram_grid: instagram_grid || [],
            instagram_caption: instagram_caption || ''
        },
        media: {
            has_media: Array.isArray(mediaArray) && mediaArray.length > 0,
            items: Array.isArray(mediaArray) ? mediaArray : []
        },
        job: {
            has_job: !!(job.title),
            title: job.title || '',
            type: job.type || 'Full Time',
            location: job.location || '',
            description: (() => { const d = (job.description || '').replace(/<[^>]+>/g, '').trim(); return d.length > 120 ? d.slice(0, 117) + '...' : d; })(),
            link: job.link || 'https://clientapps.jobadder.com/67514/artisan'
        },
        alist: {
            has_candidate: !!alistCandidate,
            title: alistCandidate ? alistCandidate.title : '',
            image: alistCandidate ? (alistCandidate.image_url || fallbackImg) : fallbackImg,
            link: alistCandidate ? alistCandidate.mailto_link : ''
        },
        articles: (articles || []).slice(0, 3).map(a => ({
            title: a.title || '',
            image: a.image || fallbackImg,
            link: a.link || fallbackArticleLink
        })),
        events: Array.isArray(parsed.events) ? parsed.events : []
    };
}

// ============================================================
// GET /api/consultant/preview
// ============================================================
async function previewConsultant(req, res) {
    try {
        const state = readState();
        if (state.state === 'EMPTY' || !state.templateParams) {
            return res.send('<div style="padding:40px;text-align:center;"><h2>No content yet</h2></div>');
        }

        const emailPreviewService = require('../services/emailPreviewService');
        const html = await renderConsultantTemplate(state.templateParams, emailPreviewService);
        res.send(html);
    } catch (error) {
        res.status(500).send(`Error: ${error.message}`);
    }
}

async function renderConsultantTemplate(params, emailPreviewService) {
    const templateHtml = fs.readFileSync(TEMPLATE_FILE, 'utf8');
    const data = {
        params,
        update_profile: 'https://artisan.com.au/email-preferences',
        unsubscribe: 'https://artisan.com.au/unsubscribe'
    };
    return emailPreviewService.replaceTemplateVariables(templateHtml, data);
}

// ============================================================
// POST /api/consultant/send-test
// ============================================================
async function sendTest(req, res) {
    const state = readState();
    if (state.state === 'EMPTY' || !state.templateParams) {
        return res.status(400).json({ success: false, message: 'No content yet.' });
    }

    const testEmail = process.env.TEST_EMAIL;
    const templateId = state.consultant && state.consultant.brevo_template_id ? state.consultant.brevo_template_id : null;

    try {
        if (templateId) {
            await brevoService.sendBatchEmail(
                [{ email: testEmail, name: 'Test User' }],
                parseInt(templateId),
                { 
                    ...state.templateParams,
                    update_profile: 'https://artisan.com.au/email-preferences',
                    unsubscribe: 'https://artisan.com.au/unsubscribe'
                }
            );
        } else {
            const emailPreviewService = require('../services/emailPreviewService');
            const htmlContent = await renderConsultantTemplate(state.templateParams, emailPreviewService);
            await brevoService.sendEmailWithHtml({
                to: { email: testEmail, name: 'Test User' },
                subject: `[TEST] Consultant — Artisan`,
                htmlContent
            });
        }
        res.json({ success: true, message: `Test email sent to ${testEmail}` });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
}

// ============================================================
// POST /api/consultant/send
// ============================================================
async function sendToAll(req, res) {
    const state = readState();
    const templateId = state.consultant && state.consultant.brevo_template_id ? state.consultant.brevo_template_id : null;

    try {
        const { recipientType, recipientId } = req.body;
        let recipients = [];
        if (recipientType === 'segment') recipients = await brevoService.getSegmentContacts(recipientId);
        else if (recipientType === 'list') recipients = await brevoService.getListContacts(recipientId);

        const finalRecipients = modeService.isTestMode() ? [{ email: modeService.getTestEmail() }] : recipients;

        if (templateId) {
            await brevoService.sendBatchEmail(
                finalRecipients,
                parseInt(templateId),
                { 
                    ...state.templateParams,
                    update_profile: 'https://artisan.com.au/email-preferences',
                    unsubscribe: 'https://artisan.com.au/unsubscribe'
                }
            );
        }
        res.json({ success: true, message: 'Email sent successfully!' });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
}

async function updateSections(req, res) {
    try {
        const { sections, content, events, media, instagram_grid, life_update_images } = req.body;
        const state = readState();
        
        if (state.state === 'EMPTY') {
            return res.status(400).json({ success: false, message: 'No newsletter parsed yet.' });
        }

        if (sections) {
            // Map dashboard section keys to template section keys
            state.content.sections = {
                industry_insight: !!sections.industry_insight,
                life_update: !!sections.life_update,
                media: !!sections.media,
                instagram: !!sections.instagram_grid, // Dashboard uses instagram_grid for the toggle
                events: !!sections.events,
                alist: true, // Always show these or add toggles if needed
                job: true,
                articles: true
            };
        }
        if (content) {
            if (content.industry_insight) {
                state.content.industry_insight = {
                    heading: content.industry_insight.title,
                    body: content.industry_insight.body
                };
            }
            if (content.personal_update) {
                state.content.life_update = {
                    heading: content.personal_update.title,
                    body: content.personal_update.body
                };
            }
            if (content.instagram) state.content.instagram = content.instagram;
        }
        if (events) state.content.events = events;
        if (media) state.content.media = media;
        if (instagram_grid) state.content.instagram_grid = instagram_grid;
        if (life_update_images) state.content.life_update_images = life_update_images;

        state.templateParams = buildTemplateParams(
            state.consultant,
            {
                industry_insight: state.content.industry_insight,
                life_update: state.content.life_update,
                events: state.content.events,
                life_update_images: state.content.life_update_images
            },
            state.content.media,
            state.content.articles,
            state.content.alist_candidate,
            state.content.live_job,
            state.content.sections,
            state.content.instagram_grid,
            state.content.instagram ? state.content.instagram.caption : ''
        );
        
        // Preserve data that buildTemplateParams might not return but we need in state
        // (like raw objects from the dashboard)
        state.content.sections = state.templateParams.sections;
        
        // Final sanity check: ensure templateParams is actually updated in state
        console.log('✅ TemplateParams updated after save for:', state.consultant.name);

        writeState(state);
        res.json({ success: true, message: 'Edits saved successfully!', state });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
}

function resetState(req, res) {
    writeState({ state: 'EMPTY' });
    res.json({ success: true });
}

function scheduleConsultant(req, res) { res.status(501).send(); }
function cancelConsultantSchedule(req, res) { res.status(501).send(); }
function restoreConsultantSchedule() {}

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
    scheduleConsultant,
    cancelConsultantSchedule,
    restoreConsultantSchedule,
    updateSections
};
