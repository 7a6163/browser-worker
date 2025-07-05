import puppeteer from "@cloudflare/puppeteer";

interface Env {
  MYBROWSER: Fetcher;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    let reqUrl = url.searchParams.get("url") || "https://example.com";
    reqUrl = new URL(reqUrl).toString(); // normalize

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

  <!-- Redirect to original URL after a short delay -->
  <meta http-equiv="refresh" content="0;url=${reqUrl}">
</head>
<body>
  <h1>${ogData.title || 'Loading...'}</h1>
  <p>${ogData.description || 'Redirecting to original page...'}</p>
  <p><a href="${reqUrl}">Click here if you are not redirected automatically</a></p>

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
