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
const axios = require('axios');
const brevoService = require('../services/brevoService');
const modeService = require('../services/modeService');
const jobadderService = require('../services/jobadderService');
const candidateService = require('../services/candidateService');

const ALIST_STATE_FILE = path.join(__dirname, '..', '.alist-state.json');
const WP_API = 'https://artisan.com.au/wp-json/wp/v2';
const WP_ARTICLE_CATEGORY = 6; // 'Article' category ID

const { OpenAI } = require('openai');
const client = new OpenAI();

// ============================================================
// Fetch 3 latest Creative Community articles from WordPress
// ============================================================
async function fetchWordPressArticles() {
    try {
        const response = await axios.get(`${WP_API}/posts?categories=${WP_ARTICLE_CATEGORY}&per_page=3&orderby=date&order=desc&_fields=id,title,link,featured_media`, { timeout: 5000 });
        const posts = response.data;
        const articles = await Promise.all(posts.map(async (p) => {
            let image = 'https://artisan.com.au/wp-content/uploads/2024/03/artisan_A_RGB_artisan-A-Red.png';
            if (p.featured_media) {
                try {
                    const mediaRes = await axios.get(`${WP_API}/media/${p.featured_media}?_fields=source_url`, { timeout: 3000 });
                    if (mediaRes.data.source_url) image = mediaRes.data.source_url;
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

// ============================================================
// Fetch Instagram post data
// ============================================================
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
            title: c.title || c.currentJobTitle || '',
            image_url: c.photo || c.image_url || c.avatar_url || 'https://artisan.com.au/wp-content/uploads/2024/03/artisan_A_RGB_artisan-A-Red.png',
            mailto_link: c.mailto_link || `mailto:?subject=A-List Talent Request: ${c.title}&body=Hi, I am interested in viewing the folio for ${c.title}.`,
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
        const candidates = await jobadderService.getAListCandidates();
        if (!candidates || candidates.length === 0) {
            console.log('ℹ️  No recent candidates found in JobAdder');
            return null;
        }
        const c = candidates[0];
        return {
            title: c.currentJobTitle || 'Creative Professional',
            image_url: c.photo || 'https://artisan.com.au/wp-content/uploads/2024/03/artisan_A_RGB_artisan-A-Red.png',
            mailto_link: `mailto:?subject=A-List Talent Request: ${c.currentJobTitle}&body=Hi, I am interested in viewing the folio for this candidate.`,
            candidateId: c.candidateId || ''
        };
    } catch (e) {
        console.warn('⚠️  Live candidate fetch failed:', e.message);
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
                title: formatted.job_title || '',
                type: formatted.job_type || 'Full Time',
                location: formatted.location || '',
                description: formatted.job_description || '',
                link: formatted.apply_url || 'https://clientapps.jobadder.com/67514/artisan'
            };
        } catch (e) {
            console.warn(`⚠️  Live job fetch attempt ${attempt} failed: ${e.message}`);
            if (attempt < 2) await new Promise(r => setTimeout(r, 2000));
        }
    }
    return null;
}

const STATE_FILE = path.join(__dirname, '..', '.consultant-state.json');
const CONSULTANTS_FILE = path.join(__dirname, '..', 'config', 'consultants.json');
const TEMPLATE_FILE = path.join(__dirname, '..', 'templates', 'brevo_consultant_for_brevo.html');

function readState() {
    if (!fs.existsSync(STATE_FILE)) return { state: 'EMPTY' };
    try { return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')); } catch (e) { return { state: 'EMPTY' }; }
}

function writeState(data) {
    fs.writeFileSync(STATE_FILE, JSON.stringify(data, null, 2));
}

function loadConsultants() {
    try {
        return JSON.parse(fs.readFileSync(CONSULTANTS_FILE, 'utf8'));
    } catch (e) {
        throw new Error('Could not load consultants config.');
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
        if (!profile) return res.status(404).json({ success: false, message: 'Consultant not found' });
        res.json({ success: true, profile });
    } catch (e) {
        res.status(500).json({ success: false, message: e.message });
    }
}

function saveProfile(req, res) {
    try {
        const id = req.params.id;
        const consultants = loadConsultants();
        if (!consultants[id]) return res.status(404).json({ success: false, message: 'Consultant not found' });
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
    try { parsed = JSON.parse(json); } catch (e) { return res.status(400).json({ success: false, message: 'Invalid JSON' }); }

    const consultants = loadConsultants();
    const consultantConfig = consultants[parsed.consultant];
    if (!consultantConfig) return res.status(400).json({ success: false, message: 'Unknown consultant' });

    const wpArticles = await fetchWordPressArticles();
    const articles = [parsed.article1 || wpArticles[0] || {}, parsed.article2 || wpArticles[1] || {}, parsed.article3 || wpArticles[2] || {}];
    const alistCandidate = getAListCandidateFromState() || await fetchAListCandidateLive();
    const liveJob = await fetchLiveJob();

    const templateParams = buildTemplateParams(consultantConfig, parsed, parsed.media || [], articles, alistCandidate, liveJob);
    const state = {
        state: 'GENERATED',
        generatedAt: new Date().toISOString(),
        consultant: consultantConfig,
        content: { ...parsed, articles, alist_candidate: alistCandidate, live_job: liveJob },
        templateParams
    };
    writeState(state);
    res.json({ success: true, state });
}

// ============================================================
// CSV UPLOAD HELPERS (Restored Robust Original Logic)
// ============================================================

function splitCsvIntoLogicalRows(text) {
    const rows = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < text.length; i++) {
        const ch = text[i];
        if (ch === '"') {
            if (inQuotes && text[i + 1] === '"') { current += '""'; i++; }
            else { inQuotes = !inQuotes; current += ch; }
        } else if (ch === '\r' && text[i + 1] === '\n' && !inQuotes) {
            rows.push(current); current = ''; i++;
        } else if (ch === '\n' && !inQuotes) {
            rows.push(current); current = '';
        } else {
            current += ch;
        }
    }
    if (current.trim()) rows.push(current);
    return rows;
}

function parseCsvCell(raw) {
    if (!raw) return '';
    const s = raw.trim();
    if (s.startsWith('"')) {
        const inner = s.slice(1, s.lastIndexOf('"'));
        return inner.replace(/""/g, '"').trim();
    }
    return s;
}

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

const LABEL_TO_KEY = {
    'consultant': 'consultant',
    'your name': 'consultant',
    'industry insight body text': 'industry_insight_body',
    'industry insight': 'industry_insight_body',
    'personal update body text': 'life_update_body',
    'life update body text': 'life_update_body',
    'personal update': 'life_update_body',
    'life update': 'life_update_body',
    'youtube url': 'youtube_url',
    'youtube caption': 'youtube_caption',
    'image url': 'image_url',
    'image caption': 'image_caption',
    'instagram post url': 'instagram_url',
    'instagram url': 'instagram_url',
    'article url': 'link_url',
    'link url': 'link_url',
    'worth reading url': 'link_url',
    'event 1 date': 'event_1_date',
    'event 1 title': 'event_1_title',
    'event 1 description': 'event_1_description',
    'event 1 link url': 'event_1_link',
    'event 1 link': 'event_1_link',
    'event 2 date': 'event_2_date',
    'event 2 title': 'event_2_title',
    'event 2 description': 'event_2_description',
    'event 2 link url': 'event_2_link',
    'event 2 link': 'event_2_link',
    'event 3 date': 'event_3_date',
    'event 3 title': 'event_3_title',
    'event 3 description': 'event_3_description',
    'event 3 link url': 'event_3_link',
    'event 3 link': 'event_3_link',
};

const SECTION_CONTEXTS = [
    { pattern: /industry insight/i, bodyKey: 'industry_insight_body', captionKey: null },
    { pattern: /personal update|life update/i, bodyKey: 'life_update_body', captionKey: null },
    { pattern: /youtube/i, bodyKey: null, captionKey: 'youtube_caption' },
    { pattern: /\bimage\b/i, bodyKey: null, captionKey: 'image_caption' },
    { pattern: /instagram/i, bodyKey: null, captionKey: null },
    { pattern: /worth reading/i, bodyKey: null, captionKey: null },
    { pattern: /events?/i, bodyKey: null, captionKey: null },
];

function parseGoogleFormsCsv(lines) {
    const nonEmpty = lines.filter(l => l.trim());
    if (nonEmpty.length < 2) return null;
    const headerCells = splitCsvLine(nonEmpty[0]);
    const firstHeader = parseCsvCell(headerCells[0]).trim().toLowerCase();
    if (firstHeader !== 'timestamp') return null;
    const lastRow = nonEmpty[nonEmpty.length - 1];
    const valueCells = splitCsvLine(lastRow);
    const data = {};
    for (let i = 1; i < headerCells.length; i++) {
        const header = parseCsvCell(headerCells[i]).trim();
        const value = i < valueCells.length ? parseCsvCell(valueCells[i]).trim() : '';
        if (!header || !value) continue;
        const normHeader = header.replace(/\s*\([^)]*\)/gi, '').replace(/[^a-z0-9\s\-]/gi, ' ').replace(/\s+/g, ' ').trim().toLowerCase();
        let key = LABEL_TO_KEY[normHeader];
        if (!key) {
            const stripped = normHeader.replace(/^[\w\s]+ - /, '').trim();
            const eventMatch = normHeader.match(/event\s*(\d)[\s\-]+(date|title|description|url|link)/);
            if (eventMatch) {
                const n = eventMatch[1];
                const field = eventMatch[2] === 'url' ? 'link' : eventMatch[2];
                key = `event_${n}_${field}`;
            } else {
                key = LABEL_TO_KEY[stripped];
            }
        }
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
        if (key) data[key] = value;
    }
    return Object.keys(data).length > 0 ? data : null;
}

function parseCsvBuffer(buffer) {
    const text = buffer.toString('utf8');
    const lines = splitCsvIntoLogicalRows(text);
    const gFormsData = parseGoogleFormsCsv(lines);
    if (gFormsData) return gFormsData;
    const data = {};
    let currentSection = null;
    for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        const cells = splitCsvLine(trimmed);
        if (cells.length < 1) continue;
        const rawLabel = cells[0].trim();
        const rawValue = cells.length >= 2 ? cells.slice(1).join(',').trim() : '';
        const value = parseCsvCell(rawValue);
        const cleanLabel = rawLabel.replace(/^[\u2014\-\u2500\u2501\s]+|[\u2014\-\u2500\u2501\s]+$/g, '').replace(/\s*\(optional.*?\)/gi, '').replace(/\s*\u2014.*$/, '').replace(/\s*up to \d+.*$/i, '').trim();
        const isSectionHeader = !value && /^[\u2014\-\u2500\u2501]|section|insight|update|youtube|image|instagram|worth|event/i.test(rawLabel);
        if (isSectionHeader) {
            for (const ctx of SECTION_CONTEXTS) {
                if (ctx.pattern.test(cleanLabel)) { currentSection = ctx; break; }
            }
            continue;
        }
        const normLabel = cleanLabel.toLowerCase().replace(/[\u2605\u2714\u2713\*]+/g, '').replace(/required|optional/gi, '').replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
        let key = LABEL_TO_KEY[normLabel];
        if (!key && currentSection) {
            if (/body text|body/i.test(normLabel) && currentSection.bodyKey) key = currentSection.bodyKey;
            else if (/caption|description/i.test(normLabel) && currentSection.captionKey) key = currentSection.captionKey;
        }
        if (!key) {
            const machineKey = rawLabel.trim().toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
            const KNOWN_KEYS = ['consultant','industry_insight_body','life_update_body','youtube_url','youtube_caption','image_url','image_caption','instagram_url','link_url','event_1_date','event_1_title','event_1_description','event_1_link','event_2_date','event_2_title','event_2_description','event_2_link','event_3_date','event_3_title','event_3_description','event_3_link'];
            if (KNOWN_KEYS.includes(machineKey)) key = machineKey;
        }
        if (key && value !== '') data[key] = value;
    }
    return data;
}

function parseEventDate(dateStr) {
    if (!dateStr || !dateStr.trim()) return null;
    const s = dateStr.trim();
    const MONTHS = { january:'JAN', february:'FEB', march:'MAR', april:'APR', may:'MAY', june:'JUN', july:'JUL', august:'AUG', september:'SEP', october:'OCT', november:'NOV', december:'DEC', jan:'JAN', feb:'FEB', mar:'MAR', apr:'APR', jun:'JUN', jul:'JUL', aug:'AUG', sep:'SEP', oct:'OCT', nov:'NOV', dec:'DEC' };
    const wordMatch = s.match(/^(\d{1,2})\s+([A-Za-z]+)(?:\s+\d{2,4})?$/) || s.match(/^([A-Za-z]+)\s+(\d{1,2})(?:\s+\d{2,4})?$/);
    if (wordMatch) {
        let day, monthWord;
        if (/^\d/.test(wordMatch[1])) { day = wordMatch[1]; monthWord = wordMatch[2]; }
        else { monthWord = wordMatch[1]; day = wordMatch[2]; }
        const abbr = MONTHS[monthWord.toLowerCase()];
        if (abbr) return { day: String(parseInt(day, 10)), month: abbr };
    }
    const numMatch = s.match(/^(\d{1,2})[\/-](\d{1,2})(?:[\/-]\d{2,4})?$/);
    if (numMatch) {
        const day = numMatch[1];
        const monthNum = parseInt(numMatch[2], 10);
        const monthNames = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];
        if (monthNum >= 1 && monthNum <= 12) return { day: String(parseInt(day, 10)), month: monthNames[monthNum - 1] };
    }
    return null;
}

async function parseCsv(req, res) {
    try {
        if (!req.file || !req.file.buffer) return res.status(400).json({ success: false, message: 'No file' });
        const data = parseCsvBuffer(req.file.buffer);
        console.log('Parsed CSV data keys:', Object.keys(data));
        const consultants = loadConsultants();
        let consultantId = data.consultant;
        
        // Match by display name if needed
        if (consultantId && !consultants[consultantId]) {
            const match = Object.keys(consultants).find(id => consultants[id].name && consultants[id].name.toLowerCase() === consultantId.toLowerCase());
            if (match) consultantId = match;
        }

        const consultantConfig = consultants[consultantId];
        if (!consultantConfig) return res.status(400).json({ success: false, message: `Unknown consultant: ${consultantId}` });

        const parsed = {
            industry_insight: { heading: data.industry_insight_heading || 'Industry Insight', body: data.industry_insight_body || '' },
            life_update: { heading: data.life_update_heading || 'Life Update', body: data.life_update_body || '' },
            events: []
        };
        for (let i = 1; i <= 3; i++) {
            if (data[`event_${i}_title`]) {
                const dateInfo = parseEventDate(data[`event_${i}_date`]);
                parsed.events.push({
                    day: dateInfo ? dateInfo.day : '',
                    month: dateInfo ? dateInfo.month : '',
                    title: data[`event_${i}_title`],
                    description: data[`event_${i}_description`] || '',
                    link: data[`event_${i}_link`] || ''
                });
            }
        }

        const wpArticles = await fetchWordPressArticles();
        const articles = [wpArticles[0] || {}, wpArticles[1] || {}, wpArticles[2] || {}];
        const alistCandidate = getAListCandidateFromState() || await fetchAListCandidateLive();
        const liveJob = await fetchLiveJob();

        const templateParams = buildTemplateParams(consultantConfig, parsed, [], articles, alistCandidate, liveJob);
        const state = {
            state: 'GENERATED',
            generatedAt: new Date().toISOString(),
            consultant: consultantConfig,
            content: { ...parsed, articles, alist_candidate: alistCandidate, live_job: liveJob },
            templateParams
        };
        writeState(state);
        res.json({ success: true, state, consultant: consultantConfig.name });
    } catch (e) {
        res.status(500).json({ success: false, message: e.message });
    }
}

function buildTemplateParams(consultant, parsed, mediaArray, articles, alistCandidate, liveJob, sections, instagram_grid, instagram_caption) {
    const job = liveJob || {};
    const fallbackImg = 'https://artisan.com.au/wp-content/uploads/2024/03/artisan_A_RGB_artisan-A-Red.png';
    
    // Ensure sections is always an object with defaults
    const finalSections = sections || (parsed && parsed.sections) || {
        industry_insight: true,
        life_update: true,
        media: true,
        instagram: true,
        events: true,
        alist: true,
        job: true,
        articles: true
    };

    // Correctly map fields from either initial parse or dashboard update
    const industry_insight_heading = parsed.industry_insight_heading || (parsed.industry_insight ? (parsed.industry_insight.heading || parsed.industry_insight.title) : '');
    const industry_insight_body = parsed.industry_insight_body || (parsed.industry_insight ? parsed.industry_insight.body : '');
    
    const life_update_heading = parsed.life_update_heading || (parsed.life_update ? (parsed.life_update.heading || parsed.life_update.title) : '');
    const life_update_body = parsed.life_update_body || (parsed.life_update ? parsed.life_update.body : '');
    const life_update_images = parsed.life_update_images || (parsed.life_update ? parsed.life_update.images : []) || [];

    const preheader_text = parsed.preheader_text || (industry_insight_heading ? `${industry_insight_heading} — from ${consultant.name} at Artisan` : '');

    return {
        sections: finalSections,
        consultant: {
            newsletter_name: consultant.newsletter_name || consultant.name,
            name: consultant.name,
            title: consultant.title,
            email: consultant.email,
            phone: consultant.phone,
            linkedin: consultant.linkedin,
            photo: consultant.photo_url || consultant.photo,
            calendar_link: consultant.calendar_link || 'https://artisan.com.au/contact'
        },
        content: {
            preheader_text,
            industry_insight_heading,
            industry_insight_body,
            life_update_heading,
            life_update_body,
            life_update_images
        },
        media: {
            has_media: Array.isArray(mediaArray) && mediaArray.length > 0,
            items: (Array.isArray(mediaArray) ? mediaArray : []).map(item => {
                if (item.type === 'youtube' && item.url && !item.thumbnail) {
                    const videoIdMatch = item.url.match(/(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=))([^&?]+)/);
                    if (videoIdMatch && videoIdMatch[1]) {
                        item.thumbnail = `https://img.youtube.com/vi/${videoIdMatch[1]}/maxresdefault.jpg`;
                    }
                }
                return item;
            })
        },
        instagram_grid: instagram_grid || (parsed.instagram_grid || (parsed.instagram && parsed.instagram.images) || []),
        instagram: {
            caption: instagram_caption || (parsed.instagram_caption || (parsed.instagram && parsed.instagram.caption) || ''),
            // Add grid to the instagram object as well, as some templates might use params.instagram.grid
            grid: instagram_grid || (parsed.instagram_grid || (parsed.instagram && parsed.instagram.images) || [])
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
            link: a.link || 'https://artisan.com.au/creative-community/'
        })),
        events: (Array.isArray(parsed.events) ? parsed.events : []).map(e => {
            // Normalize event data for template
            const day = e.day || '';
            const month = (e.month || '').toUpperCase();
            const link = e.link || e.url || '';
            
            // If date is provided but day/month are missing, try to parse
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
                url: link // Ensure both are present for safety
            };
        })
    };
}

