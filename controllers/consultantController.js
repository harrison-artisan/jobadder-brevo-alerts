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
const brevoService = require('../services/brevoService');

const STATE_FILE = path.join(__dirname, '..', '.consultant-state.json');
const CONSULTANTS_FILE = path.join(__dirname, '..', 'config', 'consultants.json');
const TEMPLATE_FILE = path.join(__dirname, '..', 'templates', 'brevo_template_consultant_newsletter.html');

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
        return JSON.parse(fs.readFileSync(CONSULTANTS_FILE, 'utf8'));
    } catch (e) {
        throw new Error('Could not load consultants config. Check config/consultants.json.');
    }
}

function saveConsultants(data) {
    fs.writeFileSync(CONSULTANTS_FILE, JSON.stringify(data, null, 2));
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
        console.log(`✅ Profile saved for ${consultants[id].name}`);
        res.json({ success: true, message: `Profile saved for ${consultants[id].name}.`, consultant: consultants[id] });
    } catch (error) {
        console.error('❌ Error saving profile:', error.message);
        res.status(500).json({ success: false, message: error.message });
    }
}

// ============================================================
// POST /api/consultant/parse
// Accepts raw JSON from Gemini Gem, validates, merges with config
// ============================================================
function parseJSON(req, res) {
    console.log('\n======== CONSULTANT: PARSE JSON ========');

    const { jsonText, mediaType, mediaUrl, mediaCaption } = req.body;
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

    // Resolve media — dashboard override takes priority over Gemini JSON
    const resolvedMedia = {
        type: mediaType || (parsed.media && parsed.media.type) || consultantConfig.media_type_default || 'none',
        url: mediaUrl || (parsed.media && parsed.media.url) || '',
        caption: mediaCaption || (parsed.media && parsed.media.caption) || ''
    };

    // Build the merged state object
    const state = {
        state: 'GENERATED',
        generatedAt: new Date().toISOString(),
        consultant: consultantConfig,
        content: {
            industry_insight: parsed.industry_insight,
            life_update: parsed.life_update,
            events: events,
            media: resolvedMedia
        },
        templateParams: buildTemplateParams(consultantConfig, parsed, resolvedMedia)
    };

    writeState(state);
    console.log(`✅ Consultant newsletter parsed for ${consultantConfig.name}`);

    res.json({
        success: true,
        message: `Newsletter content parsed for ${consultantConfig.name}.`,
        consultant: consultantConfig.name,
        newsletter_name: consultantConfig.newsletter_name,
        media: resolvedMedia,
        state
    });
}

// ============================================================
// Build flat template params for Brevo
// ============================================================
function buildTemplateParams(consultant, parsed, media) {
    const a1 = parsed.article1 || {};
    const a2 = parsed.article2 || {};
    const a3 = parsed.article3 || {};
    const job = parsed.job || {};
    const m = media || {};

    return {
        // Newsletter identity
        newsletter_name: consultant.newsletter_name || consultant.name,
        consultant_name: consultant.name,
        consultant_title: consultant.title,
        consultant_email: consultant.email,
        consultant_phone: consultant.phone,
        consultant_linkedin: consultant.linkedin,
        consultant_photo: consultant.photo_url,
        calendar_link: consultant.calendar_link || 'https://artisan.com.au/contact',

        // Email metadata
        preheader_text: parsed.preheader_text || `${parsed.industry_insight.heading} — from ${consultant.name} at Artisan`,

        // Industry insight
        industry_insight_heading: parsed.industry_insight.heading,
        industry_insight_body: parsed.industry_insight.body,

        // Life update
        life_update_heading: parsed.life_update.heading,
        life_update_body: parsed.life_update.body,

        // Personal media
        media_type: m.type || 'none',
        media_url: m.url || '',
        media_caption: m.caption || '',

        // Featured job ad
        job_title: job.title || '',
        job_type: job.type || 'Full Time',
        job_location: job.location || '',
        job_salary: job.salary || '',
        job_description: job.description || '',
        job_link: job.link || 'https://clientapps.jobadder.com/67514/artisan',

        // Creative Community articles
        article1_title: a1.title || '',
        article1_image: a1.image || 'https://artisan.com.au/wp-content/uploads/2024/03/artisan_A_RGB_artisan-A-Red.png',
        article1_link: a1.link || 'https://artisan.com.au/creative-community/',
        article2_title: a2.title || '',
        article2_image: a2.image || 'https://artisan.com.au/wp-content/uploads/2024/03/artisan_A_RGB_artisan-A-Red.png',
        article2_link: a2.link || 'https://artisan.com.au/creative-community/',
        article3_title: a3.title || '',
        article3_image: a3.image || 'https://artisan.com.au/wp-content/uploads/2024/03/artisan_A_RGB_artisan-A-Red.png',
        article3_link: a3.link || 'https://artisan.com.au/creative-community/',

        // Events
        events: Array.isArray(parsed.events) ? parsed.events : [],

        // Brevo system vars (overridden in preview)
        update_profile: '{{ update_profile }}',
        unsubscribe: '{{ unsubscribe }}'
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
    const data = { ...params };
    data.update_profile = 'https://artisan.com.au/email-preferences';
    data.unsubscribe = 'https://artisan.com.au/unsubscribe';
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

module.exports = {
    getState,
    getConsultantList,
    getProfile,
    saveProfile,
    parseJSON,
    previewConsultant,
    sendTest,
    sendToAll,
    resetState
};
