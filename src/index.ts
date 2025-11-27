import { google } from "googleapis";
import { authorize } from "./auth";
import {
  extractLinks,
  JobEmailSource,
  ExtractedLink,
} from "./linkExtractor";
import { followRedirects } from "./redirectFollower";
import * as fs from "fs";
import * as path from "path";
import * as xpath from "xpath";

// Parse command-line arguments
const args = process.argv.slice(2);
const debugLinksMode = args.includes("--debug-links");

// Parse --message-limit argument
let messageLimit: number | undefined;
const limitIndex = args.findIndex((arg) => arg.startsWith("--message-limit"));
if (limitIndex !== -1) {
  const limitArg = args[limitIndex];
  if (limitArg.includes("=")) {
    // Format: --message-limit=5
    messageLimit = parseInt(limitArg.split("=")[1], 10);
  } else if (args[limitIndex + 1]) {
    // Format: --message-limit 5
    messageLimit = parseInt(args[limitIndex + 1], 10);
  }
  if (messageLimit === undefined || isNaN(messageLimit) || messageLimit < 1) {
    console.error("Error: --message-limit must be a positive number");
    process.exit(1);
  }
}

export interface JobListing {
  emailFrom: string;
  emailSubject: string;
  emailDate: string;
  jobTitle: string;
  jobLink: string;
}

interface Config {
  jobEmailSources: JobEmailSource[];
  delayBetweenRequests: number;
}

function loadConfig(): Config {
  const configPath = path.join(__dirname, "../config.json");
  try {
    const content = fs.readFileSync(configPath, "utf-8");
    const config = JSON.parse(content);
    
    // Validate XPath selectors
    console.log("Validating XPath selectors...");
    for (const source of config.jobEmailSources) {
      try {
        // Create a simple test document
        const testDoc = new (require("@xmldom/xmldom").DOMParser)().parseFromString(
          "<root><a href='test'>test</a></root>",
          "text/xml"
        );
        
        // Test the XPath selector
        const select = xpath.useNamespaces({});
        select(source.linkSelector, testDoc);
        
        console.log(`  ✓ Valid XPath for ${source.emailSender}: ${source.linkSelector}`);
      } catch (xpathError) {
        console.error(`\n✗ Invalid XPath selector for ${source.emailSender}:`);
        console.error(`  Selector: ${source.linkSelector}`);
        console.error(`  Error: ${xpathError instanceof Error ? xpathError.message : xpathError}`);
        process.exit(1);
      }
    }
    console.log();
    
    return config;
  } catch (error) {
    throw new Error(
      "Error loading config.json. Please copy config.example.json to config.json and customize it."
    );
  }
}

