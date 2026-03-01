const MAX_LENGTH = 4096;

// Tags that Telegram supports — only these need HTML-aware handling
const VOID_TAGS = new Set(["br", "hr"]);

interface OpenTag {
  tag: string;   // e.g. "pre", "code", "b"
  full: string;  // e.g. '<code class="language-ts">'
}

/**
 * Split a Telegram HTML message into chunks that respect the 4096-char limit.
 *
 * Key behaviors:
 * - Never splits inside an HTML tag (< ... >)
 * - Tracks open tags and closes them at end of each chunk
 * - Re-opens unclosed tags at start of next chunk
 * - Prefers splitting at paragraph, line, or space boundaries
 */
export function chunkMessage(text: string, maxLen: number = MAX_LENGTH): string[] {
  if (text.length <= maxLen) return [text];

  const chunks: string[] = [];
  let remaining = text;
  let openTags: OpenTag[] = [];

  while (remaining.length > 0) {
    // Calculate overhead for closing current open tags + reopening in next chunk
    const closeStr = buildCloseString(openTags);
    const openStr = buildOpenString(openTags);
    const overhead = closeStr.length;
    const budget = maxLen - overhead;

    if (remaining.length + overhead <= maxLen) {
      // Remaining fits — just push it
      chunks.push(remaining);
      break;
    }

    // Find the best split point within budget
    let splitAt = findSplitPoint(remaining, budget);

    // Ensure we don't split inside an HTML tag
    splitAt = adjustForTags(remaining, splitAt);

    if (splitAt < 1) splitAt = budget;

    let chunk = remaining.slice(0, splitAt);

    // Parse tags in this chunk to track open/close state
    const chunkTags = parseTags(chunk, openTags);

    // Close any tags left open in this chunk
    const chunkClose = buildCloseString(chunkTags);
    chunk = chunk + chunkClose;

    chunks.push(chunk);

    // Prepare next chunk: re-open tags that were split
    openTags = chunkTags;
    remaining = buildOpenString(openTags) + remaining.slice(splitAt).trimStart();
  }

  return chunks;
}

/**
 * Find the best split point within the budget.
 */
function findSplitPoint(text: string, budget: number): number {
  // Try paragraph break
  let splitAt = text.lastIndexOf("\n\n", budget);
  if (splitAt > budget * 0.3) return splitAt;

  // Try line break
  splitAt = text.lastIndexOf("\n", budget);
  if (splitAt > budget * 0.3) return splitAt;

  // Try space
  splitAt = text.lastIndexOf(" ", budget);
  if (splitAt > budget * 0.3) return splitAt;

  return budget;
}

/**
 * If splitAt lands inside an HTML tag (between < and >), move it before the tag.
 */
function adjustForTags(text: string, splitAt: number): number {
  // Check if we're inside a tag by scanning back for < without a matching >
  let i = splitAt - 1;
  while (i >= 0) {
    if (text[i] === ">") break; // Found closing > — we're not inside a tag
    if (text[i] === "<") {
      // We're inside a tag — move split point before it
      return i;
    }
    i--;
  }
  return splitAt;
}

/**
 * Parse HTML tags in a chunk, updating the open tags stack.
 * Returns the list of tags still open at the end of the chunk.
 */
function parseTags(chunk: string, inheritedTags: OpenTag[]): OpenTag[] {
  const stack: OpenTag[] = [...inheritedTags];
  const tagRegex = /<\/?([a-z][a-z0-9]*)[^>]*>/gi;
  let match: RegExpExecArray | null;

  while ((match = tagRegex.exec(chunk)) !== null) {
    const fullMatch = match[0];
    const tagName = match[1].toLowerCase();

    if (VOID_TAGS.has(tagName)) continue;

    if (fullMatch.startsWith("</")) {
      // Closing tag — pop from stack
      for (let i = stack.length - 1; i >= 0; i--) {
        if (stack[i].tag === tagName) {
          stack.splice(i, 1);
          break;
        }
      }
    } else {
      // Opening tag
      stack.push({ tag: tagName, full: fullMatch });
    }
  }

  return stack;
}

/**
 * Build closing tags string for all open tags (in reverse order).
 */
function buildCloseString(tags: OpenTag[]): string {
  let s = "";
  for (let i = tags.length - 1; i >= 0; i--) {
    s += `</${tags[i].tag}>`;
  }
  return s;
}

/**
 * Build opening tags string to re-open previously split tags.
 */
function buildOpenString(tags: OpenTag[]): string {
  let s = "";
  for (const t of tags) {
    s += t.full;
  }
  return s;
}
