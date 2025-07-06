# Browser Worker - Fast HTML Content Extractor

A high-performance Cloudflare Worker that uses browser rendering to extract HTML content from Single Page Applications (SPAs) and dynamic websites. Optimized with session reuse and intelligent caching for maximum speed.

## 🎯 Purpose

Many modern web applications (React, Vue, Angular) generate their content dynamically using JavaScript. This Worker solves the problem by:
- Using a real browser to render JavaScript-heavy pages completely
- Extracting the fully rendered HTML content
- Providing fast access through intelligent session reuse and caching
- Supporting both social media crawlers and API consumers

## 🚀 Features

- **⚡ High Performance** - Optimized session reuse and connection pooling for 3-5x faster startup
- **🧠 Smart Caching** - Intelligent session management with automatic cleanup
- **🌐 Full Browser Rendering** - Uses Puppeteer to execute JavaScript and render SPAs completely
- **📦 KV Caching** - Optional HTML content caching with configurable TTL
- **🛡️ Resource Optimization** - Blocks unnecessary resources (CSS, fonts, images) for faster loading
- **🔧 Error Handling** - Robust error handling with optimized timeouts
- **🌍 CORS Support** - Can be called from frontend applications

## 📋 Requirements

- Cloudflare Workers account
- Browser Rendering enabled (Puppeteer binding)
- Node.js compatibility flag enabled

## 🛠️ Installation

1. Clone this repository:
```bash
git clone https://github.com/7a6163/browser-worker.git
cd browser-worker
```

2. Install dependencies:
```bash
npm install
```

3. Configure your `wrangler.jsonc`:
```json
{
  "name": "browser-worker",
  "main": "src/index.ts",
  "compatibility_date": "2025-07-05",
  "compatibility_flags": ["nodejs_compat"],
  "browser": {
    "binding": "MYBROWSER"
  }
}
```

4. Deploy to Cloudflare Workers:
```bash
npm run deploy
```

## 🔧 Usage

### Basic Usage

The Worker uses a simple `/content/{url}` endpoint to extract HTML content:

```bash
# Extract HTML content from any URL
curl "https://your-worker.your-subdomain.workers.dev/content/https://example.com"

# For URLs with special characters, URL-encode them
curl "https://your-worker.your-subdomain.workers.dev/content/https%3A%2F%2Fexample.com%2Fpath%3Fquery%3Dvalue"
```

### Response Format

The Worker returns the fully rendered HTML content with proper headers:

```http
Content-Type: text/html;charset=UTF-8
Access-Control-Allow-Origin: *
```

### Error Handling

Invalid requests return JSON error responses:

```json
{
  "success": false,
  "error": "Invalid URL format",
  "url": "invalid-url"
}
```

### Local Development

```bash
# Start development server with remote browser support
npm run dev

# Or use wrangler directly
wrangler dev --remote
```

### Performance Optimizations

This Worker includes several performance optimizations:

- **Session Reuse**: Browser sessions are kept alive and reused across requests
- **Connection Pooling**: Maintains up to 5 concurrent sessions for optimal performance
- **Resource Blocking**: Automatically blocks CSS, fonts, and images for faster loading
- **Optimized Timeouts**: Reduced wait times while maintaining reliability
- **Intelligent Caching**: Sessions are cached for 30 minutes with automatic cleanup

## 📱 Integration Examples

### Social Media Crawlers

For social media platforms that need to crawl your SPA:

```bash
# Facebook, LINE, Twitter, etc. can access:
https://your-worker.your-subdomain.workers.dev/content/https://your-spa.com/article/123
```

### API Integration

Integrate with your applications:

```javascript
// Fetch rendered HTML content
const response = await fetch('https://your-worker.workers.dev/content/https://example.com');
const htmlContent = await response.text();

// Use the HTML content in your application
document.getElementById('content').innerHTML = htmlContent;
```

### Webhook/Automation

Use in automation workflows:

```bash
# Get rendered content for processing
curl "https://your-worker.workers.dev/content/https://news-site.com/article/123" \
  | grep -o '<meta property="og:title" content="[^"]*"' \
  | sed 's/.*content="\([^"]*\)".*/\1/'
```

