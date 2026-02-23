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
            return this.formatArticleData(response.data);
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

        // Truncate excerpt to ~200 chars and ensure it ends with ...
        const maxLength = 200;
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
}

module.exports = new WordpressService();

