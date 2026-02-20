const candidateService = require('../services/candidateService');
const aiService = require('../services/aiService');
const brevoService = require('../services/brevoService');
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
      const candidatesWithSummaries = selectedCandidates.map((candidate, index) => {
        return candidateService.formatCandidateForEmail(
          candidate, 
          index + 1, 
          summaries[index]
        );
      });
      
      // 5. Save state
      const state = {
        state: 'GENERATED',
        generatedAt: new Date().toISOString(),
        testSentAt: null,
        sentAt: null,
        candidates: candidatesWithSummaries,
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
      
      // Send email via Brevo
      await brevoService.sendBatchEmail(
        testRecipient,
        process.env.A_LIST_TEMPLATE_ID,
        { candidates: state.candidates }
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
   */
  async sendToAll() {
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
      console.log('👥 Fetching recipients from Brevo...');
      const recipients = await brevoService.getJobAlertContacts();
      
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
        { candidates: state.candidates }
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
   * Preview A-List
   */
  previewAlist = async (req, res) => {
    try {
      console.log('\n======== 🔍 PREVIEWING A-LIST ========');
      
      const state = this.loadState();
      
      if (!state || state.state === 'EMPTY' || !state.candidates || state.candidates.length === 0) {
        return res.status(404).send(`
          <div style="padding: 40px; text-align: center; font-family: Arial, sans-serif;">
            <h2 style="color: #e74c3c;">No A-List Generated</h2>
            <p style="color: #666;">Please generate an A-List first before previewing.</p>
          </div>
        `);
      }
      
      // Use emailPreviewService to render the preview
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
  };
}

module.exports = new CandidateAlertsController();
