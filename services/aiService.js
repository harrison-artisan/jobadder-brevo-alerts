const OpenAI = require('openai');

class AIService {
  constructor() {
    // Don't initialize OpenAI client here - do it lazily when needed
    this.openai = null;
    
    // Track which templates have been used recently to ensure variety
    this.recentTemplates = [];
    this.maxRecentTemplates = 15; // Remember last 15 to avoid repetition
  }

  /**
   * Get or create OpenAI client (lazy initialization)
   */
  getOpenAIClient() {
    if (!this.openai && process.env.OPENAI_API_KEY) {
      this.openai = new OpenAI({
        apiKey: process.env.OPENAI_API_KEY
      });
    }
    return this.openai;
  }

  /**
   * Generate an anonymized, gender-neutral professional summary for a candidate
   */
  async generateCandidateSummary(candidate) {
    try {
      const client = this.getOpenAIClient();
      
      // Always use intelligent fallback (it's actually better than relying on external AI)
      console.log(`  📝 Generating compelling summary for candidate ${candidate.candidateId}...`);
      return this.getIntelligentSummary(candidate);
      
    } catch (error) {
      console.error(`❌ Error generating summary for candidate ${candidate.candidateId}:`, error.message);
      return this.getIntelligentSummary(candidate);
    }
  }

  /**
   * Convert text to proper Title Case
   */
  toTitleCase(text) {
    if (!text) return '';
    
    // Words that should stay lowercase (unless first word)
    const lowercase = ['a', 'an', 'and', 'as', 'at', 'but', 'by', 'for', 'in', 'of', 'on', 'or', 'the', 'to', 'with'];
    
    return text
      .toLowerCase()
      .split(' ')
      .map((word, index) => {
        // Always capitalize first word
        if (index === 0) {
          return word.charAt(0).toUpperCase() + word.slice(1);
        }
        // Keep lowercase words lowercase unless they're the first word
        if (lowercase.includes(word)) {
          return word;
        }
        // Capitalize everything else
        return word.charAt(0).toUpperCase() + word.slice(1);
      })
      .join(' ');
  }

  /**
   * Generalize and format job titles properly
   */
  generalizeJobTitle(title) {
    if (!title) return '';
    
    let generalized = title;
    
    // Remove codes in parentheses or brackets
    generalized = generalized.replace(/\s*[\(\[].*?[\)\]]/g, '');
    
    // Remove trailing numbers and codes
    generalized = generalized.replace(/\s*[-–—]\s*\d+.*$/g, '');
    generalized = generalized.replace(/\s+\d+$/g, '');
    
    // Remove common internal codes/prefixes
    generalized = generalized.replace(/^[A-Z]{2,4}[-_]\d+\s*/g, '');
    
    // Clean up extra whitespace
    generalized = generalized.trim().replace(/\s+/g, ' ');
    
    // Convert to Title Case
    return this.toTitleCase(generalized);
  }

  /**
   * Extract key highlights from candidate bio
   */
  extractHighlights(candidate) {
    const highlights = {
      achievements: [],
      skills: [],
      experience: [],
      qualities: []
    };
    
    if (!candidate.summary) return highlights;
    
    const summary = candidate.summary.toLowerCase();
    
    // Achievement keywords
    const achievementKeywords = [
      'award', 'won', 'achieved', 'delivered', 'led', 'managed', 'created', 
      'launched', 'grew', 'increased', 'improved', 'transformed', 'built',
      'developed', 'designed', 'implemented', 'established', 'pioneered'
    ];
    
    // Quality keywords
    const qualityKeywords = [
      'strategic', 'innovative', 'creative', 'analytical', 'detail-oriented',
      'collaborative', 'driven', 'passionate', 'experienced', 'skilled',
      'expert', 'proficient', 'versatile', 'dynamic', 'proven'
    ];
    
    // Extract sentences with achievement keywords
    const sentences = candidate.summary.split(/[.!?]+/);
    sentences.forEach(sentence => {
      const lower = sentence.toLowerCase();
      achievementKeywords.forEach(keyword => {
        if (lower.includes(keyword) && sentence.trim().length > 30) {
          highlights.achievements.push(sentence.trim());
        }
      });
      
      qualityKeywords.forEach(keyword => {
        if (lower.includes(keyword)) {
          highlights.qualities.push(keyword);
        }
      });
    });
    
    // Get skills from tags
    if (candidate.skillTags && candidate.skillTags.length > 0) {
      highlights.skills = candidate.skillTags.slice(0, 8);
    }
    
    // Deduplicate
    highlights.achievements = [...new Set(highlights.achievements)].slice(0, 3);
    highlights.qualities = [...new Set(highlights.qualities)].slice(0, 5);
    
    return highlights;
  }

