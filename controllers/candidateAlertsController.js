const candidateService = require('../services/candidateService');
const aiService = require('../services/aiService');
const brevoService = require('../services/brevoService');
const wordpressService = require('../services/wordpressService');
const fs = require('fs');
const path = require('path');

class CandidateAlertsController {
  constructor() {
    this.stateFile = path.join(__dirname, '../.alist-state.json');
  }

  /**
   * Generate A-List email content
   */
  async generateAList() {
    console.log('\n🎲 ========== GENERATING A-LIST ==========');
    
    try {
      // 1. Fetch candidates interviewed in last 3 weeks
      const allCandidates = await candidateService.getRecentlyInterviewedCandidates(3);
      
      if (allCandidates.length === 0) {
        return {
          success: false,
          message: 'No candidates found with interviews in the last 3 weeks',
          data: {
            totalCandidatesInPool: 0,
            selectedCount: 0
          }
        };
      }
      
      // 2. Randomly select 5 candidates
      const selectedCandidates = candidateService.selectRandomCandidates(allCandidates, 5);
      console.log(`\n✅ Selected ${selectedCandidates.length} candidates for A-List`);
      
      // 3. Generate AI summaries for each candidate
      const summaries = await aiService.generateBatchSummaries(selectedCandidates);
      
      // 4. Format candidates for email
      const candidatesWithSummaries = await Promise.all(
        selectedCandidates.map((candidate, index) => {
          return candidateService.formatCandidateForEmail(
            candidate, 
            index + 1, 
            summaries[index]
          );
        })
      );
      
      // 5. Fetch latest WordPress articles
      console.log('📰 Fetching latest WordPress articles...');
      const articles = await wordpressService.getLatestArticles(3);
      const articlesList = articles || [];
      const articlesData = {
        article1: articlesList[0] || null,
        article2: articlesList[1] || null,
        article3: articlesList[2] || null
      };
      
      // 6. Save state
      const state = {
        state: 'GENERATED',
        generatedAt: new Date().toISOString(),
        testSentAt: null,
        sentAt: null,
        candidates: candidatesWithSummaries,
        articles: articlesData,
        totalCandidatesInPool: allCandidates.length
      };
      
      this.saveState(state);
      
      console.log('✅ A-List generated successfully!');
      console.log('========================================\n');
      
      return {
        success: true,
        message: `Generated A-List with ${candidatesWithSummaries.length} candidates from pool of ${allCandidates.length}`,
        data: state
      };
      
    } catch (error) {
      console.error('❌ Error generating A-List:', error);
      return {
        success: false,
        message: `Error: ${error.message}`,
        data: null
      };
    }
  }

  /**
   * Send test email
   */
  async sendTest() {
    console.log('\n🧪 ========== SENDING TEST EMAIL ==========');
    
    const state = this.loadState();
    
    if (state.state !== 'GENERATED' && state.state !== 'TESTED') {
      return {
        success: false,
        message: 'No A-List generated. Please generate first.',
        data: state
      };
    }
    
    try {
      // Get test recipient
      const testEmail = process.env.TEST_EMAIL || process.env.test_email;
      if (!testEmail) {
        return {
          success: false,
          message: 'TEST_EMAIL not configured in environment variables',
          data: state
        };
      }
      
      const testRecipient = [{
        email: testEmail,
        name: 'Test User'
      }];
      
      console.log(`📧 Sending to: ${testEmail}`);
      console.log(`📋 Template ID: ${process.env.A_LIST_TEMPLATE_ID}`);
      console.log(`👥 Candidates: ${state.candidates.length}`);
      
      // Log candidate data for debugging
      console.log('📊 Sample candidate data being sent:');
      console.log(JSON.stringify(state.candidates[0], null, 2));
      
      // Send email via Brevo
      await brevoService.sendBatchEmail(
        testRecipient,
        process.env.A_LIST_TEMPLATE_ID,
        { 
          candidates: state.candidates,
          ...state.articles
        }
      );
      
      // Update state
      state.state = 'TESTED';
      state.testSentAt = new Date().toISOString();
      this.saveState(state);
      
      console.log('✅ Test email sent successfully!');
      console.log('==========================================\n');
      
      return {
        success: true,
        message: `Test email sent to ${testEmail}`,
        data: state
      };
      
    } catch (error) {
      console.error('❌ Error sending test email:', error);
      return {
        success: false,
        message: `Error: ${error.message}`,
        data: state
      };
    }
  }

