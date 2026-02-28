import type { Bot } from "grammy";
import { InputFile } from "grammy";
import { getProvider } from "../providers/index.js";
import { chunkMessage } from "../utils/chunker.js";
import { formatCatchError } from "../utils/errors.js";
import { escapeHtml } from "../utils/html.js";

export function registerFileCommands(bot: Bot): void {
  bot.command("read", async (ctx) => {
    const filePath = ctx.match?.trim();
    if (!filePath) {
      await ctx.reply("Usage: <code>/read &lt;file-path&gt;</code>", { parse_mode: "HTML" });
      return;
    }

    try {
      await ctx.replyWithChatAction("typing");
      const provider = getProvider();
      const content = await provider.readFile(filePath);

      if (content === null) {
        await ctx.reply(
          `File reading is not supported by the <b>${escapeHtml(provider.name)}</b> provider.`,
          { parse_mode: "HTML" }
        );
        return;
      }

      const header = `<b>${escapeHtml(filePath)}</b>\n\n`;

      if (content.length > 15000) {
        const buffer = Buffer.from(content, "utf-8");
        const fileName = filePath.split("/").pop() ?? "file.txt";
        await ctx.replyWithDocument(new InputFile(buffer, fileName));
        return;
      }

      const formatted = header + "<pre>" + escapeHtml(content) + "</pre>";
      const chunks = chunkMessage(formatted);
      for (const chunk of chunks) {
        await ctx.reply(chunk, { parse_mode: "HTML" });
      }
    } catch (err: any) {
      await ctx.reply(formatCatchError(err, "reading file"), { parse_mode: "HTML" });
    }
  });

  bot.command("search", async (ctx) => {
    const pattern = ctx.match?.trim();
    if (!pattern) {
      await ctx.reply("Usage: <code>/search &lt;pattern&gt;</code>", { parse_mode: "HTML" });
      return;
    }

    try {
      await ctx.replyWithChatAction("typing");
      const provider = getProvider();
      const matches = await provider.searchText(pattern);

      if (matches === null) {
        await ctx.reply(
          `Text search is not supported by the <b>${escapeHtml(provider.name)}</b> provider.`,
          { parse_mode: "HTML" }
        );
        return;
      }

      if (matches.length === 0) {
        await ctx.reply(`No matches found for: <code>${escapeHtml(pattern)}</code>`, { parse_mode: "HTML" });
        return;
      }

      const shown = matches.slice(0, 20);
      const text = shown
        .map((m) => `<b>${escapeHtml(m.file)}${m.line ? `:${m.line}` : ""}</b>\n<code>${escapeHtml(m.text ?? "")}</code>`)
        .join("\n\n");

      const header = `Found ${matches.length} match(es) for <code>${escapeHtml(pattern)}</code>:\n\n`;
      const footer = matches.length > 20 ? `\n\n<i>...and ${matches.length - 20} more</i>` : "";
      const chunks = chunkMessage(header + text + footer);
      for (const chunk of chunks) {
        await ctx.reply(chunk, { parse_mode: "HTML" });
      }
    } catch (err: any) {
      await ctx.reply(formatCatchError(err, "searching files"), { parse_mode: "HTML" });
    }
  });

  bot.command("find", async (ctx) => {
    const query = ctx.match?.trim();
    if (!query) {
      await ctx.reply("Usage: <code>/find &lt;filename-pattern&gt;</code>", { parse_mode: "HTML" });
      return;
    }

    try {
      await ctx.replyWithChatAction("typing");
      const provider = getProvider();
      const files = await provider.findFiles(query);

      if (files === null) {
        await ctx.reply(
          `File search is not supported by the <b>${escapeHtml(provider.name)}</b> provider.`,
          { parse_mode: "HTML" }
        );
        return;
      }

      if (files.length === 0) {
        await ctx.reply(`No files found matching: <code>${escapeHtml(query)}</code>`, { parse_mode: "HTML" });
        return;
      }

      const shown = files.slice(0, 50);
      const text = shown.map((f) => `<code>${escapeHtml(f)}</code>`).join("\n");
      const header = `Found ${files.length} file(s) matching <code>${escapeHtml(query)}</code>:\n\n`;
      const footer = files.length > 50 ? `\n\n<i>...and ${files.length - 50} more</i>` : "";
      const chunks = chunkMessage(header + text + footer);
      for (const chunk of chunks) {
        await ctx.reply(chunk, { parse_mode: "HTML" });
      }
    } catch (err: any) {
      await ctx.reply(formatCatchError(err, "finding files"), { parse_mode: "HTML" });
    }
  });

  bot.command("symbols", async (ctx) => {
    const query = ctx.match?.trim();
    if (!query) {
      await ctx.reply("Usage: <code>/symbols &lt;query&gt;</code>", { parse_mode: "HTML" });
      return;
    }

    try {
      const provider = getProvider();
      const symbols = await provider.findSymbols(query);

      if (symbols === null) {
        await ctx.reply(
          `Symbol search is not supported by the <b>${escapeHtml(provider.name)}</b> provider.`,
          { parse_mode: "HTML" }
        );
        return;
      }

      if (symbols.length === 0) {
        await ctx.reply(`No symbols found for: <code>${escapeHtml(query)}</code>`, { parse_mode: "HTML" });
        return;
      }

      const shown = symbols.slice(0, 30);
      const text = shown
        .map((s: any) => `<code>${escapeHtml(s.name)}</code> in <code>${escapeHtml(s.location?.path ?? "unknown")}</code>`)
        .join("\n");

      const footer = symbols.length > 30 ? `\n\n<i>...and ${symbols.length - 30} more</i>` : "";
      await ctx.reply(`Found ${symbols.length} symbol(s):\n\n${text}${footer}`, { parse_mode: "HTML" });
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
          `File status is not supported by the <b>${escapeHtml(provider.name)}</b> provider.`,
          { parse_mode: "HTML" }
        );
        return;
      }

      if (files.length === 0) {
        await ctx.reply("No changed files (clean working tree).", { parse_mode: "HTML" });
        return;
      }

      const text = files
        .map((f) => `<code>${escapeHtml(f.status)}</code> ${escapeHtml(f.path)}`)
        .join("\n");

      await ctx.reply(`<b>File status:</b>\n\n${text}`, { parse_mode: "HTML" });
    } catch (err: any) {
      await ctx.reply(formatCatchError(err, "fetching file status"), { parse_mode: "HTML" });
    }
  });
}
