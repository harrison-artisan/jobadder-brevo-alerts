const jobadderService = require('./jobadderService');
const wordpressService = require('./wordpressService');

class EmailPreviewService {
    /**
     * Render HTML preview for Xpose newsletter
     */
    async renderXposeNewsletter(state) {
        if (!state || !state.featuredArticle) {
            throw new Error('No newsletter data available. Please generate first.');
        }

        const { featuredArticle, recentArticles, jobs } = state;

        return this.buildXposeNewsletterHTML(featuredArticle, recentArticles || [], jobs || []);
    }

    /**
     * Render HTML preview for single article
     */
    async renderSingleArticle(articleId) {
        const article = await wordpressService.getArticleById(articleId);
        if (!article) {
            throw new Error('Article not found');
        }

        return this.buildSingleArticleHTML(article);
    }

    /**
     * Render HTML preview for single job alert
     */
    async renderSingleJob(job) {
        if (!job) {
            throw new Error('Job not found');
        }
        return this.buildSingleJobHTML(job);
    }
    
    /**
     * Render HTML preview for A-List
     */
    async renderAlist(state) {
        if (!state || !state.candidates || state.candidates.length === 0) {
            throw new Error('No A-List data available. Please generate first.');
        }
        return this.buildAlistHTML(state.candidates);
    }

