const OpenAI = require('openai');

class AIService {
  constructor() {
    // Don't initialize OpenAI client here - do it lazily when needed
    this.openai = null;
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
      
      // If no OpenAI client available, use intelligent fallback
      if (!client) {
        console.log(`  📝 Using intelligent summary rewriter for candidate ${candidate.candidateId}...`);
        return this.getIntelligentSummary(candidate);
      }
      
      // Build anonymized context about the candidate
      const context = this.buildAnonymizedContext(candidate);
      
      const prompt = `TASK: Rewrite the candidate's Bio below into a COMPELLING, EXCITING 2-3 sentence recruitment pitch that makes employers want to hire this person immediately!

${context}

YOUR JOB:
- Take the "Bio" section above and rewrite it to sound AMAZING and PROFESSIONAL
- Keep all the real achievements, skills, and experience from their Bio
- Make it exciting and compelling - use power words like: exceptional, outstanding, proven, innovative, strategic, transformative, award-winning
- Focus on IMPACT and RESULTS they can deliver
- VARY your opening structure - be creative and dynamic, don't use the same pattern twice

REMOVE THESE:
- Any names (first name, last name, proper names)
- Any company names or employer names
- Gender-specific pronouns (he/she/his/her) - use they/their/them or avoid pronouns
- Overly personal details (age, location specifics, personal life)
- Overly specific job titles with codes/numbers - make them readable

FORMAT:
- 2-3 punchy sentences maximum
- USE AUSTRALIAN SPELLING: specialising (not specializing), recognised (not recognized), organised (not organized), etc.
- Make it sound like the best candidate ever

EXAMPLE OUTPUT: A strategic brand designer who transforms complex ideas into award-winning visual campaigns. With 10+ years leading creative teams at top agencies, brings exceptional expertise in digital storytelling and brand identity. Recognised for delivering results that exceed expectations and driving measurable business impact.`;

      console.log(`  🤖 Generating anonymized AI summary for candidate ${candidate.candidateId}...`);
      
      const response = await client.chat.completions.create({
        model: 'gemini-2.5-flash',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.9, // High temperature for maximum variety and creativity
        max_tokens: 150
      });
      
      let summary = response.choices[0].message.content.trim();
      
      // Post-process to catch any leaked identifiers
      summary = this.sanitizeSummary(summary, candidate);
      
      console.log(`    ✓ Generated anonymized summary (${summary.length} chars)`);
      
      return summary;
      
    } catch (error) {
      console.error(`❌ Error generating AI summary for candidate ${candidate.candidateId}:`, error.message);
      
      // Fallback to intelligent summary
      return this.getIntelligentSummary(candidate);
    }
  }

  /**
   * Build anonymized context string about candidate for AI prompt
   */
  buildAnonymizedContext(candidate) {
    const parts = [];
    
    // Current position (anonymized - no company name)
    if (candidate.employment?.current?.position) {
      const generalizedTitle = this.generalizeJobTitle(candidate.employment.current.position);
      parts.push(`Current Role: ${generalizedTitle}`);
      // Intentionally NOT including company name
    }
    
    // Work history (anonymized - positions only, no employer names)
    if (candidate.employment?.history && candidate.employment.history.length > 0) {
      const recentPositions = candidate.employment.history
        .slice(0, 3)
        .map(job => this.generalizeJobTitle(job.position))
        .filter(pos => pos); // Remove empty positions
      
      if (recentPositions.length > 0) {
        parts.push(`Recent Experience: ${recentPositions.join(', ')}`);
      }
    }
    
    // Calculate years of experience
    const yearsExp = this.calculateYearsOfExperience(candidate);
    if (yearsExp > 0) {
      parts.push(`Years of Experience: ${yearsExp}`);
    }
    
    // Skills
    if (candidate.skillTags && candidate.skillTags.length > 0) {
      parts.push(`Skills: ${candidate.skillTags.slice(0, 10).join(', ')}`);
    }
    
    // Existing summary (anonymized)
    if (candidate.summary) {
      let anonymizedSummary = candidate.summary.substring(0, 300);
      // Remove names from summary
      anonymizedSummary = this.removeNamesFromText(anonymizedSummary, candidate);
      parts.push(`Bio: ${anonymizedSummary}`);
    }
    
    // Ideal position (no company names)
    if (candidate.employment?.ideal?.position) {
      const generalizedIdeal = this.generalizeJobTitle(candidate.employment.ideal.position);
      parts.push(`Seeking: ${generalizedIdeal}`);
    }
    
    return parts.join('\n');
  }

  /**
   * Generalize overly specific job titles
   * Removes codes, numbers, internal jargon
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
    
    return generalized;
  }

  /**
   * Calculate years of experience from employment history
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
    let cleaned = text;
    
    // Remove candidate's first and last name
    if (candidate.firstName) {
      const firstNameRegex = new RegExp(candidate.firstName, 'gi');
      cleaned = cleaned.replace(firstNameRegex, '');
    }
    
    if (candidate.lastName) {
      const lastNameRegex = new RegExp(candidate.lastName, 'gi');
      cleaned = cleaned.replace(lastNameRegex, '');
    }
    
    // Remove company names from employment history
    if (candidate.employment?.current?.company) {
      const companyRegex = new RegExp(candidate.employment.current.company, 'gi');
      cleaned = cleaned.replace(companyRegex, 'a leading organisation');
    }
    
    if (candidate.employment?.history) {
      candidate.employment.history.forEach(job => {
        if (job.employer) {
          const employerRegex = new RegExp(job.employer, 'gi');
          cleaned = cleaned.replace(employerRegex, 'a top organisation');
        }
      });
    }
    
    // Clean up extra spaces
    cleaned = cleaned.replace(/\s+/g, ' ').trim();
    
    return cleaned;
  }

  /**
   * Sanitize AI-generated summary to ensure no identifiers leaked
   */
  sanitizeSummary(summary, candidate) {
    let sanitized = summary;
    
    // Remove any names that might have leaked
    sanitized = this.removeNamesFromText(sanitized, candidate);
    
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
   * Get intelligent summary by rewriting the candidate's actual bio
   * This is used when no AI API is available
   */
  getIntelligentSummary(candidate) {
    // Start with their actual summary if available
    if (candidate.summary && candidate.summary.length > 50) {
      let summary = candidate.summary;
      
      // Remove names and company names
      summary = this.removeNamesFromText(summary, candidate);
      
      // Remove gender pronouns
      summary = this.sanitizeSummary(summary, candidate);
      
      // Extract the most compelling parts (first 2-3 sentences)
      const sentences = summary.split(/[.!?]+/).filter(s => s.trim().length > 20);
      
      if (sentences.length >= 2) {
        // Take first 2-3 sentences and make them compelling
        let result = sentences.slice(0, 3).join('. ').trim();
        
        // Ensure it ends with a period
        if (!result.endsWith('.')) {
          result += '.';
        }
        
        // Add power words if missing
        result = this.enhanceSummary(result, candidate);
        
        return result;
      }
    }
    
    // If no good summary, build one from available data
    return this.buildSummaryFromData(candidate);
  }

  /**
   * Enhance a summary with power words and better phrasing
   */
  enhanceSummary(summary, candidate) {
    let enhanced = summary;
    
    // Get years of experience
    const yearsExp = this.calculateYearsOfExperience(candidate);
    
    // Add experience context if not already mentioned
    if (yearsExp > 0 && !enhanced.match(/\d+\s*(year|yr)/i)) {
      const expPhrase = yearsExp >= 10 ? `over ${yearsExp} years` : `${yearsExp}+ years`;
      
      // Try to insert experience mention naturally
      if (enhanced.match(/experience|expertise|background/i)) {
        enhanced = enhanced.replace(
          /(experience|expertise|background)/i,
          `$1 spanning ${expPhrase}`
        );
      }
    }
    
    // Replace weak words with power words
    const replacements = {
      'good at': 'excels at',
      'skilled in': 'specialising in',
      'knows': 'masters',
      'worked on': 'delivered',
      'helped': 'drove',
      'made': 'created',
      'did': 'executed',
      'can do': 'delivers',
      'able to': 'capable of driving'
    };
    
    for (const [weak, strong] of Object.entries(replacements)) {
      const regex = new RegExp(weak, 'gi');
      enhanced = enhanced.replace(regex, strong);
    }
    
    // Ensure Australian spelling
    enhanced = enhanced.replace(/specializing/gi, 'specialising');
    enhanced = enhanced.replace(/recognized/gi, 'recognised');
    enhanced = enhanced.replace(/organized/gi, 'organised');
    enhanced = enhanced.replace(/organization/gi, 'organisation');
    
    return enhanced;
  }

  /**
   * Build a compelling summary from candidate data when bio is not available
   */
  buildSummaryFromData(candidate) {
    const parts = [];
    
    // Get title
    const title = this.generalizeJobTitle(
      candidate.employment?.current?.position || 
      candidate.employment?.ideal?.position || 
      'professional'
    );
    
    // Get years of experience
    const yearsExp = this.calculateYearsOfExperience(candidate);
    const expText = yearsExp >= 10 ? `over ${yearsExp} years` : 
                    yearsExp > 0 ? `${yearsExp}+ years` : 'extensive';
    
    // Get top skills
    const skills = candidate.skillTags?.slice(0, 5) || [];
    
    // Build opening based on available data
    if (skills.length >= 3) {
      const skillList = skills.slice(0, 3).join(', ');
      parts.push(`A ${title} specialising in ${skillList} with ${expText} of proven experience.`);
    } else if (skills.length > 0) {
      parts.push(`An experienced ${title} with ${expText} in the field, bringing expertise in ${skills.join(' and ')}.`);
    } else {
      parts.push(`A seasoned ${title} with ${expText} of professional experience.`);
    }
    
    // Add work history context if available
    if (candidate.employment?.history && candidate.employment.history.length > 0) {
      const positions = candidate.employment.history
        .slice(0, 2)
        .map(job => this.generalizeJobTitle(job.position))
        .filter(pos => pos && pos !== title);
      
      if (positions.length > 0) {
        parts.push(`Background includes roles as ${positions.join(' and ')}.`);
      }
    }
    
    // Add closing statement
    parts.push('Brings a strong track record of delivering exceptional results and driving meaningful impact.');
    
    return parts.join(' ');
  }

  /**
   * Generate summaries for multiple candidates in parallel
   */
  async generateBatchSummaries(candidates) {
    const client = this.getOpenAIClient();
    
    if (!client) {
      console.log(`\n📝 Using intelligent summary rewriter for ${candidates.length} candidates...`);
    } else {
      console.log(`\n🤖 Generating anonymized AI summaries for ${candidates.length} candidates...`);
    }
    
    const summaries = await Promise.all(
      candidates.map(candidate => this.generateCandidateSummary(candidate))
    );
    
    console.log('✅ All anonymized summaries generated\n');
    
    return summaries;
  }
}

module.exports = new AIService();
