const axios = require('axios');
const jobadderService = require('./jobadderService');

class CandidateService {
  constructor() {
    this.INTERVIEW_NOTE_TYPES = [
      'Internal Interview',
      'Candidate Interview', 
      'Phonescreen'
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
    const dateFilter = `>${cutoffDate.toISOString()}`;
    
    console.log(`   Cutoff date: ${cutoffDate.toISOString()}`);
    
    // Fetch interview notes for all interview types
    const allInterviewNotes = [];
    
    for (const noteType of this.INTERVIEW_NOTE_TYPES) {
      try {
        console.log(`  📋 Fetching "${noteType}" notes...`);
        const notes = await this.fetchNotesByType(noteType, dateFilter);
        allInterviewNotes.push(...notes);
        console.log(`    ✓ Found ${notes.length} notes`);
      } catch (error) {
        console.warn(`    ⚠️  Could not fetch "${noteType}" notes:`, error.message);
      }
    }
    
    console.log(`\n📊 Total interview notes found: ${allInterviewNotes.length}`);
    
    // Extract unique candidate IDs
    const candidateIds = this.extractUniqueCandidateIds(allInterviewNotes);
    console.log(`👥 Unique candidates interviewed: ${candidateIds.length}`);
    
    if (candidateIds.length === 0) {
      console.log('⚠️  No candidates found with interviews in the specified period');
      return [];
    }
    
    // Fetch full candidate details
    console.log('🔄 Fetching candidate details...');
    const candidates = await this.fetchCandidateDetails(candidateIds);
    console.log(`✅ Retrieved ${candidates.length} candidate profiles\n`);
    
    return candidates;
  }

  /**
   * Fetch notes by type and date
   */
  async fetchNotesByType(noteType, dateFilter) {
    const token = await jobadderService.getAccessToken();
    
    const response = await axios.get(`${jobadderService.baseUrl}/notes`, {
      headers: {
        'Authorization': `Bearer ${token}`
      },
      params: {
        type: noteType,
        createdAt: dateFilter,
        limit: 500  // Max per request
      }
    });
    
    return response.data.items || [];
  }

  /**
   * Extract unique candidate IDs from notes
   */
  extractUniqueCandidateIds(notes) {
    const candidateIds = new Set();
    
    notes.forEach(note => {
      // Notes have a 'candidates' array with candidate IDs
      if (note.candidates && Array.isArray(note.candidates)) {
        note.candidates.forEach(candidateId => {
          if (candidateId) {
            candidateIds.add(candidateId);
          }
        });
      }
    });
    
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
    }
    
    return candidates;
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
      // Try to estimate from current position or return default
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
   */
  getCurrentTitle(candidate) {
    // Try multiple sources for job title
    if (candidate.employment?.current?.position) {
      return candidate.employment.current.position;
    }
    
    if (candidate.employment?.ideal?.position) {
      return candidate.employment.ideal.position;
    }
    
    if (candidate.employment?.history && candidate.employment.history.length > 0) {
      return candidate.employment.history[0].position || 'Professional';
    }
    
    return 'Professional';
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
      title: currentTitle,
      experience: `${yearsExp} ${yearsExp === 1 ? 'Year' : 'Years'}`,
      summary: aiSummary,
      profile_url: `https://app.jobadder.com/candidates/${candidate.candidateId}`,
      avatar_url: candidate.links?.photo || null,
      candidateId: candidate.candidateId
    };
  }
}

module.exports = new CandidateService();
