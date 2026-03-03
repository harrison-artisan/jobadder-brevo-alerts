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

module.exports = {
    getState,
    getConsultantList,
    getProfile,
    saveProfile,
    parseJSON,
    previewConsultant,
    sendTest,
    sendToAll,
    resetState,
    scheduleConsultant,
    cancelConsultantSchedule,
    restoreConsultantSchedule
};
