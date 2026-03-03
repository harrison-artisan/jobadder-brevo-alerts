const axios = require("axios");

const WORDPRESS_API_URL = process.env.WORDPRESS_API_URL || "https://artisan.com.au/wp-json/wp/v2";
const ARTICLE_CATEGORY_ID = process.env.ARTICLE_CATEGORY_ID || 6;

/**
 * Decode HTML entities and strip any remaining HTML tags from a string.
 * This ensures clean plain text is passed to Brevo templates.
 * @param {string} str - Raw string potentially containing HTML entities or tags.
 * @returns {string}
 */
function decodeHtmlEntities(str) {
    if (!str) return '';

    return str
        // Strip HTML tags first
        .replace(/<[^>]*>?/gm, '')
        // Named entities — punctuation
        .replace(/&hellip;/gi, '...')
        .replace(/&amp;/gi, '&')
        .replace(/&nbsp;/gi, ' ')
        .replace(/&ndash;/gi, '–')
        .replace(/&mdash;/gi, '—')
        // Smart quotes
        .replace(/&lsquo;/gi, '\u2018')
        .replace(/&rsquo;/gi, '\u2019')
        .replace(/&ldquo;/gi, '\u201C')
        .replace(/&rdquo;/gi, '\u201D')
        // Numeric entities — common ones
        .replace(/&#8230;/g, '...')
        .replace(/&#8211;/g, '–')
        .replace(/&#8212;/g, '—')
        .replace(/&#8216;/g, '\u2018')
        .replace(/&#8217;/g, '\u2019')
        .replace(/&#8220;/g, '\u201C')
        .replace(/&#8221;/g, '\u201D')
        .replace(/&#038;/g, '&')
        .replace(/&#160;/g, ' ')
        // Generic numeric entities (decimal)
        .replace(/&#(\d+);/g, (match, dec) => String.fromCharCode(dec))
        // Generic numeric entities (hex)
        .replace(/&#x([0-9a-f]+);/gi, (match, hex) => String.fromCharCode(parseInt(hex, 16)))
        // Collapse multiple spaces / trim
        .replace(/\s+/g, ' ')
        .trim();
}

class WordpressService {
    /**
     * Fetches a specified number of the latest articles from the 'Article' category.
     * @param {number} count - The number of articles to fetch.
     * @returns {Promise<Array>}
     */
    async getLatestArticles(count = 5) {
        try {
            const response = await axios.get(`${WORDPRESS_API_URL}/posts`, {
                params: {
                    categories: ARTICLE_CATEGORY_ID,
                    per_page: count,
                    _embed: "true", // Embeds featured images, author, etc.
                },
            });
            return response.data.map(this.formatArticleData);
        } catch (error) {
            console.error("Error fetching latest articles from WordPress:", error.message);
            return [];
        }
    }

    /**
     * Fetches all articles from the 'Article' category for dropdown lists.
     * @returns {Promise<Array>}
     */
    async getAllArticles() {
        try {
            const response = await axios.get(`${WORDPRESS_API_URL}/posts`, {
                params: {
                    categories: ARTICLE_CATEGORY_ID,
                    per_page: 100, // Fetch up to 100 articles for the list
                },
            });
            return response.data.map(post => ({
                id: post.id,
                title: decodeHtmlEntities(post.title.rendered)
            }));
        } catch (error) {
            console.error("Error fetching all articles from WordPress:", error.message);
            return [];
        }
    }

    /**
     * Fetches a single article by its ID.
     * @param {number} articleId - The ID of the article to fetch.
     * @returns {Promise<Object|null>}
     */
    async getArticleById(articleId) {
        try {
            const response = await axios.get(`${WORDPRESS_API_URL}/posts/${articleId}`, {
                params: {
                    _embed: "true",
                },
            });
            return this.formatArticleDataLong(response.data);
        } catch (error) {
            console.error(`Error fetching article ${articleId} from WordPress:`, error.message);
            return null;
        }
    }

    /**
     * Formats the raw article data from the WordPress API into a clean object.
     * Strips HTML tags and decodes all HTML entities so plain text is passed to Brevo.
     * @param {Object} post - The raw post object from the API.
     * @returns {Object}
     */
    formatArticleData(post) {
        const featuredImage = post._embedded?.["wp:featuredmedia"]?.[0]?.source_url || null;

        // Decode entities and strip HTML from both title and excerpt
        const title = decodeHtmlEntities(post.title.rendered);
        const excerpt = decodeHtmlEntities(post.excerpt.rendered);

        // Truncate excerpt to ~800 chars and ensure it ends with ...
        const maxLength = 800;
        const truncatedExcerpt = excerpt.length > maxLength
            ? excerpt.substring(0, maxLength).replace(/\s+\S*$/, '') + '...'
            : excerpt;

        return {
            id: post.id,
            title,
            excerpt: truncatedExcerpt,
            link: post.link,
            date: post.date,
            featuredImage,
        };
    }

    /**
     * Same as formatArticleData but with a longer excerpt (2500 chars).
     * Used only by getArticleById for single article emails.
     * NEVER pass this as a .map() callback.
     */
    formatArticleDataLong(post) {
        const featuredImage = post._embedded?.["wp:featuredmedia"]?.[0]?.source_url || null;
        const title = decodeHtmlEntities(post.title.rendered);
        // Use full article content (stripped of HTML tags) so WordPress excerpt truncation doesn't limit us
        const rawContent = post.content?.rendered || post.excerpt?.rendered || '';
        const excerpt = decodeHtmlEntities(rawContent);
        const maxLength = 500;
        const truncatedExcerpt = excerpt.length > maxLength
            ? excerpt.substring(0, maxLength).replace(/\s+\S*$/, '') + '...'
            : excerpt;
        return {
            id: post.id,
            title,
            excerpt: truncatedExcerpt,
            link: post.link,
            date: post.date,
            featuredImage,
        };
    }

    // ============================================================
    // CONTENT MARKETING: Create Posts & Upload Media
    // ============================================================

    /**
     * Build the Basic Auth header from env vars.
     * Requires WORDPRESS_USERNAME and WORDPRESS_APPLICATION_PASSWORD.
     */
    getAuthHeader() {
        const user = process.env.WORDPRESS_USERNAME;
        const pass = process.env.WORDPRESS_APPLICATION_PASSWORD;
        if (!user || !pass) {
            throw new Error('WORDPRESS_USERNAME or WORDPRESS_APPLICATION_PASSWORD environment variable is not set.');
        }
        const token = Buffer.from(`${user}:${pass}`).toString('base64');
        return `Basic ${token}`;
    }

    /**
     * Upload an image file to the WordPress Media Library.
     * @param {string} filePath - Absolute path to the local image file.
     * @param {string} fileName - Desired file name (e.g. "header-image.png").
     * @returns {Promise<{id: number, url: string}>} The media ID and source URL.
     */
    async uploadMedia(filePath, fileName) {
        const fs = require('fs');
        const path = require('path');
        const FormData = require('form-data');

        console.log(`\n📤 Uploading media to WordPress: ${fileName}`);

        const form = new FormData();
        form.append('file', fs.createReadStream(filePath), {
            filename: fileName || path.basename(filePath),
            contentType: 'image/png'
        });

        try {
            const response = await axios.post(
                `${WORDPRESS_API_URL}/media`,
                form,
                {
                    headers: {
                        ...form.getHeaders(),
                        'Authorization': this.getAuthHeader(),
                        'Content-Disposition': `attachment; filename="${fileName || path.basename(filePath)}"`
                    }
                }
            );

            console.log(`✅ Media uploaded. ID: ${response.data.id}, URL: ${response.data.source_url}`);
            return {
                id: response.data.id,
                url: response.data.source_url
            };
        } catch (error) {
            console.error('❌ Error uploading media to WordPress:', error.response?.data || error.message);
            throw error;
        }
    }

    /**
     * Create a new WordPress post.
     * @param {Object} postData
     * @param {string} postData.title - Post title.
     * @param {string} postData.content - Post body (HTML or markdown).
     * @param {string} [postData.excerpt] - Short excerpt.
     * @param {number} [postData.featuredMediaId] - ID of the featured image media.
     * @param {string} [postData.status] - 'publish' | 'draft' | 'future' (default: 'draft').
     * @param {number[]} [postData.categories] - Array of category IDs.
     * @param {number[]} [postData.tags] - Array of tag IDs.
     * @param {string} [postData.scheduledDate] - ISO 8601 datetime in Melbourne time, e.g. '2025-06-01T09:00:00+10:00'. Required when status is 'future'.
     * @returns {Promise<{id: number, link: string, status: string}>}
     */
    async createPost({ title, content, excerpt, featuredMediaId, status = 'draft', categories = [], tags = [], scheduledDate = null }) {
        console.log(`\n📝 Creating WordPress post: "${title}" [status: ${status}${scheduledDate ? ', scheduled: ' + scheduledDate : ''}]`);

        // Convert markdown-style content to basic HTML paragraphs
        const htmlContent = this.markdownToHtml(content);

        const payload = {
            title,
            content: htmlContent,
            excerpt: excerpt || '',
            status,
            categories: categories.length ? categories : undefined,
            tags: tags.length ? tags : undefined,
        };

        if (featuredMediaId) {
            payload.featured_media = featuredMediaId;
        }

        // WordPress requires date when status is 'future'
        if (scheduledDate && status === 'future') {
            payload.date = scheduledDate;
        }

        try {
            const response = await axios.post(
                `${WORDPRESS_API_URL}/posts`,
                payload,
                {
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': this.getAuthHeader()
                    }
                }
            );

            console.log(`✅ WordPress post created. ID: ${response.data.id}, Link: ${response.data.link}`);
            return {
                id: response.data.id,
                link: response.data.link,
                status: response.data.status
            };
        } catch (error) {
            console.error('❌ Error creating WordPress post:', error.response?.data || error.message);
            throw error;
        }
    }

    /**
     * Resolve or create WordPress tags by name.
     * Returns an array of tag IDs.
     */
    async resolveTagIds(tagNames) {
        if (!tagNames || tagNames.length === 0) return [];

        const ids = [];
        for (const name of tagNames) {
            try {
                // Search for existing tag
                const searchResp = await axios.get(`${WORDPRESS_API_URL}/tags`, {
                    params: { search: name, per_page: 1 },
                    headers: { 'Authorization': this.getAuthHeader() }
                });

                if (searchResp.data.length > 0) {
                    ids.push(searchResp.data[0].id);
                } else {
                    // Create new tag
                    const createResp = await axios.post(
                        `${WORDPRESS_API_URL}/tags`,
                        { name },
                        { headers: { 'Content-Type': 'application/json', 'Authorization': this.getAuthHeader() } }
                    );
                    ids.push(createResp.data.id);
                }
            } catch (e) {
                console.warn(`⚠️  Could not resolve tag "${name}": ${e.message}`);
            }
        }
        return ids;
    }

    /**
     * Minimal markdown-to-HTML converter for article body.
     * Handles headings, bold, italic, and paragraphs.
     */
    markdownToHtml(markdown) {
        if (!markdown) return '';
        let html = markdown
            // Headings
            .replace(/^### (.+)$/gm, '<h3>$1</h3>')
            .replace(/^## (.+)$/gm, '<h2>$1</h2>')
            .replace(/^# (.+)$/gm, '<h1>$1</h1>')
            // Bold & italic
            .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
            .replace(/\*(.+?)\*/g, '<em>$1</em>')
            // Line breaks to paragraphs
            .split(/\n{2,}/)
            .map(para => {
                const trimmed = para.trim();
                if (!trimmed) return '';
                if (trimmed.startsWith('<h') || trimmed.startsWith('<ul') || trimmed.startsWith('<ol')) return trimmed;
                return `<p>${trimmed.replace(/\n/g, '<br>')}</p>`;
            })
            .filter(Boolean)
            .join('\n');
        return html;
    }

    /**
     * Fetch all WordPress categories.
     * Returns an array of { id, name, slug, count } objects.
     */
    async getCategories() {
        try {
            const response = await axios.get(`${WORDPRESS_API_URL}/categories`, {
                params: { per_page: 100, hide_empty: false },
                headers: { 'Authorization': this.getAuthHeader() }
            });
            return response.data.map(cat => ({
                id: cat.id,
                name: cat.name,
                slug: cat.slug,
                count: cat.count
            }));
        } catch (error) {
            console.error('❌ Error fetching WordPress categories:', error.response?.data || error.message);
            throw error;
        }
    }
}

module.exports = new WordpressService();