  /**
   * Send to all recipients
   * @param {Object} options - Sending options
   * @param {string} options.recipientType - 'segment' or 'list'
   * @param {string} options.recipientId - Segment or List ID
   */
  async sendToAll(options = {}) {
    console.log('\n📧 ========== SENDING TO ALL RECIPIENTS ==========');
    
    const state = this.loadState();
    
    if (state.state !== 'TESTED') {
      return {
        success: false,
        message: 'Must send test email first before sending to all recipients',
        data: state
      };
    }
    
    try {
      // Get recipients from Brevo
      let recipients;
      
      if (options.recipientId && options.recipientType) {
        console.log(`👥 Fetching recipients from ${options.recipientType} #${options.recipientId}...`);
        
        if (options.recipientType === 'segment') {
          recipients = await brevoService.getSegmentContacts(options.recipientId);
        } else if (options.recipientType === 'list') {
          recipients = await brevoService.getListContacts(options.recipientId);
        } else {
          throw new Error('Invalid recipient type. Must be "segment" or "list"');
        }
      } else {
        // Fallback to old method (JOB_ALERTS attribute)
        console.log('👥 Fetching recipients from Brevo (JOB_ALERTS = Yes)...');
        recipients = await brevoService.getJobAlertContacts();
      }
      
      if (!recipients || recipients.length === 0) {
        return {
          success: false,
          message: 'No recipients found with JOB_ALERTS = Yes',
          data: state
        };
      }
      
      console.log(`📧 Sending to ${recipients.length} recipients`);
      console.log(`📋 Template ID: ${process.env.A_LIST_TEMPLATE_ID}`);
      console.log(`👥 Candidates: ${state.candidates.length}`);
      
      // Send email via Brevo
      await brevoService.sendBatchEmail(
        recipients,
        process.env.A_LIST_TEMPLATE_ID,
        { 
          candidates: state.candidates,
          ...state.articles
        }
      );
      
      // Update state to SENT
      state.state = 'SENT';
      state.sentAt = new Date().toISOString();
      this.saveState(state);
      
      console.log('✅ A-List sent to all recipients!');
      console.log('=================================================\n');
      
      // Reset state after successful send (delayed)
      setTimeout(() => {
        console.log('🔄 Resetting state to EMPTY...');
        this.resetState();
      }, 2000);
      
      return {
        success: true,
        message: `A-List sent to ${recipients.length} recipients`,
        data: state
      };
      
    } catch (error) {
      console.error('❌ Error sending A-List:', error);
      return {
        success: false,
        message: `Error: ${error.message}`,
        data: state
      };
    }
  }

  /**
   * Get current state
   */
  getState() {
    return this.loadState();
  }

  /**
   * Reset state
   */
  resetState() {
    const emptyState = {
      state: 'EMPTY',
      generatedAt: null,
      testSentAt: null,
      sentAt: null,
      candidates: [],
      totalCandidatesInPool: 0
    };
    
    this.saveState(emptyState);
    console.log('🔄 State reset to EMPTY\n');
    
    return { success: true, message: 'State reset successfully', data: emptyState };
  }

  /**
   * Load state from file
   */
  loadState() {
    try {
      if (fs.existsSync(this.stateFile)) {
        const data = fs.readFileSync(this.stateFile, 'utf8');
        return JSON.parse(data);
      }
    } catch (error) {
      console.warn('⚠️  Could not load state file:', error.message);
    }
    
    // Return empty state if file doesn't exist
    return {
      state: 'EMPTY',
      generatedAt: null,
      testSentAt: null,
      sentAt: null,
      candidates: [],
      totalCandidatesInPool: 0
    };
  }

