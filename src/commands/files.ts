import type { Bot, Context } from "grammy";
import { InputFile } from "grammy";
import { getProvider } from "../providers/index.js";
import { chunkMessage } from "../utils/chunker.js";
import { formatCatchError } from "../utils/errors.js";
import { escapeHtml } from "../utils/html.js";
import { promptForInput } from "../utils/input.js";

async function executeRead(filePath: string, ctx: Context): Promise<void> {
  try {
    await ctx.replyWithChatAction("typing");
    const provider = getProvider();
    const content = await provider.readFile(filePath);

    if (content === null) {
      await ctx.reply("Could not read this file.", { parse_mode: "HTML" });
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
}

async function executeSearch(pattern: string, ctx: Context): Promise<void> {
  try {
    await ctx.replyWithChatAction("typing");
    const provider = getProvider();
    const matches = await provider.searchText(pattern);

    if (matches === null) {
      await ctx.reply("Search returned no results.", { parse_mode: "HTML" });
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
}

async function executeFind(query: string, ctx: Context): Promise<void> {
  try {
    await ctx.replyWithChatAction("typing");
    const provider = getProvider();
    const files = await provider.findFiles(query);

    if (files === null) {
      await ctx.reply("File search returned no results.", { parse_mode: "HTML" });
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
}

async function executeSymbols(query: string, ctx: Context): Promise<void> {
  try {
    await ctx.replyWithChatAction("typing");
    const provider = getProvider();
    const symbols = await provider.findSymbols(query);

    if (symbols === null) {
      await ctx.reply("Symbol search returned no results.", { parse_mode: "HTML" });
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
}

export function registerFileCommands(bot: Bot): void {
  bot.command("ls", async (ctx) => {
    const dirPath = ctx.match?.trim() || ".";

    try {
      await ctx.replyWithChatAction("typing");
      const provider = getProvider();
      const nodes = await provider.listFiles(dirPath);

      if (nodes === null) {
        await ctx.reply("Could not list this directory.", { parse_mode: "HTML" });
        return;
      }

      // Filter out ignored entries
      const visible = nodes.filter((n) => !n.ignored);

      if (visible.length === 0) {
        await ctx.reply(`<b>${escapeHtml(dirPath)}</b>\n\n(empty)`, { parse_mode: "HTML" });
        return;
      }

      // Sort: directories first, then files, alphabetical within each group
      const dirs = visible.filter((n) => n.type === "directory").sort((a, b) => a.name.localeCompare(b.name));
      const files = visible.filter((n) => n.type === "file").sort((a, b) => a.name.localeCompare(b.name));

      let text = `<b>${escapeHtml(dirPath)}</b>  (${visible.length})\n\n`;
      for (const d of dirs) {
        text += `${escapeHtml(d.name)}/\n`;
      }
      for (const f of files) {
        text += `${escapeHtml(f.name)}\n`;
      }

      const chunks = chunkMessage(text);
      for (const chunk of chunks) {
        await ctx.reply(chunk, { parse_mode: "HTML" });
      }
    } catch (err: any) {
      await ctx.reply(formatCatchError(err, "listing directory"), { parse_mode: "HTML" });
    }
  });

  bot.command("read", async (ctx) => {
    const filePath = ctx.match?.trim();
    if (!filePath) {
      await promptForInput(ctx, "Type the file path:", async (text, replyCtx) => {
        await executeRead(text.trim(), replyCtx);
      });
      return;
    }
    await executeRead(filePath, ctx);
  });

  bot.command("search", async (ctx) => {
    const pattern = ctx.match?.trim();
    if (!pattern) {
      await promptForInput(ctx, "Type the search pattern:", async (text, replyCtx) => {
        await executeSearch(text.trim(), replyCtx);
      });
      return;
    }
    await executeSearch(pattern, ctx);
  });

  bot.command("find", async (ctx) => {
    const query = ctx.match?.trim();
    if (!query) {
      await promptForInput(ctx, "Type the filename pattern:", async (text, replyCtx) => {
        await executeFind(text.trim(), replyCtx);
      });
      return;
    }
    await executeFind(query, ctx);
  });

  bot.command("symbols", async (ctx) => {
    const query = ctx.match?.trim();
    if (!query) {
      await promptForInput(ctx, "Type the symbol query:", async (text, replyCtx) => {
        await executeSymbols(text.trim(), replyCtx);
      });
      return;
    }
    await executeSymbols(query, ctx);
  });

  bot.command("status", async (ctx) => {
    try {
      await ctx.replyWithChatAction("typing");
      const provider = getProvider();
      const files = await provider.getFileStatus();

      if (files === null) {
        await ctx.reply("File status is not available.", { parse_mode: "HTML" });
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
