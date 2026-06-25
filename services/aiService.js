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
   * Generate article ideas using OpenAI
   */
  async generateArticleIdeas() {
    try {
      const client = this.getClient();
      if (!client) {
        throw new Error("OpenAI API key not configured.");
      }

      console.log("    🤖 Generating 10 article ideas with OpenAI (gpt-4o-mini)...");

      // Inject current date so ideas are anchored to now, not training data
      const now = new Date();
      const monthYear = now.toLocaleString('en-AU', { month: 'long', year: 'numeric' });

      // Rotating angle pools — picked by week number so each call has a different structural lens
      const weekNum = Math.floor(now.getDate() / 7);
      const anglePools = [
        ['salary transparency', 'the freelance economy', 'AI tools replacing creative roles', 'portfolio vs degree debate', 'burnout in agency life'],
        ['remote vs in-office creative teams', 'personal branding for creatives', 'the rise of the fractional CMO', 'hiring for culture fit vs skill', 'career pivots into UX'],
        ['pay gap in creative industries', 'how brands are building in-house agencies', 'the death of the job description', 'creative directors on TikTok', 'what clients actually want from agencies'],
        ['neurodiversity in creative teams', 'the contractor vs permanent debate', 'side projects and career growth', 'AI-generated content and creative jobs', 'what makes a great creative brief']
      ];
      const angles = anglePools[weekNum % anglePools.length];

      // Random seed string to prevent the model caching identical responses
      const seed = Math.random().toString(36).substring(2, 8);

      const response = await client.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: `You are the content strategist for Artisan, a specialist Australian recruitment agency with 27 years of experience placing creative, digital, and marketing professionals. You write for the Artisan Creative Community blog (artisan.com.au/creative-community).

Today is ${monthYear}. All ideas must be relevant to RIGHT NOW — current industry climate, current conversations, current challenges facing Australian creative and marketing professionals in ${now.getFullYear()}.

Your job is to generate 10 article title ideas that are genuinely diverse — different angles, different audiences, different formats. The 10 ideas must span at least 6 of these categories:
- Opinion / hot take (a strong, debatable point of view)
- Data or trend-led (based on something measurable happening now)
- Career advice (practical, specific — not generic)
- Hiring manager perspective (what clients and employers are actually thinking)
- Industry critique (something broken or changing in the creative/marketing world)
- Candidate story angle (what talent is experiencing right now)
- Salary / money (rates, negotiation, market shifts)
- Technology impact (AI, tools, automation — specific, not vague)

RULES:
- Every title must be specific and opinionated — not generic
- BANNED titles: anything with "Navigating", "In Today's World", "The Future of", "Unlocking", "Mastering", "Tips for", "How to Succeed"
- No two ideas can cover the same broad topic
- Ideas must feel like they were written in ${monthYear}, not 2022
- Australian context and spelling throughout
- Output as a numbered list of titles only — no explanations`
          },
          {
            role: 'user',
            content: `Generate 10 fresh, diverse article ideas for the Artisan blog. This session's angle seeds to inspire variety (you don't have to use these directly, but let them push your thinking in different directions): ${angles.join(', ')}. Seed: ${seed}`
          }
        ],
        temperature: 1.1,
        max_tokens: 600
      });

      const ideasText = response.choices[0].message.content.trim();
      const ideas = ideasText.split('\n').map(line => line.replace(/^\d+\.\s*/, '').trim()).filter(line => line.length > 0);

      console.log(`    ✅ AI generated ${ideas.length} article ideas.`);
      return ideas;

    } catch (error) {
      console.error("❌ Error generating article ideas:", error.message);
      throw error;
    }
  }

  /**
   * Generate 10 LinkedIn poll topic ideas for Artisan's audience.
   */
  async generatePollIdeas() {
    try {
      const client = this.getClient();
      if (!client) throw new Error('OpenAI API key not configured.');

      console.log('    🤖 Generating 10 poll ideas with OpenAI (gpt-4o-mini)...');

      // Inject current date so polls are anchored to now
      const now = new Date();
      const monthYear = now.toLocaleString('en-AU', { month: 'long', year: 'numeric' });

      // Rotating theme pools — ensures structural variety across calls
      const weekNum = Math.floor(now.getDate() / 7);
      const themePools = [
        ['salary negotiation', 'AI in creative work', 'agency vs in-house', 'portfolio requirements', 'interview processes'],
        ['remote work expectations', 'job title inflation', 'contractor rates', 'creative burnout', 'LinkedIn culture'],
        ['hiring bias', 'cover letters in 2025', 'four-day work week', 'side hustles', 'performance reviews'],
        ['spec work', 'AI-generated portfolios', 'culture fit vs skill', 'redundancy experiences', 'career change at 40+']
      ];
      const themes = themePools[weekNum % themePools.length];

      // Random seed to prevent cached responses
      const seed = Math.random().toString(36).substring(2, 8);

      const response = await client.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: `You are the LinkedIn strategist for Artisan, a specialist Australian recruitment agency with 27 years of experience placing creative, digital, and marketing professionals.

Today is ${monthYear}. Generate 10 LinkedIn poll topic ideas for Artisan's audience of creative, digital, and marketing professionals in Australia. These polls must spark real debate and get people voting.

Each idea is a SHORT TOPIC ANGLE (5-10 words max) — not a full question. The platform writes the question; you just give the topic.

The 10 topics MUST be genuinely different from each other. Spread across these dimensions:
- Work preferences (remote, hybrid, hours, flexibility)
- Career decisions (pivots, seniority, agency vs in-house)
- Money (rates, salary transparency, negotiation)
- Technology (AI tools, automation, new platforms)
- Industry opinions (hot takes, things that are broken)
- Hiring process (interviews, portfolios, job ads)
- Culture (team dynamics, management, workplace norms)

RULES:
- Every topic must be specific and debatable — not vague
- Must feel relevant to ${now.getFullYear()} — not evergreen fluff
- Australian context and market
- No emojis
- No two topics can be about the same thing
- BANNED: anything that sounds like it could have been written in 2020
- Output as a numbered list of topic angles only — no explanations`
          },
          {
            role: 'user',
            content: `Generate 10 fresh, diverse LinkedIn poll topic ideas for Artisan. Theme seeds for this session (use them to push your thinking into different territory): ${themes.join(', ')}. Seed: ${seed}`
          }
        ],
        temperature: 1.1,
        max_tokens: 500
      });

      const text = response.choices[0].message.content.trim();
      const ideas = text.split('\n').map(line => line.replace(/^\d+\.\s*/, '').trim()).filter(line => line.length > 0);

      console.log(`    ✅ AI generated ${ideas.length} poll ideas.`);
      return ideas;
    } catch (error) {
      console.error('❌ Error generating poll ideas:', error.message);
      throw error;
    }
  }

  /**
   * Generate a LinkedIn post from an existing WordPress article.
   * @param {string} title - Article title
   * @param {string} excerpt - Article excerpt / short description
   * @param {string} url - Article URL
   * @returns {string} LinkedIn post copy
   */
  async generateLinkedInPostFromArticle(title, excerpt, url) {
    try {
      const client = this.getClient();
      if (!client) throw new Error('OpenAI API key not configured.');

      console.log(`    🤖 Generating LinkedIn post from article: "${title}"`);

      const response = await client.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: `You are a social media copywriter for Artisan, a specialist Australian recruitment agency with 27 years of experience placing creative, digital, and marketing professionals. Write a compelling LinkedIn post that promotes an article from the Artisan Creative Community blog. The post should:
- Open with a strong hook (no generic openers like "Excited to share...")
- Summarise the key insight or takeaway from the article in 2-3 sentences
- Include a call to action to read the article
- End with 3-5 relevant hashtags
- Be professional but conversational in tone
- Be between 150-250 words
- No emojis in the body text
- Include the article URL at the end`
          },
          {
            role: 'user',
            content: `Article title: ${title}\nArticle excerpt: ${excerpt || 'No excerpt available.'}\nArticle URL: ${url}\n\nWrite a LinkedIn post to promote this article.`
          }
        ],
        temperature: 0.75,
        max_tokens: 400
      });

      const post = response.choices[0].message.content.trim();
      console.log(`    ✅ LinkedIn post generated (${post.length} chars)`);
      return post;
    } catch (error) {
      console.error('❌ Error generating LinkedIn post from article:', error.message);
      throw error;
    }
  }

  /**
   * Generate a LinkedIn post showcasing the current A-List candidates
   */
  async generateLinkedInPostFromAList(candidates) {
    try {
      const client = this.getClient();
      if (!client) throw new Error('OpenAI API key not configured.');

      console.log(`    🤖 Generating LinkedIn A-List post for ${candidates.length} candidates`);

      // Build a candidate list for the prompt — title + condensed punchy snippet from summary
      const candidateLines = candidates.map((c, i) => {
        // Trim summary to first ~120 chars at a word boundary for a punchy snippet
        let snippet = (c.summary || '').trim();
        if (snippet.length > 120) {
          snippet = snippet.substring(0, 120).replace(/\s+\S*$/, '') + '...';
        }
        return `${i + 1}. ${c.title} — ${snippet}`;
      }).join('\n');

      const response = await client.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: `You are a social media copywriter for Artisan, a specialist Australian recruitment agency with 27 years of experience placing creative, digital, and marketing professionals. Write a compelling LinkedIn post that showcases Artisan's current A-List — a curated selection of exceptional candidates available for placement. The post should:
- Open with a strong, attention-grabbing intro (no generic openers like "Excited to share...")
- Briefly introduce the concept of the A-List (exceptional talent, ready now)
- For each candidate, include their job title followed by a single punchy sentence (max 15 words) distilled from their description — make it sharp, specific, and compelling. No names.
- End with a clear CTA directing hiring managers to https://artisan.com.au/looking-for-talent/ to find out more
- Include 3-5 relevant hashtags at the end
- Be professional, confident, and direct
- No emojis in the body text
- Between 180-280 words total`
          },
          {
            role: 'user',
            content: `Here are the ${candidates.length} candidates on this week's A-List:\n\n${candidateLines}\n\nWrite the LinkedIn post, giving each candidate a job title + one punchy sentence.`
          }
        ],
        temperature: 0.75,
        max_tokens: 500
      });

      const post = response.choices[0].message.content.trim();
      console.log(`    ✅ A-List LinkedIn post generated (${post.length} chars)`);
      return post;
    } catch (error) {
      console.error('❌ Error generating LinkedIn A-List post:', error.message);
      throw error;
    }
  }

  /**
   * Generate a LinkedIn post showcasing one or multiple jobs from JobAdder
   */
  async generateLinkedInPostFromJobs(jobs) {
    try {
      const client = this.getClient();
      if (!client) throw new Error('OpenAI API key not configured.');

      console.log(`    🤖 Generating LinkedIn jobs post for ${jobs.length} job(s)`);

      const jobLines = jobs.map((j, i) =>
        `${i + 1}. ${j.title}${j.location ? ' — ' + j.location : ''}${j.workType ? ' (' + j.workType + ')' : ''}${j.jobUrl ? ' | ' + j.jobUrl : ''}`
      ).join('\n');

      const isMultiple = jobs.length > 1;

      const response = await client.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: `You are a social media copywriter for Artisan, a specialist Australian recruitment agency with 27 years of experience placing creative, digital, and marketing professionals. Write a compelling LinkedIn post ${isMultiple ? 'showcasing multiple open roles' : 'promoting a single open role'} at Artisan. The post should:
- Open with a strong, attention-grabbing hook (no generic openers like "Excited to share...")
${isMultiple ? '- List each role with its title, location, and a punchy one-line sell (max 12 words) — make each role sound exciting and specific\n- End with a CTA encouraging people to apply or reach out via the links above' : '- Introduce the role compellingly — what makes it exciting, who it suits\n- Include the job URL naturally in the post\n- End with a clear CTA to apply or reach out'}
- Be professional, direct, and energetic
- No emojis in the body text
- Include 3-5 relevant hashtags at the end
- Between 150-250 words total`
          },
          {
            role: 'user',
            content: `Here ${isMultiple ? 'are the ' + jobs.length + ' roles' : 'is the role'} to post about:\n\n${jobLines}\n\nWrite the LinkedIn post.`
          }
        ],
        temperature: 0.75,
        max_tokens: 450
      });

      const post = response.choices[0].message.content.trim();
      console.log(`    ✅ Jobs LinkedIn post generated (${post.length} chars)`);
      return post;
    } catch (error) {
      console.error('❌ Error generating LinkedIn jobs post:', error.message);
      throw error;
    }
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
      const rawTitle = candidate.employment?.current?.position || 
                       candidate.employment?.ideal?.position || 
                       '';
      const title = this.generalizeJobTitle(rawTitle, candidate.summary || '');
      
      const yearsExp = this.calculateYearsOfExperience(candidate);
      const expText = yearsExp >= 15 ? `over ${yearsExp} years` :
                      yearsExp >= 10 ? `${yearsExp}+ years` :
                      yearsExp > 0 ? `${yearsExp} years` : 'extensive';
      
      const skills = candidate.skillTags?.slice(0, 5).join(', ') || '';
      
      // Build work history summary
      const workHistory = candidate.employment?.history?.slice(0, 3).map(job => {
        const position = job.position || '';
        const employer = job.employer || '';
        return `${position}${employer ? ' at ' + employer : ''}`;
      }).filter(h => h.trim()).join(', ') || '';
      
      // Pre-clean the bio if it exists
      let bio = candidate.summary?.trim() || '';
      let hasBio = bio.length >= 50;
      
      if (hasBio) {
        bio = this.removeNames(bio, candidate);
        bio = this.removeCompanyNames(bio, candidate);
      }
      
      // Create the prompt based on whether we have a bio or not
      let prompt;
      
      if (hasBio) {
        // Prompt for candidates WITH a bio
        prompt = `You are writing a candidate spotlight for Artisan's A-List — a curated weekly email sent to senior hiring managers across Australia's creative, digital, and marketing industry. Each spotlight must read like it was written by a sharp recruiter who genuinely knows this person's value, not a template.

Rewrite this candidate's bio into a punchy 3-sentence professional summary. It must sound human, specific, and compelling — not like every other recruitment email.

CANDIDATE INFO:
Job Title: ${title || 'Creative Professional'}
Experience: ${expText}
Skills: ${skills || 'various professional skills'}
Bio: ${bio.substring(0, 800)}

RULES:
- Exactly 3 sentences. No more, no less.
- Each sentence must do real work — no filler, no padding
- BANNED openers: "A [title] with", "With X years", "They bring", "This candidate", "An experienced"
- Start with something specific and interesting — a capability, an achievement, a sharp observation about what makes them good
- Remove ALL names (first, last, any proper names) and ALL company names
- Gender-neutral language: they/their/them
- Australian spelling: specialising, recognised, organised, analyse, realise
- No clichés: no "proven track record", "passionate about", "results-driven", "dynamic", "go-to"
- Make a hiring manager want to pick up the phone

OUTPUT ONLY THE 3-SENTENCE SUMMARY. NO PREAMBLE, NO LABELS, NO EXTRA TEXT.`;
      } else {
        // Prompt for candidates WITHOUT a bio - build from available data
        prompt = `You are writing a candidate spotlight for Artisan's A-List — a curated weekly email sent to senior hiring managers across Australia's creative, digital, and marketing industry. Each spotlight must read like it was written by a sharp recruiter who genuinely knows this person's value, not a template.

Create a punchy 3-sentence professional summary for this candidate. It must sound human, specific, and compelling — not like every other recruitment email.

CANDIDATE INFO:
Job Title: ${title || 'Creative Professional'}
Experience: ${expText}
Skills: ${skills || 'various professional skills'}
Work History: ${workHistory || 'diverse professional background'}

RULES:
- Exactly 3 sentences. No more, no less.
- Each sentence must do real work — no filler, no padding
- BANNED openers: "A [title] with", "With X years", "They bring", "This candidate", "An experienced"
- Start with something specific and interesting — lead with their strongest skill or what sets them apart
- Gender-neutral language: they/their/them
- Australian spelling: specialising, recognised, organised, analyse, realise
- No clichés: no "proven track record", "passionate about", "results-driven", "dynamic", "go-to"
- Use the job title, experience, skills, and work history to paint a picture of real capability
- Make a hiring manager want to pick up the phone

OUTPUT ONLY THE 3-SENTENCE SUMMARY. NO PREAMBLE, NO LABELS, NO EXTRA TEXT.`;
      }

      console.log(`    🤖 Generating with OpenAI (gpt-4o-mini)...`);
      
      const response = await client.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: 'You are a senior copywriter for Artisan, a specialist Australian recruitment agency. You write sharp, specific, human candidate spotlights for the Artisan A-List email. Your writing is direct, confident, and never generic. You never use clichés or stock recruitment phrases.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0.9,
        max_tokens: 350
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
  generalizeJobTitle(title, candidateSummary = '') {
    if (!title) return '';
    
    let generalized = title.trim();
    
    // Remove everything after pipe (|) - e.g., "Senior Designer | Company" → "Senior Designer"
    if (generalized.includes('|')) {
      generalized = generalized.split('|')[0].trim();
    }
    
    // Remove everything after @ - e.g., "Designer @ Company" → "Designer"
    if (generalized.includes('@')) {
      generalized = generalized.split('@')[0].trim();
    }
    
    // Remove everything after 'at' if it looks like a company - e.g., "Designer at Company" → "Designer"
    generalized = generalized.replace(/\s+at\s+[A-Z][a-zA-Z\s&]+$/i, '');
    
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
    
    // If title is too generic, try to extract better title from summary
    const genericTitles = ['team leader', 'manager', 'consultant', 'specialist', 'coordinator', 'executive', 'professional'];
    const lowerTitle = generalized.toLowerCase();
    
    if (genericTitles.includes(lowerTitle) && candidateSummary) {
      // Try to extract a better title from the summary
      const betterTitle = this.extractTitleFromSummary(candidateSummary);
      if (betterTitle && betterTitle.length > generalized.length) {
        generalized = betterTitle;
      }
    }
    
    // Remove problematic words
    const problematicWords = ['intern', 'freelance', 'professional', 'owner', 'founder', 'self employed', 'self-employed'];
    const currentLowerTitle = generalized.toLowerCase();
    
    for (const word of problematicWords) {
      if (currentLowerTitle.includes(word)) {
        if (currentLowerTitle === word || currentLowerTitle === word + 's') {
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
   * Extract a better job title from candidate summary
   */
  extractTitleFromSummary(summary) {
    if (!summary || summary.length < 20) return '';
    
    // Look for patterns like "Partner and Creative Director", "Senior Designer", etc.
    const titlePatterns = [
      /\b(Partner|Director|Manager|Designer|Developer|Consultant|Specialist|Lead|Head|Chief)\s+(?:and\s+)?(?:[A-Z][a-z]+\s+)*(?:Partner|Director|Manager|Designer|Developer|Consultant|Specialist|Lead|Head|Chief)\b/i,
      /\b(?:Senior|Junior|Lead|Principal|Associate|Executive)\s+[A-Z][a-z]+(?:\s+[A-Z][a-z]+)?\s+(?:Director|Manager|Designer|Developer|Consultant|Specialist)\b/i,
      /\b(?:Creative|Digital|Brand|Marketing|Product|Technical|Art)\s+(?:Director|Manager|Designer|Lead|Head)\b/i
    ];
    
    for (const pattern of titlePatterns) {
      const match = summary.match(pattern);
      if (match) {
        return match[0].trim();
      }
    }
    
    return '';
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

    // Extract from bio first — real content beats templates
    if (candidate.summary && candidate.summary.trim().length > 50) {
      let bio = candidate.summary.trim();
      bio = this.removeNames(bio, candidate);
      bio = this.removeCompanyNames(bio, candidate);
      bio = this.removeGenderPronouns(bio);

      const bioSentences = bio.split(/(?<=[.!?])\s+/).filter(s => s.trim().length > 20);
      if (bioSentences.length > 0) {
        sentences.push(...bioSentences.slice(0, 3));
      }
    }

    // Build from structured data if bio was short or missing
    if (sentences.length === 0) {
      if (title && yearsExp > 0) {
        const expText = yearsExp >= 15 ? `over ${yearsExp} years` :
                        yearsExp >= 10 ? `${yearsExp}+ years` :
                        `${yearsExp} years`;
        sentences.push(`${title} with ${expText} of industry experience across creative and marketing disciplines.`);
      } else if (title) {
        sentences.push(`${title} with deep expertise across creative and marketing disciplines.`);
      } else {
        sentences.push(`A versatile creative professional with cross-disciplinary expertise.`);
      }

      if (skills.length >= 2) {
        const skillList = skills.slice(0, 3).join(', ');
        sentences.push(`Their core strengths span ${skillList}.`);
      }

      sentences.push(`Available now and open to the right opportunity.`);
    }

    let summary = sentences.slice(0, 3).join(' ');
    summary = this.applyAustralianSpelling(summary);
    summary = summary.replace(/\s+/g, ' ').trim();

    if (!summary.match(/[.!?]$/)) {
      summary += '.';
    }

    return summary;
  }

  /**
   * Generate summaries for multiple candidates in a single batch call.
   * Sending all candidates together lets the model vary tone, angle, and
   * sentence structure across the set so no two spotlights sound the same.
   */
  async generateBatchSummaries(candidates) {
    const client = this.getClient();

    if (!client) {
      console.log(`\n⚠️  OPENAI_API_KEY not configured - using manual summaries for all candidates`);
      return candidates.map(c => this.createManualSummary(c));
    }

    console.log(`\n🤖 Generating AI summaries for ${candidates.length} candidates in a single batch call...`);

    try {
      // Build a rich profile block for each candidate
      const profiles = candidates.map((candidate, i) => {
        const rawTitle = candidate.employment?.current?.position ||
                         candidate.employment?.ideal?.position || '';
        const title = this.generalizeJobTitle(rawTitle, candidate.summary || '') || 'Creative Professional';
        const yearsExp = this.calculateYearsOfExperience(candidate);
        const expText = yearsExp >= 15 ? `over ${yearsExp} years` :
                        yearsExp >= 10 ? `${yearsExp}+ years` :
                        yearsExp > 0  ? `${yearsExp} years` : 'extensive experience';
        const skills = candidate.skillTags?.slice(0, 5).join(', ') || '';
        const workHistory = candidate.employment?.history?.slice(0, 3).map(job => {
          return `${job.position || ''}${job.employer ? ' at ' + job.employer : ''}`;
        }).filter(h => h.trim()).join(', ') || '';

        let bio = candidate.summary?.trim() || '';
        if (bio.length >= 50) {
          bio = this.removeNames(bio, candidate);
          bio = this.removeCompanyNames(bio, candidate);
          bio = bio.substring(0, 600);
        }

        return `--- CANDIDATE ${i + 1} ---
Title: ${title}
Experience: ${expText}
Skills: ${skills || 'not listed'}
Work History: ${workHistory || 'not listed'}
${bio ? 'Bio: ' + bio : '(No bio available — use title, skills, and work history only)'}`;
      }).join('\n\n');

      const batchPrompt = `You are writing candidate spotlights for Artisan's A-List — a curated weekly email sent to senior hiring managers across Australia's creative, digital, and marketing industry.

Write a 3-sentence professional summary for EACH of the ${candidates.length} candidates below. Each summary must:
- Sound like it was written by a sharp recruiter who genuinely knows this person's value
- Be specific, human, and compelling — not templated
- Be DIFFERENT in structure and tone from the others — vary your opening angle for every candidate
- BANNED openers: "A [title] with", "With X years", "They bring", "This candidate", "An experienced"
- Lead with something specific: a capability, a strength, what makes them stand out
- Remove ALL names and ALL company names
- Use gender-neutral language: they/their/them
- Australian spelling: specialising, recognised, organised, analyse, realise
- No clichés: no "proven track record", "passionate about", "results-driven", "dynamic", "go-to"
- Make a hiring manager want to pick up the phone

OUTPUT FORMAT — follow exactly:
CANDIDATE 1:
[3-sentence summary]

CANDIDATE 2:
[3-sentence summary]

(and so on for each candidate)

Here are the candidates:

${profiles}`;

      const response = await client.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: 'You are a senior copywriter for Artisan, a specialist Australian recruitment agency. You write sharp, specific, human candidate spotlights for the Artisan A-List email. Your writing is direct, confident, and never generic. Each spotlight you write is deliberately different in tone and structure from the others.'
          },
          {
            role: 'user',
            content: batchPrompt
          }
        ],
        temperature: 0.9,
        max_tokens: 1200
      });

      const raw = response.choices[0].message.content.trim();

      // Parse out each candidate block
      const summaries = candidates.map((candidate, i) => {
        const num = i + 1;
        // Match "CANDIDATE N:" block up to the next "CANDIDATE" or end of string
        const regex = new RegExp(`CANDIDATE\\s+${num}:\\s*([\\s\\S]*?)(?=CANDIDATE\\s+${num + 1}:|$)`, 'i');
        const match = raw.match(regex);
        let summary = match ? match[1].trim() : '';

        if (!summary) {
          console.warn(`  ⚠️  Could not parse summary for candidate ${num}, falling back to individual generation`);
          return this.generateCandidateSummary(candidate);
        }

        summary = this.cleanupSummary(summary, candidate);
        console.log(`    ✅ Candidate ${num} summary (${summary.length} chars)`);
        return summary;
      });

      // Resolve any fallback promises
      const resolved = await Promise.all(summaries);
      console.log('✅ All summaries generated\n');
      return resolved;

    } catch (error) {
      console.error('❌ Batch summary generation failed, falling back to individual generation:', error.message);
      const summaries = await Promise.all(candidates.map(c => this.generateCandidateSummary(c)));
      console.log('✅ All summaries generated (individual fallback)\n');
      return summaries;
    }
  }

  // ============================================================
  // CONTENT MARKETING: Article & Image Generation
  // ============================================================

  /**
   * Generate a full blog article from a topic/prompt.
   * Accepts optional settings: { keywords, tone, voice }
   * Returns { title, content, excerpt, seoDescription, suggestedTags }
   */
  async generateArticle(topic, settings = {}, pollContext = null) {
    const client = this.getClient();
    if (!client) {
      throw new Error('OpenAI API key not configured. Cannot generate article.');
    }

    const keywords = (settings.keywords || '').trim();
    const tone = (settings.tone || '').trim();
    const voice = (settings.voice || '').trim();
    const advStyle = (settings.advStyle || '').trim();
    const advStructure = (settings.advStructure || '').trim();
    const advSeo = (settings.advSeo || '').trim();
    const advExtra = (settings.advExtra || '').trim();

    console.log(`Generating article for topic: "${topic}"`);

    // Build optional injections
    const keywordsLine = keywords
      ? `- Naturally incorporate these keywords throughout the article: ${keywords}`
      : '';
    const toneLine = tone
      ? `- Tone: ${tone}`
      : '- Tone: confident, direct, and human — never corporate-speak or jargon-heavy';
    const voiceLine = voice
      ? `- Voice / perspective: ${voice}`
      : '- Voice: written from the perspective of Artisan, speaking directly to the reader';
    const advStyleLine = advStyle ? `\nWRITING STYLE OVERRIDE:\n${advStyle}` : '';
    const advStructureLine = advStructure ? `\nSTRUCTURE OVERRIDE:\n${advStructure}` : '';
    const advSeoLine = advSeo ? `\nSEO/AEO/GEO OVERRIDE:\n${advSeo}` : '';
    const advExtraLine = advExtra ? `\nADDITIONAL INSTRUCTIONS:\n${advExtra}` : '';

    // When a poll is attached, use a richer system prompt that foregrounds data-led writing
    const baseSystemPrompt = `You are the senior content writer for Artisan, a specialist Australian recruitment agency with over 27 years of experience placing creative, digital, and marketing professionals.

Your writing style is modelled on Artisan's Creative Community blog (artisan.com.au/creative-community).

FORMATTING RULES — follow these exactly, no exceptions:
- Write in proper flowing paragraphs. A paragraph is a group of related sentences that belong together as a continuous block of text. Do NOT start every sentence on a new line. Sentences within the same paragraph are separated by a space, not a line break.
- A paragraph can be as long as the idea requires. There is no maximum sentence count per paragraph. Write until the thought is complete, then start a new paragraph.
- Never indent the start of a paragraph with spaces, tabs, or any character. Paragraphs begin flush left.
- Use Markdown headings correctly: ## for main section headings, ### only when a section genuinely needs a sub-division. Never use # (H1) inside the body — the title is output separately on the first line as plain text.
- Use bullet point lists ONLY when presenting a set of genuinely enumerable items, steps, or comparisons that are clearer as a list than as prose. Do not use bullets as a substitute for paragraphs. When you do use bullets, follow each bullet with at least one sentence of explanation — never leave a bullet as a bare label.
- Never put a horizontal rule (---) anywhere in the article.
- Never use em-dashes (—) anywhere.
- No exclamation marks.
- No emojis anywhere.
- No filler phrases: never write "In today's fast-paced world", "In conclusion", "It goes without saying", "It's no secret", "Now more than ever".
- Write in plain, confident Australian English. Use Australian spelling throughout: specialise, recognise, organisation, behaviour, labour, colour, centre.
- Subheadings must be observations or statements, not generic labels. Write "Why Risk-Taking Feels Harder Right Now" not "Challenges".
- Always bring the article back to Artisan's role: connecting creative and marketing talent with the right opportunities and organisations.
- Every article ends with a section titled "Where Artisan Comes In" that ties the topic back to Artisan's services.`;

    const pollSystemAddition = pollContext ? `

POLL-DRIVEN ARTICLE RULES (apply because this article is based on real audience poll data):
- Open by referencing the poll result as a concrete data point — treat it as the hook that grounds the whole piece.
- Use the poll results as evidence, not as the entire article. The results are a starting point: explore the broader topic, industry context, and implications beyond what the poll directly asked.
- Present the poll results clearly — you may use a short bullet list to show each option and its percentage, then immediately expand on what that result means in practice.
- Draw out the "so what": what do these results reveal about how creative and marketing professionals in Australia are thinking or behaving right now?
- Offer practical hints, tips, and actions that readers can take based on the insights — expand on each action with a sentence or two of context.
- Do not use horizontal rules or em-dashes anywhere.
- Bring the article back to how Artisan helps — whether that is finding the right talent, advising on hiring strategy, or supporting career moves.` : '';

    const seoSystemAddition = `

SEO / AEO / GEO BEST PRACTICES (apply to every article):
- Include the primary keyword in the H1 title, the opening paragraph, and at least one H2 heading.
- Use semantic variations and LSI keywords naturally throughout — do not keyword-stuff.
- Write one clear answer to the most likely search question in the first 100 words (this satisfies AEO / featured snippet optimisation).
- Structure content so AI search engines (Perplexity, ChatGPT, Google SGE) can extract a direct answer: lead each section with the key point, then expand.
- For GEO (Generative Engine Optimisation): write in a factual, authoritative tone with specific claims, named entities, and concrete examples — vague generalisations are penalised by AI summarisers.
- Include at least one mention of a specific Australian city, industry sector, or named trend to signal geographic and topical relevance.
- The excerpt / meta description must contain the primary keyword and read as a complete, standalone sentence.`;

    const systemPrompt = baseSystemPrompt + pollSystemAddition + seoSystemAddition;

    const userPrompt = `Write a comprehensive blog article for Artisan's Creative Community section.

TOPIC: ${topic}
${pollContext ? `
POLL DATA (this is real audience data from Artisan's LinkedIn page — use it as the foundation and hook of the article):
${pollContext}
` : ''}
STRUCTURE REQUIREMENTS:
- H1 title: compelling, specific, and direct (output as plain text on the first line — no # prefix, no Markdown)
- H2 headings (##): 4 to 6 main sections — write these as observations or statements, not generic labels
- H3 subheadings (###): use sparingly, only when a section genuinely needs a sub-division
- Opening paragraph: immediately name the tension or challenge — no preamble, no throat-clearing
- Each section: write as many paragraphs as the content requires. Paragraphs are continuous blocks of prose — do NOT break every sentence onto its own line. Group sentences that belong together into a single paragraph.
- Final section: titled "Where Artisan Comes In" — tie the topic back to how Artisan helps creatives or employers
- Length: 800–1100 words total

STYLE REQUIREMENTS:
- Use Australian English spelling throughout
- No emojis anywhere
- No exclamation marks
- No em-dashes anywhere
- No filler phrases ("In today's world", "It's no secret", "It goes without saying", "In conclusion", "Now more than ever")
- No passive voice where active voice is possible
- No sentence-per-line formatting — sentences within a paragraph stay in the same paragraph block
- No indent characters at the start of paragraphs
- Default to full flowing paragraphs; use bullet point lists only when presenting items, steps, or comparisons that are genuinely clearer as a list. Each bullet must be followed by at least one sentence of explanation

SEO / AEO / GEO REQUIREMENTS:
- Primary keyword must appear in the H1, the opening paragraph, and at least one H2
- Answer the most likely search question directly within the first 100 words
- Each section should lead with the key point (inverted pyramid structure)
- Include specific Australian context: city, sector, or named trend
- Avoid vague generalisations — use concrete, citable claims
${toneLine}
${voiceLine}
${keywordsLine ? keywordsLine + '\n' : ''}- Always relate the content back to Artisan and the Australian creative/marketing/digital recruitment industry${advStyleLine}${advStructureLine}${advSeoLine}${advExtraLine}

After the article body, on a new line output exactly this JSON block (no markdown fences, no trailing comma):
{
  "excerpt": "<2-sentence summary of the article, max 160 chars>",
  "seoDescription": "<SEO meta description, max 155 chars>",
  "suggestedTags": ["tag1", "tag2", "tag3", "tag4", "tag5"]
}`;

    const response = await client.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      temperature: 0.65,
      max_tokens: 2500
    });

    const raw = response.choices[0].message.content.trim();

    // Split article body from the trailing JSON block
    const jsonMatch = raw.match(/\{[\s\S]*"excerpt"[\s\S]*\}\s*$/);
    let articleBody = raw;
    let meta = { excerpt: '', seoDescription: '', suggestedTags: [] };

    if (jsonMatch) {
      articleBody = raw.slice(0, raw.lastIndexOf(jsonMatch[0])).trim();
      try {
        meta = JSON.parse(jsonMatch[0]);
      } catch (e) {
        console.warn('Could not parse article meta JSON:', e.message);
      }
    }

    // Extract the first line as the title (strip any accidental # prefix)
    const lines = articleBody.split('\n').filter(l => l.trim());
    const title = lines[0].replace(/^#+\s*/, '').trim();
    const content = lines.slice(1).join('\n').trim();

    console.log(`Article generated: "${title}" (${content.length} chars)`);

    return {
      title,
      content,
      excerpt: meta.excerpt || '',
      seoDescription: meta.seoDescription || '',
      suggestedTags: meta.suggestedTags || []
    };
  }

  /**
   * Generate a header image for a blog article using DALL-E 3.
   * Downloads the image and returns the local file path.
   */
  async generateHeaderImage(articleTitle) {
    const client = this.getClient();
    if (!client) {
      throw new Error('OpenAI API key not configured. Cannot generate image.');
    }

    const axios = require('axios');
    const fs = require('fs');
    const path = require('path');
    const os = require('os');

    console.log(`\n🎨 Generating header image for: "${articleTitle}"`);

    const imagePrompt = `A professional, modern, high-quality blog header image for an Australian recruitment agency article titled: "${articleTitle}". 
The image should be clean, corporate, and visually striking. Use a colour palette of deep navy blue, white, and subtle gold accents. 
Abstract or conceptual style — no text, no people's faces. Suitable for a premium professional services brand. 16:9 landscape format.`;

    const response = await client.images.generate({
      model: 'dall-e-3',
      prompt: imagePrompt,
      n: 1,
      size: '1792x1024',
      quality: 'standard',
      response_format: 'url'
    });

    const imageUrl = response.data[0].url;
    console.log(`  🔗 Image URL received, downloading...`);

    // Download the image to a temp file
    const tmpDir = os.tmpdir();
    const safeTitle = articleTitle.replace(/[^a-z0-9]/gi, '_').toLowerCase().slice(0, 40);
    const localPath = path.join(tmpDir, `header_${safeTitle}_${Date.now()}.png`);

    const imageResponse = await axios.get(imageUrl, { responseType: 'arraybuffer' });
    fs.writeFileSync(localPath, imageResponse.data);

    console.log(`  ✅ Header image saved to: ${localPath}`);
    return localPath;
  }

  /**
   * Generate social media post copy for LinkedIn and Facebook/X
   * from an article title, excerpt, and URL.
   */
  async generateSocialPosts(articleTitle, excerpt, articleUrl) {
    const client = this.getClient();
    if (!client) {
      throw new Error('OpenAI API key not configured. Cannot generate social posts.');
    }

    console.log(`\n📱 Generating social posts for: "${articleTitle}"`);

    const prompt = `You are a social media manager for Artisan, a premium Australian recruitment agency. 
Create social media posts to promote the following blog article. Use Australian English spelling.

ARTICLE TITLE: ${articleTitle}
ARTICLE EXCERPT: ${excerpt}
ARTICLE URL: ${articleUrl}

Generate exactly this JSON (no markdown fences):
{
  "linkedin": "<LinkedIn post — professional tone, 150-250 words, include 3-5 relevant hashtags at the end>",
  "facebook": "<Facebook post — warm and engaging tone, 80-120 words, include 2-3 hashtags>",
  "twitter": "<X/Twitter post — punchy, max 250 chars including URL and 2 hashtags>"
}`;

    const response = await client.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.75,
      max_tokens: 800
    });

    const raw = response.choices[0].message.content.trim();
    try {
      const posts = JSON.parse(raw);
      console.log('✅ Social posts generated.');
      return posts;
    } catch (e) {
      console.warn('⚠️  Could not parse social posts JSON, returning raw.');
      return { linkedin: raw, facebook: raw, twitter: raw };
    }
  }
  /**
   * Generate a LinkedIn poll suggestion for Artisan's industry.
   * Returns { question, options: [string, string, ...], postCopy }
   * Options are always 2-4 items, no emojis, max 30 chars each.
   *
   * @param {string} prompt - Optional user prompt / topic hint
   * @returns {object} { question, options, postCopy }
   */
  async generatePollSuggestion(prompt = '') {
    const client = this.getClient();
    if (!client) throw new Error('OpenAI API key not configured.');

    const userHint = prompt.trim()
      ? `The user wants the poll to be about: ${prompt.trim()}`
      : 'Choose a topic that is relevant and timely for creative, digital, and marketing professionals in Australia.';

    const systemMsg = `You are a social media strategist for Artisan, a specialist Australian recruitment agency with 27 years of experience placing creative, digital, and marketing professionals.

You write LinkedIn polls that spark genuine professional conversation. Your polls:
- Ask a single, clear question that creative or marketing professionals have a real opinion on
- Use 2 to 4 options that are mutually exclusive and cover the realistic range of answers
- Never use emojis anywhere — not in the question, options, or post copy
- Keep each option to 30 characters or fewer (LinkedIn hard limit)
- Write post copy that gives context for the poll, invites participation, and sounds like a real person — not a brand announcement
- Use Australian English spelling throughout
- Post copy is 80-150 words, ends with a call to action like "Vote below" or "What do you think?"</p>`;

    const userMsg = `${userHint}

Generate a LinkedIn poll for Artisan. Return ONLY valid JSON (no markdown fences, no trailing commas):
{
  "question": "<poll question, max 140 chars>",
  "options": ["<option 1, max 30 chars>", "<option 2, max 30 chars>"],
  "postCopy": "<post copy, 80-150 words, no emojis, Australian English>"
}

You may include 3 or 4 options if the topic genuinely needs them. Never use emojis.`;

    const response = await client.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemMsg },
        { role: 'user', content: userMsg }
      ],
      temperature: 0.8,
      max_tokens: 500
    });

    const raw = response.choices[0].message.content.trim();
    try {
      const parsed = JSON.parse(raw);
      // Enforce 30-char limit on options (truncate if AI exceeded it)
      parsed.options = (parsed.options || []).map(o => String(o).substring(0, 30));
      return parsed;
    } catch (e) {
      throw new Error('AI returned invalid JSON for poll suggestion.');
    }
  }

  /**
   * Generate punchy LinkedIn job post copy from job details
   */
  async generateJobPost(job) {
    const client = this.getClient();
    if (!client) throw new Error('OpenAI API key not configured.');

    const meta = [
      job.location ? `Location: ${job.location}` : null,
      job.workType ? `Work type: ${job.workType}` : null,
      job.salary   ? `Salary: ${job.salary}`       : null,
    ].filter(Boolean).join('\n');

    const systemMsg = `You are a social media copywriter for Artisan, a specialist Australian recruitment agency placing creative, digital, and marketing professionals.

You write LinkedIn job posts that are:
- Short and punchy — 80 to 130 words maximum
- Written in second person ("you", "your") to speak directly to the candidate
- Highlight the most exciting parts of the role in 2-3 tight sentences
- Include a clear call to action at the end (e.g. "Apply now" or "Reach out to the Artisan team")
- End with the job URL on its own line so LinkedIn renders it as a link card
- No emojis anywhere
- No hashtags
- Australian English spelling
- No em-dashes
- Do not include the job title as a heading — weave it naturally into the copy`;

    const userMsg = `Write a LinkedIn job post for the following role:

Job title: ${job.title}
${meta}
${job.description ? `\nRole overview:\n${job.description}` : ''}
${job.jobUrl ? `\nJob URL: ${job.jobUrl}` : ''}

Return ONLY the post copy as plain text. No JSON, no markdown, no extra commentary.`;

    const response = await client.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemMsg },
        { role: 'user',   content: userMsg   }
      ],
      temperature: 0.75,
      max_tokens: 300
    });

    return response.choices[0].message.content.trim();
  }
}

module.exports = new AIService();

