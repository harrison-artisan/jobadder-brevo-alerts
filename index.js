require('dotenv').config();
const express = require('express');
const cron = require('node-cron');
const jobAlertsController = require('./controllers/jobAlertsController');
const candidateAlertsController = require('./controllers/candidateAlertsController');
const xposeController = require('./controllers/xposeController');
const contentMarketingController = require('./controllers/contentMarketingController');
const jobadderService = require('./services/jobadderService');
const jobTrackingService = require('./services/jobTrackingService');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
// Increased limit to 15mb to support base64 image uploads in Content Marketing
app.use(express.json({ limit: '15mb' }));
app.use(express.urlencoded({ extended: true, limit: '15mb' }));
app.use(express.static('public'));

// Dashboard route
app.get('/dashboard', (req, res) => {
  res.sendFile(__dirname + '/public/dashboard.html');
});

// Health check endpoint
app.get('/', (req, res) => {
  const isAuthorized = jobadderService.isAuthorized();
  const testMode = process.env.TEST_MODE === 'true';
  const testEmail = process.env.TEST_EMAIL;
  
  res.json({ 
    status: 'running',
    service: 'JobAdder to Brevo Job Alerts',
    version: '1.0.1',
    test_mode: testMode,
    test_email: testMode ? testEmail : null,
    jobadder_authorized: isAuthorized,
    message: isAuthorized ? (testMode ? `🧪 TEST MODE: Emails will only send to ${testEmail}` : 'Ready to send job alerts') : 'Please complete JobAdder authorization at /auth/jobadder'
  });
});

// OAuth2 Authorization Flow
app.get('/auth/jobadder', (req, res) => {
  const authUrl = jobadderService.getAuthorizationUrl();
  res.redirect(authUrl);
});

app.get('/auth/callback', async (req, res) => {
  const { code, error } = req.query;
  
  if (error) {
    return res.status(400).send(`Authorization failed: ${error}`);
  }
  
  if (!code) {
    return res.status(400).send('No authorization code received');
  }
  
try {
  await jobadderService.exchangeCodeForTokens(code);
  res.redirect('/dashboard');
} catch (error) {
  res.status(500).send(`Authorization failed: ${error.message}`);
}
  
});

// Webhook endpoint for JobAdder
app.post('/webhook/jobadder', async (req, res) => {
  await jobAlertsController.handleJobPostedWebhook(req, res);
});

