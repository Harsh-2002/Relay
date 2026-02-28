import type { Bot } from "grammy";
import { InputFile } from "grammy";
import { getClient } from "../client.js";
import { chunkMessage } from "../utils/chunker.js";

export function registerFileCommands(bot: Bot): void {
  bot.command("read", async (ctx) => {
    const filePath = ctx.match?.trim();
    if (!filePath) {
      await ctx.reply("Usage: /read <file-path>");
      return;
    }

    try {
      await ctx.replyWithChatAction("typing");
      const client = getClient();
      const result = await client.file.read({ query: { path: filePath } });

      if (result.error) {
        await ctx.reply(`Failed to read file: ${filePath}`);
        return;
      }

      const fileData = result.data as any;
      const content = fileData?.content ?? JSON.stringify(fileData, null, 2);
      const header = `📄 **${filePath}**\n\n`;

      if (content.length > 15000) {
        const buffer = Buffer.from(content, "utf-8");
        const fileName = filePath.split("/").pop() ?? "file.txt";
        await ctx.replyWithDocument(new InputFile(buffer, fileName));
        return;
      }

      const formatted = header + "```\n" + content + "\n```";
      const chunks = chunkMessage(formatted);
      for (const chunk of chunks) {
        try {
          await ctx.reply(chunk, { parse_mode: "Markdown" });
        } catch {
          await ctx.reply(chunk);
        }
      }
    } catch (err: any) {
      await ctx.reply(`Error: ${err.message}`);
    }
  });

  bot.command("search", async (ctx) => {
    const pattern = ctx.match?.trim();
    if (!pattern) {
      await ctx.reply("Usage: /search <pattern>");
      return;
    }

    try {
      await ctx.replyWithChatAction("typing");
      const client = getClient();

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 30000);

      let result: any;
      try {
        result = await client.find.text({
          query: { pattern },
          signal: controller.signal,
        } as any);
      } finally {
        clearTimeout(timeout);
      }

      if (result.error) {
        await ctx.reply("Search failed.");
        return;
      }

      const matches = result.data ?? [];
      if (matches.length === 0) {
        await ctx.reply(`No matches found for: ${pattern}`);
        return;
      }

      const text = matches
        .slice(0, 20)
        .map((m: any) => `**${m.path.text}:${m.line_number}**\n\`${m.lines.text.trim()}\``)
        .join("\n\n");

      const header = `Found ${matches.length} match(es) for \`${pattern}\`:\n\n`;
      const chunks = chunkMessage(header + text);
      for (const chunk of chunks) {
        try {
          await ctx.reply(chunk, { parse_mode: "Markdown" });
        } catch {
          await ctx.reply(chunk);
        }
      }
    } catch (err: any) {
      if (err.name === "AbortError") {
        await ctx.reply("Search timed out. Try a more specific pattern.");
      } else {
        await ctx.reply(`Error: ${err.message}`);
      }
    }
  });

  bot.command("find", async (ctx) => {
    const query = ctx.match?.trim();
    if (!query) {
      await ctx.reply("Usage: /find <filename-pattern>");
      return;
    }

    try {
      await ctx.replyWithChatAction("typing");
      const client = getClient();
      const result = await client.find.files({ query: { query } });

      if (result.error) {
        await ctx.reply("Find failed.");
        return;
      }

      const files = result.data ?? [];
      if (files.length === 0) {
        await ctx.reply(`No files found matching: ${query}`);
        return;
      }

      const text = files.slice(0, 50).map((f) => `\`${f}\``).join("\n");
      const header = `Found ${files.length} file(s) matching \`${query}\`:\n\n`;
      const chunks = chunkMessage(header + text);
      for (const chunk of chunks) {
        try {
          await ctx.reply(chunk, { parse_mode: "Markdown" });
        } catch {
          await ctx.reply(chunk);
        }
      }
    } catch (err: any) {
      await ctx.reply(`Error: ${err.message}`);
    }
  });

  bot.command("symbols", async (ctx) => {
    const query = ctx.match?.trim();
    if (!query) {
      await ctx.reply("Usage: /symbols <query>");
      return;
    }

    try {
      const client = getClient();
      const result = await client.find.symbols({ query: { query } });

      if (result.error) {
        await ctx.reply("Symbol search failed.");
        return;
      }

      const symbols = result.data ?? [];
      if (symbols.length === 0) {
        await ctx.reply(`No symbols found for: ${query}`);
        return;
      }

      const text = symbols
        .slice(0, 30)
        .map((s: any) => `\`${s.name}\` in \`${s.location?.path ?? "unknown"}\``)
        .join("\n");

      await ctx.reply(`Found ${symbols.length} symbol(s):\n\n${text}`, { parse_mode: "Markdown" });
    } catch (err: any) {
      await ctx.reply(`Error: ${err.message}`);
    }
  });

  bot.command("status", async (ctx) => {
    try {
      const client = getClient();
      const result = await client.file.status();

      if (result.error) {
        await ctx.reply("Failed to get file status.");
        return;
      }

      const files = result.data ?? [];
      if (files.length === 0) {
        await ctx.reply("No changed files (clean working tree).");
        return;
      }

      const text = files
        .map((f: any) => `\`${f.status ?? "?"}\` ${f.path ?? f}`)
        .join("\n");

      await ctx.reply(`**File status:**\n\n${text}`, { parse_mode: "Markdown" });
    } catch (err: any) {
      await ctx.reply(`Error: ${err.message}`);
    }
  });
}
