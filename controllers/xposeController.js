const fs = require('fs').promises;
const path = require('path');
const wordpressService = require('../services/wordpressService');
const jobadderService = require('../services/jobadderService');
const brevoService = require('../services/brevoService');

const XPOSE_STATE_FILE = path.join(__dirname, '..', '.xpose-state.json');

class XposeController {
    constructor() {
        this.state = {};
        this.loadState();
    }

    async loadState() {
        try {
            const data = await fs.readFile(XPOSE_STATE_FILE, 'utf8');
            this.state = JSON.parse(data);
        } catch (error) {
            this.state = { state: 'EMPTY' };
        }
        return this.state;
    }

    async saveState(newState) {
        this.state = { ...this.state, ...newState };
        await fs.writeFile(XPOSE_STATE_FILE, JSON.stringify(this.state, null, 2));
    }

    // --- Main Newsletter Workflow ---

    generateXpose = async (req, res) => {
        console.log('\n======== 📰 GENERATING XPOSE NEWSLETTER ========');
        try {
            const articles = await wordpressService.getLatestArticles(5);
            if (articles.length === 0) {
                return res.status(404).json({ 
                    success: false, 
                    message: 'No articles found in the last fetch.' 
                });
            }

            const jobs = await jobadderService.getLiveJobs();

            const featuredArticle = articles[0];
            const recentArticles = articles.slice(1);

            const newState = {
                state: 'GENERATED',
                generatedAt: new Date().toISOString(),
                featuredArticle,
                recentArticles,
                jobs: jobs.slice(0, 5), // Include up to 5 live jobs
            };

            await this.saveState(newState);
            console.log('✅ Xpose newsletter generated successfully!');
            res.json({ 
                success: true, 
                message: 'Newsletter generated.', 
                data: this.state 
            });
        } catch (error) {
            console.error('❌ Error generating Xpose newsletter:', error);
            res.status(500).json({ 
                success: false, 
                message: error.message 
            });
        }
    };

    sendTest = async (req, res) => {
        console.log('\n======== 🧪 SENDING XPOSE TEST EMAIL ========');
        await this.loadState();

        if (this.state.state !== 'GENERATED' && this.state.state !== 'TESTED') {
            return res.status(400).json({ 
                success: false, 
                message: 'Please generate the newsletter first.' 
            });
        }

        try {
            const testEmail = process.env.TEST_EMAIL;
            if (!testEmail) {
                return res.status(400).json({ 
                    success: false, 
                    message: 'TEST_EMAIL environment variable is not set.' 
                });
            }

            await brevoService.sendTransactionalEmail({
                templateId: parseInt(process.env.XPOSE_NEWSLETTER_TEMPLATE_ID),
                to: [{ email: testEmail }],
                params: this.state,
            });

            await this.saveState({ state: 'TESTED' });
            console.log(`✅ Test email sent to ${testEmail}`);
            res.json({ 
                success: true, 
                message: `Test email sent to ${testEmail}` 
            });
        } catch (error) {
            console.error('❌ Error sending test email:', error);
            res.status(500).json({ 
                success: false, 
                message: error.message 
            });
        }
    };

    sendToAll = async (req, res) => {
        console.log('\n======== 🚀 SENDING XPOSE TO ALL ========');
        await this.loadState();

        if (this.state.state !== 'TESTED') {
            return res.status(400).json({ 
                success: false, 
                message: 'You must send a test email before sending to all.' 
            });
        }

        try {
            const recipients = await brevoService.getContactsWithAttribute('JOB_ALERTS', 'Yes');
            if (recipients.length === 0) {
                return res.status(404).json({ 
                    success: false, 
                    message: 'No recipients found for job alerts.' 
                });
            }

            const testMode = process.env.TEST_MODE === 'true';
            const finalRecipients = testMode 
                ? [{ email: process.env.TEST_EMAIL }] 
                : recipients;

            await brevoService.sendTransactionalEmail({
                templateId: parseInt(process.env.XPOSE_NEWSLETTER_TEMPLATE_ID),
                to: finalRecipients,
                params: this.state,
            });

            await this.saveState({ state: 'SENT' });
            console.log(`✅ Xpose sent to ${finalRecipients.length} recipients.`);
            res.json({ 
                success: true, 
                message: `Newsletter sent to ${finalRecipients.length} recipients.` 
            });

            // Reset state after a short delay
            setTimeout(() => this.saveState({ state: 'EMPTY' }), 2000);

        } catch (error) {
            console.error('❌ Error sending Xpose to all:', error);
            res.status(500).json({ 
                success: false, 
                message: error.message 
            });
        }
    };

    // --- Single Article Workflow ---

    getAllArticles = async (req, res) => {
        try {
            const articles = await wordpressService.getAllArticles();
            res.json({ success: true, articles });
        } catch (error) {
            res.status(500).json({ 
                success: false, 
                message: error.message 
            });
        }
    };

    sendSingleArticle = async (req, res) => {
        const { articleId } = req.params;
        console.log(`\n======== 📄 SENDING SINGLE ARTICLE: ${articleId} ========`);

        try {
            const article = await wordpressService.getArticleById(articleId);
            if (!article) {
                return res.status(404).json({ 
                    success: false, 
                    message: 'Article not found.' 
                });
            }

            const recipients = await brevoService.getContactsWithAttribute('JOB_ALERTS', 'Yes');
            if (recipients.length === 0) {
                return res.status(404).json({ 
                    success: false, 
                    message: 'No recipients found.' 
                });
            }

            const testMode = process.env.TEST_MODE === 'true';
            const finalRecipients = testMode 
                ? [{ email: process.env.TEST_EMAIL }] 
                : recipients;

            await brevoService.sendTransactionalEmail({
                templateId: parseInt(process.env.XPOSE_SINGLE_ARTICLE_TEMPLATE_ID),
                to: finalRecipients,
                params: { article },
            });

            console.log(`✅ Single article ${articleId} sent to ${finalRecipients.length} recipients.`);
            res.json({ 
                success: true, 
                message: `Article sent to ${finalRecipients.length} recipients.` 
            });

        } catch (error) {
            console.error(`❌ Error sending single article ${articleId}:`, error);
            res.status(500).json({ 
                success: false, 
                message: error.message 
            });
        }
    };

    getState = async (req, res) => {
        await this.loadState();
        res.json({ success: true, state: this.state });
    };
}

module.exports = new XposeController();
