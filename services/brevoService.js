const axios = require('axios');

class BrevoService {
  constructor() {
    this.apiKey = process.env.BREVO_API_KEY;
    this.baseUrl = 'https://api.brevo.com/v3';
    this.testMode = process.env.TEST_MODE === 'true';
    this.testEmail = process.env.TEST_EMAIL;
    this.senderEmail = process.env.SENDER_EMAIL || 'artisan@artisan.com.au';
    this.senderName = process.env.SENDER_NAME || 'ARTISAN';
  }

  /**
   * Get all contacts where JOB_ALERTS = "Yes"
   * In test mode, returns only the test email
   */
  async getJobAlertContacts() {
    // TEST MODE: Return only test email
    if (this.testMode && this.testEmail) {
      console.log(`🧪 TEST MODE: Using test email ${this.testEmail}`);
      return [{
        email: this.testEmail,
        name: 'Test User'
      }];
    }

    // PRODUCTION MODE: Fetch from Brevo
    try {
      const response = await axios.get(`${this.baseUrl}/contacts`, {
        headers: {
          'api-key': this.apiKey,
          'Content-Type': 'application/json'
        },
        params: {
          limit: 500, // Maximum per request
          offset: 0
        }
      });

      // Filter contacts where JOB_ALERTS attribute is "Yes"
      const allContacts = response.data.contacts || [];
      const filteredContacts = allContacts.filter(contact => {
        const jobAlerts = contact.attributes?.JOB_ALERTS;
        return jobAlerts === 'Yes' || jobAlerts === 'yes' || jobAlerts === true;
      });

      console.log(`✅ Found ${filteredContacts.length} contacts with JOB_ALERTS = Yes (out of ${allContacts.length} total)`);
      
      return filteredContacts.map(contact => ({
        email: contact.email,
        name: `${contact.attributes?.FIRSTNAME || ''} ${contact.attributes?.LASTNAME || ''}`.trim() || contact.email
      }));
    } catch (error) {
      console.error('❌ Error fetching Brevo contacts:', error.response?.data || error.message);
      throw error;
    }
  }

