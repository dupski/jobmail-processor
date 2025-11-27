# Job Mail Processor

A TypeScript command-line application that extracts job listings from Gmail by parsing HTML emails and following redirect links.

## Setup Instructions

### 1. Enable Gmail API and Get Credentials

1. Go to the [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project (or select an existing one)
3. Enable the Gmail API:
   - Go to "APIs & Services" > "Library"
   - Search for "Gmail API"
   - Click "Enable"
4. Create OAuth 2.0 credentials:
   - Go to "APIs & Services" > "Credentials"
   - Click "Create Credentials" > "OAuth client ID"
   - If prompted, configure the OAuth consent screen:
     - Choose "External" user type
     - Fill in app name (e.g., "Job Mail Processor")
     - Add your email as a test user
     - Save and continue through the steps
   - Back in "Create OAuth client ID":
     - Choose "Desktop app" as the application type
     - Give it a name (e.g., "Job Mail Processor CLI")
     - Click "Create"
5. Download the credentials:
   - Click the download button (⬇️) next to your newly created OAuth 2.0 Client ID
   - Save the file as `credentials.json` in the project root directory

### 2. Install Dependencies

```bash
npm install
```

### 3. Configure the Application

Copy the example configuration and customize it:

```bash
cp config.example.json config.json
```

Edit `config.json` to configure your job email sources. Each source needs:

- **emailSender**: The email address to filter (e.g., `"info@jobs.totaljobsmail.com"`)
- **jobLinkPatterns**: Array of URL patterns to match (e.g., `["https://click.totaljobsmail.com/*"]`)
  - Use `*` as wildcard to match any segment
  - Can specify multiple patterns for sources that use different link formats
- **followJobLink**: Whether to follow redirects to get the final job URL (`true`/`false`)
- **linkSelector**: XPath expression to extract links (e.g., `"//a"` for all anchor tags)
- **linkTextExclusions**: Array of text strings to exclude (e.g., `["unsubscribe", "privacy policy"]`)
  - Links containing any of these strings (case-insensitive) will be skipped

Example configuration:

```json
{
  "jobEmailSources": [
    {
      "emailSender": "info@jobs.totaljobsmail.com",
      "jobLinkPatterns": ["https://click.totaljobsmail.com/*"],
      "followJobLink": true,
      "linkSelector": "//a",
      "linkTextExclusions": ["unsubscribe", "view in browser", "privacy policy"]
    }
  ],
  "delayBetweenRequests": 1000
}
```

### 4. Run the Application

For development:

```bash
npm run dev
```

For production (compiled):

```bash
npm run build
npm start
```

This will:

1. Authenticate with Gmail (opens browser on first run)
2. Fetch emails from configured sources
3. Extract job links from HTML content using XPath selectors
4. Follow redirects to resolve final job URLs (if configured)
5. Display all extracted job listings

#### Command-Line Options

**Limit number of messages processed:**

```bash
npm start -- --message-limit=5
# or
npm start -- --message-limit 5
```

This is useful for testing or when you want to quickly process only the most recent emails.

#### Debug Mode

To debug link extraction without following redirects:

```bash
npm start -- --debug-links
```

Or in development:

```bash
npm run dev -- --debug-links
```

Debug mode shows:
- Number of nodes matching your XPath selector
- Links extracted before filtering
- Links excluded by text filters
- Links excluded by pattern mismatches
- Redirect resolution for each link (original → final URL)
- Detailed logging of the extraction process
- Saved HTML files in `debug-links/` directory for inspection

**Combine options:**

```bash
npm start -- --debug-links --message-limit=3
```

This processes only 3 emails in debug mode, perfect for quick testing.

## How It Works

The application:

1. Authenticates with Gmail using OAuth 2.0
2. Searches for emails from configured senders in your inbox
3. Extracts HTML content from each email
4. Uses XPath selectors to find job links matching your patterns
5. Filters out unwanted links (unsubscribe, privacy policy, etc.)
6. Optionally follows redirects to resolve final job URLs (with 10-second timeout)
7. Displays all found job listings with titles and final URLs

### Link Extraction Process

1. **XPath Selection**: Uses configurable XPath expressions to find links in HTML
2. **Pattern Matching**: Filters links using wildcard patterns (e.g., `https://click.example.com/*`)
3. **Text Exclusion**: Skips links with text matching exclusion list
4. **Redirect Following**: Optionally follows HTTP redirects with Chrome user agent to get final URLs

## Files

- `src/index.ts` - Main application entry point and email processing
- `src/auth.ts` - Gmail OAuth authentication handling
- `src/linkExtractor.ts` - HTML parsing and link extraction with XPath
- `src/redirectFollower.ts` - HTTP redirect following with timeout handling
- `config.json` - Application configuration (gitignored, copy from config.example.json)
- `credentials.json` - Your Google OAuth credentials (gitignored, you must create this)
- `token.json` - Stored OAuth token (gitignored, auto-generated on first run)

## Troubleshooting

### No Links Extracted

Use `--debug-links` flag to diagnose:

```bash
npm start -- --debug-links
```

Common issues:
- **XPath selector too restrictive**: Try using `//a` to match all anchor tags
- **Pattern doesn't match**: Check that your wildcard pattern matches actual URLs in emails
- **Text exclusions too broad**: Review excluded link text in debug output
- **No HTML content**: Some emails may only have plain text

### Redirect Following Fails

- Check if the site requires authentication or has a CAPTCHA
- The 10-second timeout may be too short for slow sites
- Some sites may block automated requests

## Resources

- [Google Cloud Console](https://console.cloud.google.com/)
- [XPath Tutorial](https://www.w3schools.com/xml/xpath_intro.asp)