## 🧪 Testing

### Local Testing

```bash
# Test HTML content extraction
curl "http://localhost:8787/content/https://github.com"

# Test with complex URLs
curl "http://localhost:8787/content/https://example.com/path?query=value"

# Test error handling
curl "http://localhost:8787/content/invalid-url"

# Test CORS preflight
curl -X OPTIONS "http://localhost:8787/content/https://github.com"
```

### Production Testing

```bash
# Test your deployed Worker
curl "https://your-worker.your-subdomain.workers.dev/content/https://github.com"

# Test with URL encoding
curl "https://your-worker.your-subdomain.workers.dev/content/https%3A%2F%2Fexample.com%2Fpath%3Fquery%3Dvalue"
```

### Performance Testing

```bash
# Test session reuse (run multiple times to see performance improvement)
time curl "https://your-worker.workers.dev/content/https://example.com"
time curl "https://your-worker.workers.dev/content/https://example.com"
time curl "https://your-worker.workers.dev/content/https://example.com"
```

## 📊 Response Format

### Successful Response

Returns the fully rendered HTML content:

```http
HTTP/1.1 200 OK
Content-Type: text/html;charset=UTF-8
Access-Control-Allow-Origin: *

<!DOCTYPE html>
<html>
<head>
  <meta property="og:title" content="Page Title">
  <meta property="og:description" content="Page Description">
  <!-- All dynamically generated content -->
</head>
<body>
  <!-- Fully rendered page content -->
</body>
</html>
```

### Error Response

```http
HTTP/1.1 400 Bad Request
Content-Type: application/json
Access-Control-Allow-Origin: *

{
  "success": false,
  "error": "Invalid URL format",
  "url": "invalid-url"
}
```
  <p><a href="https://example.com">Click here if you are not redirected automatically</a></p>
</body>
</html>
```

### JSON Response (Debug Mode)
```json
{
  "success": true,
  "url": "https://example.com",
  "sessionInfo": "Connected to session-id",
  "data": {
    "title": "Page Title",
    "description": "Page Description",
    "image": "https://example.com/image.jpg",
    "url": "https://example.com",
    "type": "website",
    "siteName": "Site Name",
    "locale": "en_US",
    "twitterCard": "summary_large_image",
    "twitterImage": "https://example.com/twitter-image.jpg",
    "twitterTitle": "Twitter Title",
    "twitterDescription": "Twitter Description"
  }
}
```

## ⚙️ Configuration

### Environment Variables

No environment variables are required. The Worker uses Cloudflare's Browser Rendering binding.

### Timeout Settings

- Page load timeout: 10 seconds
- Browser session reuse for better performance
- Automatic session cleanup

### Caching

- HTML responses are cached for 5 minutes
- Browser sessions are reused across requests
- Efficient resource management

## 🔍 Troubleshooting

### Common Issues

1. **"Browser Rendering is not supported locally"**
   - Use `wrangler dev --remote` instead of `wrangler dev`

2. **"Failed to load page: 4xx/5xx"**
   - Check if the target URL is accessible
   - Verify the URL format is correct

3. **"Evaluation failed: ReferenceError"**
   - This usually indicates a JavaScript execution error
   - Check the browser console for more details

### Debug Mode

Use `?format=json` to get detailed error information:

```bash
curl "https://your-worker.your-subdomain.workers.dev/?url=https://problematic-site.com&format=json"
```

## 📈 Performance

- **Cold Start**: ~2-3 seconds for new browser sessions
- **Warm Requests**: ~500ms-1s when reusing sessions
- **Memory Usage**: Optimized with automatic session cleanup
- **Concurrent Requests**: Handles multiple requests efficiently

## 🔒 Security

- Input URL validation and normalization
- Timeout protection against slow-loading pages
- Automatic browser session cleanup
- No sensitive data storage

## 📄 License

This project is licensed under the MIT License.

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## 📞 Support

For issues and questions:
- Check the troubleshooting section
- Review Cloudflare Workers documentation
- Open an issue in this repository

---

**Version**: 1.0.0
**Last Updated**: 2025-07-05
**Cloudflare Workers**: Compatible
**Browser Rendering**: Required