  /**
   * Send batch email using Brevo transactional API
   * For single recipients: uses direct to+params (more reliable)
   * For multiple recipients: uses messageVersions batch API
   */
  async sendBatchEmail(recipients, templateId, params) {
    if (!recipients || recipients.length === 0) {
      console.log('⚠️  No recipients to send email to');
      return;
    }

    // Log test mode status
    if (this.testMode) {
      console.log(`🧪 TEST MODE ACTIVE: Sending to ${recipients.length} test recipient(s)`);
    }

    const tid = parseInt(templateId);
    if (isNaN(tid)) {
      throw new Error(`Invalid templateId: "${templateId}". Check that BREVO_XPOSE_NEWSLETTER_TEMPLATE_ID (or equivalent) is set in Railway environment variables.`);
    }

    try {
      // For single recipient: use direct to+params (simpler, more reliable)
      if (recipients.length === 1) {
        const recipient = recipients[0];
        const payload = {
          templateId: tid,
          to: [{ email: recipient.email, name: recipient.name || recipient.email }],
          params: params
        };
        if (this.senderEmail) {
          payload.sender = { email: this.senderEmail, name: this.senderName };
        }
        console.log(`📧 Sending email to 1 recipient: ${recipient.email}`);
        const response = await axios.post(`${this.baseUrl}/smtp/email`, payload, {
          headers: { 'api-key': this.apiKey, 'Content-Type': 'application/json' }
        });
        console.log(`✅ Email sent successfully to ${recipient.email} (messageId: ${response.data?.messageId})`);
        return;
      }

      // For multiple recipients: use messageVersions batch API
      const batchSize = 99; // Brevo max per messageVersion
      const batches = [];
      for (let i = 0; i < recipients.length; i += batchSize) {
        batches.push(recipients.slice(i, i + batchSize));
      }

      console.log(`📧 Sending email to ${recipients.length} recipients in ${batches.length} batch(es)`);

      for (let i = 0; i < batches.length; i++) {
        const batch = batches[i];
        const messageVersions = batch.map(recipient => ({
          to: [{ email: recipient.email, name: recipient.name || recipient.email }],
          params: params
        }));

        const payload = {
          templateId: tid,
          messageVersions: messageVersions
        };
        if (this.senderEmail) {
          payload.sender = { email: this.senderEmail, name: this.senderName };
        }

        const response = await axios.post(`${this.baseUrl}/smtp/email`, payload, {
          headers: { 'api-key': this.apiKey, 'Content-Type': 'application/json' }
        });

        console.log(`✅ Batch ${i + 1}/${batches.length} sent successfully (${batch.length} recipients)`);

        if (i < batches.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      }

      console.log(`✅ All emails sent successfully!`);
    } catch (error) {
      console.error('❌ Error sending batch email:', error.response?.data || error.message);
      throw error;
    }
  }

  /**
   * Send single email (wrapper for batch with one recipient)
   */
  async sendSingleEmail(recipients, templateId, params) {
    return this.sendBatchEmail(recipients, templateId, params);
  }

  /**
   * Get all segments from Brevo
   */
  async getSegments() {
    try {
      const response = await axios.get(`${this.baseUrl}/contacts/segments`, {
        headers: {
          'api-key': this.apiKey,
          'Content-Type': 'application/json'
        },
        params: {
          limit: 50,
          sort: 'desc'
        }
      });

      console.log(`✅ Found ${response.data.segments?.length || 0} segments`);
      return response.data.segments || [];
    } catch (error) {
      console.error('❌ Error fetching Brevo segments:', error.response?.data || error.message);
      throw error;
    }
  }

  /**
   * Get all lists from Brevo
   */
  async getLists() {
    try {
      const response = await axios.get(`${this.baseUrl}/contacts/lists`, {
        headers: {
          'api-key': this.apiKey,
          'Content-Type': 'application/json'
        },
        params: {
          limit: 50
        }
      });

      console.log(`✅ Found ${response.data.lists?.length || 0} lists`);
      return response.data.lists || [];
    } catch (error) {
      console.error('❌ Error fetching Brevo lists:', error.response?.data || error.message);
      throw error;
    }
  }

  /**
   * Get contacts from a specific segment
   */
  async getSegmentContacts(segmentId) {
    // TEST MODE: Return only test email
    if (this.testMode && this.testEmail) {
      console.log(`🧪 TEST MODE: Using test email ${this.testEmail}`);
      return [{
        email: this.testEmail,
        name: 'Test User'
      }];
    }

    // PRODUCTION MODE: Fetch from Brevo
    try {
      const response = await axios.get(`${this.baseUrl}/contacts/segments/${segmentId}/contacts`, {
        headers: {
          'api-key': this.apiKey,
          'Content-Type': 'application/json'
        },
        params: {
          limit: 500
        }
      });

      const contacts = response.data.contacts || [];
      console.log(`✅ Found ${contacts.length} contacts in segment ${segmentId}`);
      
      return contacts.map(contact => ({
        email: contact.email,
        name: `${contact.attributes?.FIRSTNAME || ''} ${contact.attributes?.LASTNAME || ''}`.trim() || contact.email
      }));
    } catch (error) {
      console.error(`❌ Error fetching contacts from segment ${segmentId}:`, error.response?.data || error.message);
      throw error;
    }
  }

  /**
   * Get contacts from a specific list
   */
  async getListContacts(listId) {
    // TEST MODE: Return only test email
    if (this.testMode && this.testEmail) {
      console.log(`🧪 TEST MODE: Using test email ${this.testEmail}`);
      return [{
        email: this.testEmail,
        name: 'Test User'
      }];
    }

    // PRODUCTION MODE: Fetch from Brevo
    try {
      const response = await axios.get(`${this.baseUrl}/contacts/lists/${listId}/contacts`, {
        headers: {
          'api-key': this.apiKey,
          'Content-Type': 'application/json'
        },
        params: {
          limit: 500
        }
      });

      const contacts = response.data.contacts || [];
      console.log(`✅ Found ${contacts.length} contacts in list ${listId}`);
      
      return contacts.map(contact => ({
        email: contact.email,
        name: `${contact.attributes?.FIRSTNAME || ''} ${contact.attributes?.LASTNAME || ''}`.trim() || contact.email
      }));
    } catch (error) {
      console.error(`❌ Error fetching contacts from list ${listId}:`, error.response?.data || error.message);
      throw error;
    }
  }
}

module.exports = new BrevoService();
