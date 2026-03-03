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

            const rawJobs = await jobadderService.getLiveJobs();

            const featuredArticle = articles[0];
            const recentArticles = articles.slice(1);

            // Format jobs through formatJobForEmail so the template receives
            // the correct field names: job_title, location, job_type, job_description, apply_url
            const jobs = rawJobs
                .slice(0, 5)
                .map(job => jobadderService.formatJobForEmail(job));

            const newState = {
                state: 'GENERATED',
                generatedAt: new Date().toISOString(),
                featuredArticle,
                recentArticles,
                jobs,
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

            await brevoService.sendBatchEmail(
                [{ email: testEmail, name: 'Test User' }],
                parseInt(process.env.BREVO_XPOSE_NEWSLETTER_TEMPLATE_ID),
                this.state
            );

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
            const { recipientType, recipientId } = req.body;
            let recipients;
            
            if (recipientId && recipientType) {
                console.log(`👥 Fetching recipients from ${recipientType} #${recipientId}...`);
                
                if (recipientType === 'segment') {
                    recipients = await brevoService.getSegmentContacts(recipientId);
                } else if (recipientType === 'list') {
                    recipients = await brevoService.getListContacts(recipientId);
                } else {
                    return res.status(400).json({ 
                        success: false, 
                        message: 'Invalid recipient type. Must be "segment" or "list"' 
                    });
                }
            } else {
                // Fallback to old method (JOB_ALERTS attribute)
                console.log('👥 Fetching recipients from Brevo (JOB_ALERTS = Yes)...');
                recipients = await brevoService.getJobAlertContacts();
            }
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

            await brevoService.sendBatchEmail(
                finalRecipients,
                parseInt(process.env.BREVO_XPOSE_NEWSLETTER_TEMPLATE_ID),
                this.state
            );

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

    sendTestSingleArticle = async (req, res) => {
        const { articleId } = req.params;
        console.log(`\n======== 🧪 SENDING TEST SINGLE ARTICLE ${articleId} ========`);

        try {
            const article = await wordpressService.getArticleById(articleId);
            if (!article) {
                return res.status(404).json({ 
                    success: false, 
                    message: 'Article not found.' 
                });
            }

            const testEmail = process.env.TEST_EMAIL;
            if (!testEmail) {
                return res.status(500).json({ 
                    success: false, 
                    message: 'TEST_EMAIL not configured.' 
                });
            }

            await brevoService.sendBatchEmail(
                [{ email: testEmail, name: 'Test User' }],
                parseInt(process.env.BREVO_XPOSE_SINGLE_ARTICLE_TEMPLATE_ID),
                { article }
            );

            console.log(`✅ Test single article ${articleId} sent to ${testEmail}.`);
            res.json({ 
                success: true, 
                message: `Test article sent to ${testEmail}.` 
            });

        } catch (error) {
            console.error(`❌ Error sending test single article ${articleId}:`, error);
            res.status(500).json({ 
                success: false, 
                message: error.message 
            });
        }
    };

    sendSingleArticle = async (req, res) => {
        const { articleId } = req.params;
        console.log(`\n======== 📄 SENDING SINGLE ARTICLE ${articleId} ========`);

        try {
            const article = await wordpressService.getArticleById(articleId);
            if (!article) {
                return res.status(404).json({ 
                    success: false, 
                    message: 'Article not found.' 
                });
            }

            const { recipientType, recipientId } = req.body;
            let recipients;
            
            if (recipientId && recipientType) {
                console.log(`👥 Fetching recipients from ${recipientType} #${recipientId}...`);
                
                if (recipientType === 'segment') {
                    recipients = await brevoService.getSegmentContacts(recipientId);
                } else if (recipientType === 'list') {
                    recipients = await brevoService.getListContacts(recipientId);
                } else {
                    return res.status(400).json({ 
                        success: false, 
                        message: 'Invalid recipient type. Must be "segment" or "list"' 
                    });
                }
            } else {
                // Fallback to old method (JOB_ALERTS attribute)
                console.log('👥 Fetching recipients from Brevo (JOB_ALERTS = Yes)...');
                recipients = await brevoService.getJobAlertContacts();
            }
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

            await brevoService.sendBatchEmail(
                finalRecipients,
                parseInt(process.env.BREVO_XPOSE_SINGLE_ARTICLE_TEMPLATE_ID),
                { article }
            );

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

    // --- Preview Endpoints ---

    previewNewsletter = async (req, res) => {
        try {
            await this.loadState();
            const emailPreviewService = require('../services/emailPreviewService');
            const html = await emailPreviewService.renderXposeNewsletter(this.state);
            res.send(html);
        } catch (error) {
            console.error('❌ Error generating newsletter preview:', error);
            res.status(500).send(`
                <div style="padding: 40px; text-align: center; font-family: Arial, sans-serif;">
                    <h2 style="color: #e74c3c;">Preview Unavailable</h2>
                    <p style="color: #666;">${error.message}</p>
                </div>
            `);
        }
    };

    previewSingleArticle = async (req, res) => {
        const { articleId } = req.params;
        try {
            const emailPreviewService = require('../services/emailPreviewService');
            const html = await emailPreviewService.renderSingleArticle(articleId);
            res.send(html);
        } catch (error) {
            console.error(`❌ Error generating article ${articleId} preview:`, error);
            res.status(500).send(`
                <div style="padding: 40px; text-align: center; font-family: Arial, sans-serif;">
                    <h2 style="color: #e74c3c;">Preview Unavailable</h2>
                    <p style="color: #666;">${error.message}</p>
                </div>
            `);
        }
    };

    /**
     * Schedule a single article send at a user-specified Melbourne datetime
     */
    async scheduleArticle(articleId, options = {}) {
        const cron = require('node-cron');
        try {
            if (!articleId) throw new Error('No article ID provided');
            let sendDate;
            if (options.scheduledAt) {
                sendDate = new Date(options.scheduledAt);
                if (isNaN(sendDate.getTime())) throw new Error('Invalid scheduledAt date');
                if (sendDate <= new Date()) throw new Error('Scheduled time must be in the future');
            } else {
                // Fallback: tomorrow 9am Melbourne
                const nowMelb = new Date(new Date().toLocaleString('en-US', { timeZone: 'Australia/Melbourne' }));
                sendDate = new Date(nowMelb);
                sendDate.setDate(nowMelb.getDate() + 1);
                sendDate.setHours(9, 0, 0, 0);
            }

            const min = sendDate.getUTCMinutes();
            const hr = sendDate.getUTCHours();
            const dom = sendDate.getUTCDate();
            const mon = sendDate.getUTCMonth() + 1;
            const cronExpr = `${min} ${hr} ${dom} ${mon} *`;

            const scheduledFor = sendDate.toLocaleString('en-AU', {
                weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
                hour: '2-digit', minute: '2-digit', hour12: true,
                timeZone: 'Australia/Melbourne'
            }) + ' (Melbourne time)';

            cron.schedule(cronExpr, async () => {
                console.log(`📅 Executing scheduled article ${articleId} send...`);
                const fakeReq = { params: { articleId }, body: { recipientType: options.recipientType, recipientId: options.recipientId } };
                const fakeRes = { json: () => {}, status: () => ({ json: () => {} }) };
                await this.sendSingleArticle(fakeReq, fakeRes);
            }, { timezone: 'UTC' });

            console.log(`📅 Article ${articleId} scheduled for ${scheduledFor} (cron: ${cronExpr} UTC)`);
            return { success: true, scheduledFor, message: 'Article scheduled successfully' };
        } catch (error) {
            console.error('❌ Error scheduling article:', error);
            return { success: false, message: error.message };
        }
    }

    /**
     * Schedule Xpose newsletter send at a user-specified Melbourne datetime
     */
    async scheduleForThursday(options = {}) {
        const cron = require('node-cron');
        try {
            let sendDate;
            if (options.scheduledAt) {
                sendDate = new Date(options.scheduledAt);
                if (isNaN(sendDate.getTime())) throw new Error('Invalid scheduledAt date');
                if (sendDate <= new Date()) throw new Error('Scheduled time must be in the future');
            } else {
                // Fallback: next Thursday 10am Melbourne
                const nowMelb = new Date(new Date().toLocaleString('en-US', { timeZone: 'Australia/Melbourne' }));
                const day = nowMelb.getDay();
                let daysUntilThursday = (4 - day + 7) % 7 || 7;
                sendDate = new Date(nowMelb);
                sendDate.setDate(nowMelb.getDate() + daysUntilThursday);
                sendDate.setHours(10, 0, 0, 0);
            }

            const min = sendDate.getUTCMinutes();
            const hr = sendDate.getUTCHours();
            const dom = sendDate.getUTCDate();
            const mon = sendDate.getUTCMonth() + 1;
            const cronExpr = `${min} ${hr} ${dom} ${mon} *`;

            const scheduledFor = sendDate.toLocaleString('en-AU', {
                weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
                hour: '2-digit', minute: '2-digit', hour12: true,
                timeZone: 'Australia/Melbourne'
            }) + ' (Melbourne time)';

            cron.schedule(cronExpr, async () => {
                console.log('📅 Executing scheduled Xpose send...');
                const fakeReq = { body: { recipientType: options.recipientType, recipientId: options.recipientId } };
                const fakeRes = { json: () => {}, status: () => ({ json: () => {} }) };
                await this.sendToAll(fakeReq, fakeRes);
            }, { timezone: 'UTC' });

            console.log(`📅 Xpose scheduled for ${scheduledFor} (cron: ${cronExpr} UTC)`);
            return { success: true, scheduledFor, message: 'Xpose scheduled successfully' };
        } catch (error) {
            console.error('❌ Error scheduling Xpose:', error);
            return { success: false, message: error.message };
        }
    }
}

module.exports = new XposeController();
