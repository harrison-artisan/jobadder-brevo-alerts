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
        prompt = `Rewrite this candidate bio into a compelling 3-4 sentence professional summary for a recruitment email.

CANDIDATE INFO:
Job Title: ${title || 'Professional'}
Experience: ${expText}
Skills: ${skills || 'various professional skills'}
Bio: ${bio.substring(0, 600)}

REQUIREMENTS:
- Write EXACTLY 3-4 sentences (MAX 300 characters total)
- Remove ALL names (first names, last names, any proper names)
- Remove ALL company names and business names - do not mention any companies at all
- Use gender-neutral language (they/their/them instead of he/she/his/her)
- Use Australian spelling: specialising, recognised, organised, analyse, realise
- Use Title Case for job titles (e.g., "Senior Designer" not "senior designer")
- Make it compelling and exciting - sell this candidate!
- Focus on achievements, skills, and impact from their bio
- Keep the real content from their bio, just clean it up
- Vary the opening - don't always start with "A [title] with..."
- No grammar errors, no business names, no overly specific language

OUTPUT ONLY THE SUMMARY - NO EXPLANATIONS OR EXTRA TEXT.`;
      } else {
        // Prompt for candidates WITHOUT a bio - build from available data
        prompt = `Create a compelling 3-4 sentence professional summary for this candidate for a recruitment email.

CANDIDATE INFO:
Job Title: ${title || 'Professional'}
Experience: ${expText}
Skills: ${skills || 'various professional skills'}
Work History: ${workHistory || 'diverse professional background'}

REQUIREMENTS:
- Write EXACTLY 3-4 sentences (MAX 300 characters total)
- Use the job title, experience, and skills to create a compelling narrative
- Make them sound amazing and professional - sell this candidate!
- Use gender-neutral language (they/their/them)
- Use Australian spelling: specialising, recognised, organised, analyse, realise
- Use Title Case for job titles (e.g., "Senior Designer" not "senior designer")
- Focus on their expertise, capabilities, and professional strengths
- Vary the opening - don't always start with "A [title] with..."
- No grammar errors, no business names, no overly specific language
- Create a unique summary that stands out

OUTPUT ONLY THE SUMMARY - NO EXPLANATIONS OR EXTRA TEXT.`;
      }

      console.log(`    🤖 Generating with OpenAI (gpt-4o-mini)...`);
      
      const response = await client.chat.completions.create({
        model: 'gpt-4o-mini',
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
      console.log(`\n🤖 Generating AI summaries for ${candidates.length} candidates using OpenAI...`);
    }
    
    const summaries = await Promise.all(
      candidates.map(candidate => this.generateCandidateSummary(candidate))
    );
    
    console.log('✅ All summaries generated\n');
    
    return summaries;
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

Your writing style is modelled on Artisan's Creative Community blog (artisan.com.au/creative-community). Key characteristics:
- Sentences are short, punchy, and declarative. Paragraphs rarely exceed 3 sentences.
- You open articles with a bold, direct statement that challenges conventional thinking or names a real tension in the industry.
- You use subheadings that are statements or observations, not generic labels (e.g. "Why Risk Taking Feels Harder Right Now" not "Challenges").
- You write in plain, confident Australian English — no buzzwords, no filler phrases, no exclamation marks, no emojis.
- You always bring the article back to Artisan's role: connecting creative and marketing talent with the right opportunities and organisations.
- You use Australian English spelling throughout: specialise, recognise, organisation, behaviour, labour, colour, centre.
- You NEVER use emojis anywhere in the article.
- You NEVER use em-dashes (—) or horizontal rules (---) anywhere in the article.
- You NEVER use phrases like "In today's fast-paced world" or "In conclusion" or "It goes without saying".
- Bullet point lists are acceptable when presenting a set of items, steps, or comparisons that are genuinely clearer as a list than as prose. Default to paragraphs; use lists only when they add clarity. When you do use bullets, expand each point with a follow-on sentence of explanation — never leave a bullet as a bare label.
- Every article ends with a "Where Artisan Comes In" or similar section that ties the topic back to Artisan's services.`;

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
- H1 title: compelling, specific, and direct (output as plain text on the first line — no # prefix)
- H2 headings (##): 4 to 6 main sections — write these as observations or statements, not generic labels
- H3 subheadings (###): use sparingly, only when a section genuinely needs a sub-division
- Opening paragraph: 2–3 sentences that immediately name the tension or challenge — no preamble
- Each section: 2–4 short paragraphs, each 1–3 sentences. Short sentences. Direct language.
- Final section: titled "Where Artisan Comes In" — tie the topic back to how Artisan helps creatives or employers
- Length: 750–1000 words total

STYLE REQUIREMENTS:
- Use Australian English spelling throughout
- No emojis anywhere
- No exclamation marks
- No filler phrases ("In today's world", "It's no secret", "It goes without saying", "In conclusion")
- No passive voice where active voice is possible
- Default to full paragraphs; use bullet point lists only when presenting items, steps, or comparisons that are genuinely clearer as a list

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
}

module.exports = new AIService();