async function previewConsultant(req, res) {
    try {
        const state = readState();
        if (state.state === 'EMPTY' || !state.templateParams) {
            return res.send('<div style="padding:40px;text-align:center;"><h2>No content yet</h2></div>');
        }
        const emailPreviewService = require('../services/emailPreviewService');
        const templateHtml = fs.readFileSync(TEMPLATE_FILE, 'utf8');
        const html = emailPreviewService.replaceTemplateVariables(templateHtml, { params: state.templateParams });
        res.send(html);
    } catch (e) {
        res.status(500).send(e.message);
    }
}

async function sendTest(req, res) {
    try {
        const state = readState();
        if (state.state === 'EMPTY') return res.status(400).json({ success: false, message: 'No content to test. Please parse or build first.' });
        
        const testEmail = process.env.TEST_EMAIL || 'test@artisan.com.au';
        const templateId = state.consultant.brevo_template_id;
        
        if (!templateId) {
            return res.status(400).json({ success: false, message: 'No Brevo template ID found for this consultant.' });
        }

        // Your template uses {{ params.xxx }}. 
        // When we pass state.templateParams to Brevo, it automatically becomes the 'params' object.
        // So {{ params.consultant.name }} in the template will look for 'consultant.name' inside our object.
        await brevoService.sendBatchEmail([{ email: testEmail }], parseInt(templateId), state.templateParams);
        
        res.json({ success: true, message: `Test email sent to ${testEmail}` });
    } catch (e) {
        console.error('Error in sendTest:', e);
        res.status(500).json({ success: false, message: e.message });
    }
}

