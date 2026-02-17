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
   * Generate a professional summary for a candidate
   */
  async generateCandidateSummary(candidate) {
    try {
      const client = this.getOpenAIClient();
      
      // If no OpenAI client available, use fallback immediately
      if (!client) {
        console.log(`  ⚠️  OpenAI not configured, using fallback for ${candidate.firstName} ${candidate.lastName}`);
        return this.getFallbackSummary(candidate);
      }
      
      // Build context about the candidate
      const context = this.buildCandidateContext(candidate);
      
      const prompt = `Create a compelling 2-3 sentence professional summary for this candidate for a recruitment email:

${context}

Requirements:
- Write in third person
- Focus on expertise, value proposition, and key strengths
- Make it engaging and highlight what makes them stand out
- Keep it concise (2-3 sentences maximum)
- Professional tone suitable for client-facing recruitment email`;

      console.log(`  🤖 Generating AI summary for ${candidate.firstName} ${candidate.lastName}...`);
      
      const response = await client.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.7,
        max_tokens: 150
      });
      
      const summary = response.choices[0].message.content.trim();
      console.log(`    ✓ Generated summary (${summary.length} chars)`);
      
      return summary;
      
    } catch (error) {
      console.error(`❌ Error generating AI summary for candidate ${candidate.candidateId}:`, error.message);
      
      // Fallback to candidate's existing summary or generic text
      return this.getFallbackSummary(candidate);
    }
  }

  /**
   * Build context string about candidate for AI prompt
   */
  buildCandidateContext(candidate) {
    const parts = [];
    
    // Name
    parts.push(`Name: ${candidate.firstName} ${candidate.lastName}`);
    
    // Current position
    if (candidate.employment?.current?.position) {
      parts.push(`Current Role: ${candidate.employment.current.position}`);
      if (candidate.employment.current.company) {
        parts.push(`Company: ${candidate.employment.current.company}`);
      }
    }
    
    // Work history
    if (candidate.employment?.history && candidate.employment.history.length > 0) {
      const recentJobs = candidate.employment.history.slice(0, 3).map(job => {
        return `${job.position}${job.employer ? ` at ${job.employer}` : ''}`;
      });
      parts.push(`Recent Experience: ${recentJobs.join('; ')}`);
    }
    
    // Skills
    if (candidate.skillTags && candidate.skillTags.length > 0) {
      parts.push(`Skills: ${candidate.skillTags.slice(0, 10).join(', ')}`);
    }
    
    // Existing summary
    if (candidate.summary) {
      parts.push(`Bio: ${candidate.summary.substring(0, 300)}`);
    }
    
    // Ideal position
    if (candidate.employment?.ideal?.position) {
      parts.push(`Seeking: ${candidate.employment.ideal.position}`);
    }
    
    return parts.join('\n');
  }

  /**
   * Get fallback summary if AI generation fails
   */
  getFallbackSummary(candidate) {
    // Use existing summary if available
    if (candidate.summary) {
      // Truncate to reasonable length
      const summary = candidate.summary.substring(0, 250);
      return summary.length < candidate.summary.length ? summary + '...' : summary;
    }
    
    // Generate basic summary from available data
    const title = candidate.employment?.current?.position || 
                  candidate.employment?.ideal?.position || 
                  'Professional';
    
    const skills = candidate.skillTags?.slice(0, 3).join(', ') || 'various skills';
    
    return `An experienced ${title} with expertise in ${skills}. Brings a strong track record of delivering results and contributing to team success.`;
  }

  /**
   * Generate summaries for multiple candidates in parallel
   */
  async generateBatchSummaries(candidates) {
    const client = this.getOpenAIClient();
    
    if (!client) {
      console.log(`\n⚠️  OpenAI API key not configured - using fallback summaries for all candidates`);
    } else {
      console.log(`\n🤖 Generating AI summaries for ${candidates.length} candidates...`);
    }
    
    const summaries = await Promise.all(
      candidates.map(candidate => this.generateCandidateSummary(candidate))
    );
    
    console.log('✅ All summaries generated\n');
    
    return summaries;
  }
}

module.exports = new AIService();
