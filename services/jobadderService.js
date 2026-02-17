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
   * Get job boards for the account
   */
  async getJobBoards() {
    try {
      const token = await this.getAccessToken();
      
      const response = await axios.get(`${this.baseUrl}/jobboards`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      console.log(`✅ Retrieved ${response.data.items?.length || 0} job boards`);
      return response.data.items || [];
    } catch (error) {
      console.error('❌ Error fetching job boards:', error.response?.data || error.message);
      throw error;
    }
  }

  /**
   * Get live job ads from a specific job board
   */
  async getJobAds(boardId) {
    try {
      const token = await this.getAccessToken();
      
      const response = await axios.get(`${this.baseUrl}/jobboards/${boardId}/ads`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      const ads = response.data.items || [];
      
      // Filter out expired ads
      const now = new Date();
      const liveAds = ads.filter(ad => {
        if (!ad.expiresAt) return true; // No expiry date = always live
        const expiryDate = new Date(ad.expiresAt);
        return expiryDate > now;
      });

      console.log(`✅ Retrieved ${liveAds.length} live job ads (${ads.length} total, ${ads.length - liveAds.length} expired)`);
      return liveAds;
    } catch (error) {
      console.error('❌ Error fetching job ads:', error.response?.data || error.message);
      throw error;
    }
  }

  /**
   * Get all live job ads from all job boards
   */
  async getLiveJobs() {
    try {
      // Get all job boards
      const boards = await this.getJobBoards();
      
      if (!boards || boards.length === 0) {
        console.log('⚠️  No job boards found');
        return [];
      }

      // Find the Artisan job board
      const artisanBoard = boards.find(board => 
        board.name && board.name.toLowerCase().includes('artisan')
      );

      if (!artisanBoard) {
        console.log('⚠️  Artisan job board not found. Available boards:');
        boards.forEach(b => console.log(`   - ${b.name} (ID: ${b.boardId})`));
        console.log('\n💡 Tip: Set JOBADDER_BOARD_ID environment variable to specify a board');
        
        // Fallback to environment variable or first board
        const boardId = process.env.JOBADDER_BOARD_ID;
        if (boardId) {
          console.log(`📋 Using board ID from environment: ${boardId}`);
          return await this.getJobAds(parseInt(boardId));
        }
        
        console.log(`📋 Using first available board: ${boards[0].name} (ID: ${boards[0].boardId})`);
        return await this.getJobAds(boards[0].boardId);
      }

      console.log(`📋 Using job board: ${artisanBoard.name} (ID: ${artisanBoard.boardId})`);

      // Get job ads from the Artisan board
      const ads = await this.getJobAds(artisanBoard.boardId);
      
      // Enrich each ad with full job details
      console.log(`🔍 Fetching full job details for ${ads.length} ads...`);
      const enrichedAds = await Promise.all(
        ads.map(async (ad) => {
          try {
            // Get full job details using the reference number
            const jobDetails = await this.getJobByReference(ad.reference);
            // Merge ad data with job details
            return { ...ad, jobDetails };
          } catch (error) {
            console.warn(`⚠️  Could not fetch details for job ${ad.reference}:`, error.message);
            return ad; // Return ad without enrichment if fetch fails
          }
        })
      );
      
      console.log(`✅ Enriched ${enrichedAds.length} ads with full job details`);
      
      // Debug: Log first enriched ad
      if (enrichedAds.length > 0 && enrichedAds[0].jobDetails) {
        console.log('\n========== ENRICHED JOB AD DEBUG ==========');
        console.log('Job Details:', JSON.stringify(enrichedAds[0].jobDetails, null, 2));
        console.log('\nExtracted Fields:');
        console.log('  location:', enrichedAds[0].jobDetails.location);
        console.log('  workType:', enrichedAds[0].jobDetails.workType);
        console.log('  category:', enrichedAds[0].jobDetails.category);
        console.log('  All job detail keys:', Object.keys(enrichedAds[0].jobDetails).join(', '));
        console.log('==========================================\n');
      }
      
      return enrichedAds;
    } catch (error) {
      console.error('❌ Error fetching live job ads:', error.message);
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
   * Get job by reference number
   */
  async getJobByReference(reference) {
    try {
      const token = await this.getAccessToken();
      
      // Search for job by reference
      const response = await axios.get(`${this.baseUrl}/jobs`, {
        headers: {
          'Authorization': `Bearer ${token}`
        },
        params: {
          reference: reference,
          limit: 1
        }
      });

      if (response.data.items && response.data.items.length > 0) {
        return response.data.items[0];
      }
      
      throw new Error(`Job not found with reference: ${reference}`);
    } catch (error) {
      console.error(`❌ Error fetching job by reference ${reference}:`, error.response?.data || error.message);
      throw error;
    }
  }

  /**
   * Get candidate by ID
   */
  async getCandidateById(candidateId) {
    try {
      const token = await this.getAccessToken();
      
      const response = await axios.get(`${this.baseUrl}/candidates/${candidateId}`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      return response.data;
    } catch (error) {
      console.error(`❌ Error fetching candidate ${candidateId}:`, error.response?.data || error.message);
      throw error;
    }
  }

  /**
   * Format job ad data for email template
   */
  formatJobForEmail(ad) {
    // ad contains: title, summary, bulletPoints, reference, adId, links
    // ad.jobDetails contains: location, workType, category, etc. (if enriched)
    
    // Get location and work type from job details if available
    let location = 'Location TBD';
    let jobType = 'Not specified';
    
    if (ad.jobDetails) {
      // Use structured data from job details
      location = ad.jobDetails.location?.name || ad.jobDetails.location || this.extractLocation(ad.summary, ad.bulletPoints);
      jobType = ad.jobDetails.workType?.name || ad.jobDetails.workType || this.extractJobType(ad.summary, ad.bulletPoints);
    } else {
      // Fallback to extraction from text
      location = this.extractLocation(ad.summary, ad.bulletPoints);
      jobType = this.extractJobType(ad.summary, ad.bulletPoints);
    }
    
    // Build description from summary and bullet points
    let description = ad.summary || '';
    if (ad.bulletPoints && ad.bulletPoints.length > 0) {
      // Add first 3 bullet points
      const bullets = ad.bulletPoints.slice(0, 3).map(b => `• ${b}`).join(' ');
      description = description ? `${description} ${bullets}` : bullets;
    }
    
    // Use the correct apply URL from JobAdder
    const applyUrl = ad.links?.ui?.self || `https://clientapps.jobadder.com/67514/artisan/${ad.adId}`;
    
    return {
      job_title: ad.title || 'Untitled Position',
      location: location,
      job_type: jobType,
      job_description: this.truncateDescription(description || 'No description available'),
      apply_url: applyUrl,
      reference: ad.reference || ''
    };
  }

  /**
   * Extract location from summary text
   */
  extractLocation(summary, bulletPoints) {
    const text = `${summary || ''} ${(bulletPoints || []).join(' ')}`;
    
    // Common location patterns
    const patterns = [
      /(?:in|at|location:|based in)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*(?:\s+(?:CBD|City|Area))?)/i,
      /(Sydney|Melbourne|Brisbane|Perth|Adelaide|Canberra|Hobart|Darwin)(?:\s+(?:CBD|City|Inner|Outer|North|South|East|West))?/i,
      /Hybrid.*?([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)/i
    ];
    
    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (match) {
        return match[1] || match[0];
      }
    }
    
    return 'Location TBD';
  }

  /**
   * Extract job type from summary text
   */
  extractJobType(summary, bulletPoints) {
    const text = `${summary || ''} ${(bulletPoints || []).join(' ')}`;
    
    // Check for job type keywords
    if (/\b(\d+\s*(?:month|mth|week|wk))\s+contract/i.test(text)) {
      return 'Contract';
    }
    if (/\bcontract\b/i.test(text)) {
      return 'Contract';
    }
    if (/\bpermanent\b/i.test(text)) {
      return 'Permanent';
    }
    if (/\btemp\b|\btemporary\b/i.test(text)) {
      return 'Temporary';
    }
    if (/\bfull[\s-]?time\b/i.test(text)) {
      return 'Full-time';
    }
    if (/\bpart[\s-]?time\b/i.test(text)) {
      return 'Part-time';
    }
    
    return 'Not specified';
  }

  /**
   * Truncate description to a reasonable length for email
   */
  truncateDescription(text, maxLength = 250) {
    if (!text) return '';
    const stripped = text.replace(/<[^>]*>/g, ''); // Remove HTML tags
    if (stripped.length <= maxLength) return stripped;
    return stripped.substring(0, maxLength).trim() + '...';
  }

  /**
   * Build HTML for multiple jobs (for daily roundup)
   * Uses inline styles for maximum email client compatibility
   */
  buildJobsHtml(jobs) {
    return jobs.map(job => {
      const formatted = this.formatJobForEmail(job);
      return `
        <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin-bottom: 24px; background-color: #ffffff; border: 1px solid #e0e0e0; border-radius: 8px; overflow: hidden;">
          <tr>
            <td style="padding: 24px;">
              <!-- Job Title -->
              <h2 style="margin: 0 0 16px 0; font-size: 22px; font-weight: 700; color: #27AE60; line-height: 1.3;">
                <a href="${formatted.apply_url}" style="color: #27AE60; text-decoration: none;">${formatted.job_title}</a>
              </h2>
              
              <!-- Job Meta (Location & Type) -->
              <div style="margin-bottom: 16px; font-size: 14px; color: #7f8c8d;">
                <span style="display: inline-block; margin-right: 16px;">
                  <strong style="color: #2C3E50;">📍 Location:</strong> ${formatted.location}
                </span>
                <span style="display: inline-block;">
                  <strong style="color: #2C3E50;">💼 Type:</strong> ${formatted.job_type}
                </span>
              </div>
              
              <!-- Job Description -->
              <p style="margin: 0 0 20px 0; font-size: 15px; line-height: 1.6; color: #34495e;">
                ${formatted.job_description}
              </p>
              
              <!-- Apply Button -->
              <table role="presentation" cellspacing="0" cellpadding="0" border="0">
                <tr>
                  <td style="border-radius: 6px; background-color: #E74C3C;">
                    <a href="${formatted.apply_url}" target="_blank" style="display: inline-block; padding: 14px 32px; font-size: 16px; font-weight: 700; color: #ffffff; text-decoration: none; border-radius: 6px; text-transform: uppercase; letter-spacing: 0.5px;">
                      View Full Details →
                    </a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      `;
    }).join('\n');
  }
}

module.exports = new JobAdderService();