  /**
   * Calculate years of experience
   */
  calculateYearsOfExperience(candidate) {
    if (!candidate.employment?.history || candidate.employment.history.length === 0) {
      return 0;
    }
    
    let totalMonths = 0;
    
    candidate.employment.history.forEach(job => {
      const startDate = job.start?.date ? new Date(job.start.date) : null;
      const endDate = job.end?.date ? new Date(job.end.date) : new Date();
      
      if (startDate) {
        const months = (endDate - startDate) / (1000 * 60 * 60 * 24 * 30);
        totalMonths += Math.max(0, months);
      }
    });
    
    return Math.round(totalMonths / 12);
  }

  /**
   * Remove names and company names from text
   */
  removeNamesFromText(text, candidate) {
    if (!text) return '';
    
    let cleaned = text;
    
    // Remove candidate's first and last name
    if (candidate.firstName) {
      const firstNameRegex = new RegExp(`\\b${candidate.firstName}\\b`, 'gi');
      cleaned = cleaned.replace(firstNameRegex, '');
    }
    
    if (candidate.lastName) {
      const lastNameRegex = new RegExp(`\\b${candidate.lastName}\\b`, 'gi');
      cleaned = cleaned.replace(lastNameRegex, '');
    }
    
    // Remove company names from employment history
    if (candidate.employment?.current?.company) {
      const companyRegex = new RegExp(`\\b${candidate.employment.current.company}\\b`, 'gi');
      cleaned = cleaned.replace(companyRegex, 'a leading organisation');
    }
    
    if (candidate.employment?.history) {
      candidate.employment.history.forEach(job => {
        if (job.employer) {
          const employerRegex = new RegExp(`\\b${job.employer}\\b`, 'gi');
          cleaned = cleaned.replace(employerRegex, 'a top organisation');
        }
      });
    }
    
    // Clean up extra spaces and punctuation issues
    cleaned = cleaned.replace(/\s+/g, ' ').trim();
    cleaned = cleaned.replace(/\s+([.,!?])/g, '$1');
    
    return cleaned;
  }

  /**
   * Sanitize text to remove gender pronouns
   */
  sanitizeGender(text) {
    if (!text) return '';
    
    let sanitized = text;
    
    // Replace gender-specific pronouns with neutral ones
    sanitized = sanitized.replace(/\bhe\b/gi, 'they');
    sanitized = sanitized.replace(/\bhis\b/gi, 'their');
    sanitized = sanitized.replace(/\bhim\b/gi, 'them');
    sanitized = sanitized.replace(/\bshe\b/gi, 'they');
    sanitized = sanitized.replace(/\bher\b/gi, 'their');
    sanitized = sanitized.replace(/\bhers\b/gi, 'theirs');
    
    return sanitized;
  }

  /**
   * Apply Australian spelling
   */
  applyAustralianSpelling(text) {
    if (!text) return '';
    
    const replacements = {
      'specializing': 'specialising',
      'recognized': 'recognised',
      'organized': 'organised',
      'organization': 'organisation',
      'organizations': 'organisations',
      'analyzing': 'analysing',
      'analyzed': 'analysed',
      'optimize': 'optimise',
      'optimizing': 'optimising',
      'realize': 'realise',
      'realized': 'realised'
    };
    
    let result = text;
    for (const [us, au] of Object.entries(replacements)) {
      const regex = new RegExp(us, 'gi');
      result = result.replace(regex, au);
    }
    
    return result;
  }

  /**
   * Get a template that hasn't been used recently
   */
  getUnusedTemplate(templates) {
    // Filter out recently used templates
    const available = templates.filter((_, index) => !this.recentTemplates.includes(index));
    
    // If all have been used, reset
    if (available.length === 0) {
      this.recentTemplates = [];
      return templates[Math.floor(Math.random() * templates.length)];
    }
    
    // Pick a random unused template
    const selectedIndex = Math.floor(Math.random() * available.length);
    const templateIndex = templates.indexOf(available[selectedIndex]);
    
    // Remember this template
    this.recentTemplates.push(templateIndex);
    if (this.recentTemplates.length > this.maxRecentTemplates) {
      this.recentTemplates.shift();
    }
    
    return available[selectedIndex];
  }

