const fs = require('fs');
const path = require('path');

const targetFile = path.join(__dirname, 'services', 'jobadderService.js');
let content = fs.readFileSync(targetFile, 'utf8');

// 1. Update the getLiveJobs API call to include portal.fields
const apiCallOld = "const response = await axios.get(`${this.baseUrl}/jobboards/${boardId}/ads`, {";
const apiCallNew = "const response = await axios.get(`${this.baseUrl}/jobboards/${boardId}/ads`, {\n        params: { fields: 'portal.fields' },";
content = content.replace(apiCallOld, apiCallNew);

// 2. Update the formatJobForEmail fallback logic to properly read portal.fields
const fallbackOld = `    // FALLBACK: If Job Record failed, check the Ad's Portal Fields
    if (location === 'Location TBD' || !jobType) {
      if (ad.portal && ad.portal.fields) {
        const fields = ad.portal.fields;
        const locF = fields.find(f => /location|city|area/i.test(f.fieldName || f.name || ''));
        const typF = fields.find(f => /type|employment|work/i.test(f.fieldName || f.name || ''));
        
        if (location === 'Location TBD' && locF) location = locF.value || locF.text || location;
        if (!jobType && typF) jobType = this.mapWorkType(typF.value || typF.text);
      }
    }`;

const fallbackNew = `    // FALLBACK: If Job Record failed, check the Ad's Portal Fields
    if (location === 'Location TBD' || !jobType) {
      if (ad.portal && ad.portal.fields) {
        const fields = ad.portal.fields;
        
        // Find Location field (often fieldName contains 'Location' or 'Area')
        const locF = fields.find(f => /location|city|area/i.test(f.fieldName || ''));
        if (location === 'Location TBD' && locF) {
          // If it's a List type, the display value is in 'value', if Text type it's in 'value'
          location = locF.value || locF.externalValue || location;
        }
        
        // Find Work Type field
        const typF = fields.find(f => /type|employment|work/i.test(f.fieldName || ''));
        if (!jobType && typF) {
          jobType = this.mapWorkType(typF.value || typF.externalValue);
        }
      }
      
      // FINAL FALLBACK: Regex extraction from summary/bullet points
      if (location === 'Location TBD') {
        location = this.extractLocation(ad.summary, ad.bulletPoints);
      }
      if (!jobType) {
        jobType = this.extractJobType(ad.summary, ad.bulletPoints);
      }
    }`;

content = content.replace(fallbackOld, fallbackNew);

fs.writeFileSync(targetFile, content);
console.log('Fixed jobadderService.js');
