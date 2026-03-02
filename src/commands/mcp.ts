import type { Bot } from "grammy";
import { InlineKeyboard } from "grammy";
import { getProvider } from "../providers/index.js";
import type { McpServerStatus } from "../providers/types.js";
import { formatCatchError, isNotModified } from "../utils/errors.js";
import { escapeHtml } from "../utils/html.js";

function buildMcpStatus(servers: McpServerStatus[]): { text: string; keyboard: InlineKeyboard } {
  let text = `<b>MCP Servers</b>  (${servers.length})\n\n`;

  servers.forEach((srv, i) => {
    const num = i + 1;
    const statusIcon = srv.status === "connected" ? "ok" : srv.status;
    text += `${num}. <code>${escapeHtml(srv.name)}</code>  ${statusIcon}`;
    if (srv.error) {
      text += `\n   <i>${escapeHtml(srv.error)}</i>`;
    }
    text += "\n";
  });

  const kb = new InlineKeyboard();
  servers.forEach((srv, i) => {
    const num = i + 1;
    const action = srv.status === "disabled" ? "Connect" : "Reconnect";
    kb.row()
      .text(`${num}. ${action}`, `mcp_conn:${srv.name}`)
      .text(`${num}. 🗑`, `mcp_rm:${srv.name}`);
  });

  return { text, keyboard: kb };
}

export function registerMcpCommands(bot: Bot): void {
  bot.command("mcp", async (ctx) => {
    const input = ctx.match?.trim() ?? "";

    // /mcp add <name> local <command...>
    // /mcp add <name> remote <url>
    if (input.startsWith("add ")) {
      await handleMcpAdd(ctx, input.slice(4).trim());
      return;
    }

    // /mcp remove <name>
    if (input.startsWith("remove ")) {
      await handleMcpRemove(ctx, input.slice(7).trim());
      return;
    }

    // /mcp connect <name>
    if (input.startsWith("connect ")) {
      await handleMcpConnect(ctx, input.slice(8).trim());
      return;
    }

    // /mcp — show status with picker
    await handleMcpStatus(ctx);
  });

  // --- MCP picker callback handlers ---

  bot.callbackQuery(/^mcp_conn:(.+)$/, async (ctx) => {
    try {
      const name = ctx.match[1];
      const provider = getProvider();
      await provider.connectMcpServer(name);

      // Re-fetch and rebuild
      const servers = await provider.getMcpStatus();
      if (servers && servers.length > 0) {
        const { text, keyboard } = buildMcpStatus(servers);
        try {
          await ctx.editMessageText(text, { parse_mode: "HTML", reply_markup: keyboard });
        } catch (err: any) {
          if (!isNotModified(err)) throw err;
        }
      }
      await ctx.answerCallbackQuery({ text: `Reconnecting ${name}...` });
    } catch (err: any) {
      await ctx.answerCallbackQuery({ text: "Failed to connect server" });
    }
  });

  bot.callbackQuery(/^mcp_rm:(.+)$/, async (ctx) => {
    try {
      const name = ctx.match[1];
      const provider = getProvider();
      await provider.removeMcpServer(name);

      // Re-fetch and rebuild
      const servers = await provider.getMcpStatus();
      if (!servers || servers.length === 0) {
        try {
          await ctx.editMessageText(
            `<b>MCP Servers</b>\n\nNo MCP servers configured.\n\n` +
            `<i>Use /mcp add &lt;name&gt; local &lt;command&gt; or /mcp add &lt;name&gt; remote &lt;url&gt;</i>`,
            { parse_mode: "HTML" }
          );
        } catch (err: any) {
          if (!isNotModified(err)) throw err;
        }
      } else {
        const { text, keyboard } = buildMcpStatus(servers);
        try {
          await ctx.editMessageText(text, { parse_mode: "HTML", reply_markup: keyboard });
        } catch (err: any) {
          if (!isNotModified(err)) throw err;
        }
      }
      await ctx.answerCallbackQuery({ text: `${name} removed` });
    } catch (err: any) {
      await ctx.answerCallbackQuery({ text: "Failed to remove server" });
    }
  });
}

