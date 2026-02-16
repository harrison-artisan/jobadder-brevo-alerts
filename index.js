require('dotenv').config();
const express = require('express');
const cron = require('node-cron');
const jobAlertsController = require('./controllers/jobAlertsController');
const jobadderService = require('./services/jobadderService');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

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
    res.send(`
      <html>
        <body style="font-family: Arial, sans-serif; padding: 40px; text-align: center;">
          <h1 style="color: #27AE60;">✅ Authorization Successful!</h1>
          <p>JobAdder has been connected successfully.</p>
          <p>You can now close this window and use the job alerts system.</p>
          <a href="/" style="display: inline-block; margin-top: 20px; padding: 10px 20px; background: #E74C3C; color: white; text-decoration: none; border-radius: 4px;">Go to Dashboard</a>
        </body>
      </html>
    `);
  } catch (error) {
    res.status(500).send(`Authorization failed: ${error.message}`);
  }
});

// Webhook endpoint for JobAdder
app.post('/webhook/jobadder', async (req, res) => {
  await jobAlertsController.handleJobPostedWebhook(req, res);
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

app.post('/trigger/single-job/:jobId', async (req, res) => {
  try {
    if (!jobadderService.isAuthorized()) {
      return res.status(401).json({ 
        error: 'Not authorized', 
        message: 'Please complete JobAdder authorization at /auth/jobadder' 
      });
    }
    const result = await jobAlertsController.sendSingleJobAlert(req.params.jobId);
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
