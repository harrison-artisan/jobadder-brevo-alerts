const { Ollama } = require('ollama');

class AIService {
  constructor() {
    this.ollama = null;
    this.modelName = 'llama3.2:3b'; // Lightweight, fast, free model
  }

  /**
   * Get or create Ollama client
   */
  async getOllamaClient() {
    if (!this.ollama) {
      this.ollama = new Ollama({
        host: process.env.OLLAMA_HOST || 'http://127.0.0.1:11434'
      });
    }
    return this.ollama;
  }

  /**
   * Check if Ollama is available and pull model if needed
   */
  async ensureModelReady() {
    try {
      const client = await this.getOllamaClient();
      
      // Check if model exists
      const models = await client.list();
      const modelExists = models.models?.some(m => m.name.includes('llama3.2'));
      
      if (!modelExists) {
        console.log(`📥 Pulling ${this.modelName} model (one-time setup, ~2GB)...`);
        await client.pull({ model: this.modelName });
        console.log(`✅ Model ready!`);
      }
      
      return true;
    } catch (error) {
      console.log(`⚠️  Ollama not available: ${error.message}`);
      return false;
    }
  }

  /**
   * Generate an anonymized, gender-neutral professional summary for a candidate
   */
  async generateCandidateSummary(candidate) {
    try {
      console.log(`  🤖 Generating AI summary for candidate ${candidate.candidateId}...`);
      
      // Try to use Ollama
      const ollamaReady = await this.ensureModelReady();
      
      if (ollamaReady && candidate.summary && candidate.summary.trim().length > 50) {
        return await this.generateWithOllama(candidate);
      }
      
      // Fallback to manual processing
      console.log(`  📝 Using manual processing for candidate ${candidate.candidateId}...`);
      return this.createCompellingSummary(candidate);
      
    } catch (error) {
      console.error(`❌ Error generating summary for candidate ${candidate.candidateId}:`, error.message);
      return this.createCompellingSummary(candidate);
    }
  }

  /**
   * Generate summary using Ollama AI
   */
  async generateWithOllama(candidate) {
    const client = await this.getOllamaClient();
    
    // Get job title
    const title = this.generalizeJobTitle(
      candidate.employment?.current?.position || 
      candidate.employment?.ideal?.position || 
      ''
    );
    
    // Get years of experience
    const yearsExp = this.calculateYearsOfExperience(candidate);
    const expText = yearsExp >= 15 ? `over ${yearsExp} years` :
                    yearsExp >= 10 ? `${yearsExp}+ years` :
                    yearsExp > 0 ? `${yearsExp} years` : 'extensive';
    
    // Get skills
    const skills = candidate.skillTags?.slice(0, 5).join(', ') || '';
    
    // Pre-clean the bio
    let bio = candidate.summary.trim();
    bio = this.removeNames(bio, candidate);
    bio = this.removeCompanyNames(bio, candidate);
    
    // Create the prompt
    const prompt = `Rewrite this candidate bio into a compelling 3-4 sentence professional summary for a recruitment email.

CANDIDATE INFO:
Job Title: ${title || 'Professional'}
Experience: ${expText}
Skills: ${skills || 'various professional skills'}
Bio: ${bio.substring(0, 500)}

REQUIREMENTS:
- Write EXACTLY 3-4 sentences (no more, no less)
- Remove ALL names (first names, last names, any proper names)
- Remove ALL company names (replace with "a leading organisation" or "a top company")
- Use gender-neutral language (they/their/them instead of he/she/his/her)
- Use Australian spelling: specialising, recognised, organised, analyse, realise
- Use Title Case for job titles (e.g., "Senior Designer" not "senior designer")
- Make it compelling and exciting - sell this candidate!
- Focus on achievements, skills, and impact
- Keep the real content from their bio, just clean it up

OUTPUT ONLY THE SUMMARY - NO EXPLANATIONS OR EXTRA TEXT.`;

    const response = await client.generate({
      model: this.modelName,
      prompt: prompt,
      stream: false,
      options: {
        temperature: 0.7,
        top_p: 0.9,
        num_predict: 200
      }
    });
    
    let summary = response.response.trim();
    
    // Post-process to ensure quality
    summary = this.cleanupSummary(summary, candidate);
    
    console.log(`    ✅ AI summary generated (${summary.length} chars)`);
    
    return summary;
  }

