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

### 3. Configure the Application

Copy the example configuration and customize it:

```bash
cp config.example.json config.json
```

Edit `config.json` to:
- Add email senders you want to process
- Add your OpenAI API key
- Configure the model and request delays

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

1. Open your browser for Gmail authorization (first time only)
2. Save the token for future use
3. Fetch matching job emails
4. Process each email with OpenAI to extract job listings
5. Display all extracted jobs with titles and links

#### Debug Mode

To debug your prompts without calling the OpenAI API:

```bash
npm start -- --debug-prompts
```

Or in development:

```bash
npm run dev -- --debug-prompts
```

This will:
- Generate prompts for each email
- Save them to the `debug-prompts/` directory
- Skip OpenAI API calls (no cost/usage)
- Allow you to inspect exactly what's being sent to the AI

## How It Works

The application:

1. Authenticates with Gmail using OAuth 2.0
2. Searches for emails from configured senders in your inbox
3. Fetches email content and converts HTML to Markdown
4. Uses OpenAI to extract job titles and links from each email
5. Displays all found job listings with metadata

## Files

- `src/index.ts` - Main application entry point
- `src/auth.ts` - Gmail OAuth authentication handling
- `src/openai.ts` - OpenAI integration for job extraction
- `config.json` - Application configuration (gitignored, copy from config.example.json)
- `credentials.json` - Your Google OAuth credentials (gitignored, you must create this)
- `token.json` - Stored OAuth token (gitignored, auto-generated on first run)
- `debug-prompts/` - Debug output directory (created when using --debug-prompts)

## Troubleshooting

### Prompts Not Returning Results

Use debug mode to inspect the prompts being sent to OpenAI:

```bash
npm start -- --debug-prompts
```

Check the generated files in `debug-prompts/` to see:
- The exact prompt text being sent
- Email content being analyzed
- System and user messages

This helps identify issues like:
- Email content not being extracted properly
- Prompts missing necessary context
- Formatting issues in the email data

## Resources

- [Google Cloud Console](https://console.cloud.google.com/)
- [OpenAI Platform Site](https://platform.openai.com/)
