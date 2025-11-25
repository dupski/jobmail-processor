import OpenAI from "openai";

export interface EmailData {
  from: string;
  subject: string;
  date: string;
  htmlContent: string;
}

export interface JobListing {
  emailFrom: string;
  emailSubject: string;
  emailDate: string;
  jobTitle: string;
  jobLink: string;
}

export async function extractJobListings(
  emails: EmailData[],
  apiKey: string,
  model: string = "gpt-5-nano"
): Promise<JobListing[]> {
  const openai = new OpenAI({ apiKey });

  // Build the prompt with all emails
  const emailsContent = emails
    .map(
      (email, index) => `
=== EMAIL ${index + 1} ===
From: ${email.from}
Subject: ${email.subject}
Date: ${email.date}

${email.htmlContent}

=== END EMAIL ${index + 1} ===
`
    )
    .join("\n\n");

  const prompt = `You are analyzing job advertisement emails. Extract ALL job listings from the emails below.

For each job listing found, extract:
1. Job title
2. Link/URL to the job posting

Return your response as a JSON array. Each element should have:
- emailFrom: the email sender's address
- emailSubject: the email subject line
- emailDate: the email date
- jobTitle: the job title
- jobLink: the URL to apply or view the job

If an email contains multiple job listings, create separate entries for each job.
Only include actual job postings with valid URLs - ignore promotional content without specific jobs.

EMAILS TO ANALYZE:

${emailsContent}

Return ONLY the JSON array, no other text.`;

  console.log("\nSending batch to ChatGPT for analysis...");
  console.log(`Analyzing ${emails.length} emails with ${model}...`);

  const response = await openai.chat.completions.create({
    model,
    messages: [
      {
        role: "system",
        content:
          "You are a helpful assistant that extracts job listings from emails and returns valid JSON arrays.",
      },
      {
        role: "user",
        content: prompt,
      },
    ],
    temperature: 0.3,
    response_format: { type: "json_object" },
  });

  const content = response.usage?.total_tokens;
  console.log(`Used ${content} tokens`);

  const resultText = response.choices[0].message.content;
  if (!resultText) {
    throw new Error("No response from ChatGPT");
  }

  // Parse the JSON response
  try {
    const parsed = JSON.parse(resultText);
    // Handle both direct array and object with jobs array
    const jobs = Array.isArray(parsed) ? parsed : parsed.jobs || [];
    return jobs;
  } catch (error) {
    console.error("Failed to parse ChatGPT response:", resultText);
    throw new Error("Invalid JSON response from ChatGPT");
  }
}
