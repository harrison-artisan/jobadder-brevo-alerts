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
      
      // If no OpenAI client available, use fallback immediately
      if (!client) {
        console.log(`  ⚠️  OpenAI not configured, using fallback for candidate ${candidate.candidateId}`);
        return this.getFallbackSummary(candidate);
      }
      
      // Build anonymized context about the candidate
      const context = this.buildAnonymizedContext(candidate);
      
      const prompt = `You are writing a COMPELLING, EXCITING recruitment pitch to sell this candidate to potential employers. Make them want to hire this person immediately!

${context}

CRITICAL REQUIREMENTS:
- DO NOT include any names (first name, last name, or any proper names)
- DO NOT include any company names or employer names  
- DO NOT use gender-specific pronouns (he/she/his/her) - use they/their/them or avoid pronouns entirely
- DO NOT include overly personal details (age, location specifics, personal life)
- DO generalize overly specific job titles - remove codes, numbers, internal jargon, make them readable and professional

WRITING STYLE - MAKE IT EXCITING:
- Use their actual experience and skills to create a COMPELLING narrative
- Highlight specific achievements, strengths, and unique value
- Use power words: exceptional, outstanding, proven, award-winning, innovative, strategic, transformative
- VARY the opening - DO NOT repeat structures - be creative and dynamic
- Make employers think "I need to meet this person NOW"
- Focus on IMPACT and RESULTS they can deliver
- 2-3 punchy sentences that SELL

VARIED OPENING EXAMPLES (use different ones each time):
- "A strategic [role] who transforms [area] through..."
- "With [X] years mastering [skill], this professional delivers..."
- "Combining [skill] with [skill], this candidate excels at..."
- "This [role] brings a rare blend of [quality] and [quality]..."
- "Known for [achievement], this professional specializes in..."
- "An innovative [role] with a track record of..."
- "Exceptional at [skill], with proven success in..."

EXAMPLE OUTPUT: A strategic brand designer who transforms complex ideas into award-winning visual campaigns. With 10+ years leading creative teams at top agencies, brings exceptional expertise in digital storytelling and brand identity. Known for delivering results that exceed expectations and driving measurable business impact.`;

      console.log(`  🤖 Generating anonymized AI summary for candidate ${candidate.candidateId}...`);
      
      const response = await client.chat.completions.create({
        model: 'gpt-4o-mini',
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
      
      // Fallback to anonymized summary
      return this.getFallbackSummary(candidate);
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
      cleaned = cleaned.replace(firstNameRegex, '[redacted]');
    }
    
    if (candidate.lastName) {
      const lastNameRegex = new RegExp(candidate.lastName, 'gi');
      cleaned = cleaned.replace(lastNameRegex, '[redacted]');
    }
    
    // Remove company names from employment history
    if (candidate.employment?.current?.company) {
      const companyRegex = new RegExp(candidate.employment.current.company, 'gi');
      cleaned = cleaned.replace(companyRegex, '[company]');
    }
    
    if (candidate.employment?.history) {
      candidate.employment.history.forEach(job => {
        if (job.employer) {
          const employerRegex = new RegExp(job.employer, 'gi');
          cleaned = cleaned.replace(employerRegex, '[company]');
        }
      });
    }
    
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
    
    // Remove [redacted] or [company] placeholders if they appear
    sanitized = sanitized.replace(/\[redacted\]/gi, 'the candidate');
    sanitized = sanitized.replace(/\[company\]/gi, 'a leading organization');
    
    return sanitized;
  }

  /**
   * Get fallback anonymized summary if AI generation fails
   */
  getFallbackSummary(candidate) {
    // Generate anonymized summary from available data
    const yearsExp = this.calculateYearsOfExperience(candidate);
    const expText = yearsExp > 0 ? `over ${yearsExp} years` : 'significant';
    
    const title = this.generalizeJobTitle(
      candidate.employment?.current?.position || 
      candidate.employment?.ideal?.position || 
      'professional'
    );
    
    const skills = candidate.skillTags?.slice(0, 3).join(', ') || 'various skills';
    
    // Vary the fallback opening too
    const openings = [
      `Specializing in ${skills} with ${expText} of experience as a ${title}.`,
      `A talented ${title} bringing ${expText} of expertise in ${skills}.`,
      `With ${expText} in the field, this ${title} excels at ${skills}.`,
      `Known for excellence in ${skills}, this ${title} has ${expText} of proven success.`
    ];
    
    const randomOpening = openings[Math.floor(Math.random() * openings.length)];
    
    return `${randomOpening} Brings a strong track record of delivering results and contributing to team success.`;
  }

  /**
   * Generate summaries for multiple candidates in parallel
   */
  async generateBatchSummaries(candidates) {
    const client = this.getOpenAIClient();
    
    if (!client) {
      console.log(`\n⚠️  OpenAI API key not configured - using fallback summaries for all candidates`);
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