// Get live jobs list for dashboard dropdown
app.get('/api/jobs', async (req, res) => {
  try {
    if (!jobadderService.isAuthorized()) {
      return res.status(401).json({ 
        error: 'Not authorized', 
        message: 'Please complete JobAdder authorization first' 
      });
    }
    
    const jobs = await jobadderService.getLiveJobs();
    
    // Return simplified job list for dropdown
    const jobList = jobs.map(job => ({
      adId: job.adId,
      title: job.title,
      reference: job.reference
    }));
    
    res.json({ jobs: jobList });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /api/jobs/for-post - Return rich job data for the LinkedIn Job Listing post card
app.get('/api/jobs/for-post', async (req, res) => {
  try {
    if (!jobadderService.isAuthorized()) {
      return res.status(401).json({ success: false, message: 'JobAdder is not connected.' });
    }
    const jobs = await jobadderService.getLiveJobs();
    // Build a richer object for each job
    const jobList = jobs.map(job => {
      const d = job.jobDetails || {};
      // Job URL: prefer the ad's apply URL, fall back to a constructed URL
      const jobUrl = job.applyUrl || job.url ||
        (job.adId ? `https://app.jobadder.com/jobs/${job.adId}` : null);
      // Location
      const location = d.location
        ? (d.location.name || d.location.city || d.location.state || '')
        : (job.location || '');
      // Work type
      const workType = d.workType
        ? (d.workType.name || d.workType)
        : (job.workType || '');
      // Salary
      const salary = d.salary
        ? [d.salary.rateLow, d.salary.rateHigh].filter(Boolean).join(' - ') + (d.salary.ratePer ? ' per ' + d.salary.ratePer : '')
        : '';
      // Short description — strip HTML tags
      const rawDesc = d.description || job.description || '';
      const description = rawDesc.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().substring(0, 300);
      return {
        adId: job.adId,
        title: d.title || job.title || '',
        reference: job.reference || '',
        location,
        workType,
        salary,
        description,
        jobUrl,
      };
    });
    res.json({ success: true, jobs: jobList });
  } catch (err) {
    console.error('[Jobs] for-post error:', err.message);
    res.status(500).json({ success: false, message: err.message });
  }
});

// Manual trigger endpoints (for testing)
app.post('/trigger/daily-roundup', async (req, res) => {
  try {
    if (!jobadderService.isAuthorized()) {
      return res.status(401).json({ 
        error: 'Not authorized', 
        message: 'Please complete JobAdder authorization at /auth/jobadder' 
      });
    }
    const { recipientType, recipientId } = req.body;
    const result = await jobAlertsController.sendDailyRoundup({ recipientType, recipientId });
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/trigger/single-job/:adId', async (req, res) => {
  try {
    if (!jobadderService.isAuthorized()) {
      return res.status(401).json({ 
        error: 'Not authorized', 
        message: 'Please complete JobAdder authorization at /auth/jobadder' 
      });
    }
    const { recipientType, recipientId } = req.body;
    const result = await jobAlertsController.sendSingleJobAlert(req.params.adId, { recipientType, recipientId });
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Daily alerts state management
app.get('/api/daily-alerts/state', (req, res) => {
  try {
    const state = jobTrackingService.getState();
    res.json(state);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/daily-alerts/toggle', (req, res) => {
  try {
    const newState = jobTrackingService.toggleState();
    res.json(newState);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// OpenAI Status API
app.get('/api/openai/status', async (req, res) => {
  try {
    // Simple check - try to access OpenAI API key
    const apiKey = process.env.OPENAI_API_KEY;
    if (apiKey && apiKey.length > 0) {
      res.json({ status: 'connected', message: 'OpenAI API key configured' });
    } else {
      res.json({ status: 'disconnected', message: 'OpenAI API key not found' });
    }
  } catch (error) {
    res.status(500).json({ status: 'error', message: error.message });
  }
});

// Brevo Segments and Lists API
const brevoService = require('./services/brevoService');

app.get('/api/brevo/segments', async (req, res) => {
  try {
    const segments = await brevoService.getSegments();
    res.json({ segments });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get contact count for a specific segment (on-demand)
app.get('/api/brevo/segment/:id/count', async (req, res) => {
  try {
    const axios = require('axios');
    
    // Get contacts in segment - the response includes a 'count' field
    const response = await axios.get(
      `https://api.brevo.com/v3/contacts`,
      {
        headers: {
          'api-key': process.env.BREVO_API_KEY,
          'Content-Type': 'application/json'
        },
        params: {
          segmentId: req.params.id,
          limit: 1  // We only need the count, not the actual contacts
        }
      }
    );
    
    // The response has a 'count' field with the total number of contacts
    const count = response.data.count || 0;
    console.log(`✅ Segment ${req.params.id} has ${count} contacts`);
    res.json({ count });
  } catch (error) {
    console.error(`❌ Error fetching count for segment ${req.params.id}:`, error.response?.data || error.message);
    res.status(500).json({ error: error.response?.data?.message || error.message });
  }
});

// Get contact count for a specific list (on-demand)
app.get('/api/brevo/list/:id/count', async (req, res) => {
  try {
    const axios = require('axios');
    
    // Get contacts in list - the response includes a 'count' field
    const response = await axios.get(
      `https://api.brevo.com/v3/contacts`,
      {
        headers: {
          'api-key': process.env.BREVO_API_KEY,
          'Content-Type': 'application/json'
        },
        params: {
          listIds: [req.params.id],
          limit: 1  // We only need the count, not the actual contacts
        }
      }
    );
    
    // The response has a 'count' field with the total number of contacts
    const count = response.data.count || 0;
    console.log(`✅ List ${req.params.id} has ${count} contacts`);
    res.json({ count });
  } catch (error) {
    console.error(`❌ Error fetching count for list ${req.params.id}:`, error.response?.data || error.message);
    res.status(500).json({ error: error.response?.data?.message || error.message });
  }
});

app.get('/api/brevo/lists', async (req, res) => {
  try {
    const lists = await brevoService.getLists();
    res.json({ lists });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// A-List API endpoints
app.post('/api/alist/schedule', async (req, res) => {
  try {
    const { recipientType, recipientId } = req.body;
    const result = await candidateAlertsController.scheduleForFriday({ recipientType, recipientId });
    res.json(result);
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

app.get('/api/alist/state', async (req, res) => {
  try {
    const state = candidateAlertsController.getState();
    res.json(state);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/alist/generate', async (req, res) => {
  try {
    if (!jobadderService.isAuthorized()) {
      return res.status(401).json({ 
        error: 'Not authorized', 
        message: 'Please complete JobAdder authorization at /auth/jobadder' 
      });
    }
    const result = await candidateAlertsController.generateAList();
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/alist/send-test', async (req, res) => {
  try {
    if (!jobadderService.isAuthorized()) {
      return res.status(401).json({ 
        error: 'Not authorized', 
        message: 'Please complete JobAdder authorization at /auth/jobadder' 
      });
    }
    const result = await candidateAlertsController.sendTest();
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/alist/send', async (req, res) => {
  try {
    if (!jobadderService.isAuthorized()) {
      return res.status(401).json({ 
        error: 'Not authorized', 
        message: 'Please complete JobAdder authorization at /auth/jobadder' 
      });
    }
    const { recipientType, recipientId } = req.body;
    const result = await candidateAlertsController.sendToAll({ recipientType, recipientId });
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/alist/reset', async (req, res) => {
  try {
    const result = candidateAlertsController.resetState();
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ===============================================
// XPOSE NEWSLETTER API ENDPOINTS
// ===============================================
app.get('/api/xpose/state', async (req, res) => {
  try {
    if (!jobadderService.isAuthorized()) {
      return res.status(401).json({ 
        error: 'Not authorized', 
        message: 'Please complete JobAdder authorization at /auth/jobadder' 
      });
    }
    await xposeController.getState(req, res);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/xpose/schedule', async (req, res) => {
  try {
    const { recipientType, recipientId } = req.body;
    const result = await xposeController.scheduleForThursday({ recipientType, recipientId });
    res.json(result);
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

app.post('/api/xpose/generate', async (req, res) => {
  try {
    if (!jobadderService.isAuthorized()) {
      return res.status(401).json({ 
        error: 'Not authorized', 
        message: 'Please complete JobAdder authorization at /auth/jobadder' 
      });
    }
    await xposeController.generateXpose(req, res);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/xpose/send-test', async (req, res) => {
  try {
    if (!jobadderService.isAuthorized()) {
      return res.status(401).json({ 
        error: 'Not authorized', 
        message: 'Please complete JobAdder authorization at /auth/jobadder' 
      });
    }
    await xposeController.sendTest(req, res);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/xpose/send', async (req, res) => {
  try {
    if (!jobadderService.isAuthorized()) {
      return res.status(401).json({ 
        error: 'Not authorized', 
        message: 'Please complete JobAdder authorization at /auth/jobadder' 
      });
    }
    await xposeController.sendToAll(req, res);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/xpose/articles', async (req, res) => {
  try {
    if (!jobadderService.isAuthorized()) {
      return res.status(401).json({ 
        error: 'Not authorized', 
        message: 'Please complete JobAdder authorization at /auth/jobadder' 
      });
    }
    await xposeController.getAllArticles(req, res);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/xpose/send-test-article/:articleId', async (req, res) => {
  try {
    if (!jobadderService.isAuthorized()) {
      return res.status(401).json({ 
        error: 'Not authorized', 
        message: 'Please complete JobAdder authorization at /auth/jobadder' 
      });
    }
    await xposeController.sendTestSingleArticle(req, res);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Preview routes
app.get('/api/preview/xpose-newsletter', async (req, res) => {
  try {
    await xposeController.previewNewsletter(req, res);
  } catch (error) {
    res.status(500).send('<div style="padding: 40px; text-align: center;"><h2>Error</h2><p>' + error.message + '</p></div>');
  }
});

app.get('/api/preview/xpose-article/:articleId', async (req, res) => {
  try {
    await xposeController.previewSingleArticle(req, res);
  } catch (error) {
    res.status(500).send('<div style="padding: 40px; text-align: center;"><h2>Error</h2><p>' + error.message + '</p></div>');
  }
});

app.get('/api/preview/job/:jobId', async (req, res) => {
  try {
    await jobAlertsController.previewSingleJob(req, res);
  } catch (error) {
    res.status(500).send('<div style="padding: 40px; text-align: center;"><h2>Error</h2><p>' + error.message + '</p></div>');
  }
});

app.get('/api/preview/alist', async (req, res) => {
  try {
    await candidateAlertsController.previewAlist(req, res);
  } catch (error) {
    res.status(500).send('<div style="padding: 40px; text-align: center;"><h2>Error</h2><p>' + error.message + '</p></div>');
  }
});

app.post('/api/xpose/send-article/:articleId', async (req, res) => {
  try {
    if (!jobadderService.isAuthorized()) {
      return res.status(401).json({ 
        error: 'Not authorized', 
        message: 'Please complete JobAdder authorization at /auth/jobadder' 
      });
    }
    await xposeController.sendSingleArticle(req, res);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Schedule daily job roundup at 2 PM (14:00) every day
// Cron format: second minute hour day month dayOfWeek
cron.schedule('0 14 * * *', async () => {
  console.log('⏰ Scheduled task triggered: Daily job roundup at 2 PM');
  
  if (!jobadderService.isAuthorized()) {
    console.error('❌ Cannot run scheduled task: JobAdder not authorized');
    return;
  }
  
  try {
    await jobAlertsController.sendDailyRoundup();
  } catch (error) {
    console.error('❌ Scheduled task failed:', error);
  }
}, {
  timezone: "Australia/Sydney" // Adjust to your timezone
});

// ============================================================
// Content Marketing Routes
// ============================================================

// GET  /api/content/state                - Restore saved state (article + image)
app.get('/api/content/state', async (req, res) => {
  await contentMarketingController.getState(req, res);
});

// GET  /api/content/wp-categories         - Fetch WordPress categories
app.get('/api/content/wp-categories', async (req, res) => {
  await contentMarketingController.getWordPressCategories(req, res);
});

// POST /api/content/generate-article      - STEP 1: Generate article copy
app.post('/api/content/generate-article', async (req, res) => {
  await contentMarketingController.generateArticle(req, res);
});

// POST /api/content/generate-image        - STEP 2: Generate header image
app.post('/api/content/generate-image', async (req, res) => {
  await contentMarketingController.generateImage(req, res);
});

// POST /api/content/publish               - STEP 3: Publish to WordPress
app.post('/api/content/publish', async (req, res) => {
  await contentMarketingController.publishToWordPress(req, res);
});

// POST /api/content/social-posts          - Generate social media post copy
app.post('/api/content/social-posts', async (req, res) => {
  await contentMarketingController.generateSocialPosts(req, res);
});

// POST /api/content/reset                 - Reset content state
app.post('/api/content/reset', async (req, res) => {
  await contentMarketingController.resetState(req, res);
});

// ============================================================
// LinkedIn OAuth + Posting Routes
// ============================================================
const linkedinService = require('./services/linkedinService');
const aiService = require('./services/aiService');
const crypto = require('crypto');

// In-memory CSRF state store (keyed by state string, value = timestamp)
const linkedinStateStore = {};

// GET /auth/linkedin - Start OAuth flow (redirect to LinkedIn)
app.get('/auth/linkedin', (req, res) => {
  try {
    const state = crypto.randomBytes(16).toString('hex');
    linkedinStateStore[state] = Date.now();
    // Clean up states older than 10 minutes
    const cutoff = Date.now() - 10 * 60 * 1000;
    Object.keys(linkedinStateStore).forEach(k => { if (linkedinStateStore[k] < cutoff) delete linkedinStateStore[k]; });
    const authUrl = linkedinService.getAuthUrl(state);
    res.redirect(authUrl);
  } catch (err) {
    console.error('[LinkedIn] Auth URL error:', err.message);
    res.redirect('/dashboard?linkedin=error&msg=' + encodeURIComponent(err.message));
  }
});

// GET /auth/linkedin/callback - LinkedIn redirects here after user approves
app.get('/auth/linkedin/callback', async (req, res) => {
  const { code, state, error, error_description } = req.query;
  if (error) {
    console.error('[LinkedIn] OAuth error:', error, error_description);
    return res.redirect('/dashboard?linkedin=error&msg=' + encodeURIComponent(error_description || error));
  }
  if (!state || !linkedinStateStore[state]) {
    return res.redirect('/dashboard?linkedin=error&msg=Invalid+state+parameter');
  }
  delete linkedinStateStore[state];
  try {
    await linkedinService.exchangeCodeForToken(code);
    res.redirect('/dashboard?linkedin=connected');
  } catch (err) {
    console.error('[LinkedIn] Token exchange error:', err.message);
    res.redirect('/dashboard?linkedin=error&msg=' + encodeURIComponent(err.message));
  }
});

// GET /api/linkedin/status - Get current token status
app.get('/api/linkedin/status', (req, res) => {
  res.json(linkedinService.getTokenStatus());
});

// GET /api/linkedin/debug-token - Introspect the live token and return scopes + org access
app.get('/api/linkedin/debug-token', async (req, res) => {
  try {
    const axios = require('axios');
    const status = linkedinService.getTokenStatus();
    if (!status.connected) {
      return res.json({ connected: false, status: status.status, message: 'No active token. Please reconnect LinkedIn.' });
    }
    // Call LinkedIn token introspection endpoint
    const tokenStore = linkedinService._getTokenStore ? linkedinService._getTokenStore() : null;
    // Access token is not directly exposed — call /v2/me to verify it works
    const accessToken = process.env.LINKEDIN_ACCESS_TOKEN ||
      (linkedinService._tokenStore && linkedinService._tokenStore.accessToken) || null;
    const results = { status, accessToken: accessToken ? accessToken.substring(0, 12) + '...' : 'not accessible from route' };
    // Try calling /v2/me
    try {
      const meResp = await axios.get('https://api.linkedin.com/v2/me', {
        headers: { Authorization: `Bearer ${accessToken}`, 'X-Restli-Protocol-Version': '2.0.0' }
      });
      results.meCall = { ok: true, id: meResp.data.id };
    } catch (e) {
      results.meCall = { ok: false, status: e.response && e.response.status, message: e.message };
    }
    // Try calling /v2/organizationAcls to check org write access
    try {
      const orgResp = await axios.get(
        'https://api.linkedin.com/v2/organizationAcls?q=roleAssignee&role=ADMINISTRATOR&projection=(elements*(organization~(id,localizedName)))',
        { headers: { Authorization: `Bearer ${accessToken}`, 'X-Restli-Protocol-Version': '2.0.0' } }
      );
      results.orgAclCall = { ok: true, count: (orgResp.data.elements || []).length, orgs: (orgResp.data.elements || []).map(e => e['organization~'] && e['organization~'].localizedName) };
    } catch (e) {
      results.orgAclCall = { ok: false, status: e.response && e.response.status, message: e.message };
    }
    // Try fetching recent posts to check r_organization_social
    try {
      const postsResp = await axios.get(
        'https://api.linkedin.com/rest/posts?author=urn%3Ali%3Aorganization%3A832171&q=author&count=3',
        { headers: { Authorization: `Bearer ${accessToken}`, 'X-Restli-Protocol-Version': '2.0.0', 'LinkedIn-Version': '202502' } }
      );
      results.orgPostsCall = { ok: true, count: (postsResp.data.elements || []).length };
    } catch (e) {
      results.orgPostsCall = { ok: false, status: e.response && e.response.status, message: e.message };
    }
    res.json(results);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/linkedin/disconnect - Clear the stored token
app.post('/api/linkedin/disconnect', (req, res) => {
  linkedinService.disconnect();
  res.json({ success: true, message: 'LinkedIn disconnected.' });
});

// POST /api/linkedin/post - Post to LinkedIn
app.post('/api/linkedin/post', async (req, res) => {
  const { text, articleUrl, jobUrl, title, jobTitle, description } = req.body;
  const resolvedUrl   = articleUrl || jobUrl || null;
  const resolvedTitle = title     || jobTitle || '';
  if (!text) return res.status(400).json({ success: false, message: 'Post text is required.' });
  try {
    let result;
    if (resolvedUrl) {
      result = await linkedinService.postArticleToLinkedIn(text, resolvedUrl, resolvedTitle, description || '');
    } else {
      result = await linkedinService.postToLinkedIn(text);
    }
    res.json({ success: true, postId: result.id, message: 'Posted to LinkedIn successfully.' });
  } catch (err) {
    console.error('[LinkedIn] Post error:', err.response ? JSON.stringify(err.response.data) : err.message);
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/linkedin/generate-poll - AI-generate a poll suggestion
app.post('/api/linkedin/generate-poll', async (req, res) => {
  try {
    const { prompt } = req.body;
    const suggestion = await aiService.generatePollSuggestion(prompt || '');
    res.json({ success: true, suggestion });
  } catch (err) {
    console.error('[AI] Generate poll error:', err.message);
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/linkedin/generate-job-post - AI-generate punchy LinkedIn job post copy
app.post('/api/linkedin/generate-job-post', async (req, res) => {
  try {
    const { job } = req.body;
    if (!job || !job.title) return res.status(400).json({ success: false, message: 'Job details are required.' });
    const copy = await aiService.generateJobPost(job);
    res.json({ success: true, copy });
  } catch (err) {
    console.error('[AI] Generate job post error:', err.message);
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/linkedin/recent-polls - Fetch recent polls from Artisan Company Page
app.get('/api/linkedin/recent-polls', async (req, res) => {
  try {
    const polls = await linkedinService.getRecentPolls(5);
    res.json({ success: true, polls });
  } catch (err) {
    console.error('[LinkedIn] Recent polls error:', err.response ? JSON.stringify(err.response.data) : err.message);
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/linkedin/post-image - Post with image to LinkedIn
app.post('/api/linkedin/post-image', async (req, res) => {
  const { text, imageBase64, mimeType, imageTitle } = req.body;
  if (!text) return res.status(400).json({ success: false, message: 'Post text is required.' });
  if (!imageBase64) return res.status(400).json({ success: false, message: 'Image data is required.' });
  try {
    const base64Data = imageBase64.replace(/^data:[^;]+;base64,/, '');
    const imageBuffer = Buffer.from(base64Data, 'base64');
    const mime = mimeType || 'image/jpeg';
    const result = await linkedinService.postWithImage(text, imageBuffer, mime, imageTitle || '');
    res.json({ success: true, postId: result.id, message: 'Image post published to LinkedIn.' });
  } catch (err) {
    console.error('[LinkedIn] Image post error:', err.response ? JSON.stringify(err.response.data) : err.message);
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/linkedin/post-poll - Post a poll to LinkedIn
app.post('/api/linkedin/post-poll', async (req, res) => {
  const { text, question, options, duration } = req.body;
  if (!text) return res.status(400).json({ success: false, message: 'Post text is required.' });
  if (!question) return res.status(400).json({ success: false, message: 'Poll question is required.' });
  if (!options || options.length < 2) return res.status(400).json({ success: false, message: 'At least 2 poll options are required.' });
  try {
    const result = await linkedinService.postPoll(text, question, options, duration || 'ONE_WEEK');
    res.json({ success: true, postId: result.id, message: 'Poll published to LinkedIn.' });
  } catch (err) {
    console.error('[LinkedIn] Poll error:', err.response ? JSON.stringify(err.response.data) : err.message);
    res.status(500).json({ success: false, message: err.message });
  }
});

// Start server
app.listen(PORT, () => {
  const isAuthorized = jobadderService.isAuthorized();
  const testMode = process.env.TEST_MODE === 'true';
  const testEmail = process.env.TEST_EMAIL;
  
  console.log(`
╔═══════════════════════════════════════════════════════════╗
║                                                           ║
║   🚀 JobAdder to Brevo Job Alerts System                 ║
║                                                           ║
║   Server running on port ${PORT}                            ║
║   Daily roundup scheduled for 2 PM (Australia/Sydney)    ║
║                                                           ║
║   Mode: ${testMode ? '🧪 TEST MODE' : '🌐 PRODUCTION'}                                  ║
║   ${testMode ? `Test Email: ${testEmail}` : '                                                     '}               ║
║                                                           ║
║   JobAdder Status: ${isAuthorized ? '✅ Authorized' : '❌ Not Authorized'}                   ║
║   ${!isAuthorized ? 'Visit /auth/jobadder to authorize' : '                                   '}                      ║
║                                                           ║
║   Endpoints:                                              ║
║   GET  /                                                  ║
║   GET  /auth/jobadder                                     ║
║   GET  /auth/callback                                     ║
║   POST /webhook/jobadder                                  ║
║   POST /trigger/daily-roundup                             ║
║   POST /trigger/single-job/:jobId                         ║
║                                                           ║
╚═══════════════════════════════════════════════════════════╝
  `);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM signal received: closing HTTP server');
  process.exit(0);
});