  /**
   * Save state to file
   */
  saveState(state) {
    try {
      fs.writeFileSync(this.stateFile, JSON.stringify(state, null, 2));
      console.log('💾 State saved');
    } catch (error) {
      console.error('❌ Error saving state:', error);
    }
  }
  
  /**
   * Schedule A-List send for next Friday at 9:00 AM Melbourne time
   */
  async scheduleForFriday(options = {}) {
    const cron = require('node-cron');
    
    try {
      // Calculate next Friday 9:00 AM Melbourne time using Intl
      const nowUtc = new Date();
      // Get current day-of-week in Melbourne
      const melbDay = Number(new Intl.DateTimeFormat('en-AU', { timeZone: 'Australia/Melbourne', weekday: 'short' }).format(nowUtc) === 'Fri' ? 5 : new Date(new Intl.DateTimeFormat('en-AU', { timeZone: 'Australia/Melbourne', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hour12: false }).format(nowUtc)).getDay());
      const melbParts = new Intl.DateTimeFormat('en-AU', { timeZone: 'Australia/Melbourne', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(nowUtc);
      const mp = {}; melbParts.forEach(p => { mp[p.type] = p.value; });
      const melbNow = new Date(`${mp.year}-${mp.month}-${mp.day}T${mp.hour}:${mp.minute}:00`);
      const dayOfWeek = melbNow.getDay(); // 0=Sun, 5=Fri
      let daysUntilFriday = (5 - dayOfWeek + 7) % 7;
      // If today is Friday and already past 9am, go to next Friday
      if (daysUntilFriday === 0 && melbNow.getHours() >= 9) daysUntilFriday = 7;
      if (daysUntilFriday === 0) daysUntilFriday = 7; // safety: always schedule future
      const nextFridayDate = new Date(melbNow);
      nextFridayDate.setDate(nextFridayDate.getDate() + daysUntilFriday);
      nextFridayDate.setHours(9, 0, 0, 0);
      const scheduledFor = nextFridayDate.toLocaleDateString('en-AU', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', timeZone: 'Australia/Melbourne' }) + ' at 9:00 AM';
      
      // Schedule cron job for Friday 9am Melbourne time (0 9 * * 5)
      // Note: This is a one-time schedule - in production you'd want to persist this
      cron.schedule('0 9 * * 5', async () => {
        console.log('📅 Executing scheduled A-List send...');
        await this.sendToAll(options);
      }, {
        timezone: 'Australia/Melbourne'
      });
      
      console.log(`📅 A-List scheduled for ${scheduledFor}`);
      
      return {
        success: true,
        scheduledFor,
        message: 'A-List scheduled successfully'
      };
    } catch (error) {
      console.error('❌ Error scheduling A-List:', error);
      return {
        success: false,
        message: error.message
      };
    }
  }

  /**
   * Preview the A-List email using the current generated state
   */
  async previewAlist(req, res) {
    try {
      const state = this.loadState();
      if (!state || !state.candidates || state.candidates.length === 0) {
        return res.status(404).send(`
          <div style="padding: 40px; text-align: center; font-family: Arial, sans-serif;">
            <h2 style="color: #e74c3c;">No A-List Data</h2>
            <p style="color: #666;">Please generate the A-List first before previewing.</p>
          </div>
        `);
      }
      const emailPreviewService = require('../services/emailPreviewService');
      const html = await emailPreviewService.renderAlist(state);
      res.send(html);
    } catch (error) {
      console.error('❌ Error generating A-List preview:', error);
      res.status(500).send(`
        <div style="padding: 40px; text-align: center; font-family: Arial, sans-serif;">
          <h2 style="color: #e74c3c;">Preview Unavailable</h2>
          <p style="color: #666;">${error.message}</p>
        </div>
      `);
    }
  }
}

module.exports = new CandidateAlertsController();

