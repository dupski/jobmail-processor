import { google } from "googleapis";
import { OAuth2Client } from "google-auth-library";
import * as fs from "fs";
import * as path from "path";
import * as readline from "readline";

const SCOPES = ["https://www.googleapis.com/auth/gmail.readonly"];
const TOKEN_PATH = path.join(__dirname, "../token.json");
const CREDENTIALS_PATH = path.join(__dirname, "../credentials.json");

/**
 * Load credentials from credentials.json file
 */
function loadCredentials(): any {
  try {
    const content = fs.readFileSync(CREDENTIALS_PATH, "utf-8");
    return JSON.parse(content);
  } catch (error) {
    throw new Error(
      "Error loading credentials.json. Please follow the setup instructions in README.md"
    );
  }
}

/**
 * Create an OAuth2 client with the given credentials
 */
function createOAuth2Client(): OAuth2Client {
  const credentials = loadCredentials();
  const { client_secret, client_id, redirect_uris } =
    credentials.installed || credentials.web;
  return new google.auth.OAuth2(client_id, client_secret, redirect_uris[0]);
}

/**
 * Save the token to disk for later use
 */
function saveToken(token: any): void {
  fs.writeFileSync(TOKEN_PATH, JSON.stringify(token));
  console.log("Token stored to", TOKEN_PATH);
}

/**
 * Load the token from disk if it exists
 */
function loadToken(): any | null {
  try {
    const token = fs.readFileSync(TOKEN_PATH, "utf-8");
    return JSON.parse(token);
  } catch (error) {
    return null;
  }
}

/**
 * Get new token by having user authorize in browser
 */
async function getNewToken(oAuth2Client: OAuth2Client): Promise<void> {
  const authUrl = oAuth2Client.generateAuthUrl({
    access_type: "offline",
    scope: SCOPES,
  });

  console.log("\n" + "=".repeat(80));
  console.log("AUTHORIZATION REQUIRED");
  console.log("=".repeat(80));
  console.log("\n1. Visit this URL in your browser:\n");
  console.log(authUrl);
  console.log("\n2. After authorizing, you'll be redirected to a URL like:");
  console.log("   http://localhost/?code=XXXXX&scope=...");
  console.log("\n3. Copy the ENTIRE redirected URL and paste it below.\n");
  console.log("=".repeat(80) + "\n");

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const redirectUrl = await new Promise<string>((resolve) => {
    rl.question("Paste the redirect URL here: ", (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });

  // Extract the code from the redirect URL
  const urlParams = new URL(redirectUrl);
  const code = urlParams.searchParams.get("code");

  if (!code) {
    throw new Error("No authorization code found in the URL");
  }

  console.log("\nExchanging authorization code for tokens...");
  const { tokens } = await oAuth2Client.getToken(code);
  oAuth2Client.setCredentials(tokens);
  saveToken(tokens);
}

/**
 * Get and authorize OAuth2 client
 */
export async function authorize(): Promise<OAuth2Client> {
  const oAuth2Client = createOAuth2Client();
  const token = loadToken();

  if (token) {
    oAuth2Client.setCredentials(token);
    return oAuth2Client;
  }

  await getNewToken(oAuth2Client);
  return oAuth2Client;
}
