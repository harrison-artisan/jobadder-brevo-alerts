/**
 * Instagram Service
 *
 * Manages Instagram session cookies and provides authenticated scraping
 * of post images and captions.
 *
 * Cookie storage: .instagram-session.json (gitignored)
 * Scraping approach: Uses stored sessionid cookie with Instagram's
 * internal API (?__a=1) to fetch post JSON data.
 */

const fs = require('fs');
const path = require('path');
const https = require('https');

const SESSION_FILE = path.join(__dirname, '..', '.instagram-session.json');

// ============================================================
// Cookie Storage
// ============================================================

function loadSession() {
    try {
        if (!fs.existsSync(SESSION_FILE)) return null;
        const data = JSON.parse(fs.readFileSync(SESSION_FILE, 'utf8'));
        if (!data || !data.sessionid) return null;
        return data;
    } catch (e) {
        return null;
    }
}

function saveSession(cookies) {
    try {
        const session = {
            sessionid:  cookies.sessionid  || '',
            csrftoken:  cookies.csrftoken  || '',
            ds_user_id: cookies.ds_user_id || '',
            username:   cookies.username   || '',
            saved_at:   new Date().toISOString()
        };
        fs.writeFileSync(SESSION_FILE, JSON.stringify(session, null, 2), 'utf8');
        return session;
    } catch (e) {
        throw new Error('Failed to save Instagram session: ' + e.message);
    }
}

function clearSession() {
    try {
        if (fs.existsSync(SESSION_FILE)) fs.unlinkSync(SESSION_FILE);
    } catch (e) { /* ignore */ }
}

function getStatus() {
    const session = loadSession();
    if (!session) {
        return { connected: false, status: 'disconnected', username: null, saved_at: null };
    }
    const savedAt = new Date(session.saved_at);
    const ageMs = Date.now() - savedAt.getTime();
    const ageDays = Math.floor(ageMs / (1000 * 60 * 60 * 24));
    // Instagram sessions typically last 90 days
    const expiringSoon = ageDays > 75;
    const expired = ageDays > 90;
    return {
        connected: !expired,
        status: expired ? 'expired' : (expiringSoon ? 'expiring' : 'connected'),
        username: session.username || null,
        saved_at: session.saved_at,
        age_days: ageDays,
        expiring_soon: expiringSoon,
        expired
    };
}

// ============================================================
// Authenticated HTTP fetch helper
// ============================================================

function igFetch(url, session) {
    return new Promise((resolve, reject) => {
        const cookieStr = [
            session.sessionid ? `sessionid=${session.sessionid}` : '',
            session.csrftoken ? `csrftoken=${session.csrftoken}` : '',
            session.ds_user_id ? `ds_user_id=${session.ds_user_id}` : ''
        ].filter(Boolean).join('; ');

        const options = {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                'Accept-Language': 'en-US,en;q=0.9',
                'Cookie': cookieStr,
                'X-IG-App-ID': '936619743392459',
                'Referer': 'https://www.instagram.com/'
            }
        };

        const req = https.get(url, options, (res) => {
            if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                return igFetch(res.headers.location, session).then(resolve).catch(reject);
            }
            let data = '';
            res.on('data', chunk => { data += chunk; if (data.length > 500000) req.destroy(); });
            res.on('end', () => resolve({ status: res.statusCode, body: data, headers: res.headers }));
        });
        req.on('error', reject);
        req.setTimeout(12000, () => { req.destroy(); reject(new Error('Instagram fetch timed out')); });
    });
}

// ============================================================
// Verify session is valid by fetching the user's own profile
// ============================================================

async function verifySession(session) {
    try {
        const result = await igFetch('https://www.instagram.com/accounts/edit/?__a=1', session);
        if (result.status === 200) {
            try {
                const json = JSON.parse(result.body);
                const username = (json.form_data && json.form_data.username) ||
                                 (json.data && json.data.user && json.data.user.username) || '';
                return { valid: true, username };
            } catch (e) {
                // Even if JSON parse fails, a 200 means we're logged in
                return { valid: true, username: session.username || '' };
            }
        }
        // Try the graphql endpoint as a fallback check
        const r2 = await igFetch('https://www.instagram.com/?__a=1', session);
        if (r2.status === 200 && r2.body.includes('"is_logged_in":true')) {
            return { valid: true, username: session.username || '' };
        }
        return { valid: false, username: '' };
    } catch (e) {
        return { valid: false, username: '' };
    }
}

