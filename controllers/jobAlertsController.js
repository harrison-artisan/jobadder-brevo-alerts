const jobadderService = require('../services/jobadderService');
const brevoService = require('../services/brevoService');
const jobTrackingService = require('../services/jobTrackingService');
const wordpressService = require('../services/wordpressService');

class JobAlertsController {
  /**
   * Fetch the latest 3 articles from WordPress for use in job alert emails.
   * Returns a safe fallback empty array if the fetch fails.
   */
  async getLatestArticles() {
    try {
      const articles = await wordpressService.getLatestArticles(3);
      const list = articles || [];
      return {
        article1: list[0] || null,
        article2: list[1] || null,
        article3: list[2] || null,
      };
    } catch (err) {
      console.warn('⚠️  Could not fetch WordPress articles for email:', err.message);
      return { article1: null, article2: null, article3: null };
    }
  }

  /**
   * Send daily roundup of all live jobs (ONLY if new jobs detected)
   */
  async sendDailyRoundup() {
    console.log('\n🔄 Starting daily job roundup...');
    
    try {
      // 0. Check if daily alerts are activated
      const state = jobTrackingService.getState();
      if (!state.activated) {
        console.log('⏸️  Daily alerts are deactivated. Skipping roundup.');
        return { success: true, message: 'Daily alerts are deactivated' };
      }

      // 1. Fetch all live jobs from JobAdder
      console.log('📋 Fetching live jobs from JobAdder...');
      const liveJobs = await jobadderService.getLiveJobs();
      
      if (!liveJobs || liveJobs.length === 0) {
        console.log('⚠️  No live jobs found. Skipping email send.');
        return { success: true, message: 'No live jobs to send' };
      }

      // 2. Check for new jobs
      const jobCheck = jobTrackingService.checkForNewJobs(liveJobs);
      
      if (!jobCheck.hasNewJobs) {
        console.log('⏭️  No new jobs detected. Skipping email send to avoid duplicates.');
        return { success: true, message: 'No new jobs posted today' };
      }

      console.log(`🆕 ${jobCheck.newJobIds.length} new job(s) detected! Proceeding with email...`);

      // 3. Limit to 10 most recent jobs
      const recentJobs = liveJobs.slice(0, 10);
      console.log(`📊 Sending ${recentJobs.length} most recent jobs (out of ${liveJobs.length} total)`);

      // 4. Format jobs for email
      const jobsData = recentJobs.map(job => jobadderService.formatJobForEmail(job));

      // 5. Fetch latest 3 WordPress articles for the Creative Community section
      console.log('📰 Fetching latest articles from WordPress...');
      const articleParams = await this.getLatestArticles();

      // 6. Get recipients from Brevo
      console.log('👥 Fetching recipients from Brevo...');
      const recipients = await brevoService.getJobAlertContacts();

      if (!recipients || recipients.length === 0) {
        console.log('⚠️  No recipients with JOB_ALERTS = Yes found. Skipping email send.');
        return { success: true, message: 'No recipients found' };
      }

      // 7. Send batch email with job data array and articles
      console.log(`📧 Sending daily roundup to ${recipients.length} recipients...`);
      await brevoService.sendBatchEmail(
        recipients,
        process.env.DAILY_ROUNDUP_TEMPLATE_ID,
        { jobs: jobsData, job_count: jobsData.length, ...articleParams }
      );

      // 8. Update tracking file with all current job IDs
      jobTrackingService.updateSentJobIds(jobCheck.allCurrentJobIds);

      console.log('✅ Daily roundup completed successfully!\n');
      return { 
        success: true, 
        message: `Sent ${recentJobs.length} jobs (${jobCheck.newJobIds.length} new) to ${recipients.length} recipients` 
      };
    } catch (error) {
      console.error('❌ Error in daily roundup:', error);
      throw error;
    }
  }