  /**
   * Cleanup and validate AI-generated summary
   */
  cleanupSummary(summary, candidate) {
    // Remove any remaining names
    summary = this.removeNames(summary, candidate);
    summary = this.removeCompanyNames(summary, candidate);
    
    // Ensure gender-neutral
    summary = this.removeGenderPronouns(summary);
    
    // Apply Australian spelling
    summary = this.applyAustralianSpelling(summary);
    
    // Clean formatting
    summary = summary.replace(/\s+/g, ' ').trim();
    summary = summary.replace(/\s+([.,!?])/g, '$1');
    
    // Remove any quotes the AI might have added
    summary = summary.replace(/^["']|["']$/g, '');
    
    // Ensure proper ending
    if (!summary.match(/[.!?]$/)) {
      summary += '.';
    }
    
    return summary;
  }

  /**
   * Convert text to proper Title Case
   */
  toTitleCase(text) {
    if (!text) return '';
    
    const lowercase = ['a', 'an', 'and', 'as', 'at', 'but', 'by', 'for', 'in', 'of', 'on', 'or', 'the', 'to', 'with', 'via'];
    
    return text
      .toLowerCase()
      .split(' ')
      .map((word, index) => {
        if (index === 0 || !lowercase.includes(word)) {
          return word.charAt(0).toUpperCase() + word.slice(1);
        }
        return word;
      })
      .join(' ');
  }

  /**
   * Generalize and clean job titles
   */
  generalizeJobTitle(title) {
    if (!title) return '';
    
    let generalized = title.trim();
    
    // Remove codes in parentheses or brackets
    generalized = generalized.replace(/\s*[\(\[].*?[\)\]]/g, '');
    
    // Remove trailing numbers and codes
    generalized = generalized.replace(/\s*[-–—]\s*\d+.*$/g, '');
    generalized = generalized.replace(/\s+\d+$/g, '');
    
    // Remove common internal codes/prefixes
    generalized = generalized.replace(/^[A-Z]{2,4}[-_]\d+\s*/g, '');
    
    // Remove business indicators
    if (generalized.match(/\b(Pty|Ltd|LLC|Inc|Limited|Corporation|Corp)\b/i) || generalized.includes('&')) {
      return '';
    }
    
    // Check for all caps (likely business name)
    if (generalized === generalized.toUpperCase() && generalized.length > 3) {
      return '';
    }
    
    // Remove problematic words
    const problematicWords = ['intern', 'freelance', 'professional', 'owner', 'founder', 'self employed', 'self-employed'];
    const lowerTitle = generalized.toLowerCase();
    
    for (const word of problematicWords) {
      if (lowerTitle.includes(word)) {
        if (lowerTitle === word || lowerTitle === word + 's') {
          return '';
        }
        const regex = new RegExp(`\\b${word}\\b`, 'gi');
        generalized = generalized.replace(regex, '').trim();
      }
    }
    
    // Clean up extra whitespace
    generalized = generalized.replace(/\s+/g, ' ').trim();
    
    if (generalized.length < 3) {
      return '';
    }
    
    // Convert to Title Case
    return this.toTitleCase(generalized);
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
   * Remove names from text
   */
  removeNames(text, candidate) {
    if (!text) return '';
    
    let cleaned = text;
    
    if (candidate.firstName) {
      const regex = new RegExp(`\\b${candidate.firstName}\\b`, 'gi');
      cleaned = cleaned.replace(regex, '');
    }
    
    if (candidate.lastName) {
      const regex = new RegExp(`\\b${candidate.lastName}\\b`, 'gi');
      cleaned = cleaned.replace(regex, '');
    }
    
    return cleaned;
  }

  /**
   * Remove company names from text
   */
  removeCompanyNames(text, candidate) {
    if (!text) return '';
    
    let cleaned = text;
    
    if (candidate.employment?.current?.company) {
      const regex = new RegExp(`\\b${candidate.employment.current.company}\\b`, 'gi');
      cleaned = cleaned.replace(regex, 'a leading organisation');
    }
    
    if (candidate.employment?.history) {
      candidate.employment.history.forEach(job => {
        if (job.employer) {
          const regex = new RegExp(`\\b${job.employer}\\b`, 'gi');
          cleaned = cleaned.replace(regex, 'a top organisation');
        }
      });
    }
    
    return cleaned;
  }

  /**
   * Remove gender pronouns and fix grammar
   */
  removeGenderPronouns(text) {
    if (!text) return '';
    
    let cleaned = text;
    
    cleaned = cleaned.replace(/\bhe\b/gi, 'they');
    cleaned = cleaned.replace(/\bshe\b/gi, 'they');
    cleaned = cleaned.replace(/\bhis\b/gi, 'their');
    cleaned = cleaned.replace(/\bher\b(?!\s+(skills|experience|expertise|background|work))/gi, 'their');
    cleaned = cleaned.replace(/\bhim\b/gi, 'them');
    cleaned = cleaned.replace(/\bhers\b/gi, 'theirs');
    
    // Fix grammar
    cleaned = cleaned.replace(/\bthey is\b/gi, 'they are');
    cleaned = cleaned.replace(/\bthey has\b/gi, 'they have');
    cleaned = cleaned.replace(/\bthey was\b/gi, 'they were');
    
    return cleaned;
  }

  /**
   * Apply Australian spelling
   */
  applyAustralianSpelling(text) {
    if (!text) return '';
    
    const replacements = {
      'specializing': 'specialising',
      'specialized': 'specialised',
      'specialize': 'specialise',
      'recognized': 'recognised',
      'recognize': 'recognise',
      'organized': 'organised',
      'organize': 'organise',
      'organization': 'organisation',
      'organizations': 'organisations',
      'analyzing': 'analysing',
      'analyzed': 'analysed',
      'analyze': 'analyse',
      'optimize': 'optimise',
      'optimizing': 'optimising',
      'optimized': 'optimised',
      'realize': 'realise',
      'realized': 'realised'
    };
    
    let result = text;
    for (const [us, au] of Object.entries(replacements)) {
      const regex = new RegExp(`\\b${us}\\b`, 'gi');
      result = result.replace(regex, au);
    }
    
    return result;
  }

  /**
   * Create a compelling summary manually (fallback)
   */
  createCompellingSummary(candidate) {
    const title = this.generalizeJobTitle(
      candidate.employment?.current?.position || 
      candidate.employment?.ideal?.position || 
      ''
    );
    
    const yearsExp = this.calculateYearsOfExperience(candidate);
    const skills = candidate.skillTags?.slice(0, 5) || [];
    
    let sentences = [];
    
    // Opening sentence
    if (title && yearsExp > 0) {
      const expText = yearsExp >= 15 ? `over ${yearsExp} years` :
                      yearsExp >= 10 ? `${yearsExp}+ years` :
                      `${yearsExp} years`;
      sentences.push(`A ${title} with ${expText} of professional experience.`);
    } else if (title) {
      sentences.push(`An experienced ${title} with a proven track record.`);
    } else {
      sentences.push(`An experienced professional with a proven track record.`);
    }
    
    // Extract from bio if available
    if (candidate.summary && candidate.summary.trim().length > 50) {
      let bio = candidate.summary.trim();
      bio = this.removeNames(bio, candidate);
      bio = this.removeCompanyNames(bio, candidate);
      bio = this.removeGenderPronouns(bio);
      
      const bioSentences = bio.split(/(?<=[.!?])\s+/).filter(s => s.trim().length > 20);
      if (bioSentences.length > 0) {
        sentences.push(...bioSentences.slice(0, 2));
      }
    }
    
    // Add skills if needed
    if (sentences.length < 3 && skills.length >= 3) {
      const skillList = skills.slice(0, 3).join(', ');
      sentences.push(`Specialises in ${skillList} with a focus on delivering exceptional results.`);
    }
    
    // Final sentence if needed
    if (sentences.length < 3) {
      sentences.push(`Brings strong analytical skills and a commitment to excellence.`);
    }
    
    let summary = sentences.slice(0, 4).join(' ');
    summary = this.applyAustralianSpelling(summary);
    summary = summary.replace(/\s+/g, ' ').trim();
    
    if (!summary.match(/[.!?]$/)) {
      summary += '.';
    }
    
    return summary;
  }

  /**
   * Generate summaries for multiple candidates in parallel
   */
  async generateBatchSummaries(candidates) {
    console.log(`\n🤖 Generating AI summaries for ${candidates.length} candidates...`);
    
    const summaries = await Promise.all(
      candidates.map(candidate => this.generateCandidateSummary(candidate))
    );
    
    console.log('✅ All summaries generated\n');
    
    return summaries;
  }
}

module.exports = new AIService();