    /**
     * Build Xpose Newsletter HTML
     */
    buildXposeNewsletterHTML(featuredArticle, recentArticles, jobs) {
        const jobsHTML = jobs.slice(0, 5).map((job, index) => `
            <div style="flex: 0 0 48%; background: linear-gradient(135deg, #ffeef2 0%, #fff5f7 100%); border: 2px solid #bd203d; border-radius: 16px; padding: 20px; margin-bottom: 15px;">
                <h3 style="color: #1b334d; font-size: 18px; margin: 0 0 10px 0;">${job.title || 'Untitled Job'}</h3>
                <p style="color: #666; font-size: 14px; margin: 5px 0;"><strong>Company:</strong> ${job.company || 'N/A'}</p>
                <p style="color: #666; font-size: 14px; margin: 5px 0;"><strong>Location:</strong> ${job.location || 'N/A'}</p>
                <p style="color: #666; font-size: 14px; margin: 5px 0;"><strong>Type:</strong> ${job.workType || 'N/A'}</p>
                <a href="${job.link || '#'}" style="display: inline-block; margin-top: 15px; padding: 10px 20px; background: #bd203d; color: white; text-decoration: none; border-radius: 8px; font-weight: bold;">APPLY NOW</a>
            </div>
        `).join('');

        const recentArticlesHTML = recentArticles.map(article => `
            <div style="display: flex; gap: 20px; margin-bottom: 30px; padding-bottom: 30px; border-bottom: 2px solid #e8f0f7;">
                <img src="${article.image || 'https://via.placeholder.com/150'}" alt="${article.title}" style="width: 150px; height: 150px; object-fit: cover; border-radius: 12px; flex-shrink: 0;">
                <div style="flex: 1;">
                    <h3 style="color: #1b334d; font-size: 20px; margin: 0 0 10px 0;">${article.title}</h3>
                    <p style="color: #666; font-size: 14px; line-height: 1.6; margin: 0 0 15px 0;">${article.excerpt}</p>
                    <a href="${article.link}" style="display: inline-block; padding: 8px 16px; border: 2px solid #1b334d; color: #1b334d; text-decoration: none; border-radius: 8px; font-weight: bold;">READ NOW</a>
                </div>
            </div>
        `).join('');

        return `
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Artisan XPOSE Newsletter</title>
</head>
<body style="margin: 0; padding: 0; font-family: 'Source Sans Pro', Arial, sans-serif; background-color: #f4f4f4;">
    <div style="max-width: 650px; margin: 0 auto; background: white;">
        <!-- Header -->
        <div style="background: linear-gradient(135deg, #1b334d 0%, #2a4a6b 100%); padding: 30px; text-align: center;">
            <img src="https://artisan.com.au/wp-content/uploads/2023/01/artisan-logo-white.png" alt="Artisan" style="height: 50px;">
            <div style="background: linear-gradient(135deg, #e8f0f7 0%, #d4e3f0 100%); color: #1b334d; padding: 8px 20px; border-radius: 20px; display: inline-block; margin-top: 15px; font-weight: bold;">
                📰 ARTISAN XPOSE
            </div>
        </div>

        <!-- Greeting -->
        <div style="padding: 30px;">
            <p style="font-size: 16px; color: #333; line-height: 1.6;">Hi there,</p>
            <p style="font-size: 16px; color: #333; line-height: 1.6;">Welcome to the latest edition of Artisan XPOSE! Here are the top articles and opportunities we've curated for you.</p>
        </div>

        <!-- Featured Article -->
        <div style="padding: 0 30px 30px 30px;">
            <h2 style="color: #1b334d; font-size: 24px; margin-bottom: 20px; border-bottom: 3px solid #1b334d; padding-bottom: 10px;">✨ Featured Article</h2>
            <div style="border: 3px solid #1b334d; border-radius: 16px; overflow: hidden; margin-bottom: 30px;">
                <img src="${featuredArticle.image || 'https://via.placeholder.com/650x300'}" alt="${featuredArticle.title}" style="width: 100%; height: auto; display: block;">
                <div style="padding: 25px;">
                    <h3 style="color: #1b334d; font-size: 26px; margin: 0 0 15px 0;">${featuredArticle.title}</h3>
                    <p style="color: #666; font-size: 16px; line-height: 1.6; margin: 0 0 20px 0;">${featuredArticle.excerpt}</p>
                    <a href="${featuredArticle.link}" style="display: inline-block; padding: 12px 30px; background: linear-gradient(135deg, #1b334d 0%, #2a4a6b 100%); color: white; text-decoration: none; border-radius: 8px; font-weight: bold; box-shadow: 0 4px 10px rgba(27,51,77,0.3);">READ FULL ARTICLE</a>
                </div>
            </div>
        </div>

        <!-- Recent Articles -->
        <div style="padding: 0 30px 30px 30px;">
            <h2 style="color: #1b334d; font-size: 24px; margin-bottom: 20px; border-bottom: 3px solid #1b334d; padding-bottom: 10px;">📚 Recent Articles</h2>
            ${recentArticlesHTML}
        </div>

        <!-- Hot Jobs -->
        ${jobs.length > 0 ? `
        <div style="padding: 0 30px 30px 30px;">
            <h2 style="color: #bd203d; font-size: 24px; margin-bottom: 20px; border-bottom: 3px solid #bd203d; padding-bottom: 10px;">🔥 Hot Jobs</h2>
            <div style="display: flex; flex-wrap: wrap; gap: 15px; justify-content: space-between;">
                ${jobsHTML}
            </div>
        </div>
        ` : ''}

        <!-- Footer -->
        <div style="background: #1b334d; color: white; padding: 30px; text-align: center;">
            <p style="margin: 0 0 10px 0; font-size: 14px;">MEL (03) 9514 1000 | SYD (02) 8214 4666 | BNE (07) 3333 1833</p>
            <p style="margin: 0; font-size: 12px; color: #ccc;">© ${new Date().getFullYear()} Artisan. All rights reserved.</p>
        </div>
    </div>
</body>
</html>
        `;
    }

