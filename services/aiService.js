const OpenAI = require('openai');

class AIService {
  constructor() {
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
      console.log(`  📝 Processing summary for candidate ${candidate.candidateId}...`);
      return this.processJobAdderSummary(candidate);
    } catch (error) {
      console.error(`❌ Error processing summary for candidate ${candidate.candidateId}:`, error.message);
      return this.buildBasicSummary(candidate);
    }
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
   * Remove names from text
   */
  removeNames(text, candidate) {
    if (!text) return '';
    
    let cleaned = text;
    
    // Remove first and last name
    if (candidate.firstName) {
      const regex = new RegExp(`\\b${candidate.firstName}\\b`, 'gi');
      cleaned = cleaned.replace(regex, '');
    }
    
    if (candidate.lastName) {
      const regex = new RegExp(`\\b${candidate.lastName}\\b`, 'gi');
      cleaned = cleaned.replace(regex, '');
    }
    
    // Clean up double spaces
    cleaned = cleaned.replace(/\s+/g, ' ').trim();
    
    return cleaned;
  }

  /**
   * Remove company names from text
   */
  removeCompanyNames(text, candidate) {
    if (!text) return '';
    
    let cleaned = text;
    
    // Current company
    if (candidate.employment?.current?.company) {
      const regex = new RegExp(`\\b${candidate.employment.current.company}\\b`, 'gi');
      cleaned = cleaned.replace(regex, 'a leading organisation');
    }
    
    // Employment history companies
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
   * Remove gender pronouns
   */
  removeGenderPronouns(text) {
    if (!text) return '';
    
    let cleaned = text;
    
    // Replace pronouns - be careful with word boundaries
    cleaned = cleaned.replace(/\bhe\b/gi, 'they');
    cleaned = cleaned.replace(/\bshe\b/gi, 'they');
    cleaned = cleaned.replace(/\bhis\b/gi, 'their');
    cleaned = cleaned.replace(/\bher\b(?!\s+(skills|experience|expertise|background|work))/gi, 'their');
    cleaned = cleaned.replace(/\bhim\b/gi, 'them');
    cleaned = cleaned.replace(/\bhers\b/gi, 'theirs');
    
    // Fix grammar issues from pronoun replacement
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
      'realized': 'realised',
      'color': 'colour',
      'colors': 'colours',
      'favorite': 'favourite',
      'center': 'centre'
    };
    
    let result = text;
    for (const [us, au] of Object.entries(replacements)) {
      const regex = new RegExp(`\\b${us}\\b`, 'gi');
      result = result.replace(regex, au);
    }
    
    return result;
  }

  /**
   * Process the JobAdder summary - this is the main function
   */
  processJobAdderSummary(candidate) {
    // If they have a summary, use it!
    if (candidate.summary && candidate.summary.trim().length > 50) {
      let summary = candidate.summary.trim();
      
      // Step 1: Remove names
      summary = this.removeNames(summary, candidate);
      
      // Step 2: Remove company names
      summary = this.removeCompanyNames(summary, candidate);
      
      // Step 3: Remove gender pronouns
      summary = this.removeGenderPronouns(summary);
      
      // Step 4: Apply Australian spelling
      summary = this.applyAustralianSpelling(summary);
      
      // Step 5: Extract first 2-3 compelling sentences (about 200-300 chars)
      const sentences = summary.split(/(?<=[.!?])\s+/);
      let result = '';
      let charCount = 0;
      
      for (let i = 0; i < sentences.length && i < 5; i++) {
        const sentence = sentences[i].trim();
        if (sentence.length > 15) { // Skip very short sentences
          result += sentence + ' ';
          charCount += sentence.length;
          
          // Stop after 2-3 good sentences or ~250 chars
          if (charCount >= 200 && i >= 1) {
            break;
          }
        }
      }
      
      // Step 6: Clean up formatting
      result = result.trim();
      result = result.replace(/\s+/g, ' '); // Remove double spaces
      result = result.replace(/\s+([.,!?])/g, '$1'); // Fix spacing before punctuation
      
      // Step 7: Ensure it ends with proper punctuation
      if (!result.match(/[.!?]$/)) {
        result += '.';
      }
      
      // Step 8: Add experience context if not mentioned and we have it
      const yearsExp = this.calculateYearsOfExperience(candidate);
      if (yearsExp > 0 && !result.match(/\d+\s*(year|yr)/i)) {
        const expText = yearsExp >= 10 ? `over ${yearsExp} years` : `${yearsExp}+ years`;
        const title = this.getJobTitle(candidate);
        
        // Add as opening if we can
        if (title) {
          result = `A ${title} with ${expText} of experience. ${result}`;
        }
      }
      
      return result;
    }
    
    // If no summary, build from available data
    return this.buildBasicSummary(candidate);
  }

  /**
   * Get job title with proper formatting
   */
  getJobTitle(candidate) {
    let title = candidate.employment?.current?.position || 
                candidate.employment?.ideal?.position || 
                '';
    
    if (!title) return '';
    
    // Clean up title
    title = title.replace(/\s*[\(\[].*?[\)\]]/g, ''); // Remove brackets
    title = title.replace(/\s*[-–—]\s*\d+.*$/g, ''); // Remove trailing numbers
    title = title.replace(/\s+\d+$/g, ''); // Remove ending numbers
    title = title.replace(/^[A-Z]{2,4}[-_]\d+\s*/g, ''); // Remove codes
    title = title.trim();
    
    // Convert to Title Case
    return this.toTitleCase(title);
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
   * Build basic summary when no JobAdder summary exists
   */
  buildBasicSummary(candidate) {
    const title = this.getJobTitle(candidate);
    const yearsExp = this.calculateYearsOfExperience(candidate);
    const skills = candidate.skillTags?.slice(0, 5).join(', ') || '';
    
    if (!title) {
      return 'An experienced professional with a proven track record of delivering exceptional results.';
    }
    
    let summary = '';
    
    if (yearsExp > 0) {
      const expText = yearsExp >= 10 ? `over ${yearsExp} years` : `${yearsExp}+ years`;
      summary = `A ${title} with ${expText} of professional experience`;
    } else {
      summary = `An experienced ${title}`;
    }
    
    if (skills) {
      summary += ` specialising in ${skills}`;
    }
    
    summary += '. Brings a strong track record of delivering high-quality outcomes and exceeding expectations.';
    
    return summary;
  }

  /**
   * Generate summaries for multiple candidates in parallel
   */
  async generateBatchSummaries(candidates) {
    console.log(`\n📝 Processing summaries for ${candidates.length} candidates...`);
    
    const summaries = await Promise.all(
      candidates.map(candidate => this.generateCandidateSummary(candidate))
    );
    
    console.log('✅ All summaries processed\n');
    
    return summaries;
  }
}

module.exports = new AIService();
