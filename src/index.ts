import { google } from "googleapis";
import { authorize } from "./auth";
import { extractJobListings, EmailData, JobListing } from "./openai";
import TurndownService from "turndown";
import * as fs from "fs";
import * as path from "path";

// Parse command-line arguments
const args = process.argv.slice(2);
const debugPromptsMode = args.includes("--debug-prompts");

interface Config {
  emailSenders: string[];
  openaiApiKey: string;
  openaiModel: string;
  delayBetweenRequests: number;
}

function loadConfig(): Config {
  const configPath = path.join(__dirname, "../config.json");
  try {
    const content = fs.readFileSync(configPath, "utf-8");
    return JSON.parse(content);
  } catch (error) {
    throw new Error(
      "Error loading config.json. Please copy config.example.json to config.json and customize it."
    );
  }
}

function buildGmailQuery(senders: string[]): string {
  const senderQuery = senders.map((email) => `from:${email}`).join(" OR ");
  return `in:inbox AND (${senderQuery})`;
}

/**
 * Extract HTML content from email payload
 */
function getEmailHtmlContent(payload: any): string {
  // Check if the body has data directly
  if (payload.body?.data) {
    return Buffer.from(payload.body.data, "base64").toString("utf-8");
  }

  // Check parts for HTML content
  if (payload.parts) {
    for (const part of payload.parts) {
      if (part.mimeType === "text/html" && part.body?.data) {
        return Buffer.from(part.body.data, "base64").toString("utf-8");
      }
      // Recursively check nested parts
      if (part.parts) {
        const html = getEmailHtmlContent(part);
        if (html) return html;
      }
    }
  }

  return "";
}

async function listJobEmails() {
  try {
    console.log("Loading configuration...");
    const config = loadConfig();
    const gmailQuery = buildGmailQuery(config.emailSenders);

    console.log("Authorizing with Gmail...");
    const auth = await authorize();

    console.log("Connecting to Gmail API...");
    const gmail = google.gmail({ version: "v1", auth });

    console.log(`\nSearching for emails with filter: ${gmailQuery}\n`);

    // List messages matching the query
    const response = await gmail.users.messages.list({
      userId: "me",
      q: gmailQuery,
      maxResults: 100, // Get more emails to process
    });

    const messages = response.data.messages;

    if (!messages || messages.length === 0) {
      console.log("No messages found matching the criteria.");
      return;
    }

    console.log(`Found ${messages.length} matching emails`);
    console.log("=".repeat(80));

    // Fetch full content for each message
    console.log("\nFetching email contents...");
    const emailData: EmailData[] = [];
    const turndownService = new TurndownService({
      headingStyle: "atx",
      codeBlockStyle: "fenced",
    });

    for (const message of messages) {
      const msg = await gmail.users.messages.get({
        userId: "me",
        id: message.id!,
        format: "full", // Get full message including body
      });

      const headers = msg.data.payload?.headers || [];
      const subject =
        headers.find((h) => h.name === "Subject")?.value || "(No Subject)";
      const from = headers.find((h) => h.name === "From")?.value || "(Unknown)";
      const date = headers.find((h) => h.name === "Date")?.value || "(No Date)";
      const htmlContent = getEmailHtmlContent(msg.data.payload);

      // Convert HTML to Markdown to reduce token usage
      let markdownContent = "";
      if (htmlContent) {
        markdownContent = turndownService.turndown(htmlContent);
      } else {
        console.warn(`\nWarning: No HTML content found for email: ${subject}`);
      }

      emailData.push({
        from,
        subject,
        date,
        content: markdownContent,
      });

      process.stdout.write(".");
    }

    console.log(`\n\nFetched ${emailData.length} emails`);
    console.log("=".repeat(80));

    // Process emails one by one
    if (debugPromptsMode) {
      console.log(`\n🔍 DEBUG MODE: Generating prompts without calling OpenAI...`);
      console.log(`Model configured: ${config.openaiModel}`);
      console.log(`Prompts will be saved to: debug-prompts/\n`);
    } else {
      console.log(`\nProcessing ${emailData.length} emails with ChatGPT...`);
      console.log(`Model: ${config.openaiModel}`);
      console.log(`Delay between requests: ${config.delayBetweenRequests}ms\n`);
    }

    const allJobListings: JobListing[] = [];

    for (let i = 0; i < emailData.length; i++) {
      const email = emailData[i];
      const emailNum = i + 1;

      console.log(
        `[${emailNum}/${
          emailData.length
        }] Processing: ${email.subject.substring(0, 60)}...`
      );

      try {
        const jobs = await extractJobListings(
          email,
          config.openaiApiKey,
          config.openaiModel,
          debugPromptsMode
        );

        allJobListings.push(...jobs);
        if (!debugPromptsMode) {
          console.log(`  ✓ Found ${jobs.length} job(s)\n`);
        }

        // Delay before next request (except for the last one)
        if (!debugPromptsMode && i < emailData.length - 1 && config.delayBetweenRequests > 0) {
          await new Promise((resolve) =>
            setTimeout(resolve, config.delayBetweenRequests)
          );
        }
      } catch (error) {
        console.error(
          `  ✗ Error processing email: ${
            error instanceof Error ? error.message : error
          }\n`
        );
      }
    }

    // Display results
    console.log("\n" + "=".repeat(80));
    if (debugPromptsMode) {
      console.log(`DEBUG MODE COMPLETE`);
      console.log("=".repeat(80));
      console.log(`\n✓ Generated ${emailData.length} prompt file(s) in debug-prompts/`);
      console.log(`\nTo run normally (with OpenAI API calls), use: npm start`);
      console.log(`To debug prompts again, use: npm start -- --debug-prompts\n`);
      return;
    }
    console.log(`TOTAL JOB LISTINGS FOUND: ${allJobListings.length}`);
    console.log("=".repeat(80) + "\n");

    allJobListings.forEach((job, index) => {
      console.log(`${index + 1}. ${job.jobTitle}`);
      console.log(`   Link: ${job.jobLink}`);
      console.log(`   From: ${job.emailFrom}`);
      console.log(`   Email Subject: ${job.emailSubject}`);
      console.log(`   Date: ${job.emailDate}`);
      console.log("-".repeat(80));
    });

    console.log(`\nTotal: ${allJobListings.length} job listings extracted`);
  } catch (error) {
    console.error("Error:", error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

// Run the application
listJobEmails();
