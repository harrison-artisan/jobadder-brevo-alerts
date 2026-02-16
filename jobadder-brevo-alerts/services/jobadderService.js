const axios = require('axios');
const fs = require('fs');
const path = require('path');

class JobAdderService {
  constructor() {
    this.clientId = process.env.JOBADDER_CLIENT_ID;
    this.clientSecret = process.env.JOBADDER_CLIENT_SECRET;
    this.redirectUri = process.env.JOBADDER_REDIRECT_URI;
    this.baseUrl = 'https://api.jobadder.com/v2';
    this.tokenFile = path.join(__dirname, '../.jobadder-tokens.json');
    this.tokens = this.loadTokens();
  }

  /**
   * Load tokens from file
   */
  loadTokens() {
    try {
      if (fs.existsSync(this.tokenFile)) {
        const data = fs.readFileSync(this.tokenFile, 'utf8');
        return JSON.parse(data);
      }
    } catch (error) {
      console.log('No existing tokens found');
    }
    return null;
  }

  /**
   * Save tokens to file
   */
  saveTokens(tokens) {
    try {
      fs.writeFileSync(this.tokenFile, JSON.stringify(tokens, null, 2));
      this.tokens = tokens;
      console.log('✅ Tokens saved successfully');
    } catch (error) {
      console.error('❌ Error saving tokens:', error);
    }
  }

  /**
   * Get authorization URL for OAuth2 flow
   */
  getAuthorizationUrl() {
    const params = new URLSearchParams({
      client_id: this.clientId,
      redirect_uri: this.redirectUri,
      response_type: 'code',
      scope: 'read offline_access'
    });
    return `https://id.jobadder.com/connect/authorize?${params.toString()}`;
  }

  /**
   * Exchange authorization code for tokens
   */
  async exchangeCodeForTokens(code) {
    try {
      const response = await axios.post('https://id.jobadder.com/connect/token', 
        new URLSearchParams({
          grant_type: 'authorization_code',
          client_id: this.clientId,
          client_secret: this.clientSecret,
          redirect_uri: this.redirectUri,
          code: code
        }), {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded'
          }
        }
      );

      const tokens = {
        access_token: response.data.access_token,
        refresh_token: response.data.refresh_token,
        expires_at: Date.now() + (response.data.expires_in * 1000)
      };

      this.saveTokens(tokens);
      console.log('✅ Authorization successful, tokens obtained');
      return tokens;
    } catch (error) {
      console.error('❌ Error exchanging code for tokens:', error.response?.data || error.message);
      throw error;
    }
  }

  /**
   * Refresh access token using refresh token
   */
  async refreshAccessToken() {
    if (!this.tokens || !this.tokens.refresh_token) {
      throw new Error('No refresh token available. Please authorize the application first.');
    }

    try {
      const response = await axios.post('https://id.jobadder.com/connect/token', 
        new URLSearchParams({
          grant_type: 'refresh_token',
          client_id: this.clientId,
          client_secret: this.clientSecret,
          refresh_token: this.tokens.refresh_token
        }), {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded'
          }
        }
      );

      const tokens = {
        access_token: response.data.access_token,
        refresh_token: response.data.refresh_token || this.tokens.refresh_token,
        expires_at: Date.now() + (response.data.expires_in * 1000)
      };

      this.saveTokens(tokens);
      console.log('✅ Access token refreshed successfully');
      return tokens.access_token;
    } catch (error) {
      console.error('❌ Error refreshing token:', error.response?.data || error.message);
      throw error;
    }
  }

  /**
   * Get valid access token (refresh if needed)
   */
  async getAccessToken() {
    if (!this.tokens) {
      throw new Error('Not authorized. Please complete OAuth2 authorization first.');
    }

    // If token is expired or about to expire (within 5 minutes), refresh it
    if (Date.now() >= (this.tokens.expires_at - 300000)) {
      console.log('🔄 Token expired, refreshing...');
      return await this.refreshAccessToken();
    }

    return this.tokens.access_token;
  }

  /**
   * Check if authorized
   */
  isAuthorized() {
    return this.tokens && this.tokens.access_token && this.tokens.refresh_token;
  }

  /**
   * Get all live/open jobs from JobAdder
   */
  async getLiveJobs() {
    try {
      const token = await this.getAccessToken();
      
      const response = await axios.get(`${this.baseUrl}/jobs`, {
        headers: {
          'Authorization': `Bearer ${token}`
        },
        params: {
          status: 'Open',
          limit: 100 // Adjust as needed
        }
      });

      console.log(`✅ Retrieved ${response.data.items?.length || 0} live jobs from JobAdder`);
      return response.data.items || [];
    } catch (error) {
      console.error('❌ Error fetching live jobs:', error.response?.data || error.message);
      throw error;
    }
  }

  /**
   * Get specific job details by ID
   */
  async getJobDetails(jobId) {
    try {
      const token = await this.getAccessToken();
      
      const response = await axios.get(`${this.baseUrl}/jobs/${jobId}`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      console.log(`✅ Retrieved job details for job ID: ${jobId}`);
      return response.data;
    } catch (error) {
      console.error(`❌ Error fetching job ${jobId}:`, error.response?.data || error.message);
      throw error;
    }
  }

  /**
   * Format job data for email template
   */
  formatJobForEmail(job) {
    return {
      job_title: job.title || 'Untitled Position',
      location: job.location?.name || 'Location TBD',
      job_type: job.workType || 'Not specified',
      job_description: this.truncateDescription(job.summary || job.description || 'No description available'),
      apply_url: job.applyUrl || `https://clientapps.jobadder.com/67514/artisan/jobs/${job.jobId}`
    };
  }

  /**
   * Truncate description to a reasonable length for email
   */
  truncateDescription(text, maxLength = 300) {
    if (!text) return '';
    const stripped = text.replace(/<[^>]*>/g, ''); // Remove HTML tags
    if (stripped.length <= maxLength) return stripped;
    return stripped.substring(0, maxLength).trim() + '...';
  }

  /**
   * Build HTML for multiple jobs (for daily roundup)
   */
  buildJobsHtml(jobs) {
    return jobs.map(job => {
      const formatted = this.formatJobForEmail(job);
      return `
        <div class="job-card">
          <a href="${formatted.apply_url}" class="job-title">${formatted.job_title}</a>
          <div class="job-meta">
            <span>${formatted.location}</span>
            <span>${formatted.job_type}</span>
          </div>
          <div class="job-description">
            ${formatted.job_description}
          </div>
          <a href="${formatted.apply_url}" class="job-button">View Job</a>
        </div>
      `;
    }).join('\n');
  }
}

module.exports = new JobAdderService();
