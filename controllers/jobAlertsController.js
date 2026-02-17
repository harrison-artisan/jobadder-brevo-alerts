const jobadderService = require('../services/jobadderService');
const brevoService = require('../services/brevoService');

class JobAlertsController {
  /**
   * Send daily roundup of all live jobs
   */
  async sendDailyRoundup() {
    console.log('\n🔄 Starting daily job roundup...');
    
    try {
      // 1. Fetch all live jobs from JobAdder
      console.log('📋 Fetching live jobs from JobAdder...');
      const liveJobs = await jobadderService.getLiveJobs();
      
      if (!liveJobs || liveJobs.length === 0) {
        console.log('⚠️  No live jobs found. Skipping email send.');
        return { success: true, message: 'No live jobs to send' };
      }

      // 2. Limit to 5 most recent jobs
      const recentJobs = liveJobs.slice(0, 5);
      console.log(`📊 Limiting to ${recentJobs.length} most recent jobs (out of ${liveJobs.length} total)`);

      // 3. Format jobs for email (as data array, not HTML)
      const jobsData = recentJobs.map(job => jobadderService.formatJobForEmail(job));

      // 4. Get recipients from Brevo
      console.log('👥 Fetching recipients from Brevo...');
      const recipients = await brevoService.getJobAlertContacts();

      if (!recipients || recipients.length === 0) {
        console.log('⚠️  No recipients with JOB_ALERTS = Yes found. Skipping email send.');
        return { success: true, message: 'No recipients found' };
      }

      // 5. Send batch email with job data array
      console.log(`📧 Sending daily roundup to ${recipients.length} recipients...`);
      await brevoService.sendBatchEmail(
        recipients,
        process.env.DAILY_ROUNDUP_TEMPLATE_ID,
        { jobs: jobsData, job_count: jobsData.length }
      );

      console.log('✅ Daily roundup completed successfully!\n');
      return { 
        success: true, 
        message: `Sent ${recentJobs.length} most recent jobs to ${recipients.length} recipients` 
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
      // The structure may vary, adjust based on actual webhook payload
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

      // 3. Get recipients
      console.log('👥 Fetching recipients from Brevo...');
      const recipients = await brevoService.getJobAlertContacts();

      if (!recipients || recipients.length === 0) {
        console.log('⚠️  No recipients with JOB_ALERTS = Yes found. Skipping email send.');
        return res.status(200).json({ message: 'No recipients found' });
      }

      // 4. Send single job alert
      console.log(`📧 Sending job alert to ${recipients.length} recipients...`);
      await brevoService.sendSingleEmail(
        recipients,
        process.env.SINGLE_JOB_ALERT_TEMPLATE_ID,
        formattedJob
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
      // 1. Fetch all live jobs and find the one with matching adId
      const liveJobs = await jobadderService.getLiveJobs();
      const jobAd = liveJobs.find(job => job.adId === parseInt(adId));
      
      if (!jobAd) {
        console.log(`⚠️  Job ad with ID ${adId} not found`);
        return { success: false, message: `Job ad ${adId} not found` };
      }
      
      const formattedJob = jobadderService.formatJobForEmail(jobAd);

      // 2. Get recipients
      const recipients = await brevoService.getJobAlertContacts();

      if (!recipients || recipients.length === 0) {
        console.log('⚠️  No recipients found.');
        return { success: true, message: 'No recipients found' };
      }

      // 3. Send email
      await brevoService.sendSingleEmail(
        recipients,
        process.env.SINGLE_JOB_ALERT_TEMPLATE_ID,
        formattedJob
      );

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
}

module.exports = new JobAlertsController();
