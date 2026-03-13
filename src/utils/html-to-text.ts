/**
 * Converts raw HTML to readable plain text.
 * Used by watch system for SHA-256 hashing and word counting.
 * Pure regex-based — no external dependencies.
 */

export function htmlToReadableText(html: string): string {
  let text = html;

  // Remove script, style, noscript tags and their content
  text = text.replace(/<script[\s\S]*?<\/script>/gi, "");
  text = text.replace(/<style[\s\S]*?<\/style>/gi, "");
  text = text.replace(/<noscript[\s\S]*?<\/noscript>/gi, "");

  // Remove HTML comments
  text = text.replace(/<!--[\s\S]*?-->/g, "");

  // Replace block elements with newlines
  text = text.replace(/<br\s*\/?>/gi, "\n");
  text = text.replace(/<\/?(p|div|li|tr|h[1-6]|blockquote|section|article|header|footer|nav|main|aside|ul|ol|dl|dt|dd|table|thead|tbody|tfoot|figure|figcaption|details|summary|hr)[^>]*>/gi, "\n");

  // Strip all remaining HTML tags
  text = text.replace(/<[^>]+>/g, "");

  // Decode common HTML entities
  text = text.replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
  text = text.replace(/&#(\d+);/g, (_, dec) => String.fromCharCode(parseInt(dec, 10)));
  text = text.replace(/&nbsp;/gi, " ");
  text = text.replace(/&amp;/gi, "&");
  text = text.replace(/&lt;/gi, "<");
  text = text.replace(/&gt;/gi, ">");
  text = text.replace(/&quot;/gi, '"');
  text = text.replace(/&apos;/gi, "'");

  // Collapse excessive whitespace: multiple spaces → single space per line
  text = text.replace(/[ \t]+/g, " ");

  // Collapse multiple newlines into max 2
  text = text.replace(/\n{3,}/g, "\n\n");

  // Trim each line
  text = text
    .split("\n")
    .map(line => line.trim())
    .join("\n");

  return text.trim();
}
