const OpenAI = require('openai');

class AIService {
  constructor() {
    this.client = null;
  }

  /**
   * Get or create OpenAI client (configured for Manus API)
   */
  getClient() {
    if (!this.client && process.env.OPENAI_API_KEY) {
      this.client = new OpenAI({
        apiKey: process.env.OPENAI_API_KEY
      });
    }
    return this.client;
  }

  /**
   * Generate an anonymized, gender-neutral professional summary for a candidate using Manus API
   */
  async generateCandidateSummary(candidate) {
    try {
      const client = this.getClient();
      
      // If no API key, use fallback
      if (!client) {
        console.log(`  📝 No API key, using manual processing for candidate ${candidate.candidateId}...`);
        return this.createManualSummary(candidate);
      }

      // Get candidate info
      const title = this.generalizeJobTitle(
        candidate.employment?.current?.position || 
        candidate.employment?.ideal?.position || 
        ''
      );
      
      const yearsExp = this.calculateYearsOfExperience(candidate);
      const expText = yearsExp >= 15 ? `over ${yearsExp} years` :
                      yearsExp >= 10 ? `${yearsExp}+ years` :
                      yearsExp > 0 ? `${yearsExp} years` : 'extensive';
      
      const skills = candidate.skillTags?.slice(0, 5).join(', ') || '';
      
      // Pre-clean the bio
      let bio = candidate.summary?.trim() || '';
      if (bio.length < 50) {
        console.log(`  📝 No bio available, using manual processing for candidate ${candidate.candidateId}...`);
        return this.createManualSummary(candidate);
      }
      
      bio = this.removeNames(bio, candidate);
      bio = this.removeCompanyNames(bio, candidate);
      
      // Create the prompt
      const prompt = `Rewrite this candidate bio into a compelling 3-4 sentence professional summary for a recruitment email.

CANDIDATE INFO:
Job Title: ${title || 'Professional'}
Experience: ${expText}
Skills: ${skills || 'various professional skills'}
Bio: ${bio.substring(0, 600)}

REQUIREMENTS:
- Write EXACTLY 3-4 sentences (no more, no less)
- Remove ALL names (first names, last names, any proper names)
- Remove ALL company names (replace with "a leading organisation" or similar)
- Use gender-neutral language (they/their/them instead of he/she/his/her)
- Use Australian spelling: specialising, recognised, organised, analyse, realise
- Use Title Case for job titles (e.g., "Senior Designer" not "senior designer")
- Make it compelling and exciting - sell this candidate!
- Focus on achievements, skills, and impact from their bio
- Keep the real content from their bio, just clean it up
- Vary the opening - don't always start with "A [title] with..."

OUTPUT ONLY THE SUMMARY - NO EXPLANATIONS OR EXTRA TEXT.`;

      console.log(`    🤖 Generating with Manus AI (gemini-2.5-flash)...`);
      
      const response = await client.chat.completions.create({
        model: 'gemini-2.5-flash',
        messages: [
          {
            role: 'system',
            content: 'You are an expert recruitment copywriter specialising in creating compelling, anonymized candidate summaries.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0.8,
        max_tokens: 250
      });
      
      let summary = response.choices[0].message.content.trim();
      
      // Post-process to ensure quality
      summary = this.cleanupSummary(summary, candidate);
      
      console.log(`    ✅ AI summary generated (${summary.length} chars)`);
      
      return summary;
      
    } catch (error) {
      console.error(`  ⚠️  AI generation failed for candidate ${candidate.candidateId}: ${error.message}`);
      console.log(`  📝 Falling back to manual processing...`);
      return this.createManualSummary(candidate);
    }
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
   * Create a manual summary (fallback when AI not available)
   */
  createManualSummary(candidate) {
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
    const client = this.getClient();
    
    if (!client) {
      console.log(`\n⚠️  OPENAI_API_KEY not configured - using manual summaries for all candidates`);
    } else {
      console.log(`\n🤖 Generating AI summaries for ${candidates.length} candidates using Manus API...`);
    }
    
    const summaries = await Promise.all(
      candidates.map(candidate => this.generateCandidateSummary(candidate))
    );
    
    console.log('✅ All summaries generated\n');
    
    return summaries;
  }
}

module.exports = new AIService();
