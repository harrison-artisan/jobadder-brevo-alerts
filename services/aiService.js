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
      
      const prompt = `Create a compelling, anonymized professional summary for this candidate for a recruitment email.

${context}

CRITICAL REQUIREMENTS:
- DO NOT include any names (first name, last name, or any proper names)
- DO NOT include any company names or employer names
- DO NOT use gender-specific pronouns (he/she/his/her) - use "they/their/them" or avoid pronouns entirely
- DO NOT include overly personal details (age, location specifics, personal life)
- DO focus on skills, expertise, experience level, and value proposition
- DO make it compelling and highlight what makes them stand out
- DO write in third person or use neutral language
- Keep it concise (2-3 sentences maximum)
- Professional tone suitable for client-facing recruitment email
- Make it SELL the candidate without revealing their identity

Example good output: "An experienced creative professional with over 8 years in digital design and brand strategy. Brings expertise in leading cross-functional teams and delivering award-winning campaigns. Known for innovative problem-solving and a strong track record of exceeding client expectations."`;

      console.log(`  🤖 Generating anonymized AI summary for candidate ${candidate.candidateId}...`);
      
      const response = await client.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.7,
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
      parts.push(`Current Role: ${candidate.employment.current.position}`);
      // Intentionally NOT including company name
    }
    
    // Work history (anonymized - positions only, no employer names)
    if (candidate.employment?.history && candidate.employment.history.length > 0) {
      const recentPositions = candidate.employment.history
        .slice(0, 3)
        .map(job => job.position)
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
      parts.push(`Seeking: ${candidate.employment.ideal.position}`);
    }
    
    return parts.join('\n');
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
    
    const title = candidate.employment?.current?.position || 
                  candidate.employment?.ideal?.position || 
                  'professional';
    
    const skills = candidate.skillTags?.slice(0, 3).join(', ') || 'various skills';
    
    return `An experienced ${title} with ${expText} of expertise in ${skills}. Brings a strong track record of delivering results and contributing to team success.`;
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
