const fs = require('fs');
const path = require('path');

class JobTrackingService {
  constructor() {
    this.trackingFile = path.join(__dirname, '../data/sent_jobs.json');
    this.stateFile = path.join(__dirname, '../data/daily_alerts_state.json');
    this.dataDir = path.join(__dirname, '../data');
    this.ensureDataDirectory();
  }

  /**
   * Ensure data directory exists
   */
  ensureDataDirectory() {
    if (!fs.existsSync(this.dataDir)) {
      fs.mkdirSync(this.dataDir, { recursive: true });
    }
  }

  /**
   * Get list of previously sent job IDs
   */
  getSentJobIds() {
    try {
      if (fs.existsSync(this.trackingFile)) {
        const data = fs.readFileSync(this.trackingFile, 'utf8');
        const parsed = JSON.parse(data);
        return parsed.sentJobIds || [];
      }
      return [];
    } catch (error) {
      console.error('Error reading sent jobs file:', error);
      return [];
    }
  }

  /**
   * Update the list of sent job IDs
   */
  updateSentJobIds(jobIds) {
    try {
      const data = {
        sentJobIds: jobIds,
        lastUpdated: new Date().toISOString()
      };
      fs.writeFileSync(this.trackingFile, JSON.stringify(data, null, 2));
      console.log(`✅ Updated sent jobs tracking: ${jobIds.length} jobs recorded`);
    } catch (error) {
      console.error('Error writing sent jobs file:', error);
    }
  }

  /**
   * Check if there are new jobs compared to previously sent jobs
   * Returns { hasNewJobs: boolean, newJobIds: [], allCurrentJobIds: [] }
   */
  checkForNewJobs(currentJobs) {
    const currentJobIds = currentJobs.map(job => job.adId);
    const sentJobIds = this.getSentJobIds();
    
    // Find jobs that are in current list but not in sent list
    const newJobIds = currentJobIds.filter(id => !sentJobIds.includes(id));
    
    console.log(`📊 Job comparison:`);
    console.log(`   - Current live jobs: ${currentJobIds.length}`);
    console.log(`   - Previously sent jobs: ${sentJobIds.length}`);
    console.log(`   - New jobs detected: ${newJobIds.length}`);
    
    return {
      hasNewJobs: newJobIds.length > 0,
      newJobIds: newJobIds,
      allCurrentJobIds: currentJobIds
    };
  }

  /**
   * Get daily alerts activation state
   */
  getState() {
    try {
      if (fs.existsSync(this.stateFile)) {
        const data = fs.readFileSync(this.stateFile, 'utf8');
        return JSON.parse(data);
      }
      // Default state: activated
      return {
        activated: true,
        lastChanged: new Date().toISOString()
      };
    } catch (error) {
      console.error('Error reading state file:', error);
      return {
        activated: true,
        lastChanged: new Date().toISOString()
      };
    }
  }

  /**
   * Set daily alerts activation state
   */
  setState(activated) {
    try {
      const data = {
        activated: activated,
        lastChanged: new Date().toISOString()
      };
      fs.writeFileSync(this.stateFile, JSON.stringify(data, null, 2));
      console.log(`✅ Daily alerts ${activated ? 'ACTIVATED' : 'DEACTIVATED'}`);
      return data;
    } catch (error) {
      console.error('Error writing state file:', error);
      throw error;
    }
  }

  /**
   * Toggle activation state
   */
  toggleState() {
    const currentState = this.getState();
    return this.setState(!currentState.activated);
  }
}

module.exports = new JobTrackingService();
