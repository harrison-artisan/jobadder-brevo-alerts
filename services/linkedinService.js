'use strict';

const axios = require('axios');

/**
 * LinkedIn OAuth 2.0 Service
 * Handles: authorization URL generation, token exchange, token refresh detection,
 * token storage (in-memory + env fallback), and posting to LinkedIn.
 *
 * Scopes required on the LinkedIn Developer App:
 *   r_basicprofile, w_member_social
 *
 * Redirect URI registered on LinkedIn Developer App:
 *   https://jobadder-brevo-alerts-production.up.railway.app/auth/linkedin/callback
 */

const CLIENT_ID = process.env.LINKEDIN_CLIENT_ID;
// LINKEDIN_CLIENT_SECRET is stored base64-encoded in Railway to avoid secret-name conflicts.
// Decode it at runtime. If it doesn't look like base64, use it as-is (plain text fallback).
const _rawSecret = process.env.LINKEDIN_CLIENT_SECRET || '';
const CLIENT_SECRET = (() => {
  try {
    const decoded = Buffer.from(_rawSecret, 'base64').toString('utf8');
    // A valid base64 decode will produce a non-empty string; use it if it looks right
    return decoded.length > 0 ? decoded : _rawSecret;
  } catch { return _rawSecret; }
})();
const REDIRECT_URI = process.env.LINKEDIN_REDIRECT_URI ||
  'https://jobadder-brevo-alerts-production.up.railway.app/auth/linkedin/callback';

// Scopes available on this app: r_basicprofile, w_member_social, r_organization_social, w_organization_social
const SCOPES = ['r_basicprofile', 'w_member_social', 'r_organization_social'];

// Token expiry warning threshold: 7 days in ms
const EXPIRY_WARNING_MS = 7 * 24 * 60 * 60 * 1000;

// In-memory token store (persists across requests, resets on server restart)
// On Railway, tokens survive as long as the dyno is running.
// For persistence across restarts, store tokens in env vars via Railway dashboard.
let tokenStore = {
  accessToken: process.env.LINKEDIN_ACCESS_TOKEN || null,
  expiresAt: process.env.LINKEDIN_TOKEN_EXPIRES_AT ? parseInt(process.env.LINKEDIN_TOKEN_EXPIRES_AT) : null,
  personUrn: process.env.LINKEDIN_PERSON_URN || null,
  displayName: process.env.LINKEDIN_DISPLAY_NAME || null,
  orgUrn: 'urn:li:organization:832171',
  orgName: 'Artisan',
};

class LinkedInService {

  // ---- OAuth ----

  /**
   * Generate the LinkedIn authorization URL.
   * @param {string} state - CSRF state token
   * @returns {string} Authorization URL
   */
  getAuthUrl(state) {
    if (!CLIENT_ID || !CLIENT_SECRET) {
      throw new Error('LinkedIn credentials are not configured. Please set LINKEDIN_CLIENT_ID and LINKEDIN_CLIENT_SECRET environment variables in Railway.');
    }
    const params = new URLSearchParams({
      response_type: 'code',
      client_id: CLIENT_ID,
      redirect_uri: REDIRECT_URI,
      state: state,
      scope: SCOPES.join(' '),
    });
    return `https://www.linkedin.com/oauth/v2/authorization?${params.toString()}`;
  }

