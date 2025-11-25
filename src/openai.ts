import OpenAI from "openai";
import { encoding_for_model } from "tiktoken";

// Model token limits (input context window)
const MODEL_TOKEN_LIMITS: { [key: string]: number } = {
  "gpt-5": 400000,
  "gpt-5-mini": 400000,
  "gpt-5-nano": 250000,
  "gpt-5-pro": 400000,
};

// Reserve tokens for prompt overhead and response
const RESERVED_TOKENS = 10000; // Increased reserve for safety

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

/**
 * Count actual tokens in text using tiktoken
 */
function countTokens(text: string, model: string): number {
  try {
    // Use gpt-4o encoding for gpt-5 models (they use similar tokenization)
    const encoding = encoding_for_model("gpt-4o" as any);
    const tokens = encoding.encode(text);
    const count = tokens.length;
    encoding.free();
    return count;
  } catch (error) {
    // Fallback to character-based estimation if tiktoken fails
    console.warn("Token counting failed, using character estimate");
    return Math.ceil(text.length / 4);
  }
}

/**
 * Get model token limit
 */
export function getModelTokenLimit(model: string): number {
  return MODEL_TOKEN_LIMITS[model] || 128000; // Default to 128k if unknown
}

/**
 * Calculate optimal batch size based on average email size and model limit
 */
export function calculateOptimalBatchSize(
  emails: EmailData[],
  model: string,
  maxBatchSize: number = 20
): number {
  if (emails.length === 0) return maxBatchSize;

  const modelLimit = getModelTokenLimit(model);
  const availableTokens = modelLimit - RESERVED_TOKENS;

  // Calculate average tokens per email (including metadata)
  const sampleSize = Math.min(5, emails.length);
  let totalTokens = 0;

  console.log("Calculating accurate token counts...");

  for (let i = 0; i < sampleSize; i++) {
    const email = emails[i];
    const emailText = `
=== EMAIL ${i + 1} ===
From: ${email.from}
Subject: ${email.subject}
Date: ${email.date}

${email.content}

=== END EMAIL ${i + 1} ===
`;
    totalTokens += countTokens(emailText, model);
  }

  // Add tokens for the system prompt and instructions
  const promptOverhead = countTokens(
    `You are analyzing job advertisement emails. Extract ALL job listings from the emails below.

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

Return ONLY the JSON array, no other text.`,
    model
  );

  const avgTokensPerEmail = totalTokens / sampleSize;

  // Calculate how many emails we can fit, accounting for prompt overhead
  const calculatedBatchSize = Math.floor(
    (availableTokens - promptOverhead) / avgTokensPerEmail
  );

  // Use the smaller of calculated batch size or max batch size, minimum 1
  const optimalBatchSize = Math.max(
    1,
    Math.min(calculatedBatchSize, maxBatchSize)
  );

  console.log(`\nBatch size calculation:`);
  console.log(`  Model: ${model} (${modelLimit.toLocaleString()} token limit)`);
  console.log(`  Prompt overhead: ~${promptOverhead} tokens`);
  console.log(`  Average tokens per email: ~${Math.round(avgTokensPerEmail)}`);
  console.log(`  Reserved for response: ${RESERVED_TOKENS} tokens`);
  console.log(`  Calculated optimal batch size: ${calculatedBatchSize}`);
  console.log(`  Using batch size: ${optimalBatchSize}\n`);

  return optimalBatchSize;
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

${email.content}

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

  const totalTokens = countTokens(prompt, model);

  console.log("\nSending batch to ChatGPT for analysis...");
  console.log(`  Emails in batch: ${emails.length}`);
  console.log(`  Model: ${model}`);
  console.log(`  Estimated input tokens: ~${totalTokens.toLocaleString()}`);
  console.log(`  Waiting for response (this may take 1-2 minutes)...`);

  const startTime = Date.now();

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
    response_format: { type: "json_object" },
  });

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  const usage = response.usage;

  console.log(`\n  ✓ Response received in ${elapsed}s`);
  if (usage) {
    console.log(
      `  Tokens used: ${usage.prompt_tokens.toLocaleString()} input + ${usage.completion_tokens.toLocaleString()} output = ${usage.total_tokens.toLocaleString()} total`
    );
  }

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
