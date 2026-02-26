require('dotenv').config();
const express = require('express');
const cron = require('node-cron');
const jobAlertsController = require('./controllers/jobAlertsController');
const candidateAlertsController = require('./controllers/candidateAlertsController');
const xposeController = require('./controllers/xposeController');
const jobadderService = require('./services/jobadderService');
const jobTrackingService = require('./services/jobTrackingService');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
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

