export function escapeMarkdownV2(text: string): string {
  return text.replace(/([_*\[\]()~`>#+\-=|{}.!\\])/g, "\\$1");
}

export function formatParts(parts: any[]): string {
  const sections: string[] = [];

  for (const part of parts) {
    switch (part.type) {
      case "text":
        sections.push(part.text);
        break;
      case "tool": {
        const toolName = part.tool;
        if (part.state.status === "completed") {
          const output = part.state.output;
          const title = part.state.title || toolName;
          if (output && output.length > 0) {
            sections.push(`**[${title}]**\n\`\`\`\n${truncate(output, 1000)}\n\`\`\``);
          } else {
            sections.push(`**[${title}]** ✓`);
          }
        } else if (part.state.status === "error") {
          sections.push(`**[${toolName}]** Error: ${part.state.error}`);
        } else if (part.state.status === "running") {
          sections.push(`**[${toolName}]** Running...`);
        }
        break;
      }
      case "file":
        sections.push(`📄 ${part.filename ?? "file"}`);
        break;
      default:
        break;
    }
  }

  return sections.join("\n\n") || "(empty response)";
}

function truncate(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen) + "\n... (truncated)";
}
