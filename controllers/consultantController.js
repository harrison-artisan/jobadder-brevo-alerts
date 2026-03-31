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

const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');
const brevoService = require('../services/brevoService');
const jobadderService = require('../services/jobadderService');
const candidateService = require('../services/candidateService');

const ALIST_STATE_FILE = path.join(__dirname, '..', '.alist-state.json');
const WP_API = 'https://artisan.com.au/wp-json/wp/v2';
const WP_ARTICLE_CATEGORY = 6; // 'Article' category ID

// ============================================================
// Fetch 3 latest Creative Community articles from WordPress
// ============================================================
async function fetchWordPressArticles() {
    try {
        const posts = await wpGet(`${WP_API}/posts?categories=${WP_ARTICLE_CATEGORY}&per_page=3&orderby=date&order=desc&_fields=id,title,link,featured_media`);
        const articles = await Promise.all(posts.map(async (p) => {
            let image = 'https://artisan.com.au/wp-content/uploads/2024/03/artisan_A_RGB_artisan-A-Red.png';
            if (p.featured_media) {
                try {
                    const media = await wpGet(`${WP_API}/media/${p.featured_media}?_fields=source_url`);
                    if (media.source_url) image = media.source_url;
                } catch (e) { /* use fallback */ }
            }
            return {
                title: p.title && p.title.rendered ? p.title.rendered : '',
                image,
                link: p.link || 'https://artisan.com.au/creative-community/'
            };
        }));
        console.log(`✅ Fetched ${articles.length} WordPress articles`);
        return articles;
    } catch (e) {
        console.warn('⚠️  WordPress article fetch failed:', e.message);
        return [];
    }
}

// Simple HTTP GET helper that returns parsed JSON
function wpGet(url) {
    return new Promise((resolve, reject) => {
        const mod = url.startsWith('https') ? https : http;
        mod.get(url, { headers: { 'User-Agent': 'ArtisanDashboard/1.0' } }, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try { resolve(JSON.parse(data)); }
                catch (e) { reject(new Error('JSON parse error: ' + e.message)); }
            });
        }).on('error', reject);
    });
}

// ============================================================
// Scrape Instagram post data (image + caption) from public post URL
// Uses Facebook crawler user-agent to get og:image / og:description
// ============================================================
async function fetchInstagramPostData(url) {
    return new Promise((resolve) => {
        try {
            const mod = url.startsWith('https') ? https : http;
            const options = {
                headers: {
                    'User-Agent': 'facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)',
                    'Accept': 'text/html,application/xhtml+xml',
                    'Accept-Language': 'en-US,en;q=0.9'
                }
            };
            const req = mod.get(url, options, (res) => {
                let data = '';
                res.on('data', chunk => data += chunk);
                res.on('end', () => {
                    try {
                        const ogImage = (data.match(/<meta property="og:image" content="([^"]+)"/) || [])[1];
                        const ogDesc = (data.match(/<meta property="og:description" content="([^"]+)"/) || [])[1];
                        const ogTitle = (data.match(/<meta property="og:title" content="([^"]+)"/) || [])[1];
                        // Decode HTML entities
                        const decode = s => s ? s.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>') : '';
                        const imageUrl = decode(ogImage || '');
                        // Extract caption from og:description (format: "X likes, Y comments - handle on date: \"caption\"")
                        let caption = decode(ogDesc || '');
                        const captionMatch = caption.match(/:\s*"(.+)"\s*$/);
                        if (captionMatch) caption = captionMatch[1];
                        // Extract handle from og:title (format: "Name on Instagram: ...")
                        let handle = '';
                        const titleStr = decode(ogTitle || '');
                        const handleMatch = titleStr.match(/^([^:]+) on Instagram/);
                        if (handleMatch) handle = handleMatch[1].trim();
                        console.log(`✅ Instagram post scraped: image=${imageUrl ? 'yes' : 'no'}, handle=${handle}`);
                        resolve({ imageUrl, caption, handle });
                    } catch (e) {
                        console.warn('⚠️  Instagram scrape parse error:', e.message);
                        resolve({ imageUrl: '', caption: '', handle: '' });
                    }
                });
            });
            req.on('error', (e) => {
                console.warn('⚠️  Instagram scrape request error:', e.message);
                resolve({ imageUrl: '', caption: '', handle: '' });
            });
            req.setTimeout(10000, () => {
                req.destroy();
                console.warn('⚠️  Instagram scrape timed out');
                resolve({ imageUrl: '', caption: '', handle: '' });
            });
        } catch (e) {
            console.warn('⚠️  Instagram scrape error:', e.message);
            resolve({ imageUrl: '', caption: '', handle: '' });
        }
    });
}

// ============================================================
// Auto-pull first candidate from A-List state or live JobAdder
// ============================================================
function getAListCandidateFromState() {
    try {
        if (!fs.existsSync(ALIST_STATE_FILE)) return null;
        const state = JSON.parse(fs.readFileSync(ALIST_STATE_FILE, 'utf8'));
        if (!state || !state.candidates || state.candidates.length === 0) return null;
        const c = state.candidates[0];
        return {
            title: c.title || '',
            image_url: c.image_url || c.avatar_url || '',
            mailto_link: c.mailto_link || '',
            candidateId: c.candidateId || ''
        };
    } catch (e) {
        console.warn('⚠️  Could not read A-List state:', e.message);
        return null;
    }
}

async function fetchAListCandidateLive() {
    try {
        console.log('🔍 Fetching live candidate from JobAdder...');
        const candidates = await candidateService.getRecentlyInterviewedCandidates(4);
        if (!candidates || candidates.length === 0) {
            console.log('ℹ️  No recent candidates found in JobAdder');
            return null;
        }
        // Pick a random candidate from the pool (up to 10)
        const pool = candidates.slice(0, 10);
        const pick = pool[Math.floor(Math.random() * pool.length)];
        const formatted = await candidateService.formatCandidateForEmail(pick, 1, '');
        console.log(`✅ Live candidate fetched: ${formatted.title}`);
        return {
            title: formatted.title || '',
            image_url: formatted.image_url || '',
            mailto_link: formatted.mailto_link || '',
            candidateId: formatted.candidateId || ''
        };
    } catch (e) {
        console.warn('⚠️  Live candidate fetch failed:', e.message);
        return null;
    }
}

async function fetchLiveJob() {
    try {
        console.log('📋 Fetching live job from JobAdder...');
        const liveJobs = await jobadderService.getLiveJobs();
        if (!liveJobs || liveJobs.length === 0) {
            console.log('ℹ️  No live jobs found in JobAdder');
            return null;
        }
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
        console.warn('⚠️  Live job fetch failed:', e.message);
        return null;
    }
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
        throw new Error('Could not load consultants config. Check config/consultants.json.');
    }
}

// In-memory overrides cache (updated on save, lost on restart — Railway env var is the source of truth)
let profileOverrides = {};
try {
    if (process.env.CONSULTANT_PROFILES_JSON) {
        profileOverrides = JSON.parse(process.env.CONSULTANT_PROFILES_JSON);
    }
} catch (e) { profileOverrides = {}; }

