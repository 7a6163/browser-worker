import puppeteer from "@cloudflare/puppeteer";

// Global session cache to reuse across requests
const sessionCache = new Map<string, { sessionId: string; lastUsed: number; inUse: boolean }>();
const SESSION_TIMEOUT = 30 * 60 * 1000; // 30 minutes
const MAX_SESSIONS = 5; // Maximum concurrent sessions to maintain

// Default User-Agent for browser requests
const DEFAULT_USER_AGENT = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

interface Env {
  MYBROWSER: Fetcher;
  HTML_CACHE?: KVNamespace; // Optional KV store for caching HTML content
  CUSTOM_USER_AGENT?: string; // Optional custom User-Agent string
}

interface SessionInfo {
  sessionId: string;
  lastUsed: number;
  inUse: boolean;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // Handle CORS preflight requests
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          "access-control-allow-origin": "*",
          "access-control-allow-methods": "GET, OPTIONS",
          "access-control-allow-headers": "Content-Type",
        },
      });
    }

    // Handle GET requests to /content/{target_url}
    if (request.method === 'GET' && url.pathname.startsWith('/content/')) {
      // Extract the target URL from the path
      const targetUrl = url.pathname.substring('/content/'.length);

      if (!targetUrl) {
        return new Response(
          JSON.stringify({
            success: false,
            error: "Missing target URL in path. Usage: /content/https://example.com",
          }),
          {
            status: 400,
            headers: {
              "content-type": "application/json",
              "access-control-allow-origin": "*",
            },
          },
        );
      }

      let reqUrl: string;
      try {
        // Decode the URL in case it's URL-encoded
        reqUrl = decodeURIComponent(targetUrl);
        // Validate and normalize the URL
        reqUrl = new URL(reqUrl).toString();
      } catch (error) {
        return new Response(
          JSON.stringify({
            success: false,
            error: "Invalid URL format",
          }),
          {
            status: 400,
            headers: {
              "content-type": "application/json",
              "access-control-allow-origin": "*",
            },
          },
        );
      }

      // Generate cache key based on URL
      const cacheKey = `html:${btoa(reqUrl).replace(/[^a-zA-Z0-9]/g, '')}`;

      // Check cache first (if KV is available)
      if (env.HTML_CACHE) {
        try {
          const cached = await env.HTML_CACHE.get(cacheKey);
          if (cached) {
            console.log(`Cache hit for ${reqUrl}`);
            return new Response(cached, {
              headers: {
                "content-type": "text/html;charset=UTF-8",
                "access-control-allow-origin": "*",
                "cache-control": "public, max-age=3600", // 1 hour for cached data
              },
            });
          }
        } catch (e) {
          console.log(`Cache read error: ${e}`);
        }
      }

      let browser;
      let sessionId;
      let launched = false;
      let sessionInfo: SessionInfo | null = null;

      try {
        const endpoint = env.MYBROWSER;

        // Try to get an existing session first
        sessionInfo = await this.getOptimalSession(endpoint);

        if (sessionInfo) {
          sessionId = sessionInfo.sessionId;
          try {
            browser = await puppeteer.connect(endpoint, sessionId);
            console.log(`Successfully reused session: ${sessionId}`);
          } catch (connectError) {
            console.log(`Failed to connect to session ${sessionId}: ${connectError}`);
            // Remove invalid session from cache
            sessionCache.delete(sessionId);
            sessionInfo = null;

            // Fall back to launching new browser
            browser = await puppeteer.launch(endpoint);
            launched = true;
            console.log('Launched new browser session after connection failure');
          }
        } else {
          // Launch new browser if no session available
          browser = await puppeteer.launch(endpoint);
          launched = true;
          console.log('Launched new browser session');
        }

        const page = await browser.newPage();

        // Set User-Agent (from env var or default)
        const userAgent = env.CUSTOM_USER_AGENT || DEFAULT_USER_AGENT;
        await page.setUserAgent(userAgent);
        console.log(`Using User-Agent: ${userAgent}`);

        // Optimize page loading by blocking unnecessary resources
        await page.setRequestInterception(true);
        page.on('request', (req) => {
          const resourceType = req.resourceType();
          const url = req.url();

          // Block CSS, fonts, images, and other static resources for faster loading
          if (['stylesheet', 'font', 'image', 'media', 'other'].includes(resourceType)) {
            req.abort();
          } else {
            req.continue();
          }
        });

        // Navigate with optimized settings
        await page.goto(reqUrl, {
          waitUntil: 'domcontentloaded', // Faster than networkidle0
          timeout: 15000 // Reduced timeout
        });

        // Wait for meta tags to be rendered (shorter wait)
        await new Promise(resolve => setTimeout(resolve, 1000));

        // Get the full HTML content after rendering
        const htmlContent = await page.content();

        // Close the page but keep session alive for reuse
        await page.close();

        // Don't disconnect if we're reusing the session
        if (launched) {
          // For new sessions, keep them alive for reuse
          const newSessionId = (browser as any).sessionId;
          if (newSessionId) {
            sessionCache.set(newSessionId, {
              sessionId: newSessionId,
              lastUsed: Date.now(),
              inUse: false
            });
          }
          browser.disconnect();
        } else if (sessionInfo) {
          // Mark session as available for reuse
          sessionInfo.inUse = false;
          sessionInfo.lastUsed = Date.now();
        }

        // Cache the HTML content (if KV is available)
        if (env.HTML_CACHE) {
          try {
            await env.HTML_CACHE.put(cacheKey, htmlContent, {
              expirationTtl: 3600, // Cache for 1 hour
            });
            console.log(`Cached HTML for ${reqUrl}`);
          } catch (e) {
            console.log(`Cache write error: ${e}`);
          }
        }

        // Return the raw HTML content
        return new Response(htmlContent, {
          headers: {
            "content-type": "text/html;charset=UTF-8",
            "access-control-allow-origin": "*",
          },
        });
      } catch (error) {
        console.error(`Error processing request for ${reqUrl}:`, error);

        // Make sure to handle browser cleanup on error
        if (browser) {
          try {
            if (sessionInfo) {
              // If this was a session connection error, remove it from cache
              if (error instanceof Error && error.message.includes('Cannot read properties of null')) {
                console.log(`Removing invalid session from cache: ${sessionInfo.sessionId}`);
                sessionCache.delete(sessionInfo.sessionId);
              } else {
                // Mark session as available again for other errors
                sessionInfo.inUse = false;
              }
            }
            if (launched) {
              browser.disconnect();
            }
          } catch (cleanupError) {
            console.error('Error during cleanup:', cleanupError);
          }
        }

        return new Response(
          JSON.stringify({
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
            url: reqUrl,
            timestamp: new Date().toISOString(),
          }),
          {
            status: 500,
            headers: {
              "content-type": "application/json",
              "access-control-allow-origin": "*",
            },
          },
        );
      }
    } else {
      // Handle static resource requests (CSS, JS, images, etc.) that browsers automatically request
      console.log(`Static resource request: ${request.method} ${url.pathname}`);

      if (request.method === 'GET') {
        // Check for common static resource patterns
        const isStaticResource =
          url.pathname.match(/\.(css|js|png|jpg|jpeg|gif|svg|ico|woff|woff2|ttf|eot|webp|avif)$/i) ||
          url.pathname.startsWith('/media/') ||
          url.pathname.startsWith('/assets/') ||
          url.pathname.startsWith('/static/') ||
          url.pathname.startsWith('/images/') ||
          url.pathname.startsWith('/css/') ||
          url.pathname.startsWith('/js/') ||
          url.pathname.includes('favicon');

        if (isStaticResource) {
          console.log(`Blocking static resource: ${url.pathname}`);
          // Return 204 No Content for static resources to avoid 405 errors in logs
          return new Response(null, {
            status: 204,
            headers: {
              "access-control-allow-origin": "*",
              "cache-control": "no-cache",
            },
          });
        }
      }

      // For other requests, return method not allowed
      console.log(`Method not allowed: ${request.method} ${url.pathname}`);
      return new Response(
        JSON.stringify({
          success: false,
          error: "Only GET requests to /content/{target_url} are supported",
          path: url.pathname,
          method: request.method,
        }),
        {
          status: 405,
          headers: {
            "content-type": "application/json",
            "access-control-allow-origin": "*",
          },
        },
      );
    }
  },

  // Get optimal session with improved caching and management
  async getOptimalSession(endpoint: any): Promise<SessionInfo | null> {
    // Clean up expired sessions from cache
    const now = Date.now();
    for (const [sessionId, info] of sessionCache.entries()) {
      if (now - info.lastUsed > SESSION_TIMEOUT) {
        console.log(`Removing expired session: ${sessionId}`);
        sessionCache.delete(sessionId);
      }
    }

    // Get current sessions from Cloudflare to validate our cache
    let activeSessions: any[] = [];
    try {
      activeSessions = await puppeteer.sessions(endpoint);
      console.log(`Available sessions from Cloudflare: ${activeSessions.length}`);
    } catch (error) {
      console.log(`Error getting sessions from Cloudflare: ${error}`);
      return null;
    }

    // Create a set of active session IDs for quick lookup
    const activeSessionIds = new Set(activeSessions.map(s => s.sessionId));

    // Remove cached sessions that are no longer active
    for (const [sessionId, info] of sessionCache.entries()) {
      if (!activeSessionIds.has(sessionId)) {
        console.log(`Removing stale session from cache: ${sessionId}`);
        sessionCache.delete(sessionId);
      }
    }

    // Try to find an available cached session that's still active
    for (const [sessionId, info] of sessionCache.entries()) {
      if (!info.inUse && activeSessionIds.has(sessionId)) {
        const activeSession = activeSessions.find(s => s.sessionId === sessionId);
        // Only use sessions that are not connected to avoid conflicts
        if (activeSession && !activeSession.connectionId) {
          info.inUse = true;
          info.lastUsed = now;
          console.log(`Found available cached session: ${sessionId}`);
          return info;
        }
      }
    }

    // If no cached session available, find a new available session
    const availableSessions = activeSessions.filter((v) => {
      return !v.connectionId && !sessionCache.has(v.sessionId);
    });

    if (availableSessions.length > 0) {
      // Pick the most recently created session for better performance
      const selectedSession = availableSessions[0];
      const sessionInfo: SessionInfo = {
        sessionId: selectedSession.sessionId,
        lastUsed: now,
        inUse: true
      };

      sessionCache.set(selectedSession.sessionId, sessionInfo);
      console.log(`Selected new session: ${selectedSession.sessionId}`);
      return sessionInfo;
    }

    console.log('No available sessions found');
    return null;
  },

  // Warm up sessions for better performance
  async warmupSessions(endpoint: any): Promise<void> {
    if (sessionCache.size >= MAX_SESSIONS) {
      return;
    }

    try {
      const browser = await puppeteer.launch(endpoint);
      const sessionId = (browser as any).sessionId;

      if (sessionId) {
        sessionCache.set(sessionId, {
          sessionId,
          lastUsed: Date.now(),
          inUse: false
        });
        console.log(`Warmed up session: ${sessionId}`);
      }

      browser.disconnect();
    } catch (error) {
      console.log(`Session warmup failed: ${error}`);
    }
  },
};