    /**
     * Build Single Article HTML
     */
    buildSingleArticleHTML(article) {
        return `
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${article.title}</title>
</head>
<body style="margin: 0; padding: 0; font-family: 'Source Sans Pro', Arial, sans-serif; background-color: #f4f4f4;">
    <div style="max-width: 650px; margin: 0 auto; background: white;">
        <!-- Header -->
        <div style="background: linear-gradient(135deg, #1b334d 0%, #2a4a6b 100%); padding: 30px; text-align: center;">
            <img src="https://artisan.com.au/wp-content/uploads/2023/01/artisan-logo-white.png" alt="Artisan" style="height: 50px;">
            <div style="background: linear-gradient(135deg, #e8f0f7 0%, #d4e3f0 100%); color: #1b334d; padding: 8px 20px; border-radius: 20px; display: inline-block; margin-top: 15px; font-weight: bold;">
                📰 ARTISAN XPOSE
            </div>
        </div>

        <!-- Greeting -->
        <div style="padding: 30px;">
            <p style="font-size: 16px; color: #333; line-height: 1.6;">Hi there,</p>
            <p style="font-size: 16px; color: #333; line-height: 1.6;">We thought you'd enjoy this article from Artisan.</p>
        </div>

        <!-- Article -->
        <div style="padding: 0 30px 30px 30px;">
            <div style="border: 3px solid #1b334d; border-radius: 16px; overflow: hidden;">
                <img src="${article.image || 'https://via.placeholder.com/650x300'}" alt="${article.title}" style="width: 100%; height: auto; display: block;">
                <div style="padding: 30px; text-align: center;">
                    <h1 style="color: #1b334d; font-size: 32px; margin: 0 0 20px 0;">${article.title}</h1>
                    <div style="background: #f9f9f9; border-left: 4px solid #1b334d; padding: 20px; margin: 20px 0; text-align: left;">
                        <p style="color: #666; font-size: 16px; line-height: 1.8; margin: 0;">${article.excerpt}</p>
                    </div>
                    <a href="${article.link}" style="display: inline-block; padding: 15px 40px; background: linear-gradient(135deg, #1b334d 0%, #2a4a6b 100%); color: white; text-decoration: none; border-radius: 8px; font-weight: bold; font-size: 18px; box-shadow: 0 4px 10px rgba(27,51,77,0.3); margin-top: 20px;">READ FULL ARTICLE</a>
                </div>
            </div>
        </div>

        <!-- CTA -->
        <div style="background: linear-gradient(135deg, #ffeef2 0%, #fff5f7 100%); padding: 30px; margin: 0 30px 30px 30px; border-radius: 16px; text-align: center; border: 2px solid #bd203d;">
            <h3 style="color: #bd203d; font-size: 22px; margin: 0 0 15px 0;">Looking for Your Next Opportunity?</h3>
            <p style="color: #666; font-size: 16px; margin: 0 0 20px 0;">Check out our latest job openings!</p>
            <a href="https://artisan.com.au/jobs" style="display: inline-block; padding: 12px 30px; background: #bd203d; color: white; text-decoration: none; border-radius: 8px; font-weight: bold;">VIEW ALL JOBS</a>
        </div>

        <!-- Footer -->
        <div style="background: #1b334d; color: white; padding: 30px; text-align: center;">
            <p style="margin: 0 0 10px 0; font-size: 14px;">MEL (03) 9514 1000 | SYD (02) 8214 4666 | BNE (07) 3333 1833</p>
            <p style="margin: 0; font-size: 12px; color: #ccc;">© ${new Date().getFullYear()} Artisan. All rights reserved.</p>
        </div>
    </div>
</body>
</html>
        `;
    }

    /**
     * Build Single Job HTML
     */
    buildSingleJobHTML(job) {
        return `
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${job.title}</title>
</head>
<body style="margin: 0; padding: 0; font-family: 'Source Sans Pro', Arial, sans-serif; background-color: #f4f4f4;">
    <div style="max-width: 650px; margin: 0 auto; background: white;">
        <!-- Header -->
        <div style="background: linear-gradient(135deg, #2980b9 0%, #3498db 100%); padding: 30px; text-align: center;">
            <img src="https://artisan.com.au/wp-content/uploads/2023/01/artisan-logo-white.png" alt="Artisan" style="height: 50px;">
            <h2 style="color: white; margin: 15px 0 0 0; font-size: 24px;">New Job Alert</h2>
        </div>

        <!-- Job Details -->
        <div style="padding: 40px;">
            <h1 style="color: #1b334d; font-size: 28px; margin: 0 0 20px 0;">${job.title}</h1>
            <div style="background: #f9f9f9; border-left: 4px solid #2980b9; padding: 20px; margin-bottom: 30px;">
                <p style="margin: 5px 0; color: #666; font-size: 16px;"><strong>Company:</strong> ${job.company || 'N/A'}</p>
                <p style="margin: 5px 0; color: #666; font-size: 16px;"><strong>Location:</strong> ${job.location || 'N/A'}</p>
                <p style="margin: 5px 0; color: #666; font-size: 16px;"><strong>Type:</strong> ${job.workType || 'N/A'}</p>
                <p style="margin: 5px 0; color: #666; font-size: 16px;"><strong>Category:</strong> ${job.category || 'N/A'}</p>
            </div>
            ${job.description ? `
            <div style="margin-bottom: 30px;">
                <h3 style="color: #1b334d; font-size: 20px; margin: 0 0 15px 0;">Job Description</h3>
                <p style="color: #666; font-size: 15px; line-height: 1.6;">${job.description}</p>
            </div>
            ` : ''}
            <div style="text-align: center;">
                <a href="${job.link || '#'}" style="display: inline-block; padding: 15px 40px; background: linear-gradient(135deg, #2980b9 0%, #3498db 100%); color: white; text-decoration: none; border-radius: 8px; font-weight: bold; font-size: 18px; box-shadow: 0 4px 10px rgba(41,128,185,0.3);">APPLY NOW</a>
            </div>
        </div>

        <!-- Footer -->
        <div style="background: #1b334d; color: white; padding: 30px; text-align: center;">
            <p style="margin: 0 0 10px 0; font-size: 14px;">MEL (03) 9514 1000 | SYD (02) 8214 4666 | BNE (07) 3333 1833</p>
            <p style="margin: 0; font-size: 12px; color: #ccc;">© ${new Date().getFullYear()} Artisan. All rights reserved.</p>
        </div>
    </div>
</body>
</html>
        `;
    }
    