async function handleMcpStatus(ctx: any): Promise<void> {
  try {
    const provider = getProvider();
    const servers = await provider.getMcpStatus();

    if (servers === null) {
      await ctx.reply("MCP status is not available.", { parse_mode: "HTML" });
      return;
    }

    if (servers.length === 0) {
      await ctx.reply(
        `<b>MCP Servers</b>\n\nNo MCP servers configured.\n\n` +
        `<i>Use /mcp add &lt;name&gt; local &lt;command&gt; or /mcp add &lt;name&gt; remote &lt;url&gt;</i>`,
        { parse_mode: "HTML" }
      );
      return;
    }

    const { text, keyboard } = buildMcpStatus(servers);
    await ctx.reply(text, { parse_mode: "HTML", reply_markup: keyboard });
  } catch (err: any) {
    await ctx.reply(formatCatchError(err, "checking MCP status"), { parse_mode: "HTML" });
  }
}

async function handleMcpAdd(ctx: any, input: string): Promise<void> {
  // Parse: <name> local <command...> or <name> remote <url>
  const parts = input.split(/\s+/);
  if (parts.length < 3) {
    await ctx.reply(
      `<b>Usage:</b>\n` +
      `<code>/mcp add name local npx -y @modelcontextprotocol/server-x</code>\n` +
      `<code>/mcp add name remote https://mcp.example.com</code>`,
      { parse_mode: "HTML" }
    );
    return;
  }

  const name = parts[0];
  const type = parts[1];

  try {
    const provider = getProvider();

    if (type === "local") {
      const command = parts.slice(2);
      await provider.addMcpServer(name, { type: "local", command });
      await ctx.reply(
        `MCP server <code>${escapeHtml(name)}</code> added (local: <code>${escapeHtml(command.join(" "))}</code>)`,
        { parse_mode: "HTML" }
      );
    } else if (type === "remote") {
      const url = parts[2];
      await provider.addMcpServer(name, { type: "remote", url });
      await ctx.reply(
        `MCP server <code>${escapeHtml(name)}</code> added (remote: <code>${escapeHtml(url)}</code>)`,
        { parse_mode: "HTML" }
      );
    } else {
      await ctx.reply(
        `Unknown MCP type: ${escapeHtml(type)}. Use "local" or "remote".`,
        { parse_mode: "HTML" }
      );
    }
  } catch (err: any) {
    await ctx.reply(formatCatchError(err, "adding MCP server"), { parse_mode: "HTML" });
  }
}

async function handleMcpConnect(ctx: any, name: string): Promise<void> {
  if (!name) {
    await ctx.reply(
      `<b>Usage:</b>  <code>/mcp connect name</code>`,
      { parse_mode: "HTML" }
    );
    return;
  }

  try {
    const provider = getProvider();
    const ok = await provider.connectMcpServer(name);

    if (ok) {
      await ctx.reply(
        `MCP server <code>${escapeHtml(name)}</code> reconnected.`,
        { parse_mode: "HTML" }
      );
    } else {
      await ctx.reply(
        `Could not connect MCP server <code>${escapeHtml(name)}</code>.`,
        { parse_mode: "HTML" }
      );
    }
  } catch (err: any) {
    await ctx.reply(formatCatchError(err, "connecting MCP server"), { parse_mode: "HTML" });
  }
}

async function handleMcpRemove(ctx: any, name: string): Promise<void> {
  if (!name) {
    await ctx.reply(
      `<b>Usage:</b>  <code>/mcp remove name</code>`,
      { parse_mode: "HTML" }
    );
    return;
  }

  try {
    const provider = getProvider();
    const removed = await provider.removeMcpServer(name);

    if (removed) {
      await ctx.reply(
        `MCP server <code>${escapeHtml(name)}</code> removed.`,
        { parse_mode: "HTML" }
      );
    } else {
      await ctx.reply(
        `Could not remove MCP server <code>${escapeHtml(name)}</code>.`,
        { parse_mode: "HTML" }
      );
    }
  } catch (err: any) {
    await ctx.reply(formatCatchError(err, "removing MCP server"), { parse_mode: "HTML" });
  }
}
