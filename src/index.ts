import { google } from "googleapis";
import { authorize } from "./auth";

const GMAIL_QUERY =
  "in:inbox AND (from:info@jobs.totaljobsmail.com OR from:jobs-listings@linkedin.com)";

async function listJobEmails() {
  try {
    console.log("Authorizing with Gmail...");
    const auth = await authorize();

    console.log("Connecting to Gmail API...");
    const gmail = google.gmail({ version: "v1", auth });

    console.log(`\nSearching for emails with filter: ${GMAIL_QUERY}\n`);

    // List messages matching the query
    const response = await gmail.users.messages.list({
      userId: "me",
      q: GMAIL_QUERY,
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
