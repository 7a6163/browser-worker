# Browser Worker - Open Graph Meta Data Extractor

A Cloudflare Worker that uses browser rendering to extract Open Graph (OG) meta data from Single Page Applications (SPAs) for social media sharing on Facebook, LINE, and other platforms.

## 🎯 Purpose

Many modern web applications (React, Vue, Angular) generate their Open Graph meta tags dynamically using JavaScript. Social media crawlers like Facebook and LINE cannot execute JavaScript, so they can't see the proper meta data for sharing previews.

This Worker solves that problem by:
- Using a real browser to render the page completely
- Extracting the dynamically generated OG meta data
- Returning it in a format that social media crawlers can understand

## 🚀 Features

- **Full Browser Rendering** - Uses Puppeteer to execute JavaScript and render SPAs completely
- **Smart Response Format** - Returns HTML for social crawlers, JSON for debugging
- **Session Management** - Efficiently reuses browser sessions for better performance
- **Error Handling** - Robust error handling with timeouts and fallbacks
- **CORS Support** - Can be called from frontend applications
- **Auto Redirect** - Users are automatically redirected to the original page

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

### For Social Media Crawlers (Default)

When Facebook, LINE, or other social media platforms access your Worker URL, they'll receive HTML with proper OG meta tags:

```
https://your-worker.your-subdomain.workers.dev/?url=https://your-spa.com/article/123
```

### For Debugging (JSON Response)

To get JSON response for debugging or API usage:

```bash
# Using query parameter
curl "https://your-worker.your-subdomain.workers.dev/?url=https://example.com&format=json"

# Using Accept header
curl -H "Accept: application/json" "https://your-worker.your-subdomain.workers.dev/?url=https://example.com"
```

### Local Development

```bash
# Start development server with remote browser support
npm run dev

# Or use wrangler directly
wrangler dev --remote
```

## 📱 Social Media Integration

### Facebook Sharing

1. Share your Worker URL instead of the original SPA URL:
```
https://your-worker.your-subdomain.workers.dev/?url=https://your-spa.com/page
```

2. Facebook will:
   - Crawl your Worker URL
   - Receive HTML with proper OG meta tags
   - Show correct preview in the share dialog
   - Redirect users to the original page when clicked

### LINE Sharing

Works the same way as Facebook - LINE's crawler will read the OG meta tags from the HTML response.

## 🧪 Testing

### Local Testing

```bash
# Test with JSON response (easier to read)
curl "http://localhost:53172/?url=https://github.com&format=json"

# Test HTML response (what Facebook sees)
curl "http://localhost:53172/?url=https://github.com"

# Test error handling
curl "http://localhost:53172/?url=https://invalid-url.com&format=json"
```

### Production Testing

```bash
# Test your deployed Worker
curl "https://your-worker.your-subdomain.workers.dev/?url=https://github.com&format=json"
```

## 📊 Response Format

### HTML Response (Default)
```html
<!DOCTYPE html>
<html>
<head>
  <meta property="og:title" content="Page Title">
  <meta property="og:description" content="Page Description">
  <meta property="og:image" content="https://example.com/image.jpg">
  <meta property="og:url" content="https://example.com">
  <meta property="og:type" content="website">
  <!-- Additional meta tags -->
  <meta http-equiv="refresh" content="0;url=https://example.com">
</head>
<body>
  <h1>Page Title</h1>
  <p>Page Description</p>
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