async function sendToAll(req, res) {
    try {
        const state = readState();
        if (state.state === 'EMPTY') return res.status(400).json({ success: false, message: 'No content to send.' });

        const { recipientType, recipientId } = req.body;
        let recipients = [];
        if (recipientType === 'segment') recipients = await brevoService.getSegmentContacts(recipientId);
        else if (recipientType === 'list') recipients = await brevoService.getListContacts(recipientId);

        if (recipients.length === 0) {
            return res.status(400).json({ success: false, message: 'No recipients found.' });
        }

        const templateId = state.consultant.brevo_template_id;
        if (!templateId) {
            return res.status(400).json({ success: false, message: 'No Brevo template ID found.' });
        }

        // Your template uses {{ params.xxx }}.
        await brevoService.sendBatchEmail(recipients, parseInt(templateId), state.templateParams);
        
        res.json({ success: true, message: `Newsletter sent successfully to ${recipients.length} recipients.` });
    } catch (e) {
        console.error('Error in sendToAll:', e);
        res.status(500).json({ success: false, message: e.message });
    }
}

async function updateSections(req, res) {
    try {
        const { sections, content, events, media, instagram_grid, life_update_images } = req.body;
        const state = readState();
        if (state.state === 'EMPTY') return res.status(400).json({ success: false, message: 'Empty state' });

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
                state.content.industry_insight_heading = content.industry_insight.title || content.industry_insight.heading || '';
                state.content.industry_insight_body = content.industry_insight.body || '';
                // Sync legacy objects for buildTemplateParams
                state.content.industry_insight = {
                    heading: state.content.industry_insight_heading,
                    body: state.content.industry_insight_body
                };
            }
            if (content.personal_update) {
                state.content.life_update_heading = content.personal_update.title || content.personal_update.heading || '';
                state.content.life_update_body = content.personal_update.body || '';
                // Sync legacy objects for buildTemplateParams
                state.content.life_update = {
                    heading: state.content.life_update_heading,
                    body: state.content.life_update_body,
                    images: state.content.life_update_images || []
                };
            }
            if (content.instagram) {
                state.content.instagram_caption = content.instagram.caption || '';
                // Sync legacy objects for buildTemplateParams
                state.content.instagram = {
                    caption: state.content.instagram_caption,
                    images: state.content.instagram_grid
                };
            }
        }
        
        // 3. Update Arrays
        if (events) state.content.events = events;
        if (media) state.content.media = media;
        state.content.instagram_grid = (instagram_grid || []).filter(url => !url.startsWith("data:"));
        state.content.life_update_images = (life_update_images || []).filter(url => !url.startsWith("data:"));

        // 4. Rebuild templateParams using the same logic as initial build
        state.templateParams = buildTemplateParams(
            state.consultant,
            state.content,
            state.content.media,
            state.content.articles,
            state.content.alist_candidate,
            state.content.live_job,
            state.sections,
            state.content.instagram_grid,
            state.content.instagram_caption
        );

        writeState(state);
        res.json({ success: true, state });
    } catch (e) {
        console.error('Error in updateSections:', e);
        res.status(500).json({ success: false, message: e.message });
    }
}

function resetState(req, res) {
    writeState({ state: 'EMPTY' });
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
