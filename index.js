require('dotenv').config();
const express = require('express');
const cron = require('node-cron');
const jobAlertsController = require('./controllers/jobAlertsController');
const candidateAlertsController = require('./controllers/candidateAlertsController');
const xposeController = require('./controllers/xposeController');
const jobadderService = require('./services/jobadderService');

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
    // Redirect to dashboard after successful authorization
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

// A-List API endpoints
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
    const result = await candidateAlertsController.sendToAll();
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

// Manual trigger endpoints (for testing)
app.post('/trigger/daily-roundup', async (req, res) => {
  try {
    if (!jobadderService.isAuthorized()) {
      return res.status(401).json({ 
        error: 'Not authorized', 
        message: 'Please complete JobAdder authorization at /auth/jobadder' 
      });
    }
    const result = await jobAlertsController.sendDailyRoundup();
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
    const result = await jobAlertsController.sendSingleJobAlert(req.params.adId);
    res.json(result);
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
