import OpenAI from "openai";

export interface EmailData {
  from: string;
  subject: string;
  date: string;
  content: string;
}

export interface JobListing {
  emailFrom: string;
  emailSubject: string;
  emailDate: string;
  jobTitle: string;
  jobLink: string;
}

export async function extractJobListings(
  email: EmailData,
  apiKey: string,
  model: string = "gpt-5-nano"
): Promise<JobListing[]> {
  const openai = new OpenAI({ apiKey });

  const prompt = `You are analyzing a job advertisement email. Extract ALL job listings from the email below.

For each job listing found, extract:
1. Job title
2. Link/URL to the job posting

Return your response as a JSON object with a "jobs" array. Each job should have:
- jobTitle: the job title
- jobLink: the URL to apply or view the job

If the email contains multiple job listings, include all of them in the array.
Only include actual job postings with valid URLs - ignore promotional content without specific jobs.

EMAIL TO ANALYZE:

From: ${email.from}
Subject: ${email.subject}
Date: ${email.date}

${email.content}

Return ONLY a JSON object with format: {"jobs": [{"jobTitle": "...", "jobLink": "..."}]}`;

  const startTime = Date.now();

  const response = await openai.chat.completions.create({
    model,
    messages: [
      {
        role: "system",
        content:
          "You are a helpful assistant that extracts job listings from emails and returns valid JSON.",
      },
      {
        role: "user",
        content: prompt,
      },
    ],
    response_format: { type: "json_object" },
  });

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

  const resultText = response.choices[0].message.content;
  if (!resultText) {
    throw new Error("No response from ChatGPT");
  }

  // Parse the JSON response
  try {
    const parsed = JSON.parse(resultText);
    const jobs = parsed.jobs || [];

    // Add email metadata to each job
    return jobs.map((job: any) => ({
      emailFrom: email.from,
      emailSubject: email.subject,
      emailDate: email.date,
      jobTitle: job.jobTitle,
      jobLink: job.jobLink,
    }));
  } catch (error) {
    console.error("Failed to parse ChatGPT response:", resultText);
    throw new Error("Invalid JSON response from ChatGPT");
  }
}