  /**
   * Exchange authorization code for access token.
   * @param {string} code - Authorization code from LinkedIn callback
   * @returns {object} Token data
   */
  async exchangeCodeForToken(code) {
    const params = new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: REDIRECT_URI,
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
    });

    const response = await axios.post(
      'https://www.linkedin.com/oauth/v2/accessToken',
      params.toString(),
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
    );

    const { access_token, expires_in } = response.data;
    const expiresAt = Date.now() + (expires_in * 1000);

     // Fetch the user's profile to get their person URN and display name
    const profile = await this.fetchProfile(access_token);
    // Always post as Artisan Company Page (org ID: 832171)
    tokenStore = {
      accessToken: access_token,
      expiresAt,
      personUrn: profile.personUrn,
      displayName: profile.displayName,
      orgUrn: 'urn:li:organization:832171',
      orgName: 'Artisan',
    };
    console.log(`[LinkedIn] Token stored. Expires: ${new Date(expiresAt).toISOString()}. User: ${profile.displayName}. Org: Artisan (832171)`);
    return tokenStore;
  }

  /**
   * Fetch the authenticated user's profile (name + URN).
   * @param {string} accessToken
   * @returns {object} { personUrn, displayName }
   */
   async fetchProfile(accessToken) {
    // Use v2/me with r_basicprofile (does not require openid scope)
    const response = await axios.get(
      'https://api.linkedin.com/v2/me?projection=(id,localizedFirstName,localizedLastName)',
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    const data = response.data;
    const personUrn = `urn:li:person:${data.id}`;
    const displayName = `${data.localizedFirstName || ''} ${data.localizedLastName || ''}`.trim() || 'LinkedIn User';
    return { personUrn, displayName };
  }

  /**
   * Fetch the first LinkedIn organisation page the user administers.
   * Uses the r_organization_social scope.
   * @param {string} accessToken
   * @param {string} personUrn - e.g. urn:li:person:ABC123
   * @returns {object} { orgUrn, orgName }
   */
  async fetchOrgPage(accessToken, personUrn) {
    // Get all org admin roles for this person
    const personId = personUrn.replace('urn:li:person:', '');
    const response = await axios.get(
      `https://api.linkedin.com/v2/organizationAcls?q=roleAssignee&role=ADMINISTRATOR&projection=(elements*(organization~(id,localizedName)))`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'X-Restli-Protocol-Version': '2.0.0',
        },
      }
    );
    const elements = (response.data && response.data.elements) || [];
    if (elements.length === 0) {
      throw new Error('No LinkedIn organisation pages found for this account.');
    }
    // Use the first org the user admins
    const first = elements[0];
    const orgId = first['organization~'] ? first['organization~'].id : null;
    const orgName = first['organization~'] ? first['organization~'].localizedName : 'Company Page';
    if (!orgId) throw new Error('Could not extract org ID from LinkedIn response.');
    return { orgUrn: `urn:li:organization:${orgId}`, orgName };
  }

  // ---- Token Status ----

  /**
   * Get the current token status.
   * @returns {object} { connected, expiresAt, daysRemaining, status, displayName, orgName }
   */
  getTokenStatus() {
    if (!tokenStore.accessToken || !tokenStore.expiresAt) {
      return { connected: false, status: 'disconnected', displayName: null, orgName: null, expiresAt: null, daysRemaining: null };
    }

    const now = Date.now();
    const msRemaining = tokenStore.expiresAt - now;
    const daysRemaining = Math.max(0, Math.floor(msRemaining / (1000 * 60 * 60 * 24)));

    if (msRemaining <= 0) {
      return {
        connected: false,
        status: 'expired',
        displayName: tokenStore.displayName,
        orgName: tokenStore.orgName,
        expiresAt: tokenStore.expiresAt,
        daysRemaining: 0,
      };
    }
    if (msRemaining <= EXPIRY_WARNING_MS) {
      return {
        connected: true,
        status: 'expiring_soon',
        displayName: tokenStore.displayName,
        orgName: tokenStore.orgName,
        expiresAt: tokenStore.expiresAt,
        daysRemaining,
      };
    }
    return {
      connected: true,
      status: 'active',
      displayName: tokenStore.displayName,
      orgName: tokenStore.orgName,
      expiresAt: tokenStore.expiresAt,
      daysRemaining,
    };
  }

  /**
   * Check if a valid (non-expired) token exists.
   * @returns {boolean}
   */
  isConnected() {
    const status = this.getTokenStatus();
    return status.connected;
  }

  /**
   * Disconnect — clear the token store.
   */
  disconnect() {
    tokenStore = { accessToken: null, expiresAt: null, personUrn: null, displayName: null, orgUrn: 'urn:li:organization:832171', orgName: 'Artisan' };
  }

  // ---- Posting ----

  /**
   * Post a text update to the authenticated user's LinkedIn feed.
   * @param {string} text - The post body text
   * @returns {object} LinkedIn API response
   */
  async postToLinkedIn(text) {
    if (!this.isConnected()) {
      throw new Error('LinkedIn is not connected. Please reconnect via the Social Media tab.');
    }

    // Post as the Company Page if available, otherwise fall back to personal profile
    const author = tokenStore.orgUrn || tokenStore.personUrn;
    const payload = {
      author,
      lifecycleState: 'PUBLISHED',
      specificContent: {
        'com.linkedin.ugc.ShareContent': {
          shareCommentary: { text },
          shareMediaCategory: 'NONE',
        },
      },
      visibility: {
        'com.linkedin.ugc.MemberNetworkVisibility': 'PUBLIC',
      },
    };

    const response = await axios.post(
      'https://api.linkedin.com/v2/ugcPosts',
      payload,
      {
        headers: {
          Authorization: `Bearer ${tokenStore.accessToken}`,
          'Content-Type': 'application/json',
          'X-Restli-Protocol-Version': '2.0.0',
        },
      }
    );

    console.log(`[LinkedIn] Post published. ID: ${response.data.id}`);
    return response.data;
  }

  /**
   * Post a text update with an article link to LinkedIn.
   * @param {string} text - The post body text
   * @param {string} articleUrl - URL to share
   * @param {string} title - Article title
   * @param {string} description - Article excerpt/description
   * @returns {object} LinkedIn API response
   */
  async postArticleToLinkedIn(text, articleUrl, title, description) {
    if (!this.isConnected()) {
      throw new Error('LinkedIn is not connected. Please reconnect via the Social Media tab.');
    }
    const author = tokenStore.orgUrn || tokenStore.personUrn;
    const payload = {
      author,
      lifecycleState: 'PUBLISHED',
      specificContent: {
        'com.linkedin.ugc.ShareContent': {
          shareCommentary: { text },
          shareMediaCategory: 'ARTICLE',
          media: [
            {
              status: 'READY',
              description: { text: description || '' },
              originalUrl: articleUrl,
              title: { text: title || '' },
            },
          ],
        },
      },
      visibility: {
        'com.linkedin.ugc.MemberNetworkVisibility': 'PUBLIC',
      },
    };

    const response = await axios.post(
      'https://api.linkedin.com/v2/ugcPosts',
      payload,
      {
        headers: {
          Authorization: `Bearer ${tokenStore.accessToken}`,
          'Content-Type': 'application/json',
          'X-Restli-Protocol-Version': '2.0.0',
        },
      }
    );

     console.log(`[LinkedIn] Article post published. ID: ${response.data.id}`);
    return response.data;
  }

  // ---- Fetch Recent Polls ----

  /**
   * Fetch the most recent polls posted by the Artisan Company Page.
   * Uses the Posts API (v2) with q=authors to list org posts, then filters
   * for those that contain poll content and returns the last `limit` polls.
   *
   * Each returned poll object has:
   *   { id, question, options: [{ text, voteCount }], totalVotes, postedAt, commentary }
   *
   * @param {number} limit - Max number of polls to return (default 5)
   * @returns {Array} Array of poll summary objects
   */
  async getRecentPolls(limit = 5) {
    if (!this.isConnected()) throw new Error('LinkedIn is not connected.');

    const headers = {
      Authorization: `Bearer ${tokenStore.accessToken}`,
      'X-Restli-Protocol-Version': '2.0.0',
      'LinkedIn-Version': '202502',
    };
    const encodedUrn = encodeURIComponent(tokenStore.orgUrn);
    const polls = [];

    // ---- Strategy 1: REST Posts API (newer, returns content.poll directly) ----
    try {
      const restResp = await axios.get(
        `https://api.linkedin.com/rest/posts?author=${encodedUrn}&q=author&count=100`,
        { headers }
      );
      const restElements = (restResp.data && restResp.data.elements) || [];
      for (const post of restElements) {
        if (polls.length >= limit) break;
        const pollData = post.content && post.content.poll;
        if (!pollData) continue;
        const options = (pollData.options || []).map(opt => ({
          text: opt.text,
          voteCount: opt.voteCount || 0,
        }));
        const totalVotes = options.reduce((sum, o) => sum + o.voteCount, 0);
        polls.push({
          id: post.id,
          question: pollData.question || '',
          options,
          totalVotes,
          postedAt: post.publishedAt || post.createdAt || null,
          commentary: post.commentary || '',
        });
      }
      if (polls.length > 0) return polls;
    } catch (restErr) {
      console.warn('[LinkedIn] REST posts API failed, falling back to ugcPosts:', restErr.message);
    }

    // ---- Strategy 2: ugcPosts API (older v2 format) ----
    const ugcResp = await axios.get(
      `https://api.linkedin.com/v2/ugcPosts?q=authors&authors=List(${encodedUrn})&count=100`,
      { headers }
    );
    const ugcElements = (ugcResp.data && ugcResp.data.elements) || [];
    for (const post of ugcElements) {
      if (polls.length >= limit) break;

      // Shape A: specificContent.com.linkedin.ugc.ShareContent.media[].poll
      const shareContent = post.specificContent &&
        post.specificContent['com.linkedin.ugc.ShareContent'];
      if (shareContent) {
        const media = shareContent.media || [];
        const pollMedia = media.find(m => m.poll);
        if (pollMedia) {
          const poll = pollMedia.poll;
          const options = (poll.options || []).map(opt => ({
            text: opt.text,
            voteCount: opt.voteCount || 0,
          }));
          const totalVotes = options.reduce((sum, o) => sum + o.voteCount, 0);
          polls.push({
            id: post.id,
            question: poll.question || '',
            options,
            totalVotes,
            postedAt: post.created ? post.created.time : null,
            commentary: shareContent.shareCommentary ? shareContent.shareCommentary.text : '',
          });
          continue;
        }
      }

      // Shape B: content.poll (some API versions return this on ugcPosts too)
      const pollDirect = post.content && post.content.poll;
      if (pollDirect) {
        const options = (pollDirect.options || []).map(opt => ({
          text: opt.text,
          voteCount: opt.voteCount || 0,
        }));
        const totalVotes = options.reduce((sum, o) => sum + o.voteCount, 0);
        polls.push({
          id: post.id,
          question: pollDirect.question || '',
          options,
          totalVotes,
          postedAt: post.created ? post.created.time : null,
          commentary: post.commentary || '',
        });
      }
    }

    return polls;
  }

  // ---- Image Upload ----

  /**
   * Register an image upload with LinkedIn Assets API.
   * @returns {object} { uploadUrl, asset }
   */
  async registerImageUpload() {
    if (!this.isConnected()) throw new Error('LinkedIn is not connected.');
    const payload = {
      registerUploadRequest: {
        recipes: ['urn:li:digitalmediaRecipe:feedshare-image'],
        owner: tokenStore.orgUrn,
        serviceRelationships: [{
          relationshipType: 'OWNER',
          identifier: 'urn:li:userGeneratedContent',
        }],
      },
    };
    const response = await axios.post(
      'https://api.linkedin.com/v2/assets?action=registerUpload',
      payload,
      {
        headers: {
          Authorization: `Bearer ${tokenStore.accessToken}`,
          'Content-Type': 'application/json',
          'X-Restli-Protocol-Version': '2.0.0',
        },
      }
    );
    const { uploadMechanism, asset } = response.data.value;
    const uploadUrl = uploadMechanism['com.linkedin.digitalmedia.uploading.MediaUploadHttpRequest'].uploadUrl;
    return { uploadUrl, asset };
  }

  /**
   * Upload image binary to LinkedIn.
   * @param {string} uploadUrl - URL from registerImageUpload
   * @param {Buffer} imageBuffer - Raw image buffer
   * @param {string} mimeType - e.g. 'image/jpeg'
   */
  async uploadImageBinary(uploadUrl, imageBuffer, mimeType) {
    await axios.put(uploadUrl, imageBuffer, {
      headers: {
        Authorization: `Bearer ${tokenStore.accessToken}`,
        'Content-Type': mimeType,
      },
    });
  }

  /**
   * Post a text update with an attached image to the Artisan Company Page.
   * @param {string} text - Post body text
   * @param {Buffer} imageBuffer - Raw image buffer
   * @param {string} mimeType - e.g. 'image/jpeg'
   * @param {string} imageTitle - Alt text / title for the image
   * @returns {object} LinkedIn API response
   */
  async postWithImage(text, imageBuffer, mimeType, imageTitle = '') {
    if (!this.isConnected()) throw new Error('LinkedIn is not connected.');
    // Step 1: Register upload
    const { uploadUrl, asset } = await this.registerImageUpload();
    // Step 2: Upload binary
    await this.uploadImageBinary(uploadUrl, imageBuffer, mimeType);
    // Step 3: Create post referencing asset
    const payload = {
      author: tokenStore.orgUrn,
      lifecycleState: 'PUBLISHED',
      specificContent: {
        'com.linkedin.ugc.ShareContent': {
          shareCommentary: { text },
          shareMediaCategory: 'IMAGE',
          media: [{
            status: 'READY',
            description: { text: imageTitle },
            media: asset,
            title: { text: imageTitle },
          }],
        },
      },
      visibility: {
        'com.linkedin.ugc.MemberNetworkVisibility': 'PUBLIC',
      },
    };
    const response = await axios.post(
      'https://api.linkedin.com/v2/ugcPosts',
      payload,
      {
        headers: {
          Authorization: `Bearer ${tokenStore.accessToken}`,
          'Content-Type': 'application/json',
          'X-Restli-Protocol-Version': '2.0.0',
        },
      }
    );
    console.log(`[LinkedIn] Image post published. ID: ${response.data.id}`);
    return response.data;
  }

  // ---- Poll ----

  /**
   * Post a LinkedIn Poll to the Artisan Company Page.
   * @param {string} text - Post body / question context
   * @param {string} question - The poll question
   * @param {string[]} options - Array of 2–4 option strings
   * @param {string} duration - 'ONE_DAY' | 'THREE_DAYS' | 'ONE_WEEK' | 'TWO_WEEKS'
   * @returns {object} LinkedIn API response
   */
  async postPoll(text, question, options, duration = 'ONE_WEEK') {
    if (!this.isConnected()) throw new Error('LinkedIn is not connected.');
    if (!options || options.length < 2 || options.length > 4) {
      throw new Error('Polls require between 2 and 4 options.');
    }
    const pollOptions = options.map(opt => ({ text: opt }));
    const payload = {
      author: tokenStore.orgUrn,
      lifecycleState: 'PUBLISHED',
      specificContent: {
        'com.linkedin.ugc.ShareContent': {
          shareCommentary: { text },
          shareMediaCategory: 'POLL',
          media: [{
            status: 'READY',
            poll: {
              question,
              options: pollOptions,
              settings: {
                duration,
              },
            },
          }],
        },
      },
      visibility: {
        'com.linkedin.ugc.MemberNetworkVisibility': 'PUBLIC',
      },
    };
    const response = await axios.post(
      'https://api.linkedin.com/v2/ugcPosts',
      payload,
      {
        headers: {
          Authorization: `Bearer ${tokenStore.accessToken}`,
          'Content-Type': 'application/json',
          'X-Restli-Protocol-Version': '2.0.0',
        },
      }
    );
    console.log(`[LinkedIn] Poll published. ID: ${response.data.id}`);
    return response.data;
  }
}
module.exports = new LinkedInService();
