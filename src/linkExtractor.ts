import { DOMParser } from "@xmldom/xmldom";
import * as xpath from "xpath";
import * as fs from "fs";
import * as path from "path";

export interface JobEmailSource {
  emailSender: string;
  jobLinkPatterns: string[];
  followJobLink: boolean;
  linkSelector: string;
  linkTextExclusions: string[];
}

export interface ExtractedLink {
  url: string;
  text: string;
}

/**
 * Check if a URL matches a pattern with wildcard support
 * Pattern format: "https://example.com/*" where * matches any segment
 */
function matchesPattern(url: string, pattern: string): boolean {
  // Convert wildcard pattern to regex
  // Escape special regex characters except *
  const regexPattern = pattern
    .replace(/[.+?^${}()|[\]\\]/g, "\\$&")
    .replace(/\*/g, ".*");
  
  const regex = new RegExp(`^${regexPattern}$`);
  return regex.test(url);
}

/**
 * Extract links from HTML using XPath selector
 */
export function extractLinks(
  html: string,
  source: JobEmailSource,
  debugMode: boolean = false
): ExtractedLink[] {
  // Save HTML to debug file in debug mode
  if (debugMode) {
    const debugDir = path.join(process.cwd(), "debug-links");
    if (!fs.existsSync(debugDir)) {
      fs.mkdirSync(debugDir, { recursive: true });
    }
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const htmlFile = path.join(debugDir, `email-${timestamp}.html`);
    fs.writeFileSync(htmlFile, html, "utf-8");
    console.log(`  💾 Saved HTML to: debug-links/email-${timestamp}.html`);
    console.log(`  Parsing HTML (${html.length} chars)...`);
  }
  
  // Remove XHTML namespace to simplify XPath selectors
  // This allows us to use simple XPath like //a instead of //x:a
  const originalLength = html.length;
  html = html.replace(/xmlns="http:\/\/www\.w3\.org\/1999\/xhtml"/g, "");
  
  if (debugMode) {
    console.log(`  Namespace removed: ${originalLength !== html.length ? 'YES' : 'NO'}`);
  }
  
  // Parse as XML/HTML - try to handle malformed HTML
  const doc = new DOMParser({
    errorHandler: {
      warning: () => {},
      error: () => {},
      fatalError: () => {}
    }
  }).parseFromString(html, "text/xml");
  
  // Extract all links matching the XPath selector
  let nodes: Node[] = [];
  
  if (debugMode) {
    console.log(`  XPath: ${source.linkSelector}`);
  }
  
  try {
    const select = xpath.useNamespaces({});
    nodes = select(source.linkSelector, doc) as Node[];
  } catch (xpathError) {
    if (debugMode) {
      console.log(`  ⚠ XPath error: ${xpathError instanceof Error ? xpathError.message : xpathError}`);
    }
  }
  
  if (debugMode) {
    console.log(`  Found ${nodes.length} nodes matching selector`);
    if (nodes.length > 0 && nodes.length <= 20) {
      console.log(`  📋 All matched nodes:`);
      nodes.forEach((node, i) => {
        const element = node as any;
        const href = element.getAttribute?.("href");
        const text = element.textContent?.trim()?.substring(0, 60) || "";
        console.log(`    ${i + 1}. "${text}${text.length > 60 ? '...' : ''}" -> ${href?.substring(0, 80)}${href && href.length > 80 ? '...' : ''}`);
      });
    }
  }
  
  const allLinks: ExtractedLink[] = [];
  const excludedLinks: string[] = [];
  const patternMismatches: string[] = [];
  
  for (const node of nodes) {
    const element = node as any;
    const href = element.getAttribute?.("href");
    const text = element.textContent?.trim() || "";
    
    if (!href) {
      if (debugMode) {
        console.log(`  ⚠ Node without href: "${text.substring(0, 60)}"`);
      }
      continue;
    }
    
    // Check if link text should be excluded
    const isExcluded = source.linkTextExclusions.some((exclusion) =>
      text.toLowerCase().includes(exclusion.toLowerCase())
    );
    
    if (isExcluded) {
      if (debugMode) {
        excludedLinks.push(`${text} -> ${href}`);
      }
      continue;
    }
    
    // Check if URL matches any of the patterns
    const matchesAnyPattern = source.jobLinkPatterns.some((pattern) =>
      matchesPattern(href, pattern)
    );
    
    if (!matchesAnyPattern) {
      if (debugMode) {
        patternMismatches.push(`${text} -> ${href}`);
      }
      continue;
    }
    
    allLinks.push({ url: href, text });
  }
  
  if (debugMode) {
    console.log(`  ✓ Extracted ${allLinks.length} job link(s)`);
    if (excludedLinks.length > 0) {
      console.log(`  ⊗ Excluded ${excludedLinks.length} link(s) by text filter:`);
      excludedLinks.slice(0, 5).forEach((link) => console.log(`    - ${link}`));
      if (excludedLinks.length > 5) {
        console.log(`    ... and ${excludedLinks.length - 5} more`);
      }
    }
    if (patternMismatches.length > 0) {
      console.log(`  ⊗ Excluded ${patternMismatches.length} link(s) by pattern mismatch:`);
      patternMismatches.slice(0, 5).forEach((link) => console.log(`    - ${link}`));
      if (patternMismatches.length > 5) {
        console.log(`    ... and ${patternMismatches.length - 5} more`);
      }
    }
  }
  
  return allLinks;
}
