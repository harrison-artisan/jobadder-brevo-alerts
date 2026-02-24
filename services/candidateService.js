const axios = require('axios');
const jobadderService = require('./jobadderService');

class CandidateService {
  constructor() {
    // Exact note type names from JobAdder
    this.INTERVIEW_NOTE_TYPES = [
      'Internal interview',
      'Candidate interview',
      'Phone Screen'  // Capital S based on logs
    ];
    
    // Line art illustrations for candidates 1-5 (cleaned and cropped with white backgrounds)
    this.CANDIDATE_IMAGES = [
      'https://files.manuscdn.com/user_upload_by_module/session_file/310519663319947996/BAqVCSDgfObJIpua.png',
      'https://files.manuscdn.com/user_upload_by_module/session_file/310519663319947996/ciPuVrqcILvuNZID.png',
      'https://files.manuscdn.com/user_upload_by_module/session_file/310519663319947996/LjpxADMYuFGcTurV.png',
      'https://files.manuscdn.com/user_upload_by_module/session_file/310519663319947996/jXNoewliRXhFNbbo.png',
      'https://files.manuscdn.com/user_upload_by_module/session_file/310519663319947996/PlLAYxHCQCkRMJss.png'
    ];
  }

  /**
   * Get candidates interviewed in the last N weeks
   */
  async getRecentlyInterviewedCandidates(weeksAgo = 3) {
    console.log(`\n🔍 Fetching candidates interviewed in last ${weeksAgo} weeks...`);
    
    // Calculate cutoff date
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - (weeksAgo * 7));
    
    console.log(`   Cutoff date: ${cutoffDate.toISOString()}`);
    
    // Fetch interview notes
    const allInterviewNotes = [];
    
    for (const noteType of this.INTERVIEW_NOTE_TYPES) {
      try {
        console.log(`\n  📝 Fetching "${noteType}" notes...`);
        const notes = await this.fetchNotesByType(noteType, cutoffDate);
        console.log(`    ✓ Found ${notes.length} notes`);
        allInterviewNotes.push(...notes);
      } catch (error) {
        console.warn(`    ❌ Error fetching "${noteType}":`, error.message);
      }
    }
    
    console.log(`\n📊 Total interview notes found: ${allInterviewNotes.length}`);
    
    if (allInterviewNotes.length === 0) {
      console.log('⚠️  No interview notes found');
      return [];
    }
    
    // Fetch full details for each note to get candidate relationships
    console.log('🔍 Fetching full note details to extract candidates...');
    const candidateIds = await this.extractCandidatesFromNotes(allInterviewNotes);
    
    console.log(`👥 Unique candidates found: ${candidateIds.length}`);
    
    if (candidateIds.length === 0) {
      console.log('⚠️  No candidates found with interviews in the specified period');
      return [];
    }
    
    // Fetch full candidate details
    console.log('🔄 Fetching candidate profiles...');
    const candidates = await this.fetchCandidateDetails(candidateIds);
    console.log(`✅ Retrieved ${candidates.length} candidate profiles`);
    
    // Filter out juniors and interns
    const filteredCandidates = await this.filterQualifiedCandidates(candidates);
    console.log(`✅ ${filteredCandidates.length} qualified candidates after filtering\n`);
    
