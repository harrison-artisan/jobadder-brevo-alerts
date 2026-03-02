const aiService = require('../services/aiService');
const wordpressService = require('../services/wordpressService');
const path = require('path');
const fs = require('fs');

/**
 * Content Marketing Controller
 * Handles the full pipeline:
 *   1. Generate article (OpenAI)
 *   2. Generate header image (DALL-E 3)
 *   3. Publish to WordPress (upload media + create post)
 *   4. Generate social media posts (OpenAI)
 */

// ============================================================
// Step 1 + 2: Generate article AND header image together
// ============================================================
async function generateContent(req, res) {
    const { topic } = req.body;

    if (!topic || !topic.trim()) {
        return res.status(400).json({ success: false, message: 'A topic is required.' });
    }

    console.log('\n======== 📰 CONTENT MARKETING: GENERATE ========');
    console.log(`Topic: "${topic}"`);

    try {
        // Run article and image generation in parallel for speed
        const [article, imagePath] = await Promise.all([
            aiService.generateArticle(topic.trim()),
            aiService.generateHeaderImage(topic.trim())
        ]);

        // Read the image as base64 so the dashboard can preview it
        const imageBuffer = fs.readFileSync(imagePath);
        const imageBase64 = imageBuffer.toString('base64');
        const imageDataUrl = `data:image/png;base64,${imageBase64}`;

        // Store the local image path in a temp state file so we can use it at publish time
        const stateDir = path.join(__dirname, '..');
        const stateFile = path.join(stateDir, '.content-state.json');
        const state = {
            topic,
            article,
            imagePath,
            imageDataUrl,
            generatedAt: new Date().toISOString(),
            publishedPost: null,
            socialPosts: null
        };
        fs.writeFileSync(stateFile, JSON.stringify(state, null, 2));

        console.log('✅ Content generation complete.');
        res.json({
            success: true,
            message: 'Article and header image generated successfully.',
            article,
            imageDataUrl
        });
    } catch (error) {
        console.error('❌ Error generating content:', error.message);
        res.status(500).json({ success: false, message: error.message });
    }
}

// ============================================================
// Step 3: Publish to WordPress
// ============================================================
async function publishToWordPress(req, res) {
    const { title, content, excerpt, status, categoryId } = req.body;

    if (!title || !content) {
        return res.status(400).json({ success: false, message: 'Title and content are required.' });
    }

    console.log('\n======== 🚀 CONTENT MARKETING: PUBLISH ========');

    try {
        // Load the saved state to get the local image path
        const stateFile = path.join(__dirname, '..', '.content-state.json');
        let imagePath = null;
        let state = {};

        if (fs.existsSync(stateFile)) {
            state = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
            imagePath = state.imagePath;
        }

        // 1. Upload the header image to WordPress Media Library
        let featuredMediaId = null;
        if (imagePath && fs.existsSync(imagePath)) {
            const safeTitle = title.replace(/[^a-z0-9]/gi, '-').toLowerCase().slice(0, 50);
            const fileName = `${safeTitle}-header.png`;
            const media = await wordpressService.uploadMedia(imagePath, fileName);
            featuredMediaId = media.id;
        } else {
            console.warn('⚠️  No header image found in state — publishing without featured image.');
        }

        // 2. Resolve tag IDs from suggested tags
        const suggestedTags = state.article?.suggestedTags || [];
        const tagIds = await wordpressService.resolveTagIds(suggestedTags);

        // 3. Build category array
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

        // 5. Update state with published post info
        state.publishedPost = post;
        fs.writeFileSync(stateFile, JSON.stringify(state, null, 2));

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
// Step 4: Generate social media posts
// ============================================================
async function generateSocialPosts(req, res) {
    const { articleTitle, excerpt, articleUrl } = req.body;

    if (!articleTitle || !articleUrl) {
        return res.status(400).json({ success: false, message: 'articleTitle and articleUrl are required.' });
    }

    console.log('\n======== 📱 CONTENT MARKETING: SOCIAL POSTS ========');

    try {
        const posts = await aiService.generateSocialPosts(articleTitle, excerpt || '', articleUrl);

        // Save social posts to state
        const stateFile = path.join(__dirname, '..', '.content-state.json');
        if (fs.existsSync(stateFile)) {
            const state = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
            state.socialPosts = posts;
            fs.writeFileSync(stateFile, JSON.stringify(state, null, 2));
        }

        res.json({ success: true, posts });
    } catch (error) {
        console.error('❌ Error generating social posts:', error.message);
        res.status(500).json({ success: false, message: error.message });
    }
}

// ============================================================
// Get current content state
// ============================================================
async function getState(req, res) {
    try {
        const stateFile = path.join(__dirname, '..', '.content-state.json');
        if (!fs.existsSync(stateFile)) {
            return res.json({ success: true, state: null });
        }
        const state = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
        // Don't send the large base64 image in state checks — only the metadata
        const { imageDataUrl, imagePath, ...safeState } = state;
        res.json({ success: true, state: safeState });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
}

// ============================================================
// Reset state
// ============================================================
async function resetState(req, res) {
    try {
        const stateFile = path.join(__dirname, '..', '.content-state.json');
        if (fs.existsSync(stateFile)) {
            fs.unlinkSync(stateFile);
        }
        res.json({ success: true, message: 'Content state reset.' });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
}

module.exports = {
    generateContent,
    publishToWordPress,
    generateSocialPosts,
    getState,
    resetState
};
