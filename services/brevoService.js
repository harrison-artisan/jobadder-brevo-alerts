const axios = require('axios');

class BrevoService {
  constructor() {
    this.apiKey = process.env.BREVO_API_KEY;
    this.baseUrl = 'https://api.brevo.com/v3';
  }

  /**
   * Get all contacts where JOB_ALERTS = "Yes"
   */
  async getJobAlertContacts() {
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
   */
  async sendBatchEmail(recipients, templateId, params) {
    if (!recipients || recipients.length === 0) {
      console.log('⚠️  No recipients to send email to');
      return;
    }

    try {
      // Brevo allows up to 1000 recipients per batch
      const batchSize = 1000;
      const batches = [];
      
      for (let i = 0; i < recipients.length; i += batchSize) {
        batches.push(recipients.slice(i, i + batchSize));
      }

      console.log(`📧 Sending email to ${recipients.length} recipients in ${batches.length} batch(es)`);

      for (let i = 0; i < batches.length; i++) {
        const batch = batches[i];
        const messageVersions = batch.map(recipient => ({
          to: [{ email: recipient.email, name: recipient.name }],
          params: params
        }));

        const response = await axios.post(`${this.baseUrl}/smtp/email`, {
          templateId: parseInt(templateId),
          messageVersions: messageVersions
        }, {
          headers: {
            'api-key': this.apiKey,
            'Content-Type': 'application/json'
          }
        });

        console.log(`✅ Batch ${i + 1}/${batches.length} sent successfully (${batch.length} recipients)`);
        
        // Small delay between batches to avoid rate limiting
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
}

module.exports = new BrevoService();
