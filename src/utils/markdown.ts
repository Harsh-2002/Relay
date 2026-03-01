import { escapeHtml } from "./html.js";

/**
 * Convert markdown to Telegram-compatible HTML.
 *
 * Handles: code blocks, inline code, headings, bold, italic,
 * strikethrough, links, blockquotes, and tables.
 */
export function markdownToHtml(md: string): string {
  // Step 1: Extract fenced code blocks to protect them from processing
  const codeBlocks: string[] = [];
  let result = md.replace(/```(\w*)\n?([\s\S]*?)```/g, (_, lang, code) => {
    const idx = codeBlocks.length;
    const escaped = escapeHtml(code.trimEnd());
    codeBlocks.push(
      lang
        ? `<pre><code class="language-${escapeHtml(lang)}">${escaped}</code></pre>`
        : `<pre>${escaped}</pre>`
    );
    return `\x00CB${idx}\x00`;
  });

  // Step 2: Extract inline code
  const inlineCodes: string[] = [];
  result = result.replace(/`([^`\n]+)`/g, (_, code) => {
    const idx = inlineCodes.length;
    inlineCodes.push(`<code>${escapeHtml(code)}</code>`);
    return `\x00IC${idx}\x00`;
  });

  // Step 3: Detect and extract markdown tables (2+ lines of |...|)
  const tables: string[] = [];
  result = result.replace(/(?:^\|.+\|[^\S\n]*$\n?){2,}/gm, (match) => {
    const idx = tables.length;
    // Keep table as-is in monospace — it reads well in fixed-width
    const lines = match.trim().split("\n");
    // Remove separator rows (|---|---|) for cleaner display
    const dataLines = lines.filter((l) => !/^\|[\s\-:|]+\|$/.test(l));
    tables.push(`<pre>${escapeHtml(dataLines.join("\n"))}</pre>`);
    return `\x00TBL${idx}\x00`;
  });

  // Step 4: Escape HTML in remaining text
  result = escapeHtml(result);

  // Step 5: Headings → bold
  result = result.replace(/^#{1,6}\s+(.+)$/gm, "<b>$1</b>");

  // Step 6: Bold (**text** and __text__) — before italic
  result = result.replace(/\*\*(.+?)\*\*/g, "<b>$1</b>");
  result = result.replace(/__(.+?)__/g, "<b>$1</b>");

  // Step 7: Italic (*text* and _text_)
  // Require no space after opening delimiter and no space before closing delimiter
  // to avoid false positives on math expressions like "2 * 3 * 4"
  result = result.replace(/(?<!\w)\*(?! )([^*\n]+?)(?<! )\*(?!\w)/g, "<i>$1</i>");
  result = result.replace(/(?<!\w)_(?! )([^_\n]+?)(?<! )_(?!\w)/g, "<i>$1</i>");

  // Step 8: Strikethrough
  result = result.replace(/~~(.+?)~~/g, "<s>$1</s>");

  // Step 9: Links [text](url) — brackets/parens survive escapeHtml
  result = result.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');

  // Step 10: Blockquotes (> at line start, escaped to &gt;)
  // Support nested blockquotes (>>, >>>) — Telegram only has one level,
  // so strip all leading > markers and render as a single blockquote
  result = result.replace(/(?:^(?:&gt;)+\s?.+$\n?)+/gm, (match) => {
    const lines = match
      .trim()
      .split("\n")
      .map((l) => l.replace(/^(?:&gt;)+\s?/, ""));
    return `<blockquote>${lines.join("\n")}</blockquote>\n`;
  });

  // Step 11: Restore protected sections
  result = result.replace(/\x00TBL(\d+)\x00/g, (_, idx) => tables[parseInt(idx)]);
  result = result.replace(/\x00IC(\d+)\x00/g, (_, idx) => inlineCodes[parseInt(idx)]);
  result = result.replace(/\x00CB(\d+)\x00/g, (_, idx) => codeBlocks[parseInt(idx)]);

  return result;
}
