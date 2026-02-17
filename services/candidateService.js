const axios = require('axios');
const jobadderService = require('./jobadderService');

class CandidateService {
  constructor() {
    // Try multiple variations of note type names
    // Note: JobAdder is case-sensitive! Use exact casing from your system
    this.INTERVIEW_NOTE_TYPES = [
      'Internal interview',  // lowercase 'i' in interview
      'Candidate interview',  // lowercase 'i' in interview
      'Phonescreen',
      'Phone screen',
      'Interview',
      'Client interview'
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
    console.log(`   Cutoff date (readable): ${cutoffDate.toLocaleString()}`);
    
    // Try different approaches to find interview data
    let candidateIds = [];
    
    // Approach 1: Try notes endpoint with type filter
    console.log('\n📋 Approach 1: Querying notes by type...');
    const noteCandidates = await this.fetchCandidatesFromNotes(cutoffDate);
    candidateIds.push(...noteCandidates);
    
    // Approach 2: Try activities endpoint if notes didn't work
    if (candidateIds.length === 0) {
      console.log('\n📋 Approach 2: Querying activities...');
      const activityCandidates = await this.fetchCandidatesFromActivities(cutoffDate);
      candidateIds.push(...activityCandidates);
    }
    
    // Approach 3: Try fetching all recent notes without type filter
    if (candidateIds.length === 0) {
      console.log('\n📋 Approach 3: Querying all recent notes...');
      const allNotesCandidates = await this.fetchCandidatesFromAllNotes(cutoffDate);
      candidateIds.push(...allNotesCandidates);
    }
    
    // Remove duplicates
    candidateIds = [...new Set(candidateIds)];
    
    console.log(`\n👥 Total unique candidates found: ${candidateIds.length}`);
    
    if (candidateIds.length === 0) {
      console.log('⚠️  No candidates found with interviews in the specified period');
      console.log('💡 Suggestions:');
      console.log('   - Check if interviews are logged in JobAdder');
      console.log('   - Verify note type names in JobAdder settings');
      console.log('   - Try increasing the time period (e.g., 12 weeks)');
      return [];
    }
    
    // Fetch full candidate details
    console.log('🔄 Fetching candidate details...');
    const candidates = await this.fetchCandidateDetails(candidateIds);
    console.log(`✅ Retrieved ${candidates.length} candidate profiles\n`);
    
    return candidates;
  }

  /**
   * Approach 1: Fetch candidates from notes with type filter
   */
  async fetchCandidatesFromNotes(cutoffDate) {
    const candidateIds = [];
    const allInterviewNotes = [];
    
    for (const noteType of this.INTERVIEW_NOTE_TYPES) {
      try {
        console.log(`  📝 Trying note type: "${noteType}"`);
        const notes = await this.fetchNotesByType(noteType, cutoffDate);
        
        if (notes.length > 0) {
          console.log(`    ✓ Found ${notes.length} notes`);
          console.log(`    📄 Complete note structure:`);
          console.log(JSON.stringify(notes[0], null, 2));
          console.log(`    📄 Note keys:`, Object.keys(notes[0]));
          allInterviewNotes.push(...notes);
        } else {
          console.log(`    ⚠️  No notes found for this type`);
        }
      } catch (error) {
        console.warn(`    ❌ Error fetching "${noteType}":`, error.message);
        if (error.response) {
          console.warn(`       Status: ${error.response.status}`);
          console.warn(`       Response:`, JSON.stringify(error.response.data).substring(0, 200));
        }
      }
    }
    
    if (allInterviewNotes.length > 0) {
      const ids = this.extractCandidateIdsFromNotes(allInterviewNotes);
      console.log(`  ✓ Extracted ${ids.length} candidate IDs from notes`);
      candidateIds.push(...ids);
    }
    
    return candidateIds;
  }

  /**
   * Approach 2: Fetch candidates from activities endpoint
   */
  async fetchCandidatesFromActivities(cutoffDate) {
    const candidateIds = [];
    
    try {
      const token = await jobadderService.getAccessToken();
      const dateFilter = cutoffDate.toISOString().split('T')[0]; // YYYY-MM-DD format
      
      console.log(`  📅 Querying activities since ${dateFilter}`);
      
      const response = await axios.get(`${jobadderService.baseUrl}/activities`, {
        headers: {
          'Authorization': `Bearer ${token}`
        },
        params: {
          createdAt: `>${dateFilter}`,
          limit: 500
        }
      });
      
      const activities = response.data.items || [];
      console.log(`  ✓ Found ${activities.length} activities`);
      
      if (activities.length > 0) {
        console.log(`  📄 Sample activity:`, JSON.stringify(activities[0], null, 2).substring(0, 500));
        
        // Filter for interview-related activities
        const interviewActivities = activities.filter(activity => {
          const name = (activity.name || '').toLowerCase();
          const type = (activity.type || '').toLowerCase();
          return name.includes('interview') || name.includes('phone') || 
                 type.includes('interview') || type.includes('phone');
        });
        
        console.log(`  ✓ Found ${interviewActivities.length} interview-related activities`);
        
        // Extract candidate IDs
        interviewActivities.forEach(activity => {
          if (activity.candidateId) {
            candidateIds.push(activity.candidateId);
          }
          if (activity.candidates && Array.isArray(activity.candidates)) {
            candidateIds.push(...activity.candidates);
          }
        });
      }
      
    } catch (error) {
      console.warn(`  ❌ Error fetching activities:`, error.message);
      if (error.response) {
        console.warn(`     Status: ${error.response.status}`);
      }
    }
    
    return candidateIds;
  }

  /**
   * Approach 3: Fetch all recent notes without type filter
   */
  async fetchCandidatesFromAllNotes(cutoffDate) {
    const candidateIds = [];
    
    try {
      const token = await jobadderService.getAccessToken();
      const dateFilter = cutoffDate.toISOString().split('T')[0];
      
      console.log(`  📅 Querying all notes since ${dateFilter}`);
      
      const response = await axios.get(`${jobadderService.baseUrl}/notes`, {
        headers: {
          'Authorization': `Bearer ${token}`
        },
        params: {
          createdAt: `>${dateFilter}`,
          limit: 500
        }
      });
      
      const allNotes = response.data.items || [];
      console.log(`  ✓ Found ${allNotes.length} total notes`);
      
      if (allNotes.length > 0) {
        // Get unique note types to help user understand what's available
        const noteTypes = [...new Set(allNotes.map(n => n.type).filter(Boolean))];
        console.log(`  📋 Available note types:`, noteTypes);
        
        // Filter for interview-related notes
        const interviewNotes = allNotes.filter(note => {
          const type = (note.type || '').toLowerCase();
          const text = (note.text || '').toLowerCase();
          return type.includes('interview') || type.includes('phone') ||
                 text.includes('interview') || text.includes('phone screen');
        });
        
        console.log(`  ✓ Found ${interviewNotes.length} interview-related notes`);
        
        if (interviewNotes.length > 0) {
          const ids = this.extractCandidateIdsFromNotes(interviewNotes);
          candidateIds.push(...ids);
        }
      }
      
    } catch (error) {
      console.warn(`  ❌ Error fetching all notes:`, error.message);
    }
    
    return candidateIds;
  }

  /**
   * Fetch notes by type and date
   */
  async fetchNotesByType(noteType, cutoffDate) {
    const token = await jobadderService.getAccessToken();
    
    // Try different date formats
    const isoDate = cutoffDate.toISOString();
    const shortDate = cutoffDate.toISOString().split('T')[0]; // YYYY-MM-DD
    
    // Try ISO format first
    try {
      const response = await axios.get(`${jobadderService.baseUrl}/notes`, {
        headers: {
          'Authorization': `Bearer ${token}`
        },
        params: {
          type: noteType,
          createdAt: `>${isoDate}`,
          limit: 500
        }
      });
      
      return response.data.items || [];
    } catch (error) {
      // Try short date format
      const response = await axios.get(`${jobadderService.baseUrl}/notes`, {
        headers: {
          'Authorization': `Bearer ${token}`
        },
        params: {
          type: noteType,
          createdAt: `>${shortDate}`,
          limit: 500
        }
      });
      
      return response.data.items || [];
    }
  }

  /**
   * Extract candidate IDs from notes
   */
  extractCandidateIdsFromNotes(notes) {
    const candidateIds = new Set();
    
    notes.forEach(note => {
      // Try different possible fields for candidate ID
      if (note.candidateId) {
        candidateIds.add(note.candidateId);
      }
      
      if (note.candidates && Array.isArray(note.candidates)) {
        note.candidates.forEach(id => {
          if (id) candidateIds.add(id);
        });
      }
      
      if (note.candidate && typeof note.candidate === 'object' && note.candidate.candidateId) {
        candidateIds.add(note.candidate.candidateId);
      }
      
      // Check links for candidate reference
      if (note.links && note.links.candidate) {
        const match = note.links.candidate.match(/\/candidates\/(\d+)/);
        if (match) {
          candidateIds.add(parseInt(match[1]));
        }
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

