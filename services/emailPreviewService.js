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
        // Always read fresh from disk — no caching, so template updates deploy immediately
        const templatePath = path.join(__dirname, '..', 'templates', `${templateName}.html`);
        try {
            const html = await fs.readFile(templatePath, 'utf8');
            return html;
        } catch (error) {
            console.error(`Failed to load template ${templateName}:`, error);
            throw new Error(`Template ${templateName} not found`);
        }
    }

    /**
     * Safely get nested property from object using dot notation
     * Example: get({a: {b: {c: 5}}}, 'a.b.c') returns 5
     */
    getNestedProperty(obj, path, defaultValue = '') {
        if (!path || !obj) return defaultValue;
        
        const keys = path.split('.');
        let result = obj;
        
        for (const key of keys) {
            if (result === null || result === undefined || typeof result !== 'object') {
                return defaultValue;
            }
            result = result[key];
        }
        
        return result !== undefined && result !== null ? result : defaultValue;
    }

    /**
     * Generic template variable replacement using recursive logic
     * Handles both {{ variable.path }} and {% for item in array %} syntax
     */
    replaceTemplateVariables(html, data) {
        let result = html;

        // Step 1: Handle {% for %} loops first (they need to be processed before simple variables)
        result = result.replace(/\{%\s*for\s+(\w+)\s+in\s+([\w.]+)\s*%\}([\s\S]*?)\{%\s*endfor\s*%\}/g, 
            (match, itemName, arrayPath, loopContent) => {
                // Get the array from data using the path
                const array = this.getNestedProperty(data, arrayPath, []);
                
                if (!Array.isArray(array) || array.length === 0) {
                    return ''; // Empty loop if no data
                }
                
                // Render the loop content for each item
                return array.map((item, index) => {
                    // Create a new data context with the loop item
                    const loopData = {
                        ...data,
                        [itemName]: item,
                        loop: {
                            index: index,
                            index0: index,
                            index1: index + 1,
                            first: index === 0,
                            last: index === array.length - 1,
                            length: array.length
                        }
                    };
                    
                    // Recursively process the loop content
                    return this.replaceTemplateVariables(loopContent, loopData);
                }).join('');
            }
        );

        // Step 2: Handle {% if %} conditionals — process iteratively to handle nested blocks
        // Use a loop to handle nested if/endif pairs correctly
        let ifIterations = 0;
        while (result.includes('{%') && ifIterations < 20) {
            const before = result;
            result = result.replace(/\{%\s*if\s+([^%]+?)\s*%\}((?:(?!\{%\s*if\b)[\s\S])*?)(?:\{%\s*else\s*%\}((?:(?!\{%\s*if\b)[\s\S])*?))?\{%\s*endif\s*%\}/,
                (match, condition, trueBlock, falseBlock) => {
                    const evalCondition = (cond) => {
                        const trimmed = cond.trim();
                        // Handle: loop.index % 2 == 0
                        if (/loop\.index\s*%\s*2\s*==\s*0/.test(trimmed)) return data.loop && data.loop.index % 2 === 0;
                        // Handle: loop.index % 2 == 1
                        if (/loop\.index\s*%\s*2\s*==\s*1/.test(trimmed)) return data.loop && data.loop.index % 2 === 1;
                        // Handle: not loop.last
                        if (/not\s+loop\.last/.test(trimmed)) return data.loop && !data.loop.last;
                        // Handle: loop.first
                        if (/loop\.first/.test(trimmed)) return data.loop && data.loop.first;
                        // Handle: loop.last
                        if (/loop\.last/.test(trimmed)) return data.loop && data.loop.last;
                        // Handle: "path and path.length > N"
                        const andLengthMatch = trimmed.match(/^([\w.]+)\s+and\s+[\w.]+\.length\s*>\s*(\d+)$/);
                        if (andLengthMatch) {
                            const arr = this.getNestedProperty(data, andLengthMatch[1], null);
                            return Array.isArray(arr) && arr.length > parseInt(andLengthMatch[2], 10);
                        }
                        // Handle: "path.length > N"
                        const lengthMatch = trimmed.match(/^([\w.]+)\.length\s*>\s*(\d+)$/);
                        if (lengthMatch) {
                            const arr = this.getNestedProperty(data, lengthMatch[1], null);
                            return Array.isArray(arr) && arr.length > parseInt(lengthMatch[2], 10);
                        }
                        // Handle: string equality e.g. item.type == 'youtube' or item.type == "youtube"
                        const strEqMatch = trimmed.match(/^([\w.]+)\s*==\s*['"]([^'"]+)['"]$/);
                        if (strEqMatch) {
                            const val = this.getNestedProperty(data, strEqMatch[1], null);
                            return val === strEqMatch[2];
                        }
                        // Handle: string inequality e.g. item.type != 'youtube'
                        const strNeqMatch = trimmed.match(/^([\w.]+)\s*!=\s*['"]([^'"]+)['"]$/);
                        if (strNeqMatch) {
                            const val = this.getNestedProperty(data, strNeqMatch[1], null);
                            return val !== strNeqMatch[2];
                        }
                        // Handle: general truthy property path (e.g. params.job.has_job)
                        if (/^[\w.]+$/.test(trimmed)) {
                            const val = this.getNestedProperty(data, trimmed, false);
                            return !!(val);
                        }
                        return false;
                    };
                    const conditionMet = evalCondition(condition);
                    return conditionMet ? (trueBlock || '') : (falseBlock || '');
                }
            );
            if (result === before) break;
            ifIterations++;
        }

        // Step 3: Replace all {{ variable.path }} with actual values
        result = result.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (match, varPath) => {
            const value = this.getNestedProperty(data, varPath, '');
            
            // Handle special cases for URLs - don't replace if it's a placeholder
            if (varPath === 'unsubscribe' && value === '') {
                return 'https://artisan.com.au/unsubscribe';
            }
            
            return value;
        });

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
            },
            unsubscribe: 'https://artisan.com.au/unsubscribe'
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
            },
            unsubscribe: 'https://artisan.com.au/unsubscribe'
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
                // formatJobForEmail returns: job_title, location, job_type, job_description, apply_url, reference
                job_title: job.job_title || job.title || '',
                location: job.location || '',
                job_type: job.job_type || job.workType || job.type || '',
                job_description: job.job_description || job.summary || job.description || '',
                apply_url: job.apply_url || job.link || job.url || '#'
            },
            unsubscribe: 'https://artisan.com.au/unsubscribe'
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
                candidates: state.candidates.map((candidate, index) => ({
                    number: index + 1,
                    name: candidate.name || candidate.firstName + ' ' + candidate.lastName,
                    title: candidate.title || candidate.currentJobTitle,
                    location: candidate.location,
                    summary: candidate.summary || candidate.bio || '',
                    skills: candidate.skills ? candidate.skills.join(', ') : '',
                    image_url: candidate.photo || 'https://via.placeholder.com/100',
                    profile_url: candidate.profileUrl || '#'
                }))
            },
            unsubscribe: 'https://artisan.com.au/unsubscribe'
        };

        return this.replaceTemplateVariables(template, data);
    }
}

module.exports = new EmailPreviewService();
