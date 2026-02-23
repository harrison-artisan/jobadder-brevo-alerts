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
    const filteredCandidates = this.filterQualifiedCandidates(candidates);
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
  filterQualifiedCandidates(candidates) {
    const excludeKeywords = [
      'junior', 'intern', 'internship', 'graduate', 'trainee', 'student',
      'entry level', 'entry-level', 'assistant'
    ];
    
    const hasExcludedKeyword = (text) => {
      if (!text) return false;
      const lowerText = text.toLowerCase();
      return excludeKeywords.some(keyword => lowerText.includes(keyword));
    };
    
    return candidates.filter(candidate => {
      // Check current position
      if (candidate.employment?.current?.position) {
        if (hasExcludedKeyword(candidate.employment.current.position)) {
          console.log(`  ⊘ Filtered out: ${candidate.firstName} ${candidate.lastName} (${candidate.employment.current.position})`);
          return false;
        }
      }
      
      // Check ideal position
      if (candidate.employment?.ideal?.position) {
        if (hasExcludedKeyword(candidate.employment.ideal.position)) {
          console.log(`  ⊘ Filtered out: ${candidate.firstName} ${candidate.lastName} (seeking ${candidate.employment.ideal.position})`);
          return false;
        }
      }
      
      // Check if we can extract a usable title
      const title = this.getCurrentTitle(candidate);
      if (!title || title === 'Creative Professional') {
        console.log(`  ⊘ Filtered out: ${candidate.firstName} ${candidate.lastName} (no usable job title)`);
        return false;
      }
      
      return true;
    });
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
   * Extracts from summary if needed
   */
  getCurrentTitle(candidate) {
    const genericTitles = [
      'freelance', 'freelancer', 'owner', 'consultant', 'contractor',
      'self-employed', 'independent', 'director', 'partner', 'designer',
      'creative', 'professional'
    ];
    
    const isGeneric = (title) => {
      if (!title) return true;
      const lowerTitle = title.toLowerCase().trim();
      
      // Check if it's ONLY a generic word (not "Senior Designer" which is fine)
      const words = lowerTitle.split(/\s+/);
      if (words.length === 1 && genericTitles.includes(words[0])) {
        return true;
      }
      
      // Check if it starts with generic + space (like "Freelance " or "Owner ")
      return genericTitles.some(generic => 
        lowerTitle === generic || 
        (lowerTitle.startsWith(generic + ' ') && words.length <= 2)
      );
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
    
    // Try to extract from summary
    if (candidate.summary) {
      const extractedTitle = this.extractTitleFromSummary(candidate.summary);
      if (extractedTitle && !isGeneric(extractedTitle)) {
        return extractedTitle;
      }
    }
    
    // Last resort: return null to indicate no usable title found
    // This will cause the candidate to be filtered out
    return null;
  }

  /**
   * Extract a job title from candidate summary/bio
   */
  extractTitleFromSummary(summary) {
    if (!summary) return null;
    
    // Common patterns in summaries
    const patterns = [
      /(?:experienced|senior|lead|principal|head of)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,3})/i,
      /(?:I am a|I'm a|As a)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,3})/i,
      /(?:working as|work as)\s+(?:a|an)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,3})/i,
      /([A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,2})\s+(?:with|specializing|focused)/i
    ];
    
    for (const pattern of patterns) {
      const match = summary.match(pattern);
      if (match && match[1]) {
        const title = match[1].trim();
        // Make sure it's not just a single generic word
        if (title.split(/\s+/).length >= 2) {
          return title;
        }
      }
    }
    
    return null;
  }

  /**
   * Format candidate for email template
   */
  formatCandidateForEmail(candidate, position, aiSummary) {
    const yearsExp = this.calculateYearsOfExperience(candidate);
    const currentTitle = this.getCurrentTitle(candidate);
    
    return {
      number: position,
      name: `${candidate.firstName} ${candidate.lastName}`,
      title: currentTitle || 'Creative Professional',
      experience: `${yearsExp} ${yearsExp === 1 ? 'Year' : 'Years'}`,
      summary: aiSummary,
      profile_url: `https://app.jobadder.com/candidates/${candidate.candidateId}`,
      avatar_url: candidate.links?.photo || null,
      image_url: this.CANDIDATE_IMAGES[position - 1] || this.CANDIDATE_IMAGES[0],
      candidateId: candidate.candidateId
    };
  }
}

module.exports = new CandidateService();
