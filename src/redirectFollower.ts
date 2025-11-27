/**
 * Module for following HTTP redirects to resolve final URLs
 */

const CHROME_USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

const TIMEOUT_MS = 10000;

export interface RedirectResult {
  finalUrl: string;
  success: boolean;
  error?: string;
  redirectChain?: string[];
}

/**
 * Follow redirects for a URL and return the final destination
 */
export async function followRedirects(
  url: string,
  debugMode: boolean = false
): Promise<RedirectResult> {
  const redirectChain: string[] = [url];
  
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);
    
    const response = await fetch(url, {
      method: "HEAD",
      headers: {
        "User-Agent": CHROME_USER_AGENT,
      },
      redirect: "follow",
      signal: controller.signal,
    });
    
    clearTimeout(timeoutId);
    
    const finalUrl = response.url;
    
    if (debugMode && finalUrl !== url) {
      console.log(`    Redirect: ${url} -> ${finalUrl}`);
    }
    
    return {
      finalUrl,
      success: true,
      redirectChain: debugMode ? redirectChain.concat(finalUrl) : undefined,
    };
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : String(error);
    
    if (debugMode) {
      console.log(`    ✗ Failed to follow redirect: ${errorMessage}`);
    }
    
    return {
      finalUrl: url,
      success: false,
      error: errorMessage,
    };
  }
}

/**
 * Follow redirects for multiple URLs in parallel with rate limiting
 */
export async function followRedirectsBatch(
  urls: string[],
  debugMode: boolean = false,
  maxConcurrent: number = 5
): Promise<Map<string, RedirectResult>> {
  const results = new Map<string, RedirectResult>();
  
  // Process URLs in batches to avoid overwhelming servers
  for (let i = 0; i < urls.length; i += maxConcurrent) {
    const batch = urls.slice(i, i + maxConcurrent);
    const batchPromises = batch.map((url) => followRedirects(url, debugMode));
    const batchResults = await Promise.all(batchPromises);
    
    batch.forEach((url, index) => {
      results.set(url, batchResults[index]);
    });
  }
  
  return results;
}
