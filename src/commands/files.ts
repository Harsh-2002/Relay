import type { Bot } from "grammy";
import { InputFile } from "grammy";
import { getProvider } from "../providers/index.js";
import { chunkMessage } from "../utils/chunker.js";
import { formatCatchError } from "../utils/errors.js";

export function registerFileCommands(bot: Bot): void {
  bot.command("read", async (ctx) => {
    const filePath = ctx.match?.trim();
    if (!filePath) {
      await ctx.reply("Usage: /read <file-path>");
      return;
    }

    try {
      await ctx.replyWithChatAction("typing");
      const provider = getProvider();
      const content = await provider.readFile(filePath);

      if (content === null) {
        await ctx.reply(
          `File reading is not directly supported by the ${provider.name} provider.`
        );
        return;
      }

      const header = `**${filePath}**\n\n`;

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
      await ctx.reply(formatCatchError(err, "reading file"), { parse_mode: "HTML" });
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
      const provider = getProvider();
      const matches = await provider.searchText(pattern);

      if (matches === null) {
        await ctx.reply(
          `Text search is not directly supported by the ${provider.name} provider.`
        );
        return;
      }

      if (matches.length === 0) {
        await ctx.reply(`No matches found for: ${pattern}`);
        return;
      }

      const text = matches
        .slice(0, 20)
        .map((m) => `**${m.file}${m.line ? `:${m.line}` : ""}**\n\`${m.text ?? ""}\``)
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
      await ctx.reply(formatCatchError(err, "searching files"), { parse_mode: "HTML" });
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
      const provider = getProvider();
      const files = await provider.findFiles(query);

      if (files === null) {
        await ctx.reply(
          `File search is not directly supported by the ${provider.name} provider.`
        );
        return;
      }

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
      await ctx.reply(formatCatchError(err, "finding files"), { parse_mode: "HTML" });
    }
  });

  bot.command("symbols", async (ctx) => {
    const query = ctx.match?.trim();
    if (!query) {
      await ctx.reply("Usage: /symbols <query>");
      return;
    }

    try {
      const provider = getProvider();
      const symbols = await provider.findSymbols(query);

      if (symbols === null) {
        await ctx.reply(
          `Symbol search is not supported by the ${provider.name} provider.`
        );
        return;
      }

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
      await ctx.reply(formatCatchError(err, "searching symbols"), { parse_mode: "HTML" });
    }
  });

  bot.command("status", async (ctx) => {
    try {
      const provider = getProvider();
      const files = await provider.getFileStatus();

      if (files === null) {
        await ctx.reply(
          `File status is not directly supported by the ${provider.name} provider.`
        );
        return;
      }

      if (files.length === 0) {
        await ctx.reply("No changed files (clean working tree).");
        return;
      }

      const text = files
        .map((f) => `\`${f.status}\` ${f.path}`)
        .join("\n");

      await ctx.reply(`**File status:**\n\n${text}`, { parse_mode: "Markdown" });
    } catch (err: any) {
      await ctx.reply(formatCatchError(err, "fetching file status"), { parse_mode: "HTML" });
    }
  });
}