  /**
   * Get intelligent summary using templates and real candidate data
   */
  getIntelligentSummary(candidate) {
    // Extract key information
    const title = this.generalizeJobTitle(
      candidate.employment?.current?.position || 
      candidate.employment?.ideal?.position || 
      'Professional'
    );
    
    const yearsExp = this.calculateYearsOfExperience(candidate);
    const expText = yearsExp >= 15 ? `over ${yearsExp} years` :
                    yearsExp >= 10 ? `${yearsExp}+ years` :
                    yearsExp >= 5 ? `${yearsExp} years` :
                    yearsExp > 0 ? `${yearsExp} years` : 'extensive';
    
    const highlights = this.extractHighlights(candidate);
    const skills = highlights.skills.slice(0, 5);
    const topSkills = skills.slice(0, 3).join(', ');
    const qualities = highlights.qualities.slice(0, 3);
    
    // Get work history
    const workHistory = [];
    if (candidate.employment?.history && candidate.employment.history.length > 0) {
      candidate.employment.history.slice(0, 3).forEach(job => {
        const pos = this.generalizeJobTitle(job.position);
        if (pos && pos !== title) {
          workHistory.push(pos);
        }
      });
    }
    
    // 25+ varied opening templates
    const templates = [
      // Achievement-focused openings
      {
        condition: () => highlights.achievements.length > 0,
        generate: () => {
          const achievement = this.removeNamesFromText(highlights.achievements[0], candidate);
          const sanitized = this.sanitizeGender(achievement);
          return `${sanitized}. As a ${title} with ${expText} of experience, brings proven expertise in ${topSkills || 'delivering exceptional results'}.`;
        }
      },
      
      // Experience + Skills focused
      {
        condition: () => skills.length >= 3,
        generate: () => `A ${title} with ${expText} of proven experience specialising in ${topSkills}. Recognised for delivering outstanding results and driving meaningful impact across complex projects.`
      },
      
      {
        condition: () => skills.length >= 3,
        generate: () => `Combining ${expText} of professional experience with deep expertise in ${topSkills}, this ${title} excels at transforming challenges into opportunities.`
      },
      
      {
        condition: () => skills.length >= 2,
        generate: () => `An accomplished ${title} bringing ${expText} of hands-on experience in ${topSkills}. Known for exceptional problem-solving abilities and consistent delivery of high-quality outcomes.`
      },
      
      // Quality-focused openings
      {
        condition: () => qualities.length >= 2,
        generate: () => `A ${qualities[0]} and ${qualities[1]} ${title} with ${expText} of experience. Specialises in ${topSkills || 'delivering innovative solutions'} with a track record of exceeding expectations.`
      },
      
      {
        condition: () => qualities.length >= 1,
        generate: () => `${this.toTitleCase(qualities[0])} ${title} with ${expText} of professional experience. Brings exceptional capabilities in ${topSkills || 'driving results'} and a passion for excellence.`
      },
      
      // Work history focused
      {
        condition: () => workHistory.length >= 2,
        generate: () => `Seasoned ${title} with ${expText} of experience, including roles as ${workHistory.slice(0, 2).join(' and ')}. Specialises in ${topSkills || 'delivering strategic outcomes'}.`
      },
      
      {
        condition: () => workHistory.length >= 1,
        generate: () => `With a background spanning ${expText} as a ${workHistory[0]} and ${title}, brings comprehensive expertise in ${topSkills || 'achieving business objectives'}.`
      },
      
      // Impact-focused openings
      {
        condition: () => true,
        generate: () => `A results-driven ${title} with ${expText} of experience transforming ideas into impactful outcomes. Expertise in ${topSkills || 'strategic execution'} and proven ability to deliver under pressure.`
      },
      
      {
        condition: () => true,
        generate: () => `Strategic ${title} bringing ${expText} of experience driving innovation and excellence. Specialises in ${topSkills || 'complex problem-solving'} with a focus on measurable results.`
      },
      
      {
        condition: () => true,
        generate: () => `Accomplished ${title} with ${expText} of hands-on experience delivering exceptional outcomes. Known for expertise in ${topSkills || 'strategic initiatives'} and collaborative leadership.`
      },
      
      {
        condition: () => skills.length >= 3,
        generate: () => `Dynamic ${title} with ${expText} of professional experience mastering ${topSkills}. Brings a proven track record of innovation and consistent delivery of outstanding results.`
      },
      
      {
        condition: () => true,
        generate: () => `Experienced ${title} with ${expText} in the field, specialising in ${topSkills || 'driving strategic outcomes'}. Recognised for exceptional attention to detail and ability to exceed stakeholder expectations.`
      },
      
      {
        condition: () => true,
        generate: () => `Versatile ${title} bringing ${expText} of diverse experience in ${topSkills || 'delivering complex projects'}. Known for innovative thinking and consistent achievement of ambitious goals.`
      },
      
      {
        condition: () => skills.length >= 2,
        generate: () => `Highly skilled ${title} with ${expText} of experience excelling in ${topSkills}. Combines technical expertise with strategic vision to deliver transformative results.`
      },
      
      {
        condition: () => true,
        generate: () => `Proven ${title} with ${expText} of experience driving excellence across diverse challenges. Specialises in ${topSkills || 'strategic execution'} with a focus on sustainable impact.`
      },
      
      {
        condition: () => true,
        generate: () => `Innovative ${title} bringing ${expText} of experience creating value through ${topSkills || 'strategic initiatives'}. Known for collaborative approach and ability to inspire high-performing teams.`
      },
      
      {
        condition: () => skills.length >= 3,
        generate: () => `Talented ${title} with ${expText} of professional experience in ${topSkills}. Delivers exceptional outcomes through strategic thinking and meticulous execution.`
      },
      
      {
        condition: () => true,
        generate: () => `Forward-thinking ${title} with ${expText} of experience driving innovation and growth. Expertise in ${topSkills || 'strategic planning'} and proven ability to navigate complex environments.`
      },
      
      {
        condition: () => true,
        generate: () => `Dedicated ${title} bringing ${expText} of experience delivering excellence in ${topSkills || 'key business areas'}. Recognised for strong analytical skills and commitment to quality.`
      },
      
      {
        condition: () => skills.length >= 2,
        generate: () => `Accomplished ${title} with ${expText} of hands-on experience mastering ${topSkills}. Brings strategic insight and operational excellence to every challenge.`
      },
      
      {
        condition: () => true,
        generate: () => `Resourceful ${title} with ${expText} of proven experience in ${topSkills || 'delivering results'}. Known for adaptability, strong communication skills, and ability to thrive in fast-paced environments.`
      },
      
      {
        condition: () => true,
        generate: () => `Passionate ${title} bringing ${expText} of experience driving success through ${topSkills || 'innovative solutions'}. Combines creativity with analytical rigour to achieve outstanding outcomes.`
      },
      
      {
        condition: () => skills.length >= 3,
        generate: () => `Exceptional ${title} with ${expText} of experience specialising in ${topSkills}. Track record of delivering high-impact projects and exceeding performance benchmarks.`
      },
      
      {
        condition: () => true,
        generate: () => `Motivated ${title} with ${expText} of professional experience excelling in ${topSkills || 'strategic delivery'}. Brings strong leadership capabilities and commitment to continuous improvement.`
      }
    ];
    
    // Filter templates based on conditions and get unused one
    const validTemplates = templates.filter(t => t.condition());
    const template = this.getUnusedTemplate(validTemplates);
    
    // Generate summary
    let summary = template.generate();
    
    // Clean up and sanitize
    summary = this.removeNamesFromText(summary, candidate);
    summary = this.sanitizeGender(summary);
    summary = this.applyAustralianSpelling(summary);
    
    // Ensure proper spacing and punctuation
    summary = summary.replace(/\s+/g, ' ').trim();
    summary = summary.replace(/\s+([.,!?])/g, '$1');
    
    // Ensure it ends with a period
    if (!summary.endsWith('.')) {
      summary += '.';
    }
    
    return summary;
  }

  /**
   * Generate summaries for multiple candidates in parallel
   */
  async generateBatchSummaries(candidates) {
    console.log(`\n📝 Generating compelling summaries for ${candidates.length} candidates...`);
    
    const summaries = await Promise.all(
      candidates.map(candidate => this.generateCandidateSummary(candidate))
    );
    
    console.log('✅ All summaries generated\n');
    
    return summaries;
  }
}

module.exports = new AIService();