    return filteredCandidates;
  }

  /**
   * Fetch notes by type and date
   */
  async fetchNotesByType(noteType, cutoffDate) {
    const token = await jobadderService.getAccessToken();
    const dateFilter = cutoffDate.toISOString().split('T')[0]; // YYYY-MM-DD
    
    const response = await axios.get(`${jobadderService.baseUrl}/notes`, {
      headers: {
        'Authorization': `Bearer ${token}`
      },
      params: {
        type: noteType,
        createdAt: `>${dateFilter}`,
        limit: 500
      }
    });
    
    return response.data.items || [];
  }

  /**
   * Extract candidate IDs by fetching full note details
   */
  async extractCandidatesFromNotes(notes) {
    const candidateIds = new Set();
    const token = await jobadderService.getAccessToken();
    
    console.log(`  🔍 Fetching details for ${notes.length} notes...`);
    
    // Process notes in batches
    const batchSize = 20;
    let processed = 0;
    let firstNoteLogged = false;
    
    for (let i = 0; i < notes.length; i += batchSize) {
      const batch = notes.slice(i, i + batchSize);
      
      const promises = batch.map(async (note) => {
        try {
          // Fetch full note details
          const response = await axios.get(`${jobadderService.baseUrl}/notes/${note.noteId}`, {
            headers: {
              'Authorization': `Bearer ${token}`
            }
          });
          
          const fullNote = response.data;
          
          // Log first note to see structure
          if (!firstNoteLogged) {
            console.log(`\n    📄 FULL NOTE DETAILS:`);
            console.log(JSON.stringify(fullNote, null, 2));
            console.log(`    📄 Available keys:`, Object.keys(fullNote));
            firstNoteLogged = true;
          }
          
          // Extract candidate IDs from candidates array
          if (fullNote.candidates && Array.isArray(fullNote.candidates)) {
            fullNote.candidates.forEach(candidate => {
              if (candidate.candidateId) {
                candidateIds.add(candidate.candidateId);
              }
            });
          }
          
          // Check links for candidate reference
          if (fullNote.links) {
            if (fullNote.links.candidate) {
              const match = fullNote.links.candidate.match(/\/candidates\/(\d+)/);
              if (match) candidateIds.add(parseInt(match[1]));
            }
            if (fullNote.links.application) {
              // Fetch application to get candidate ID
              try {
                const appMatch = fullNote.links.application.match(/\/applications\/(\d+)/);
                if (appMatch) {
                  const appResponse = await axios.get(`${jobadderService.baseUrl}/applications/${appMatch[1]}`, {
                    headers: { 'Authorization': `Bearer ${token}` }
                  });
                  if (appResponse.data.candidateId) {
                    candidateIds.add(appResponse.data.candidateId);
                  }
                }
              } catch (err) {
                // Skip if application fetch fails
              }
            }
          }
          
        } catch (error) {
          // Skip notes that can't be fetched
        }
      });
      
      await Promise.all(promises);
      processed += batch.length;
      console.log(`    Processed ${processed}/${notes.length} notes, found ${candidateIds.size} candidates so far...`);
      
      // Add delay between batches to avoid rate limiting (except for last batch)
      if (i + batchSize < notes.length) {
        await new Promise(resolve => setTimeout(resolve, 500)); // 0.5 second delay
      }
    }
    
    return Array.from(candidateIds);
  }

  /**
   * Fetch full candidate details for multiple IDs
   */
  async fetchCandidateDetails(candidateIds) {
    const candidates = [];
    
    // Fetch candidates in parallel (batches of 10)
    const batchSize = 10;
    for (let i = 0; i < candidateIds.length; i += batchSize) {
      const batch = candidateIds.slice(i, i + batchSize);
      const batchPromises = batch.map(id => 
        jobadderService.getCandidateById(id).catch(error => {
          console.warn(`⚠️  Could not fetch candidate ${id}:`, error.message);
          return null;
        })
      );
      
      const batchResults = await Promise.all(batchPromises);
      candidates.push(...batchResults.filter(c => c !== null));
      
      // Add delay between batches to avoid rate limiting (except for last batch)
      if (i + batchSize < candidateIds.length) {
        await new Promise(resolve => setTimeout(resolve, 1000)); // 1 second delay
      }
    }
    
    return candidates;
  }

  /**
   * Filter out juniors, interns, and candidates with unusable titles
   */
  async filterQualifiedCandidates(candidates) {
    const excludeKeywords = [
      'junior', 'intern', 'internship', 'graduate', 'trainee', 'student',
      'entry level', 'entry-level', 'assistant'
    ];
    
    const hasExcludedKeyword = (text) => {
      if (!text) return false;
      const lowerText = text.toLowerCase();
      return excludeKeywords.some(keyword => lowerText.includes(keyword));
    };
    
    // Use Promise.all to check all candidates asynchronously
    const results = await Promise.all(
      candidates.map(async (candidate) => {
        // Check current position
        if (candidate.employment?.current?.position) {
          if (hasExcludedKeyword(candidate.employment.current.position)) {
            console.log(`  ⊘ Filtered out: ${candidate.firstName} ${candidate.lastName} (${candidate.employment.current.position})`);
            return null;
          }
        }
        
        // Check ideal position
        if (candidate.employment?.ideal?.position) {
          if (hasExcludedKeyword(candidate.employment.ideal.position)) {
            console.log(`  ⊘ Filtered out: ${candidate.firstName} ${candidate.lastName} (seeking ${candidate.employment.ideal.position})`);
            return null;
          }
        }
        
        // Check ALL employment history for excluded keywords
        if (candidate.employment?.history && candidate.employment.history.length > 0) {
          for (const job of candidate.employment.history) {
            if (job.position && hasExcludedKeyword(job.position)) {
              console.log(`  ⊘ Filtered out: ${candidate.firstName} ${candidate.lastName} (history: ${job.position})`);
              return null;
            }
          }
        }
        
        // Check summary/bio for excluded keywords
        if (candidate.summary && hasExcludedKeyword(candidate.summary)) {
          console.log(`  ⊘ Filtered out: ${candidate.firstName} ${candidate.lastName} (intern/junior mentioned in summary)`);
          return null;
        }
        
        // Check if we can extract a usable title (async now)
        const title = await this.getCurrentTitle(candidate);
        if (!title || title === 'Creative Professional') {
          console.log(`  ⊘ Filtered out: ${candidate.firstName} ${candidate.lastName} (no usable job title)`);
          return null;
        }
        
        return candidate;
      })
    );
    
    // Filter out nulls
    return results.filter(candidate => candidate !== null);
  }

  /**
   * Randomly select N candidates from the pool
   */
  selectRandomCandidates(candidates, count = 5) {
    if (candidates.length <= count) {
      console.log(`⚠️  Only ${candidates.length} candidates available (requested ${count})`);
      return candidates;
    }
    
    // Fisher-Yates shuffle algorithm
    const shuffled = [...candidates];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    
    return shuffled.slice(0, count);
  }

  /**
   * Calculate years of experience from employment history
   */
  calculateYearsOfExperience(candidate) {
    if (!candidate.employment?.history || candidate.employment.history.length === 0) {
      return 5; // Default fallback
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
   * Get current job title for candidate
   * Avoids generic titles like Freelance, Owner, Consultant
   * Uses AI to extract from summary if needed
   */
  async getCurrentTitle(candidate) {
    const genericTitles = [
      'freelance', 'freelancer', 'owner', 'consultant', 'contractor',
      'self-employed', 'independent', 'director', 'partner', 'designer',
      'creative', 'professional', 'founder', 'creator', 'ceo', 'principal',
      'managing director', 'md', 'co-founder', 'business owner'
    ];
    
    const isGeneric = (title) => {
      if (!title) return true;
      const lowerTitle = title.toLowerCase().trim();
      
      // Filter out titles with ALL CAPS (likely business names like "ALTRIMENTI")
      if (title === title.toUpperCase() && title.length > 3) {
        return true;
      }
      
      // Check if it contains business name indicators
      const businessIndicators = ['pty', 'ltd', 'llc', 'inc', 'corp', '&', 'and'];
      if (businessIndicators.some(indicator => lowerTitle.includes(indicator))) {
        return true;
      }
      
      // Check if it's ONLY a generic word (not "Senior Designer" which is fine)
      const words = lowerTitle.split(/\s+/);
      if (words.length === 1 && genericTitles.includes(words[0])) {
        return true;
      }
      
      // Check if it contains generic terms like "Owner", "Founder"
      return genericTitles.some(generic => {
        // Exact match
        if (lowerTitle === generic) return true;
        // Starts with generic ("Freelance Designer")
        if (lowerTitle.startsWith(generic + ' ') && words.length <= 2) return true;
        // Ends with generic ("ALTRIMENTI Founder")
        if (lowerTitle.endsWith(' ' + generic)) return true;
        // Contains "& generic" ("Founder & Creator")
        if (lowerTitle.includes('& ' + generic) || lowerTitle.includes('and ' + generic)) return true;
        return false;
      });
    };
    
    // Check current position
    if (candidate.employment?.current?.position) {
      const currentTitle = candidate.employment.current.position;
      if (!isGeneric(currentTitle)) {
        return currentTitle;
      }
    }
    
    // If current is generic, look through work history for more specific title
    if (candidate.employment?.history && candidate.employment.history.length > 0) {
      for (const job of candidate.employment.history) {
        if (job.position && !isGeneric(job.position)) {
          return job.position;
        }
      }
    }
    
    // Check ideal position
    if (candidate.employment?.ideal?.position) {
      const idealTitle = candidate.employment.ideal.position;
      if (!isGeneric(idealTitle)) {
        return idealTitle;
      }
    }
    
    // Try to extract from summary using regex patterns
    if (candidate.summary) {
      const extractedTitle = this.extractTitleFromSummary(candidate.summary);
      if (extractedTitle && !isGeneric(extractedTitle)) {
        return extractedTitle;
      }
    }
    
    // No usable title found - candidate will be filtered out
    return null;
  }

  /**
   * Extract a job title from candidate summary/bio using improved regex patterns
   */
  extractTitleFromSummary(summary) {
    if (!summary) return null;
    
    // Expanded patterns to catch more job titles
    const patterns = [
      // "Senior Art Director", "Lead Designer", etc.
      /(?:experienced|senior|lead|principal|head of|chief)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,4})/i,
      // "I am a Creative Director"
      /(?:I am a|I'm a|I am an|I'm an|As a|As an)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,4})/i,
      // "working as a Brand Strategist"
      /(?:working as|work as|currently|currently working as)\s+(?:a|an)?\s*([A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,4})/i,
      // "Brand Strategist with 10 years"
      /([A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,3})\s+(?:with|specializing|specialising|focused|passionate)/i,
      // "Creative Director at"
      /([A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,3})\s+(?:at|for)\s+[A-Z]/i,
      // Start of summary: "Digital Designer based in"
      /^([A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,3})\s+(?:based|located|living)/i,
      // "role as a UX Designer"
      /(?:role as|position as|job as)\s+(?:a|an)?\s*([A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,4})/i
    ];
    
    for (const pattern of patterns) {
      const match = summary.match(pattern);
      if (match && match[1]) {
        let title = match[1].trim();
        
        // Clean up the title
        title = title.replace(/\s+/g, ' '); // Normalize spaces
        
        // Must be at least 2 words to avoid single generic words
        const words = title.split(/\s+/);
        if (words.length >= 2) {
          return title;
        }
      }
    }
    
    return null;
  }

  /**
   * Format candidate for email template
   */
  async formatCandidateForEmail(candidate, position, aiSummary) {
    // Import aiService to use its title cleaning logic
    const aiService = require('./aiService');
    
    // Get raw title from JobAdder
    const rawTitle = candidate.employment?.current?.position || 
                     candidate.employment?.ideal?.position || 
                     '';
    
    // Clean the title using aiService (removes pipes, company names, etc.)
    const cleanedTitle = aiService.generalizeJobTitle(rawTitle, candidate.summary || '') || 'Creative Professional';
    
    const mailtoSubject = `Send me more information about ${cleanedTitle} - Candidate #${candidate.candidateId}`;
    // Add &body= to prevent Brevo from appending UTM to subject
    const mailtoLink = `mailto:artisan@artisan.com.au?subject=${encodeURIComponent(mailtoSubject)}&body=`;
    
    return {
      number: position,
      name: `${candidate.firstName} ${candidate.lastName}`,
      title: cleanedTitle,
      // experience field removed - no longer displayed in email
      summary: aiSummary,
      profile_url: `https://app.jobadder.com/candidates/${candidate.candidateId}`,
      avatar_url: candidate.links?.photo || null,
      image_url: this.CANDIDATE_IMAGES[position - 1] || this.CANDIDATE_IMAGES[0],
      candidateId: candidate.candidateId,
      mailto_link: mailtoLink
    };
  }
}

module.exports = new CandidateService();
