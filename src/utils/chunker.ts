const MAX_LENGTH = 4096;

export function chunkMessage(text: string, maxLen: number = MAX_LENGTH): string[] {
  if (text.length <= maxLen) return [text];

  const chunks: string[] = [];
  let remaining = text;

  while (remaining.length > 0) {
    if (remaining.length <= maxLen) {
      chunks.push(remaining);
      break;
    }

    let splitAt = remaining.lastIndexOf("\n\n", maxLen);
    if (splitAt < 1) splitAt = remaining.lastIndexOf("\n", maxLen);
    if (splitAt < 1) splitAt = remaining.lastIndexOf(" ", maxLen);
    if (splitAt < 1) splitAt = maxLen;

    chunks.push(remaining.slice(0, splitAt));
    remaining = remaining.slice(splitAt).trimStart();
  }

  return chunks;
}