function saveConsultants(data) {
    // Write to repo file (works locally; on Railway this is overwritten on next deploy)
    try { fs.writeFileSync(CONSULTANTS_FILE, JSON.stringify(data, null, 2)); } catch (e) {}
}

// ============================================================
// GET /api/consultant/state
// ============================================================
function getState(req, res) {
    try {
        const state = readState();
        res.json({ success: true, state });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
}

// ============================================================
// GET /api/consultant/list
// Returns the list of consultants for the dropdown
// ============================================================
function getConsultantList(req, res) {
    try {
        const consultants = loadConsultants();
        const list = Object.values(consultants).map(c => ({
            id: c.id,
            name: c.name,
            newsletter_name: c.newsletter_name || c.name,
            title: c.title,
            photo_url: c.photo_url,
            media_type_default: c.media_type_default || 'none'
        }));
        res.json({ success: true, consultants: list });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
}

// ============================================================
// GET /api/consultant/profile/:id
// Returns full profile for a consultant
// ============================================================
function getProfile(req, res) {
    try {
        const consultants = loadConsultants();
        const consultant = consultants[req.params.id];
        if (!consultant) {
            return res.status(404).json({ success: false, message: `Consultant "${req.params.id}" not found.` });
        }
        res.json({ success: true, profile: consultant });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
}

// ============================================================
// POST /api/consultant/profile/:id
// Saves updated profile fields to consultants.json
// ============================================================
function saveProfile(req, res) {
    try {
        const consultants = loadConsultants();
        const id = req.params.id;

        if (!consultants[id]) {
            return res.status(404).json({ success: false, message: `Consultant "${id}" not found.` });
        }

        // Allowed fields that can be updated via dashboard
        const allowedFields = [
            'newsletter_name', 'name', 'title', 'email', 'phone',
            'photo_url', 'linkedin', 'calendar_link', 'media_type_default'
        ];

        const updates = req.body;
        allowedFields.forEach(field => {
            if (updates[field] !== undefined && updates[field] !== null) {
                consultants[id][field] = updates[field];
            }
        });

        saveConsultants(consultants);

        // Update in-memory overrides so changes take effect immediately without restart
        if (!profileOverrides[id]) profileOverrides[id] = {};
        allowedFields.forEach(field => {
            if (updates[field] !== undefined) profileOverrides[id][field] = updates[field];
        });

        // Build the full overrides JSON string for the user to paste into Railway
        const railwayEnvValue = JSON.stringify(profileOverrides);

        console.log(`✅ Profile saved for ${consultants[id].name}`);
        res.json({
            success: true,
            message: `Profile saved for ${consultants[id].name}.`,
            consultant: consultants[id],
            railway_env_value: railwayEnvValue
        });
    } catch (error) {
        console.error('❌ Error saving profile:', error.message);
        res.status(500).json({ success: false, message: error.message });
    }
}

// ============================================================
// POST /api/consultant/parse
// Accepts raw JSON from Gemini Gem, validates, merges with config
// Auto-fetches WordPress articles and A-List candidate
// ============================================================
async function parseJSON(req, res) {
    console.log('\n======== CONSULTANT: PARSE JSON ========');

    const { jsonText } = req.body;
    if (!jsonText || !jsonText.trim()) {
        return res.status(400).json({ success: false, message: 'No JSON provided.' });
    }

    let parsed;
    try {
        parsed = JSON.parse(jsonText.trim());
    } catch (e) {
        return res.status(400).json({
            success: false,
            message: 'Invalid JSON. Please check the output from Gemini and try again.',
            detail: e.message
        });
    }

    // Validate required fields
    const errors = [];
    if (!parsed.consultant) errors.push('Missing "consultant" field (e.g. "debbie-younger")');
    if (!parsed.industry_insight || !parsed.industry_insight.heading) errors.push('Missing industry_insight.heading');
    if (!parsed.industry_insight || !parsed.industry_insight.body) errors.push('Missing industry_insight.body');
    if (!parsed.life_update || !parsed.life_update.heading) errors.push('Missing life_update.heading');
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
    // media can be: { type, url, caption } OR [{ type, url, caption }, ...]
    const rawMedia = parsed.media;
    const rawMediaArray = Array.isArray(rawMedia)
        ? rawMedia
        : (rawMedia && rawMedia.type && rawMedia.type !== 'none' && rawMedia.url ? [rawMedia] : []);

    // Enrich each media item (async for Instagram scraping)
    const enrichMedia = async (m) => {
        if (!m || !m.type || m.type === 'none' || !m.url) return null;
        const item = { ...m };
        // For YouTube: extract video ID and add thumbnail URL
        if (m.type === 'youtube') {
            const ytMatch = m.url.match(/(?:v=|youtu\.be\/)?([\w-]{11})/);
            if (ytMatch) item.thumbnail = `https://img.youtube.com/vi/${ytMatch[1]}/hqdefault.jpg`;
        }
        // For Instagram: scrape og:image and og:description from the public post page
        if (m.type === 'instagram') {
            console.log(`📸 Scraping Instagram post: ${m.url}`);
            const igData = await fetchInstagramPostData(m.url);
            if (igData.imageUrl) item.scraped_image = igData.imageUrl;
            if (igData.caption && !item.caption) item.caption = igData.caption;
            if (igData.handle) item.handle = igData.handle;
        }
        return item;
    };

    const resolvedMedia = (await Promise.all(rawMediaArray.map(enrichMedia))).filter(Boolean);

    // Auto-fetch WordPress articles (falls back to empty array on failure)
    console.log('📰 Fetching WordPress articles...');
    const wpArticles = await fetchWordPressArticles();

    // Merge: Gemini-provided articles override WordPress auto-fetch
    const articles = [
        parsed.article1 || wpArticles[0] || {},
        parsed.article2 || wpArticles[1] || {},
        parsed.article3 || wpArticles[2] || {}
    ];

    // Auto-pull A-List candidate: try state file first, then fetch live from JobAdder
    let alistCandidate = getAListCandidateFromState();
    if (alistCandidate) {
        console.log(`✅ A-List candidate from state: ${alistCandidate.title}`);
    } else {
        console.log('ℹ️  No A-List state — fetching live candidate from JobAdder...');
        alistCandidate = await fetchAListCandidateLive();
        if (!alistCandidate) console.log('ℹ️  No candidate available — job-only layout will be used.');
    }

    // Auto-fetch a live job from JobAdder (unless Gemini JSON provided one)
    let liveJob = null;
    if (parsed.job && parsed.job.title) {
        liveJob = parsed.job;
        console.log(`✅ Job from Gemini JSON: ${liveJob.title}`);
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
            alist_candidate: alistCandidate
        },
        templateParams: buildTemplateParams(consultantConfig, parsed, resolvedMedia, articles, alistCandidate, liveJob)
    };

    writeState(state);
    console.log(`✅ Consultant newsletter parsed for ${consultantConfig.name}`);

    res.json({
        success: true,
        message: `Newsletter content parsed for ${consultantConfig.name}. ${wpArticles.length} articles auto-fetched from WordPress.${alistCandidate ? ' A-List candidate included.' : ''}${liveJob ? ` Live job: ${liveJob.title}.` : ''}`,
        consultant: consultantConfig.name,
        newsletter_name: consultantConfig.newsletter_name,
        media_count: resolvedMedia.length,
        articles_from_wp: wpArticles.length,
        alist_candidate: !!alistCandidate,
        live_job: !!liveJob,
        state
    });
}

// ============================================================
// Build nested template params for Brevo
// Brevo's Nunjucks engine requires nested objects (not flat strings)
// for {{ params.xxx }} substitution to work correctly.
// ============================================================
function buildTemplateParams(consultant, parsed, mediaArray, articles, alistCandidate, liveJob) {
    // liveJob is pre-fetched from JobAdder (or from Gemini JSON if provided)
    const job = liveJob || parsed.job || {};
    const fallbackImg = 'https://artisan.com.au/wp-content/uploads/2024/03/artisan_A_RGB_artisan-A-Red.png';
    const fallbackArticleLink = 'https://artisan.com.au/creative-community/';

    return {
        // Consultant identity — nested object
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

        // Email content — nested object
        content: {
            preheader_text: parsed.preheader_text || `${parsed.industry_insight.heading} — from ${consultant.name} at Artisan`,
            industry_insight_heading: parsed.industry_insight.heading,
            industry_insight_body: parsed.industry_insight.body,
            life_update_heading: parsed.life_update.heading,
            life_update_body: parsed.life_update.body
        },

        // Personal media — nested object with items array
        media: {
            has_media: Array.isArray(mediaArray) && mediaArray.length > 0,
            items: Array.isArray(mediaArray) ? mediaArray : []
        },

        // Featured job — nested object
        job: {
            has_job: !!(job.title),
            title: job.title || '',
            type: job.type || 'Full Time',
            location: job.location || '',
            description: job.description || '',
            link: job.link || 'https://clientapps.jobadder.com/67514/artisan'
        },

        // A-List candidate — nested object
        alist: {
            has_candidate: !!alistCandidate,
            title: alistCandidate ? alistCandidate.title : '',
            image: alistCandidate ? (alistCandidate.image_url || fallbackImg) : fallbackImg,
            link: alistCandidate ? alistCandidate.mailto_link : ''
        },

        // Creative Community articles — array of objects (iterated with {% for %})
        articles: (articles || []).slice(0, 3).map(a => ({
            title: a.title || '',
            image: a.image || fallbackImg,
            link: a.link || fallbackArticleLink
        })),

        // Events — array of objects
        events: Array.isArray(parsed.events) ? parsed.events : []
    };
}

// ============================================================
// GET /api/preview/consultant
// ============================================================
async function previewConsultant(req, res) {
    try {
        const state = readState();
        if (state.state === 'EMPTY' || !state.templateParams) {
            return res.send('<div style="padding:40px;text-align:center;font-family:sans-serif;color:#888"><h2>No content yet</h2><p>Select a consultant, paste the Gemini JSON, and click Parse.</p></div>');
        }

        const emailPreviewService = require('../services/emailPreviewService');
        const html = await renderConsultantTemplate(state.templateParams, emailPreviewService);
        res.send(html);
    } catch (error) {
        console.error('❌ Consultant preview error:', error.message);
        res.status(500).send(`<div style="padding:40px;text-align:center;"><h2>Error</h2><p>${error.message}</p></div>`);
    }
}

// ============================================================
// Template rendering helper
// ============================================================
async function renderConsultantTemplate(params, emailPreviewService) {
    const templateHtml = fs.readFileSync(TEMPLATE_FILE, 'utf8');
    // Wrap params in { params: ... } so {{ params.consultant.name }} resolves correctly
    // via getNestedProperty(data, 'params.consultant.name')
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
    console.log('\n======== CONSULTANT: SEND TEST ========');

    const state = readState();
    if (state.state === 'EMPTY' || !state.templateParams) {
        return res.status(400).json({ success: false, message: 'Please parse the Gemini JSON first.' });
    }

    const testEmail = process.env.TEST_EMAIL;
    if (!testEmail) {
        return res.status(400).json({ success: false, message: 'TEST_EMAIL environment variable is not set.' });
    }

    const templateId = state.consultant && state.consultant.brevo_template_id
        ? state.consultant.brevo_template_id : null;
    // DIAGNOSTIC: log exactly what templateParams looks like
    console.log('🔍 state.templateParams keys:', state.templateParams ? Object.keys(state.templateParams) : 'MISSING');
    if (state.templateParams && state.templateParams.consultant) {
        console.log('🔍 consultant.name:', state.templateParams.consultant.name);
        console.log('🔍 consultant.newsletter_name:', state.templateParams.consultant.newsletter_name);
    } else {
        console.log('🔍 templateParams.consultant is MISSING — flat keys?', state.templateParams ? Object.keys(state.templateParams).slice(0,5) : 'none');
    }
    try {
        if (templateId) {
            console.log(`📧 Sending test via Brevo template #${templateId} for ${state.consultant.name}`);
            await brevoService.sendBatchEmail(
                [{ email: testEmail, name: 'Test User' }],
                parseInt(templateId),
                state.templateParams
            );
        } else {
            console.log('ℹ️  No template ID — sending inline HTML test email.');
            const emailPreviewService = require('../services/emailPreviewService');
            const htmlContent = await renderConsultantTemplate(state.templateParams, emailPreviewService);
            const newsletterName = state.consultant ? (state.consultant.newsletter_name || state.consultant.name) : 'Consultant';
            await brevoService.sendEmailWithHtml({
                to: { email: testEmail, name: 'Test User' },
                subject: `[TEST] ${newsletterName} — Artisan`,
                htmlContent
            });
        }

        writeState({ ...state, state: 'TESTED', testSentAt: new Date().toISOString() });
        console.log(`✅ Consultant test email sent to ${testEmail}`);
        res.json({ success: true, message: `Test email sent to ${testEmail}` });
    } catch (error) {
        console.error('❌ Error sending consultant test email:', error.message);
        res.status(500).json({ success: false, message: error.message });
    }
}

// ============================================================
// POST /api/consultant/send
// ============================================================
async function sendToAll(req, res) {
    console.log('\n======== CONSULTANT: SEND TO ALL ========');

    const state = readState();
    if (!['GENERATED', 'TESTED'].includes(state.state) || !state.templateParams) {
        return res.status(400).json({ success: false, message: 'Please parse the Gemini JSON first.' });
    }

    const templateId = state.consultant && state.consultant.brevo_template_id
        ? state.consultant.brevo_template_id : null;

    try {
        const { recipientType, recipientId } = req.body;
        let recipients;

        if (recipientId && recipientType) {
            console.log(`👥 Fetching recipients from ${recipientType} #${recipientId}...`);
            if (recipientType === 'segment') {
                recipients = await brevoService.getSegmentContacts(recipientId);
            } else if (recipientType === 'list') {
                recipients = await brevoService.getListContacts(recipientId);
            } else {
                return res.status(400).json({ success: false, message: 'Invalid recipient type.' });
            }
        } else {
            return res.status(400).json({ success: false, message: 'Please select a recipient segment or list.' });
        }

        if (recipients.length === 0) {
            return res.status(404).json({ success: false, message: 'No recipients found in the selected segment/list.' });
        }

        const testMode = process.env.TEST_MODE === 'true';
        const finalRecipients = testMode ? [{ email: process.env.TEST_EMAIL }] : recipients;

        if (templateId) {
            console.log(`📧 Sending via Brevo template #${templateId} for ${state.consultant.name}`);
            await brevoService.sendBatchEmail(
                finalRecipients,
                parseInt(templateId),
                state.templateParams
            );
        } else {
            console.log('ℹ️  No template ID — sending inline HTML to all recipients.');
            const emailPreviewService = require('../services/emailPreviewService');
            const htmlContent = await renderConsultantTemplate(state.templateParams, emailPreviewService);
            const newsletterName = state.consultant ? (state.consultant.newsletter_name || state.consultant.name) : 'Consultant';
            const subject = `${newsletterName} — Artisan`;
            for (const recipient of finalRecipients) {
                await brevoService.sendEmailWithHtml({
                    to: { email: recipient.email, name: recipient.name || recipient.email },
                    subject,
                    htmlContent
                });
            }
        }

        writeState({ ...state, state: 'SENT', sentAt: new Date().toISOString() });
        console.log(`✅ Consultant newsletter sent to ${finalRecipients.length} recipients.`);
        res.json({ success: true, message: `Newsletter sent to ${finalRecipients.length} recipients.` });

        setTimeout(() => writeState({ state: 'EMPTY' }), 2000);

    } catch (error) {
        console.error('❌ Error sending consultant newsletter:', error.message);
        res.status(500).json({ success: false, message: error.message });
    }
}

// ============================================================
// POST /api/consultant/reset
// ============================================================
function resetState(req, res) {
    try {
        if (fs.existsSync(STATE_FILE)) fs.unlinkSync(STATE_FILE);
        res.json({ success: true, message: 'Consultant state reset.' });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
}

// ============================================================
// Internal send helper (no req/res — used by scheduler)
// ============================================================
async function sendToAllDirect(options = {}) {
    const state = readState();
    if (!state.templateParams) throw new Error('No template params in state');
    const templateId = state.consultant && state.consultant.brevo_template_id
        ? state.consultant.brevo_template_id : null;
    const { recipientType, recipientId } = options;
    let recipients;
    if (recipientType === 'segment') {
        recipients = await brevoService.getSegmentContacts(recipientId);
    } else if (recipientType === 'list') {
        recipients = await brevoService.getListContacts(recipientId);
    } else {
        throw new Error('Invalid recipient type');
    }
    if (!recipients || recipients.length === 0) throw new Error('No recipients found');
    const testMode = process.env.TEST_MODE === 'true';
    const finalRecipients = testMode ? [{ email: process.env.TEST_EMAIL }] : recipients;
    if (templateId) {
        await brevoService.sendBatchEmail(finalRecipients, parseInt(templateId), state.templateParams);
    } else {
        const emailPreviewService = require('../services/emailPreviewService');
        const htmlContent = await renderConsultantTemplate(state.templateParams, emailPreviewService);
        const newsletterName = state.consultant ? (state.consultant.newsletter_name || state.consultant.name) : 'Consultant';
        const subject = `${newsletterName} — Artisan`;
        for (const recipient of finalRecipients) {
            await brevoService.sendEmailWithHtml({
                to: { email: recipient.email, name: recipient.name || recipient.email },
                subject, htmlContent
            });
        }
    }
    writeState({ ...state, state: 'SENT', sentAt: new Date().toISOString() });
    console.log(`✅ Scheduled consultant newsletter sent to ${finalRecipients.length} recipients.`);
    setTimeout(() => writeState({ state: 'EMPTY' }), 2000);
    return { success: true, count: finalRecipients.length };
}

// ============================================================
// POST /api/consultant/schedule
// ============================================================
let _consultantScheduledTask = null;

async function scheduleConsultant(req, res) {
    const cron = require('node-cron');
    try {
        const { recipientType, recipientId, scheduledAt } = req.body;
        const state = readState();
        if (!['GENERATED', 'TESTED'].includes(state.state) || !state.templateParams) {
            return res.status(400).json({ success: false, message: 'Please parse the Gemini JSON first.' });
        }
        if (!scheduledAt) return res.status(400).json({ success: false, message: 'scheduledAt is required' });
        const sendDate = new Date(scheduledAt);
        if (isNaN(sendDate.getTime())) return res.status(400).json({ success: false, message: 'Invalid scheduledAt date' });
        if (sendDate <= new Date()) return res.status(400).json({ success: false, message: 'Scheduled time must be in the future' });

        const min = sendDate.getUTCMinutes();
        const hr = sendDate.getUTCHours();
        const dom = sendDate.getUTCDate();
        const mon = sendDate.getUTCMonth() + 1;
        const cronExpr = `${min} ${hr} ${dom} ${mon} *`;
        const scheduledFor = sendDate.toLocaleString('en-AU', {
            weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
            hour: '2-digit', minute: '2-digit', hour12: true,
            timeZone: 'Australia/Melbourne'
        }) + ' (Melbourne time)';

        if (_consultantScheduledTask) { _consultantScheduledTask.stop(); _consultantScheduledTask = null; }
        _consultantScheduledTask = cron.schedule(cronExpr, async () => {
            console.log('📅 Executing scheduled consultant newsletter send...');
            const s = readState();
            if (s.state === 'SCHEDULED') writeState({ ...s, state: 'TESTED' });
            try {
                await sendToAllDirect({ recipientType, recipientId });
            } catch (e) {
                console.error('❌ Scheduled consultant send failed:', e.message);
            }
            if (_consultantScheduledTask) { _consultantScheduledTask.stop(); _consultantScheduledTask = null; }
        }, { timezone: 'UTC' });

        writeState({ ...state, state: 'SCHEDULED', scheduledAt: sendDate.toISOString(), scheduledFor, scheduledOptions: { recipientType, recipientId } });
        console.log(`📅 Consultant newsletter scheduled for ${scheduledFor} (cron: ${cronExpr} UTC)`);
        res.json({ success: true, scheduledFor, message: 'Consultant newsletter scheduled successfully' });
    } catch (error) {
        console.error('❌ Error scheduling consultant newsletter:', error);
        res.status(500).json({ success: false, message: error.message });
    }
}

// ============================================================
// POST /api/consultant/cancel-schedule
// ============================================================
function cancelConsultantSchedule(req, res) {
    try {
        if (_consultantScheduledTask) { _consultantScheduledTask.stop(); _consultantScheduledTask = null; }
        const state = readState();
        if (state.state === 'SCHEDULED') {
            const { scheduledAt, scheduledFor, scheduledOptions, ...rest } = state;
            writeState({ ...rest, state: 'TESTED' });
        }
        res.json({ success: true, message: 'Schedule cancelled' });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
}

// ============================================================
// Restore scheduled cron on server startup
// ============================================================
function restoreConsultantSchedule() {
    const cron = require('node-cron');
    try {
        const state = readState();
        if (state.state !== 'SCHEDULED' || !state.scheduledAt) return;
        const sendDate = new Date(state.scheduledAt);
        if (sendDate <= new Date()) {
            console.warn('⚠️  Consultant scheduled time has passed, clearing schedule');
            const { scheduledAt, scheduledFor, scheduledOptions, ...rest } = state;
            writeState({ ...rest, state: 'TESTED' });
            return;
        }
        const { recipientType, recipientId } = state.scheduledOptions || {};
        const min = sendDate.getUTCMinutes();
        const hr = sendDate.getUTCHours();
        const dom = sendDate.getUTCDate();
        const mon = sendDate.getUTCMonth() + 1;
        const cronExpr = `${min} ${hr} ${dom} ${mon} *`;
        if (_consultantScheduledTask) { _consultantScheduledTask.stop(); _consultantScheduledTask = null; }
        _consultantScheduledTask = cron.schedule(cronExpr, async () => {
            console.log('📅 Executing restored consultant newsletter send...');
            const s = readState();
            if (s.state === 'SCHEDULED') writeState({ ...s, state: 'TESTED' });
            try {
                await sendToAllDirect({ recipientType, recipientId });
            } catch (e) {
                console.error('❌ Restored consultant send failed:', e.message);
            }
            if (_consultantScheduledTask) { _consultantScheduledTask.stop(); _consultantScheduledTask = null; }
        }, { timezone: 'UTC' });
        console.log(`📅 Consultant schedule restored for ${state.scheduledFor}`);
    } catch (error) {
        console.error('❌ Error restoring consultant schedule:', error.message);
    }
}

// ============================================================
// CSV UPLOAD HELPERS
// ============================================================

/**
 * Parse a CSV cell — handles quoted values with embedded commas and escaped quotes.
 */
function parseCsvCell(raw) {
    if (!raw) return '';
    const s = raw.trim();
    if (s.startsWith('"')) {
        // RFC 4180 quoted field
        const inner = s.slice(1, s.lastIndexOf('"'));
        return inner.replace(/""/g, '"').trim();
    }
    return s;
}

/**
 * Split a single CSV line into cells, respecting quoted fields.
 */
function splitCsvLine(line) {
    const cells = [];
    let inQuote = false, cur = '';
    for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (ch === '"') {
            if (inQuote && line[i + 1] === '"') { cur += '"'; i++; }
            else { inQuote = !inQuote; }
        } else if (ch === ',' && !inQuote) {
            cells.push(cur.trim()); cur = '';
        } else {
            cur += ch;
        }
    }
    cells.push(cur.trim());
    return cells;
}

/**
 * Map a human-readable label from the Google Sheets template to a machine key.
 * Also handles the old key,value format (where column A is already a machine key).
 * Context-aware: tracks which section we're in to disambiguate repeated labels
 * like "Body Text" and "Caption / Description".
 */
const LABEL_TO_KEY = {
    // About You
    'consultant':                   'consultant',
    // Industry Insight
    'industry insight body text':   'industry_insight_body',
    'industry insight':             'industry_insight_body',
    // Personal Update
    'personal update body text':    'life_update_body',
    'life update body text':        'life_update_body',
    'personal update':              'life_update_body',
    'life update':                  'life_update_body',
    // YouTube
    'youtube url':                  'youtube_url',
    'youtube caption':              'youtube_caption',
    // Image
    'image url':                    'image_url',
    'image caption':                'image_caption',
    // Instagram
    'instagram post url':           'instagram_url',
    'instagram url':                'instagram_url',
    // Worth Reading
    'article url':                  'link_url',
    'link url':                     'link_url',
    'worth reading url':            'link_url',
    // Events
    'event 1 date':                 'event_1_date',
    'event 1 title':                'event_1_title',
    'event 1 description':          'event_1_description',
    'event 1 link url':             'event_1_link',
    'event 1 link':                 'event_1_link',
    'event 2 date':                 'event_2_date',
    'event 2 title':                'event_2_title',
    'event 2 description':          'event_2_description',
    'event 2 link url':             'event_2_link',
    'event 2 link':                 'event_2_link',
    'event 3 date':                 'event_3_date',
    'event 3 title':                'event_3_title',
    'event 3 description':          'event_3_description',
    'event 3 link url':             'event_3_link',
    'event 3 link':                 'event_3_link',
};

// Section context tracker — used to disambiguate repeated labels
const SECTION_CONTEXTS = [
    { pattern: /industry insight/i,   bodyKey: 'industry_insight_body', captionKey: null },
    { pattern: /personal update|life update/i, bodyKey: 'life_update_body', captionKey: null },
    { pattern: /youtube/i,            bodyKey: null, captionKey: 'youtube_caption' },
    { pattern: /\bimage\b/i,          bodyKey: null, captionKey: 'image_caption' },
    { pattern: /instagram/i,          bodyKey: null, captionKey: null },
    { pattern: /worth reading/i,      bodyKey: null, captionKey: null },
    { pattern: /events?/i,            bodyKey: null, captionKey: null },
];

/**
 * Detect and parse Google Forms CSV export format.
 * Google Forms exports: row 1 = column headers (first col is "Timestamp"), row 2+ = responses.
 * Uses the LAST response row (most recent submission).
 */
function parseGoogleFormsCsv(lines) {
    const nonEmpty = lines.filter(l => l.trim());
    if (nonEmpty.length < 2) return null;
    const headerCells = splitCsvLine(nonEmpty[0]);
    const firstHeader = parseCsvCell(headerCells[0]).trim().toLowerCase();
    if (firstHeader !== 'timestamp') return null;  // Not a Google Forms export
    // Use the last response row (most recent submission)
    const lastRow = nonEmpty[nonEmpty.length - 1];
    const valueCells = splitCsvLine(lastRow);
    const data = {};
    const KNOWN_KEYS = ['consultant','industry_insight_body','life_update_body',
        'youtube_url','youtube_caption','image_url','image_caption',
        'instagram_url','link_url',
        'event_1_date','event_1_title','event_1_description','event_1_link',
        'event_2_date','event_2_title','event_2_description','event_2_link',
        'event_3_date','event_3_title','event_3_description','event_3_link'];
    for (let i = 1; i < headerCells.length; i++) {
        const header = parseCsvCell(headerCells[i]).trim();
        const value = i < valueCells.length ? parseCsvCell(valueCells[i]).trim() : '';
        if (!header || !value) continue;
        // Normalise the header column name
        const normHeader = header
            .replace(/\s*\(optional.*?\)/gi, '')
            .replace(/[^a-z0-9\s\-]/gi, ' ')
            .replace(/\s+/g, ' ')
            .trim()
            .toLowerCase();
        let key = LABEL_TO_KEY[normHeader];
        // Try stripping section prefix: "event 1 - date" -> try full, then "date" with event context
        if (!key) {
            // Try the full header with section prefix stripped
            const stripped = normHeader.replace(/^[\w\s]+ - /, '').trim();
            // For event fields, need to preserve event number
            const eventMatch = normHeader.match(/event (\d) - (date|title|description|url|link)/);
            if (eventMatch) {
                const n = eventMatch[1];
                const field = eventMatch[2] === 'url' ? 'link' : eventMatch[2];
                key = `event_${n}_${field}`;
            } else {
                key = LABEL_TO_KEY[stripped];
            }
        }
        // Context-aware: industry insight / personal update body text
        if (!key) {
            if (/industry insight.*body/i.test(header)) key = 'industry_insight_body';
            else if (/personal update.*body/i.test(header)) key = 'life_update_body';
            else if (/youtube.*url/i.test(header)) key = 'youtube_url';
            else if (/youtube.*caption/i.test(header)) key = 'youtube_caption';
            else if (/image.*url/i.test(header)) key = 'image_url';
            else if (/image.*caption/i.test(header)) key = 'image_caption';
            else if (/instagram/i.test(header)) key = 'instagram_url';
            else if (/worth reading/i.test(header)) key = 'link_url';
            else if (/your name/i.test(header)) key = 'consultant';
        }
        // Direct machine key fallback
        if (!key) {
            const machineKey = normHeader.replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
            if (KNOWN_KEYS.includes(machineKey)) key = machineKey;
        }
        if (key) {
            data[key] = value;
            console.log(`  GForms: ${key} = "${value.slice(0,60)}${value.length > 60 ? '...' : ''}"`); 
        }
    }
    return Object.keys(data).length > 0 ? data : null;
}

function parseCsvBuffer(buffer) {
    const text = buffer.toString('utf8');
    const lines = text.split(/\r?\n/);
    // Detect Google Forms export format first (Timestamp header in first column)
    const gFormsData = parseGoogleFormsCsv(lines);
    if (gFormsData) {
        console.log('  Detected Google Forms CSV export format');
        return gFormsData;
    }
    const data = {};
    let currentSection = null;  // tracks which section we're in

    for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;

        const cells = splitCsvLine(trimmed);
        if (cells.length < 1) continue;

        const rawLabel = cells[0].trim();
        const rawValue = cells.length >= 2 ? cells.slice(1).join(',').trim() : '';
        // Strip outer quotes from value
        const value = parseCsvCell(rawValue.startsWith('"') ? rawValue : rawValue);

        // Detect section header rows (no value, label looks like a section divider)
        const cleanLabel = rawLabel
            .replace(/^[\u2014\-\u2500\u2501\s]+|[\u2014\-\u2500\u2501\s]+$/g, '')  // strip dashes
            .replace(/\s*\(optional.*?\)/gi, '')  // strip "(optional)"
            .replace(/\s*\u2014.*$/, '')           // strip em-dash suffixes
            .replace(/\s*up to \d+.*$/i, '')       // strip "up to 3"
            .trim();

        // Check if this is a section header (value is empty AND label looks like a header)
        const isSectionHeader = !value && /^[\u2014\-\u2500\u2501]|section|insight|update|youtube|image|instagram|worth|event/i.test(rawLabel);
        if (isSectionHeader) {
            for (const ctx of SECTION_CONTEXTS) {
                if (ctx.pattern.test(cleanLabel)) { currentSection = ctx; break; }
            }
            continue;
        }

        // Normalise label for lookup
        const normLabel = cleanLabel
            .toLowerCase()
            .replace(/[\u2605\u2714\u2713\*]+/g, '')  // strip stars/checkmarks
            .replace(/required|optional/gi, '')
            .replace(/[^a-z0-9\s]/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();

        // Try direct lookup first
        let key = LABEL_TO_KEY[normLabel];

        // Context-aware disambiguation for repeated labels
        if (!key && currentSection) {
            if (/body text|body/i.test(normLabel) && currentSection.bodyKey) {
                key = currentSection.bodyKey;
            } else if (/caption|description/i.test(normLabel) && currentSection.captionKey) {
                key = currentSection.captionKey;
            }
        }

        // Fallback: if the label IS already a machine key (old format), use it directly
        if (!key) {
            const machineKey = rawLabel.trim().toLowerCase().replace(/\s+/g, '_');
            const KNOWN_KEYS = ['consultant','industry_insight_body','life_update_body',
                'youtube_url','youtube_caption','image_url','image_caption',
                'instagram_url','link_url',
                'event_1_date','event_1_title','event_1_description','event_1_link',
                'event_2_date','event_2_title','event_2_description','event_2_link',
                'event_3_date','event_3_title','event_3_description','event_3_link'];
            if (KNOWN_KEYS.includes(machineKey)) key = machineKey;
        }

        if (key && value !== '') {
            data[key] = value;
            console.log(`  CSV: ${key} = "${value.slice(0,60)}${value.length > 60 ? '...' : ''}"`); 
        }
    }
    return data;
}

/**
 * Parse a human-readable date string into { day, month } for the email template.
 * Accepts: "15 April 2026", "15/04/2026", "April 15 2026", "15-04-2026"
 */
function parseEventDate(dateStr) {
    if (!dateStr || !dateStr.trim()) return null;
    const s = dateStr.trim();
    const MONTHS = {
        january:'JAN', february:'FEB', march:'MAR', april:'APR', may:'MAY', june:'JUN',
        july:'JUL', august:'AUG', september:'SEP', october:'OCT', november:'NOV', december:'DEC',
        jan:'JAN', feb:'FEB', mar:'MAR', apr:'APR', jun:'JUN', jul:'JUL',
        aug:'AUG', sep:'SEP', oct:'OCT', nov:'NOV', dec:'DEC'
    };
    // "15 April 2026" or "April 15 2026"
    const wordMatch = s.match(/^(\d{1,2})\s+([A-Za-z]+)(?:\s+\d{2,4})?$/) ||
                      s.match(/^([A-Za-z]+)\s+(\d{1,2})(?:\s+\d{2,4})?$/);
    if (wordMatch) {
        let day, monthWord;
        if (/^\d/.test(wordMatch[1])) { day = wordMatch[1]; monthWord = wordMatch[2]; }
        else { monthWord = wordMatch[1]; day = wordMatch[2]; }
        const abbr = MONTHS[monthWord.toLowerCase()];
        if (abbr) return { day: String(parseInt(day, 10)), month: abbr };
    }
    // "15/04/2026" or "15-04-2026"
    const numMatch = s.match(/^(\d{1,2})[\/-](\d{1,2})(?:[\/-]\d{2,4})?$/);
    if (numMatch) {
        const day = numMatch[1];
        const monthNum = parseInt(numMatch[2], 10);
        const monthNames = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];
        if (monthNum >= 1 && monthNum <= 12) return { day: String(parseInt(day, 10)), month: monthNames[monthNum - 1] };
    }
    return null;
}

/**
 * Scrape og:title and og:description from a URL (for Worth Reading card).
 */
async function scrapePageMeta(url) {
    return new Promise((resolve) => {
        try {
            const mod = url.startsWith('https') ? https : http;
            const options = {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/124.0.0.0 Safari/537.36',
                    'Accept': 'text/html,application/xhtml+xml',
                    'Accept-Language': 'en-US,en;q=0.9'
                }
            };
            const req = mod.get(url, options, (res) => {
                if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                    return scrapePageMeta(res.headers.location).then(resolve).catch(() => resolve({ title: '', description: '' }));
                }
                // If server connects but never sends data (e.g. BBC), abort after 6s
                const responseTimer = setTimeout(() => { req.destroy(); console.warn('⚠️  Page meta response stalled'); resolve({ title: '', description: '' }); }, 6000);
                let data = '';
                res.on('data', chunk => { clearTimeout(responseTimer); data += chunk; if (data.length > 200000) req.destroy(); });
                res.on('end', () => { clearTimeout(responseTimer);
                    try {
                        const decode = s => s ? s.replace(/&amp;/g,'&').replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/&lt;/g,'<').replace(/&gt;/g,'>') : '';
                        const ogTitle = (data.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i) ||
                                         data.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:title["']/i) || [])[1];
                        const ogDesc  = (data.match(/<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)["']/i) ||
                                         data.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:description["']/i) ||
                                         data.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i) ||
                                         data.match(/<meta[^>]+content=["']([^"']+)["'][^>]+name=["']description["']/i) || [])[1];
                        const titleTag = (data.match(/<title[^>]*>([^<]+)<\/title>/i) || [])[1];
                        const title = decode(ogTitle || titleTag || '');
                        const description = decode(ogDesc || '');
                        console.log(`✅ Scraped page meta: title="${title.slice(0,60)}"`);
                        resolve({ title, description });
                    } catch (e) { console.warn('⚠️  Page meta parse error:', e.message); resolve({ title: '', description: '' }); }
                });
            });
            req.on('error', (e) => { console.warn('⚠️  Page meta fetch error:', e.message); resolve({ title: '', description: '' }); });
            req.setTimeout(8000, () => { req.destroy(); console.warn('⚠️  Page meta fetch timed out'); resolve({ title: '', description: '' }); });
        } catch (e) { console.warn('⚠️  scrapePageMeta error:', e.message); resolve({ title: '', description: '' }); }
    });
}

/**
 * Use OpenAI to polish text and auto-generate headings for Industry Insight and Personal Update.
 */
async function aiPolishAndGenerateHeadings(fields) {
    try {
        const aiService = require('../services/aiService');
        const client = aiService.getClient();
        if (!client) { console.warn('⚠️  OpenAI not available — skipping polish'); return fields; }
        const prompt = `You are an editorial assistant for Artisan, a specialist Australian creative recruitment agency.
Your tasks:
1. Fix any spelling or grammar errors in the provided text fields. Use Australian English spelling throughout (e.g. specialise, recognise, organisation, colour).
2. Generate a punchy, compelling heading (max 10 words) for the Industry Insight section based on its body text.
3. Generate a warm, personal heading (max 10 words) for the Personal Update section based on its body text.

Return ONLY valid JSON with these exact keys (no markdown, no extra text):
{
  "industry_insight_heading": "...",
  "industry_insight_body": "...",
  "life_update_heading": "...",
  "life_update_body": "...",
  "youtube_caption": "...",
  "image_caption": "...",
  "link_caption": "...",
  "event_1_description": "...",
  "event_2_description": "...",
  "event_3_description": "..."
}

Input:
- industry_insight_body: ${JSON.stringify(fields.industry_insight_body || '')}
- life_update_body: ${JSON.stringify(fields.life_update_body || '')}
- youtube_caption: ${JSON.stringify(fields.youtube_caption || '')}
- image_caption: ${JSON.stringify(fields.image_caption || '')}
- link_caption: ${JSON.stringify(fields.link_caption || '')}
- event_1_description: ${JSON.stringify(fields.event_1_description || '')}
- event_2_description: ${JSON.stringify(fields.event_2_description || '')}
- event_3_description: ${JSON.stringify(fields.event_3_description || '')}`;

        const response = await client.chat.completions.create({
            model: 'gpt-4o-mini',
            messages: [{ role: 'user', content: prompt }],
            temperature: 0.5,
            max_tokens: 900
        });
        const raw = response.choices[0].message.content.trim();
        const cleaned = raw.replace(/^```json\s*/i,'').replace(/^```\s*/i,'').replace(/```\s*$/i,'').trim();
        const polished = JSON.parse(cleaned);
        console.log('✅ OpenAI polish complete');
        return {
            ...fields,
            industry_insight_heading: polished.industry_insight_heading || '',
            industry_insight_body:    polished.industry_insight_body    || fields.industry_insight_body || '',
            life_update_heading:      polished.life_update_heading      || '',
            life_update_body:         polished.life_update_body         || fields.life_update_body || '',
            youtube_caption:  polished.youtube_caption  !== undefined ? polished.youtube_caption  : (fields.youtube_caption  || ''),
            image_caption:    polished.image_caption    !== undefined ? polished.image_caption    : (fields.image_caption    || ''),
            link_caption:     polished.link_caption     !== undefined ? polished.link_caption     : (fields.link_caption     || ''),
            event_1_description: polished.event_1_description !== undefined ? polished.event_1_description : (fields.event_1_description || ''),
            event_2_description: polished.event_2_description !== undefined ? polished.event_2_description : (fields.event_2_description || ''),
            event_3_description: polished.event_3_description !== undefined ? polished.event_3_description : (fields.event_3_description || '')
        };
    } catch (e) {
        console.warn('⚠️  OpenAI polish failed:', e.message);
        return fields;
    }
}

// ============================================================
// POST /api/consultant/parse-csv
// Accepts multipart CSV file upload (field name: "csv").
// Parses the CSV, enriches all fields, saves state.
// ============================================================
async function parseCsv(req, res) {
    console.log('\n======== CONSULTANT: PARSE CSV ========');
    try {
        if (!req.file || !req.file.buffer) {
            return res.status(400).json({ success: false, message: 'No CSV file uploaded. Attach a file with field name "csv".' });
        }

        // 1. Parse CSV
        const raw = parseCsvBuffer(req.file.buffer);
        console.log('📄 CSV fields parsed:', Object.keys(raw).join(', '));

        // 2. Validate required fields
        let consultantId = (raw.consultant || '').trim();
        if (!consultantId) return res.status(400).json({ success: false, message: 'CSV missing required field: consultant' });
        if (!raw.industry_insight_body && !raw.industry_insight) return res.status(400).json({ success: false, message: 'CSV missing required field: industry_insight_body' });
        if (!raw.life_update_body && !raw.life_update) return res.status(400).json({ success: false, message: 'CSV missing required field: life_update_body' });
        // Normalise alternate field names
        if (!raw.industry_insight_body && raw.industry_insight) raw.industry_insight_body = raw.industry_insight;
        if (!raw.life_update_body && raw.life_update) raw.life_update_body = raw.life_update;

        // 3. Load consultant config
        let consultants;
        try { consultants = loadConsultants(); } catch (e) { return res.status(500).json({ success: false, message: e.message }); }
        // If consultantId is a display name (e.g. "Debbie Younger"), convert to machine ID
        if (!consultants[consultantId]) {
            const displayNameToId = {};
            Object.entries(consultants).forEach(([id, cfg]) => {
                if (cfg.name) displayNameToId[cfg.name.toLowerCase().trim()] = id;
                // Also try slug: "Debbie Younger" -> "debbie-younger"
                displayNameToId[id.replace(/-/g, ' ').toLowerCase()] = id;
            });
            const mapped = displayNameToId[consultantId.toLowerCase().trim()];
            if (mapped) {
                console.log(`  Mapped display name "${consultantId}" -> ID "${mapped}"`);
                consultantId = mapped;
                raw.consultant = mapped;
            }
        }
        const consultantConfig = consultants[consultantId];
        if (!consultantConfig) return res.status(400).json({ success: false, message: `Unknown consultant ID: "${consultantId}". Valid IDs: ${Object.keys(consultants).join(', ')}` });

        // 4. OpenAI: polish text + generate headings
        console.log('🤖 Running OpenAI polish and heading generation...');
        const polished = await aiPolishAndGenerateHeadings(raw);

        // 5. Scrape Worth Reading URL for title + snippet
        let linkTitle = (polished.link_title || polished.link_caption || '').trim();
        let linkDescription = (polished.link_description || '').trim();
        if (polished.link_url && polished.link_url.startsWith('http')) {
            console.log(`🔗 Scraping Worth Reading URL: ${polished.link_url}`);
            const meta = await scrapePageMeta(polished.link_url);
            if (!linkTitle && meta.title) linkTitle = meta.title;
            if (!linkDescription && meta.description) linkDescription = meta.description;
        }

        // 6. Build media array
        const mediaArray = [];
        // YouTube
        if (polished.youtube_url && polished.youtube_url.startsWith('http')) {
            const ytItem = { type: 'youtube', url: polished.youtube_url, caption: polished.youtube_caption || '' };
            const ytMatch = polished.youtube_url.match(/(?:v=|youtu\.be\/|embed\/|shorts\/)?([\w-]{11})/);
            if (ytMatch) ytItem.thumbnail = `https://img.youtube.com/vi/${ytMatch[1]}/hqdefault.jpg`;
            mediaArray.push(ytItem);
        }
        // Image
        if (polished.image_url && polished.image_url.startsWith('http')) {
            mediaArray.push({ type: 'image', url: polished.image_url, caption: polished.image_caption || '' });
        }
        // Instagram
        if (polished.instagram_url && polished.instagram_url.startsWith('http')) {
            const igItem = { type: 'instagram', url: polished.instagram_url, caption: '' };
            console.log(`📸 Scraping Instagram post: ${polished.instagram_url}`);
            const igData = await fetchInstagramPostData(polished.instagram_url);
            if (igData.imageUrl) igItem.scraped_image = igData.imageUrl;
            if (igData.caption)  igItem.caption = igData.caption;
            if (igData.handle)   igItem.handle = igData.handle;
            mediaArray.push(igItem);
        }
        // Worth Reading link card
        if (polished.link_url && polished.link_url.startsWith('http')) {
            mediaArray.push({
                type: 'link',
                url: polished.link_url,
                title: linkTitle,
                caption: linkDescription || linkTitle
            });
        }

        // 7. Parse events
        const events = [];
        for (let i = 1; i <= 3; i++) {
            const title = (polished[`event_${i}_title`] || '').trim();
            if (!title) continue;
            const parsed = parseEventDate(polished[`event_${i}_date`] || '');
            events.push({
                day:         parsed ? parsed.day   : '',
                month:       parsed ? parsed.month : '',
                title,
                description: (polished[`event_${i}_description`] || '').trim(),
                link:        (polished[`event_${i}_link`]        || '').trim()
            });
        }

        // 8. Auto-fetch WordPress articles
        console.log('📰 Fetching WordPress articles...');
        const wpArticles = await fetchWordPressArticles();
        const articles = [ wpArticles[0] || {}, wpArticles[1] || {}, wpArticles[2] || {} ];

        // 9. A-List candidate
        let alistCandidate = getAListCandidateFromState();
        if (alistCandidate) { console.log(`✅ A-List candidate from state: ${alistCandidate.title}`); }
        else { console.log('ℹ️  No A-List state — fetching live...'); alistCandidate = await fetchAListCandidateLive(); }

        // 10. Live job
        const liveJob = await fetchLiveJob();

        // 11. Build parsedForTemplate (same shape as parseJSON uses)
        const parsedForTemplate = {
            consultant: consultantId,
            preheader_text: `${polished.industry_insight_heading} — from ${consultantConfig.name} at Artisan`,
            industry_insight: { heading: polished.industry_insight_heading, body: polished.industry_insight_body },
            life_update:      { heading: polished.life_update_heading,      body: polished.life_update_body },
            events
        };

        // 12. Build template params and save state
        const templateParams = buildTemplateParams(consultantConfig, parsedForTemplate, mediaArray, articles, alistCandidate, liveJob);
        const state = {
            state: 'GENERATED',
            generatedAt: new Date().toISOString(),
            consultant: consultantConfig,
            content: { industry_insight: parsedForTemplate.industry_insight, life_update: parsedForTemplate.life_update, events, media: mediaArray, articles, alist_candidate: alistCandidate },
            templateParams
        };
        writeState(state);

        console.log(`✅ CSV newsletter parsed for ${consultantConfig.name}`);
        res.json({
            success: true,
            message: `Newsletter built for ${consultantConfig.name}. ${wpArticles.length} articles auto-fetched.${alistCandidate ? ' A-List candidate included.' : ''}${liveJob ? ` Live job: ${liveJob.title}.` : ''}`,
            consultant: consultantConfig.name,
            newsletter_name: consultantConfig.newsletter_name,
            media_count: mediaArray.length,
            articles_from_wp: wpArticles.length,
            alist_candidate: !!alistCandidate,
            live_job: !!liveJob,
            state
        });
    } catch (error) {
        console.error('❌ Error parsing CSV:', error);
        res.status(500).json({ success: false, message: error.message });
    }
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
    scheduleConsultant,
    cancelConsultantSchedule,
    restoreConsultantSchedule
};
