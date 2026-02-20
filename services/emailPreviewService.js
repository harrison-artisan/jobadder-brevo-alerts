const fs = require('fs').promises;
const path = require('path');
const jobadderService = require('./jobadderService');
const wordpressService = require('./wordpressService');

class EmailPreviewService {
    constructor() {
        this.templates = {};
    }

    /**
     * Load a Brevo template from file
     */
    async loadTemplate(templateName) {
        if (this.templates[templateName]) {
            return this.templates[templateName];
        }

        const templatePath = path.join(__dirname, '..', 'templates', `${templateName}.html`);
        try {
            const html = await fs.readFile(templatePath, 'utf8');
            this.templates[templateName] = html;
            return html;
        } catch (error) {
            console.error(`Failed to load template ${templateName}:`, error);
            throw new Error(`Template ${templateName} not found`);
        }
    }

    /**
     * Replace Brevo template variables with actual data
     * Handles both {{ contact.X }} and {{ params.X }} syntax
     */
    replaceTemplateVariables(html, data) {
        let result = html;

        // Replace contact variables
        result = result.replace(/\{\{\s*contact\.FIRSTNAME\s*\}\}/g, data.contact?.FIRSTNAME || 'there');
        result = result.replace(/\{\{\s*contact\.LASTNAME\s*\}\}/g, data.contact?.LASTNAME || '');
        result = result.replace(/\{\{\s*contact\.EMAIL\s*\}\}/g, data.contact?.EMAIL || '');

        // Replace simple params variables
        if (data.params) {
            // Featured article
            if (data.params.featuredArticle) {
                const fa = data.params.featuredArticle;
                result = result.replace(/\{\{\s*params\.featuredArticle\.title\s*\}\}/g, fa.title || '');
                result = result.replace(/\{\{\s*params\.featuredArticle\.excerpt\s*\}\}/g, fa.excerpt || '');
                result = result.replace(/\{\{\s*params\.featuredArticle\.link\s*\}\}/g, fa.link || '#');
                result = result.replace(/\{\{\s*params\.featuredArticle\.featuredImage\s*\}\}/g, fa.featuredImage || fa.image || 'https://via.placeholder.com/650x300');
            }

            // Handle loops for recent articles
            if (data.params.recentArticles && Array.isArray(data.params.recentArticles)) {
                const articleLoopRegex = /\{%\s*for\s+article\s+in\s+params\.recentArticles\s*%\}([\s\S]*?)\{%\s*endfor\s*%\}/g;
                result = result.replace(articleLoopRegex, (match, template) => {
                    return data.params.recentArticles.map(article => {
                        let articleHtml = template;
                        articleHtml = articleHtml.replace(/\{\{\s*article\.title\s*\}\}/g, article.title || '');
                        articleHtml = articleHtml.replace(/\{\{\s*article\.excerpt\s*\}\}/g, article.excerpt || '');
                        articleHtml = articleHtml.replace(/\{\{\s*article\.link\s*\}\}/g, article.link || '#');
                        articleHtml = articleHtml.replace(/\{\{\s*article\.featuredImage\s*\}\}/g, article.featuredImage || article.image || 'https://via.placeholder.com/150');
                        return articleHtml;
                    }).join('');
                });
            }

            // Handle loops for jobs
            if (data.params.jobs && Array.isArray(data.params.jobs)) {
                const jobLoopRegex = /\{%\s*for\s+job\s+in\s+params\.jobs\s*%\}([\s\S]*?)\{%\s*endfor\s*%\}/g;
                result = result.replace(jobLoopRegex, (match, template) => {
                    return data.params.jobs.map((job, index) => {
                        let jobHtml = template;
                        jobHtml = jobHtml.replace(/\{\{\s*job\.title\s*\}\}/g, job.title || '');
                        jobHtml = jobHtml.replace(/\{\{\s*job\.location\s*\}\}/g, job.location || '');
                        jobHtml = jobHtml.replace(/\{\{\s*job\.type\s*\}\}/g, job.type || job.workType || '');
                        jobHtml = jobHtml.replace(/\{\{\s*job\.summary\s*\}\}/g, job.summary || job.description || '');
                        jobHtml = jobHtml.replace(/\{\{\s*job\.url\s*\}\}/g, job.url || job.link || '#');
                        
                        // Handle loop.index for conditional formatting
                        jobHtml = jobHtml.replace(/\{%\s*if\s+loop\.index\s*%\s*2\s*==\s*1\s*%\}(.*?)\{%\s*else\s*%\}(.*?)\{%\s*endif\s*%\}/g, 
                            (m, odd, even) => (index % 2 === 0) ? odd : even);
                        
                        return jobHtml;
                    }).join('');
                });
            }

            // Handle loops for candidates (A-List)
            if (data.params.candidates && Array.isArray(data.params.candidates)) {
                const candidateLoopRegex = /\{%\s*for\s+candidate\s+in\s+params\.candidates\s*%\}([\s\S]*?)\{%\s*endfor\s*%\}/g;
                result = result.replace(candidateLoopRegex, (match, template) => {
                    return data.params.candidates.map(candidate => {
                        let candidateHtml = template;
                        candidateHtml = candidateHtml.replace(/\{\{\s*candidate\.name\s*\}\}/g, candidate.name || '');
                        candidateHtml = candidateHtml.replace(/\{\{\s*candidate\.title\s*\}\}/g, candidate.title || '');
                        candidateHtml = candidateHtml.replace(/\{\{\s*candidate\.location\s*\}\}/g, candidate.location || '');
                        candidateHtml = candidateHtml.replace(/\{\{\s*candidate\.summary\s*\}\}/g, candidate.summary || '');
                        candidateHtml = candidateHtml.replace(/\{\{\s*candidate\.skills\s*\}\}/g, candidate.skills || '');
                        return candidateHtml;
                    }).join('');
                });
            }
        }

        // Clean up any remaining template syntax
        result = result.replace(/\{%\s*if\s+loop\.index\s*%\s*2\s*==\s*0\s+and\s+not\s+loop\.last\s*%\}[\s\S]*?\{%\s*endif\s*%\}/g, '');
        
        return result;
    }

