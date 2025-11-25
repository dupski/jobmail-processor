# Job Mail Processor

A TypeScript command-line application that connects to Gmail and processes job emails.

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

### 3. Run the Application

First time (for development):

```bash
npm run dev
```

This will:

1. Open your browser for Gmail authorization
2. Save the token for future use
3. List all matching job emails with their subjects

For production (compiled):

```bash
npm run build
npm start
```

## How It Works

The application:

1. Authenticates with Gmail using OAuth 2.0
2. Searches for emails matching: `in:inbox AND (from:info@jobs.totaljobsmail.com OR from:jobs-listings@linkedin.com)`
3. Lists the subject, sender, and date of each matching email

## Files

- `src/index.ts` - Main application entry point
- `src/auth.ts` - Gmail OAuth authentication handling
- `credentials.json` - Your Google OAuth credentials (gitignored, you must create this)
- `token.json` - Stored OAuth token (gitignored, auto-generated on first run)

## Next Steps

Future enhancements will include:

- AI-powered extraction of job titles and links
- Export to spreadsheet format
