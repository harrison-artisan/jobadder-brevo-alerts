const OpenAI = require('openai');

/**
 * Extract job title from candidate summary using AI
 */
async function extractJobTitleFromSummary(candidate) {
  try {
    // Check if API key is available
    if (!process.env.OPENAI_API_KEY) {
      console.log(`  ⚠️  OpenAI API key not configured, skipping AI title extraction`);
      return null;
    }
    
    if (!candidate.summary) {
      return null;
    }
    
    const openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY
    });
    
    const prompt = `Extract the most appropriate job title for this candidate based on their professional summary. 

CANDIDATE SUMMARY:
${candidate.summary}

REQUIREMENTS:
- Return ONLY the job title, nothing else
- Must be specific and professional (e.g., "Senior Brand Strategist", "Creative Director", "Digital Designer")
- DO NOT return generic titles like "Freelance", "Owner", "Consultant", "Designer" alone
- DO NOT return business names or company names
- DO NOT return titles with "Intern", "Junior", "Graduate", "Trainee", "Assistant"
- If the summary mentions multiple roles, pick the most senior/relevant one
- Use Australian spelling (e.g., "Specialised" not "Specialized")
- If no clear title can be extracted, return "NONE"

Examples of GOOD titles:
- Senior Art Director
- Brand Strategist
- Creative Director
- Digital Marketing Manager
- UX/UI Designer

Examples of BAD titles (don't return these):
- Freelance
- Owner
- Designer (too generic)
- Junior Designer
- ACME Founder`;

    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.3, // Lower temperature for more consistent extraction
      max_tokens: 20
    });
    
    const title = response.choices[0].message.content.trim();
    
    // Validate the response
    if (title === 'NONE' || title.length < 3 || title.length > 50) {
      return null;
    }
    
    // Check if it contains excluded keywords
    const excludedKeywords = ['intern', 'junior', 'graduate', 'trainee', 'assistant', 'freelance', 'owner', 'founder'];
    const lowerTitle = title.toLowerCase();
    if (excludedKeywords.some(keyword => lowerTitle.includes(keyword))) {
      return null;
    }
    
    return title;
    
  } catch (error) {
    console.error(`  ⚠️  Error extracting job title via AI:`, error.message);
    return null;
  }
}

module.exports = { extractJobTitleFromSummary };