function buildGmailQuery(sources: JobEmailSource[]): string {
  const senderQuery = sources
    .map((source) => `from:${source.emailSender}`)
    .join(" OR ");
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

async function processJobEmails() {
  try {
    console.log("Loading configuration...");
    const config = loadConfig();
    const gmailQuery = buildGmailQuery(config.jobEmailSources);

    if (debugLinksMode) {
      console.log("\n🔍 DEBUG MODE: Link extraction debugging enabled\n");
    }
    
    if (messageLimit) {
      console.log(`📊 LIMIT: Processing maximum ${messageLimit} message(s)\n`);
    }

    console.log("Authorizing with Gmail...");
    const auth = await authorize();

    console.log("Connecting to Gmail API...");
    const gmail = google.gmail({ version: "v1", auth });

    console.log(`\nSearching for emails with filter: ${gmailQuery}\n`);

    // List messages matching the query
    const response = await gmail.users.messages.list({
      userId: "me",
      q: gmailQuery,
      maxResults: 100,
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
    
    interface EmailData {
      from: string;
      subject: string;
      date: string;
      htmlContent: string;
      source: JobEmailSource;
    }
    
    const emailData: EmailData[] = [];

    for (const message of messages) {
      const msg = await gmail.users.messages.get({
        userId: "me",
        id: message.id!,
        format: "full",
      });

      const headers = msg.data.payload?.headers || [];
      const subject =
        headers.find((h) => h.name === "Subject")?.value || "(No Subject)";
      const from = headers.find((h) => h.name === "From")?.value || "(Unknown)";
      const date = headers.find((h) => h.name === "Date")?.value || "(No Date)";
      const htmlContent = getEmailHtmlContent(msg.data.payload);

      if (!htmlContent) {
        console.warn(`\nWarning: No HTML content found for email: ${subject}`);
        continue;
      }

      // Find matching source config
      const source = config.jobEmailSources.find((s) =>
        from.includes(s.emailSender)
      );

      if (!source) {
        console.warn(`\nWarning: No source config found for: ${from}`);
        continue;
      }

      emailData.push({
        from,
        subject,
        date,
        htmlContent,
        source,
      });

      process.stdout.write(".");
    }

    console.log(`\n\nFetched ${emailData.length} emails with HTML content`);
    console.log("=".repeat(80));

    // Apply message limit if specified
    const emailsToProcess = messageLimit
      ? emailData.slice(0, messageLimit)
      : emailData;

    // Process emails one by one
    console.log(`\nExtracting job links from ${emailsToProcess.length} emails...\n`);

    const allJobListings: JobListing[] = [];

    for (let i = 0; i < emailsToProcess.length; i++) {
      const email = emailsToProcess[i];
      const emailNum = i + 1;

      console.log(
        `[${emailNum}/${emailsToProcess.length}] Processing: ${email.subject.substring(
          0,
          60
        )}...`
      );

      try {
        // Extract links from HTML
        const extractedLinks = extractLinks(
          email.htmlContent,
          email.source,
          debugLinksMode
        );

        if (extractedLinks.length === 0) {
          console.log(`  ⊘ No job links found\n`);
          continue;
        }

        // Follow redirects if configured
        if (email.source.followJobLink) {
          if (debugLinksMode) {
            console.log(`  Following redirects for ${extractedLinks.length} link(s)...`);
          }

          for (const link of extractedLinks) {
            const result = await followRedirects(link.url, debugLinksMode);

            if (result.success) {
              allJobListings.push({
                emailFrom: email.from,
                emailSubject: email.subject,
                emailDate: email.date,
                jobTitle: link.text,
                jobLink: result.finalUrl,
              });
            } else {
              console.warn(`  ⚠ Failed to resolve link: ${link.text}`);
            }

            // Small delay between redirect requests
            if (config.delayBetweenRequests > 0) {
              await new Promise((resolve) =>
                setTimeout(resolve, config.delayBetweenRequests)
              );
            }
          }
        } else {
          // Use original URLs without following redirects
          for (const link of extractedLinks) {
            allJobListings.push({
              emailFrom: email.from,
              emailSubject: email.subject,
              emailDate: email.date,
              jobTitle: link.text,
              jobLink: link.url,
            });
          }
        }

        console.log(`  ✓ Extracted ${extractedLinks.length} job(s)\n`);
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
    
    if (debugLinksMode) {
      console.log(`DEBUG MODE COMPLETE`);
      console.log("=".repeat(80));
      console.log(`\n✓ Processed ${emailsToProcess.length} email(s)${messageLimit && emailData.length > messageLimit ? ` (limited from ${emailData.length})` : ""}`);;
      console.log(`\nTo run normally, use: npm start`);
      console.log(`To debug links again, use: npm start -- --debug-links`);
      if (!messageLimit) {
        console.log(`To limit messages processed, use: npm start -- --message-limit=5`);
      }
      console.log();
      return;
    }
    
    console.log(`TOTAL JOB LISTINGS FOUND: ${allJobListings.length}`);
    console.log("=".repeat(80) + "\n");

    if (allJobListings.length === 0) {
      console.log("No job listings were extracted.");
      if (!debugLinksMode) {
        console.log(
          "\nTip: Run with --debug-links flag to see detailed link extraction info"
        );
      }
      return;
    }

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
processJobEmails();
