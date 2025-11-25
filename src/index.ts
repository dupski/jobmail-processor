import { google } from "googleapis";
import { authorize } from "./auth";
import * as fs from "fs";
import * as path from "path";

interface Config {
  emailSenders: string[];
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
      maxResults: 50, // Adjust as needed
    });

    const messages = response.data.messages;

    if (!messages || messages.length === 0) {
      console.log("No messages found matching the criteria.");
      return;
    }

    console.log(`Found ${messages.length} matching emails:\n`);
    console.log("=".repeat(80));

    // Fetch details for each message to get the subject
    for (const message of messages) {
      const msg = await gmail.users.messages.get({
        userId: "me",
        id: message.id!,
        format: "metadata",
        metadataHeaders: ["Subject", "From", "Date"],
      });

      const headers = msg.data.payload?.headers || [];
      const subject =
        headers.find((h) => h.name === "Subject")?.value || "(No Subject)";
      const from = headers.find((h) => h.name === "From")?.value || "(Unknown)";
      const date = headers.find((h) => h.name === "Date")?.value || "(No Date)";

      console.log(`Subject: ${subject}`);
      console.log(`From: ${from}`);
      console.log(`Date: ${date}`);
      console.log("-".repeat(80));
    }

    console.log(`\nTotal: ${messages.length} emails`);
  } catch (error) {
    console.error("Error:", error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

// Run the application
listJobEmails();
