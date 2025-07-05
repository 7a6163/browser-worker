import puppeteer from "@cloudflare/puppeteer";

interface Env {
  MYBROWSER: Fetcher;
  OG_CACHE?: KVNamespace; // Optional KV store for caching OG data
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    let reqUrl = url.searchParams.get("url") || "https://example.com";
    reqUrl = new URL(reqUrl).toString(); // normalize

    // Generate cache key based on URL
    const cacheKey = `og:${btoa(reqUrl).replace(/[^a-zA-Z0-9]/g, '')}`;

    // Check cache first (if KV is available)
    let cachedData = null;
    if (env.OG_CACHE) {
      try {
        const cached = await env.OG_CACHE.get(cacheKey);
        if (cached) {
          cachedData = JSON.parse(cached);
          console.log(`Cache hit for ${reqUrl}`);
        }
      } catch (e) {
        console.log(`Cache read error: ${e}`);
      }
    }

    // If we have cached data, use it
    if (cachedData) {
      const acceptHeader = request.headers.get('accept') || '';
      const wantsJson = acceptHeader.includes('application/json') || url.searchParams.get('format') === 'json';

      if (wantsJson) {
        return new Response(
          JSON.stringify({
            success: true,
            url: reqUrl,
            sessionInfo: "From cache",
            data: cachedData,
            cached: true
          }, null, 2),
          {
            headers: {
              "content-type": "application/json",
              "access-control-allow-origin": "*",
              "cache-control": "public, max-age=3600", // 1 hour for cached data
            },
          },
        );
      } else {
        const htmlContent = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>${cachedData.title || 'Page Title'}</title>

  <!-- Open Graph meta tags -->
  <meta property="og:title" content="${cachedData.title || ''}">
  <meta property="og:description" content="${cachedData.description || ''}">
  <meta property="og:image" content="${cachedData.image || ''}">
  <meta property="og:url" content="${cachedData.url || reqUrl}">
  <meta property="og:type" content="${cachedData.type || 'website'}">
  ${cachedData.siteName ? `<meta property="og:site_name" content="${cachedData.siteName}">` : ''}
  ${cachedData.locale ? `<meta property="og:locale" content="${cachedData.locale}">` : ''}

  <!-- Twitter Card meta tags -->
  ${cachedData.twitterCard ? `<meta name="twitter:card" content="${cachedData.twitterCard}">` : ''}
  ${cachedData.twitterImage ? `<meta name="twitter:image" content="${cachedData.twitterImage}">` : ''}
  ${cachedData.twitterTitle ? `<meta name="twitter:title" content="${cachedData.twitterTitle}">` : ''}
  ${cachedData.twitterDescription ? `<meta name="twitter:description" content="${cachedData.twitterDescription}">` : ''}

  <!-- Standard meta tags -->
  <meta name="description" content="${cachedData.description || ''}">

  <!-- No redirect needed for crawlers -->
</head>
<body>
  <h1>${cachedData.title || 'Loading...'}</h1>
  <p>${cachedData.description || 'Open Graph data loaded from cache'}</p>

  <!-- Debug info (hidden) -->
  <!-- Cached data -->
</body>
</html>`;
        return new Response(htmlContent, {
          headers: {
            "content-type": "text/html;charset=UTF-8",
            "cache-control": "public, max-age=3600", // 1 hour for cached data
          },
        });
      }
    }

    // No cache hit, proceed with browser rendering
    // Pick random session from open sessions
    let sessionId = await this.getRandomSession(env.MYBROWSER);
    let browser, launched;
    if (sessionId) {
      try {
        browser = await puppeteer.connect(env.MYBROWSER, sessionId);
      } catch (e) {
        // another worker may have connected first
        console.log(`Failed to connect to ${sessionId}. Error ${e}`);
      }
    }
    if (!browser) {
      // No open sessions, launch new session
      browser = await puppeteer.launch(env.MYBROWSER);
      launched = true;
    }

    sessionId = browser.sessionId(); // get current session id

    // Do your work here
    const page = await browser.newPage();

    try {
      // Set timeout and wait for page to load
      await page.setDefaultTimeout(10000);
      const response = await page.goto(reqUrl, { waitUntil: 'domcontentloaded' });

      if (!response) {
        throw new Error('Failed to load page: No response received');
      }

      // Accept 2xx and 3xx status codes (including 304 Not Modified)
      const status = response.status();
      if (status >= 400) {
        throw new Error(`Failed to load page: ${status}`);
      }

      // Extract Open Graph meta data using a simple approach
      const ogData: any = await page.evaluate(`
        (function() {
          const result = {};

          // Helper function to get meta content
          const getMeta = function(prop) {
            const el = document.querySelector('meta[property="' + prop + '"]') ||
                       document.querySelector('meta[name="' + prop + '"]');
            return el ? el.getAttribute('content') : null;
          };

          // Extract OG data
          result.title = getMeta('og:title') || document.title || null;
          result.description = getMeta('og:description') || getMeta('description') || null;
          result.image = getMeta('og:image') || null;
          result.url = getMeta('og:url') || window.location.href;
          result.type = getMeta('og:type') || 'website';
          result.siteName = getMeta('og:site_name') || null;
          result.locale = getMeta('og:locale') || null;

          // Twitter meta data
          result.twitterCard = getMeta('twitter:card') || null;
          result.twitterImage = getMeta('twitter:image') || null;
          result.twitterTitle = getMeta('twitter:title') || null;
          result.twitterDescription = getMeta('twitter:description') || null;

          return result;
        })()
      `);

      // All work done, so free connection (IMPORTANT!)
      browser.disconnect();

      // Cache the extracted OG data (if KV is available)
      if (env.OG_CACHE) {
        try {
          await env.OG_CACHE.put(cacheKey, JSON.stringify(ogData), {
            expirationTtl: 3600, // Cache for 1 hour
          });
          console.log(`Cached OG data for ${reqUrl}`);
        } catch (e) {
          console.log(`Cache write error: ${e}`);
        }
      }

      // Check if request wants JSON (for debugging) or HTML (for Facebook)
      const acceptHeader = request.headers.get('accept') || '';
      const wantsJson = acceptHeader.includes('application/json') || url.searchParams.get('format') === 'json';

      if (wantsJson) {
        // Return JSON for debugging/API usage
        return new Response(
          JSON.stringify({
            success: true,
            url: reqUrl,
            sessionInfo: `${launched ? "Launched" : "Connected to"} ${sessionId}`,
            data: ogData
          }, null, 2),
          {
            headers: {
              "content-type": "application/json",
              "access-control-allow-origin": "*",
              "access-control-allow-methods": "GET, POST, OPTIONS",
              "access-control-allow-headers": "Content-Type",
            },
          },
        );
      } else {
        // Return HTML with OG meta tags for Facebook crawler
        const htmlContent = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>${ogData.title || 'Page Title'}</title>

  <!-- Open Graph meta tags -->
  <meta property="og:title" content="${ogData.title || ''}">
  <meta property="og:description" content="${ogData.description || ''}">
  <meta property="og:image" content="${ogData.image || ''}">
  <meta property="og:url" content="${ogData.url || reqUrl}">
  <meta property="og:type" content="${ogData.type || 'website'}">
  ${ogData.siteName ? `<meta property="og:site_name" content="${ogData.siteName}">` : ''}
  ${ogData.locale ? `<meta property="og:locale" content="${ogData.locale}">` : ''}

  <!-- Twitter Card meta tags -->
  ${ogData.twitterCard ? `<meta name="twitter:card" content="${ogData.twitterCard}">` : ''}
  ${ogData.twitterImage ? `<meta name="twitter:image" content="${ogData.twitterImage}">` : ''}
  ${ogData.twitterTitle ? `<meta name="twitter:title" content="${ogData.twitterTitle}">` : ''}
  ${ogData.twitterDescription ? `<meta name="twitter:description" content="${ogData.twitterDescription}">` : ''}

  <!-- Standard meta tags -->
  <meta name="description" content="${ogData.description || ''}">

  <!-- No redirect needed for crawlers -->
</head>
<body>
  <h1>${ogData.title || 'Loading...'}</h1>
  <p>${ogData.description || 'Open Graph data extracted successfully'}</p>

  <!-- Debug info (hidden) -->
  <!-- Session: ${sessionId} -->
</body>
</html>`;

        return new Response(htmlContent, {
          headers: {
            "content-type": "text/html;charset=UTF-8",
            "cache-control": "public, max-age=300", // Cache for 5 minutes
          },
        });
      }
    } catch (error) {
      // Make sure to disconnect browser even on error
      browser.disconnect();

      return new Response(
        JSON.stringify({
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
          url: reqUrl,
          sessionInfo: `${launched ? "Launched" : "Connected to"} ${sessionId}`,
        }, null, 2),
        {
          status: 500,
          headers: {
            "content-type": "application/json",
            "access-control-allow-origin": "*",
          },
        },
      );
    }
  },

  // Pick random free session
  // Other custom logic could be used instead
  async getRandomSession(endpoint: puppeteer.BrowserWorker): Promise<string | undefined> {
    const sessions: puppeteer.ActiveSession[] =
      await puppeteer.sessions(endpoint);
    console.log(`Sessions: ${JSON.stringify(sessions)}`);
    const sessionsIds = sessions
      .filter((v) => {
        return !v.connectionId; // remove sessions with workers connected to them
      })
      .map((v) => {
        return v.sessionId;
      });
    if (sessionsIds.length === 0) {
      return;
    }

    const sessionId =
      sessionsIds[Math.floor(Math.random() * sessionsIds.length)];

    return sessionId!;
  },
};