    /**
     * Build A-List HTML
     */
    buildAlistHTML(candidates) {
        const candidatesHTML = candidates.map(candidate => `
            <div style="background: linear-gradient(135deg, #f3e8ff 0%, #f9f5ff 100%); border: 2px solid #9b59b6; border-radius: 16px; padding: 25px; margin-bottom: 20px;">
                <h3 style="color: #1b334d; font-size: 22px; margin: 0 0 15px 0;">${candidate.firstName} ${candidate.lastName}</h3>
                <p style="color: #666; font-size: 16px; margin: 5px 0;"><strong>Position:</strong> ${candidate.position || 'N/A'}</p>
                <p style="color: #666; font-size: 16px; margin: 5px 0;"><strong>Email:</strong> ${candidate.email || 'N/A'}</p>
                <p style="color: #666; font-size: 16px; margin: 5px 0;"><strong>Phone:</strong> ${candidate.phone || 'N/A'}</p>
                ${candidate.skills ? `<p style="color: #666; font-size: 14px; margin: 10px 0 0 0;"><strong>Skills:</strong> ${candidate.skills}</p>` : ''}
            </div>
        `).join('');
        
        return `
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Artisan A-List</title>
</head>
<body style="margin: 0; padding: 0; font-family: 'Source Sans Pro', Arial, sans-serif; background-color: #f4f4f4;">
    <div style="max-width: 650px; margin: 0 auto; background: white;">
        <!-- Header -->
        <div style="background: linear-gradient(135deg, #9b59b6 0%, #8e44ad 100%); padding: 30px; text-align: center;">
            <img src="https://artisan.com.au/wp-content/uploads/2023/01/artisan-logo-white.png" alt="Artisan" style="height: 50px;">
            <h2 style="color: white; margin: 15px 0 0 0; font-size: 24px;">Artisan A-List</h2>
        </div>

        <!-- Greeting -->
        <div style="padding: 30px;">
            <p style="font-size: 16px; color: #333; line-height: 1.6;">Hi there,</p>
            <p style="font-size: 16px; color: #333; line-height: 1.6;">Here are the top candidates from our recent interviews. These professionals are ready for their next opportunity!</p>
        </div>

        <!-- Candidates -->
        <div style="padding: 0 30px 30px 30px;">
            <h2 style="color: #9b59b6; font-size: 24px; margin-bottom: 20px; border-bottom: 3px solid #9b59b6; padding-bottom: 10px;">Featured Candidates</h2>
            ${candidatesHTML}
        </div>

        <!-- Footer -->
        <div style="background: #1b334d; color: white; padding: 30px; text-align: center;">
            <p style="margin: 0 0 10px 0; font-size: 14px;">MEL (03) 9514 1000 | SYD (02) 8214 4666 | BNE (07) 3333 1833</p>
            <p style="margin: 0; font-size: 12px; color: #ccc;">© ${new Date().getFullYear()} Artisan. All rights reserved.</p>
        </div>
    </div>
</body>
</html>
        `;
    }
}

module.exports = new EmailPreviewService();

