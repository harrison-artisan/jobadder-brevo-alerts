const axios = require("axios");

const WORDPRESS_API_URL = process.env.WORDPRESS_API_URL || "https://artisan.com.au/wp-json/wp/v2";
const ARTICLE_CATEGORY_ID = process.env.ARTICLE_CATEGORY_ID || 6;

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
                title: post.title.rendered 
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
     * @param {Object} post - The raw post object from the API.
     * @returns {Object}
     */
    formatArticleData(post) {
        const featuredImage = post._embedded?.["wp:featuredmedia"]?.[0]?.source_url || null;
        
        // Simple regex to strip HTML tags from the excerpt
        const excerpt = post.excerpt.rendered.replace(/<[^>]*>?/gm, '').trim();

        return {
            id: post.id,
            title: post.title.rendered,
            excerpt,
            link: post.link,
            date: post.date,
            featuredImage,
        };
    }
}

module.exports = new WordpressService();