  /**
   * Handle webhook from JobAdder when new job is posted
   */
  async handleJobPostedWebhook(req, res) {
    console.log('\n🔔 Webhook received: New job posted');
    
    try {
      const webhookData = req.body;
      console.log('Webhook data:', JSON.stringify(webhookData, null, 2));

      // Extract job ID from webhook payload
      const jobId = webhookData.job?.jobId || webhookData.jobId;

      if (!jobId) {
        console.error('❌ No job ID found in webhook payload');
        return res.status(400).json({ error: 'No job ID in payload' });
      }

      // 1. Fetch job details
      console.log(`📋 Fetching details for job ID: ${jobId}...`);
      const jobDetails = await jobadderService.getJobDetails(jobId);

      // 2. Format job for email
      const formattedJob = jobadderService.formatJobForEmail(jobDetails);

      // 3. Fetch latest 3 WordPress articles
      console.log('📰 Fetching latest articles from WordPress...');
      const articleParams = await this.getLatestArticles();

      // 4. Get recipients
      console.log('👥 Fetching recipients from Brevo...');
      const recipients = await brevoService.getJobAlertContacts();

      if (!recipients || recipients.length === 0) {
        console.log('⚠️  No recipients with JOB_ALERTS = Yes found. Skipping email send.');
        return res.status(200).json({ message: 'No recipients found' });
      }

      // 5. Send single job alert with articles
      console.log(`📧 Sending job alert to ${recipients.length} recipients...`);
      await brevoService.sendSingleEmail(
        recipients,
        process.env.SINGLE_JOB_ALERT_TEMPLATE_ID,
        { ...formattedJob, ...articleParams }
      );

      console.log('✅ Job alert sent successfully!\n');
      return res.status(200).json({ 
        success: true, 
        message: `Job alert sent to ${recipients.length} recipients` 
      });
    } catch (error) {
      console.error('❌ Error handling webhook:', error);
      return res.status(500).json({ error: 'Internal server error' });
    }
  }

  /**
   * Manual trigger for single job alert (for testing or consultant use)
   */
  async sendSingleJobAlert(adId) {
    console.log(`\n🔄 Sending single job alert for ad ID: ${adId}...`);
    
    try {
      // 0. Check if this job was already sent today
      const alreadySent = jobTrackingService.wasSingleJobSentToday(parseInt(adId));
      if (alreadySent) {
        console.log(`⏸️  Job ${adId} was already sent today. Skipping to prevent duplicate.`);
        return { 
          success: false, 
          message: `This job alert was already sent today. Please wait until tomorrow to send it again.`,
          alreadySent: true
        };
      }

      // 1. Fetch all live jobs and find the one with matching adId
      const liveJobs = await jobadderService.getLiveJobs();
      const jobAd = liveJobs.find(job => job.adId === parseInt(adId));
      
      if (!jobAd) {
        console.log(`⚠️  Job ad with ID ${adId} not found`);
        return { success: false, message: `Job ad ${adId} not found` };
      }
      
      const formattedJob = jobadderService.formatJobForEmail(jobAd);

      // 2. Fetch latest 3 WordPress articles
      console.log('📰 Fetching latest articles from WordPress...');
      const articleParams = await this.getLatestArticles();

      // 3. Get recipients
      const recipients = await brevoService.getJobAlertContacts();

      if (!recipients || recipients.length === 0) {
        console.log('⚠️  No recipients found.');
        return { success: true, message: 'No recipients found' };
      }

      // 4. Send email with articles
      await brevoService.sendSingleEmail(
        recipients,
        process.env.SINGLE_JOB_ALERT_TEMPLATE_ID,
        { ...formattedJob, ...articleParams }
      );

      // 5. Record that this job was sent today
      jobTrackingService.recordSingleJobSent(parseInt(adId));

      console.log('✅ Single job alert sent successfully!\n');
      return { 
        success: true, 
        message: `Job alert sent to ${recipients.length} recipients` 
      };
    } catch (error) {
      console.error('❌ Error sending single job alert:', error);
      throw error;
    }
  }

  // Preview single job alert
  previewSingleJob = async (req, res) => {
    const { jobId } = req.params;
    try {
      console.log(`\n======== 🔍 PREVIEWING JOB ${jobId} ========`);
      
      // Fetch job details
      const job = await jobadderService.getJobDetails(jobId);
      if (!job) {
        return res.status(404).send(`
          <div style="padding: 40px; text-align: center; font-family: Arial, sans-serif;">
            <h2 style="color: #e74c3c;">Job Not Found</h2>
            <p style="color: #666;">Job ID ${jobId} could not be found.</p>
          </div>
        `);
      }
      
      // Format job for email
      const formattedJob = jobadderService.formatJobForEmail(job);
      
      // Use emailPreviewService to render the preview
      const emailPreviewService = require('../services/emailPreviewService');
      const html = await emailPreviewService.renderSingleJob(formattedJob);
      res.send(html);
    } catch (error) {
      console.error(`❌ Error generating job ${jobId} preview:`, error);
      res.status(500).send(`
        <div style="padding: 40px; text-align: center; font-family: Arial, sans-serif;">
          <h2 style="color: #e74c3c;">Preview Unavailable</h2>
          <p style="color: #666;">${error.message}</p>
        </div>
      `);
    }
  };
}

module.exports = new JobAlertsController();