    /**
     * Render HTML preview for Xpose newsletter
     */
    async renderXposeNewsletter(state) {
        if (!state || !state.featuredArticle) {
            throw new Error('No newsletter data available. Please generate first.');
        }

        const template = await this.loadTemplate('brevo_template_161_xpose_newsletter');
        
        const data = {
            contact: {
                FIRSTNAME: 'Preview',
                LASTNAME: 'User',
                EMAIL: 'preview@artisan.com.au'
            },
            params: {
                featuredArticle: {
                    title: state.featuredArticle.title,
                    excerpt: state.featuredArticle.excerpt,
                    link: state.featuredArticle.link,
                    featuredImage: state.featuredArticle.image || state.featuredArticle.featuredImage
                },
                recentArticles: (state.recentArticles || []).map(article => ({
                    title: article.title,
                    excerpt: article.excerpt,
                    link: article.link,
                    featuredImage: article.image || article.featuredImage
                })),
                jobs: (state.jobs || []).slice(0, 5).map(job => ({
                    title: job.title,
                    location: job.location,
                    type: job.workType || job.type,
                    summary: job.summary || job.description || '',
                    url: job.link || job.url || '#'
                }))
            }
        };

        return this.replaceTemplateVariables(template, data);
    }

    /**
     * Render HTML preview for single article
     */
    async renderSingleArticle(articleId) {
        const article = await wordpressService.getArticleById(articleId);
        if (!article) {
            throw new Error('Article not found');
        }

        const template = await this.loadTemplate('brevo_template_162_single_article');
        
        const data = {
            contact: {
                FIRSTNAME: 'Preview',
                LASTNAME: 'User',
                EMAIL: 'preview@artisan.com.au'
            },
            params: {
                article: {
                    title: article.title,
                    excerpt: article.excerpt,
                    link: article.link,
                    featuredImage: article.image || article.featuredImage
                }
            }
        };

        return this.replaceTemplateVariables(template, data);
    }

    /**
     * Render HTML preview for single job alert
     */
    async renderSingleJob(job) {
        if (!job) {
            throw new Error('Job not found');
        }

        const template = await this.loadTemplate('brevo_template_job_alert');
        
        const data = {
            contact: {
                FIRSTNAME: 'Preview',
                LASTNAME: 'User',
                EMAIL: 'preview@artisan.com.au'
            },
            params: {
                job: {
                    title: job.title,
                    company: job.company || 'Artisan',
                    location: job.location,
                    type: job.workType || job.type,
                    summary: job.summary || job.description || '',
                    url: job.link || job.url || '#'
                }
            }
        };

        return this.replaceTemplateVariables(template, data);
    }
    
    /**
     * Render HTML preview for A-List
     */
    async renderAlist(state) {
        if (!state || !state.candidates || state.candidates.length === 0) {
            throw new Error('No A-List data available. Please generate first.');
        }

        const template = await this.loadTemplate('brevo_template_alist');
        
        const data = {
            contact: {
                FIRSTNAME: 'Preview',
                LASTNAME: 'User',
                EMAIL: 'preview@artisan.com.au'
            },
            params: {
                candidates: state.candidates.map(candidate => ({
                    name: candidate.name || candidate.firstName + ' ' + candidate.lastName,
                    title: candidate.title || candidate.currentJobTitle,
                    location: candidate.location,
                    summary: candidate.summary || candidate.bio || '',
                    skills: candidate.skills ? candidate.skills.join(', ') : ''
                }))
            }
        };

        return this.replaceTemplateVariables(template, data);
    }
}

module.exports = new EmailPreviewService();