// ============================================================
// Scrape Instagram post data using session cookies
// ============================================================

async function scrapePost(postUrl) {
    const session = loadSession();
    if (!session) {
        console.log('ℹ️  No Instagram session stored — skipping authenticated scrape');
        return { imageUrl: '', caption: '', handle: '', error: 'no_session' };
    }

    // Extract shortcode from URL
    // Handles: /p/SHORTCODE/, /reel/SHORTCODE/, /tv/SHORTCODE/
    const shortcodeMatch = postUrl.match(/\/(p|reel|tv)\/([A-Za-z0-9_-]+)/);
    if (!shortcodeMatch) {
        return { imageUrl: '', caption: '', handle: '', error: 'invalid_url' };
    }
    const shortcode = shortcodeMatch[2];

    console.log(`📸 Instagram authenticated scrape: shortcode=${shortcode}`);

    // Strategy 1: Internal API with ?__a=1 (works when logged in)
    try {
        const apiUrl = `https://www.instagram.com/p/${shortcode}/?__a=1&__d=dis`;
        const result = await igFetch(apiUrl, session);
        if (result.status === 200 && result.body.includes('"graphql"')) {
            const json = JSON.parse(result.body);
            const media = json.graphql && json.graphql.shortcode_media;
            if (media) {
                const imageUrl = media.display_url || '';
                const captionEdges = media.edge_media_to_caption &&
                                     media.edge_media_to_caption.edges || [];
                const caption = captionEdges.length > 0 ?
                    (captionEdges[0].node && captionEdges[0].node.text || '') : '';
                const handle = media.owner && media.owner.username || '';
                console.log(`✅ Instagram scrape success (graphql): image=${imageUrl ? 'yes' : 'no'}, handle=@${handle}`);
                return { imageUrl, caption, handle };
            }
        }
    } catch (e) {
        console.warn('⚠️  Instagram ?__a=1 scrape failed:', e.message);
    }

    // Strategy 2: OG tags from the post page (with session cookies)
    try {
        const result = await igFetch(`https://www.instagram.com/p/${shortcode}/`, session);
        if (result.status === 200) {
            const html = result.body;
            const decode = s => s ? s.replace(/&amp;/g,'&').replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/&lt;/g,'<').replace(/&gt;/g,'>') : '';

            // Try OG tags
            const ogImage = (html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i) ||
                             html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i) || [])[1];
            const ogDesc  = (html.match(/<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)["']/i) ||
                             html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:description["']/i) || [])[1];
            const ogTitle = (html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i) ||
                             html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:title["']/i) || [])[1];

            // Try JSON data in the page
            const displayUrlMatch = html.match(/"display_url":"(https?:[^"]+)"/);
            const captionMatch = html.match(/"edge_media_to_caption":\{"edges":\[\{"node":\{"text":"([^"]+)"/);
            const usernameMatch = html.match(/"owner":\{"[^}]*"username":"([^"]+)"/);

            const imageUrl = decode(displayUrlMatch ? displayUrlMatch[1].replace(/\\u0026/g,'&') : (ogImage || ''));
            let caption = decode(captionMatch ? captionMatch[1] : (ogDesc || ''));
            // OG description format: 'username: "caption text"'
            const captionExtract = caption.match(/:\s*"(.+)"\s*$/);
            if (captionExtract) caption = captionExtract[1];

            let handle = decode(usernameMatch ? usernameMatch[1] : '');
            if (!handle && ogTitle) {
                const handleMatch = ogTitle.match(/^([^:]+) on Instagram/);
                if (handleMatch) handle = handleMatch[1].trim();
            }

            if (imageUrl || caption) {
                console.log(`✅ Instagram scrape success (OG/JSON): image=${imageUrl ? 'yes' : 'no'}, handle=@${handle}`);
                return { imageUrl, caption, handle };
            }
        }
    } catch (e) {
        console.warn('⚠️  Instagram OG scrape failed:', e.message);
    }

    console.warn('⚠️  Instagram scrape: all strategies failed');
    return { imageUrl: '', caption: '', handle: '', error: 'scrape_failed' };
}

module.exports = {
    loadSession,
    saveSession,
    clearSession,
    getStatus,
    verifySession,
    scrapePost
};
