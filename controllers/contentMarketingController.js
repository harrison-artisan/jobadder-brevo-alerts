const aiService = require('../services/aiService');
const wordpressService = require('../services/wordpressService');
const path = require('path');
const fs = require('fs');

/**
 * Content Marketing Controller
 *
 * 3-Step Pipeline:
 *   STEP 1 — Generate Article:  POST /api/content/generate-article
 *   STEP 2 — Generate Image:    POST /api/content/generate-image
 *   STEP 3 — Publish to WP:     POST /api/content/publish
 *
 * Supporting:
 *   GET  /api/content/state              - Load saved state (article + image preview)
 *   GET  /api/content/wp-categories      - Fetch WordPress categories for the selector
 *   POST /api/content/social-posts       - Generate social copy after publishing
 *   POST /api/content/reset              - Clear all state
 */

const STATE_FILE = path.join(__dirname, '..', '.content-state.json');

function readState() {
    if (!fs.existsSync(STATE_FILE)) return {};
    try { return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')); } catch (e) { return {}; }
}

function writeState(data) {
    fs.writeFileSync(STATE_FILE, JSON.stringify(data, null, 2));
}

// ============================================================
// STEP 1: Generate Article copy only
// ============================================================
async function generateArticle(req, res) {
    const { topic } = req.body;

    if (!topic || !topic.trim()) {
        return res.status(400).json({ success: false, message: 'A topic is required.' });
    }

    console.log('\n======== 📰 STEP 1: GENERATE ARTICLE ========');
    console.log(`Topic: "${topic}"`);

    try {
        const article = await aiService.generateArticle(topic.trim());

        // Save to state — image will be added in step 2
        const state = {
            topic: topic.trim(),
            article,
            imagePath: null,
            imageDataUrl: null,
            generatedAt: new Date().toISOString(),
            publishedPost: null,
            socialPosts: null
        };
        writeState(state);

        console.log('✅ Article generation complete.');
        res.json({
            success: true,
            message: 'Article generated successfully.',
            article
        });
    } catch (error) {
        console.error('❌ Error generating article:', error.message);
        res.status(500).json({ success: false, message: error.message });
    }
}

// ============================================================
// STEP 2: Generate Header Image from the article title/topic
// ============================================================
async function generateImage(req, res) {
    // Allow a custom prompt override, otherwise use the saved article title
    const { imagePrompt } = req.body;

    console.log('\n======== 🎨 STEP 2: GENERATE IMAGE ========');

    try {
        const state = readState();

        // Use the provided prompt, or fall back to the saved article title, then the topic
        const promptToUse = (imagePrompt && imagePrompt.trim())
            ? imagePrompt.trim()
            : (state.article?.title || state.topic || 'professional recruitment agency blog header');

        console.log(`Image prompt: "${promptToUse}"`);

        const imagePath = await aiService.generateHeaderImage(promptToUse);

        // Read image as base64 for the dashboard preview
        const imageBuffer = fs.readFileSync(imagePath);
        const imageDataUrl = `data:image/png;base64,${imageBuffer.toString('base64')}`;

        // Update state with image info
        state.imagePath = imagePath;
        state.imageDataUrl = imageDataUrl;
        writeState(state);

        console.log('✅ Image generation complete.');
        res.json({
            success: true,
            message: 'Header image generated successfully.',
            imageDataUrl
        });
    } catch (error) {
        console.error('❌ Error generating image:', error.message);
        res.status(500).json({ success: false, message: error.message });
    }
}

// ============================================================
// STEP 3: Publish to WordPress (after user has reviewed)
// ============================================================
async function publishToWordPress(req, res) {
    const { title, content, excerpt, status, categoryId } = req.body;

    if (!title || !content) {
        return res.status(400).json({ success: false, message: 'Title and content are required.' });
    }

    console.log('\n======== 🚀 STEP 3: PUBLISH TO WORDPRESS ========');

    try {
        const state = readState();
        const imagePath = state.imagePath;

        // 1. Upload the header image to WordPress Media Library
        let featuredMediaId = null;
        if (imagePath && fs.existsSync(imagePath)) {
            const safeTitle = title.replace(/[^a-z0-9]/gi, '-').toLowerCase().slice(0, 50);
            const fileName = `${safeTitle}-header.png`;
            const media = await wordpressService.uploadMedia(imagePath, fileName);
            featuredMediaId = media.id;
        } else {
            console.warn('⚠️  No header image in state — publishing without featured image.');
        }

        // 2. Resolve tag IDs from suggested tags saved in state
        const suggestedTags = state.article?.suggestedTags || [];
        const tagIds = await wordpressService.resolveTagIds(suggestedTags);

        // 3. Build category array from user selection
        const categories = categoryId ? [parseInt(categoryId)] : [];

        // 4. Create the WordPress post
        const post = await wordpressService.createPost({
            title,
            content,
            excerpt: excerpt || state.article?.excerpt || '',
            featuredMediaId,
            status: status || 'draft',
            categories,
            tags: tagIds
        });

        // 5. Persist published post info in state
        state.publishedPost = post;
        writeState(state);

        console.log(`✅ Published to WordPress: ${post.link}`);
        res.json({
            success: true,
            message: `Post ${post.status === 'publish' ? 'published' : 'saved as draft'} successfully.`,
            post
        });
    } catch (error) {
        console.error('❌ Error publishing to WordPress:', error.message);
        res.status(500).json({ success: false, message: error.message });
    }
}

// ============================================================
// Fetch WordPress Categories for the category selector
// ============================================================
async function getWordPressCategories(req, res) {
    console.log('\n📂 Fetching WordPress categories...');
    try {
        const categories = await wordpressService.getCategories();
        res.json({ success: true, categories });
    } catch (error) {
        console.error('❌ Error fetching categories:', error.message);
        res.status(500).json({ success: false, message: error.message });
    }
}

// ============================================================
// Generate social media posts (after publishing)
// ============================================================
async function generateSocialPosts(req, res) {
    const { articleTitle, excerpt, articleUrl } = req.body;

    if (!articleTitle || !articleUrl) {
        return res.status(400).json({ success: false, message: 'articleTitle and articleUrl are required.' });
    }

    console.log('\n======== 📱 SOCIAL POSTS ========');

    try {
        const posts = await aiService.generateSocialPosts(articleTitle, excerpt || '', articleUrl);

        const state = readState();
        state.socialPosts = posts;
        writeState(state);

        res.json({ success: true, posts });
    } catch (error) {
        console.error('❌ Error generating social posts:', error.message);
        res.status(500).json({ success: false, message: error.message });
    }
}

// ============================================================
// Get current state (article + image preview for page reload)
// ============================================================
async function getState(req, res) {
    try {
        const state = readState();
        if (!state.article) {
            return res.json({ success: true, state: null });
        }
        // Return full state including imageDataUrl for preview restoration
        res.json({ success: true, state });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
}

// ============================================================
// Reset all state
// ============================================================
async function resetState(req, res) {
    try {
        if (fs.existsSync(STATE_FILE)) fs.unlinkSync(STATE_FILE);
        res.json({ success: true, message: 'Content state reset.' });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
}

module.exports = {
    generateArticle,
    generateImage,
    publishToWordPress,
    getWordPressCategories,
    generateSocialPosts,
    getState,
    resetState
};
