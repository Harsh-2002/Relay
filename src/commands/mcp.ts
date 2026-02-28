import type { Bot } from "grammy";
import { getProvider } from "../providers/index.js";
import { formatCatchError } from "../utils/errors.js";
import { escapeHtml } from "../utils/html.js";

export function registerMcpCommands(bot: Bot): void {
  bot.command("mcp", async (ctx) => {
    const provider = getProvider();

    if (!provider.capabilities.mcp) {
      await ctx.reply(
        `MCP management is not supported by the ${provider.name} provider.`
      );
      return;
    }

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

    // /mcp — show status
    await handleMcpStatus(ctx);
  });
}

async function handleMcpStatus(ctx: any): Promise<void> {
  try {
    const provider = getProvider();
    const servers = await provider.getMcpStatus();

    if (servers === null) {
      await ctx.reply("MCP status is not available.");
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

    let text = `<b>MCP Servers</b>  (${servers.length})\n\n`;

    for (const srv of servers) {
      const statusIcon = srv.status === "connected" ? "ok" : srv.status;
      text += `<code>${escapeHtml(srv.name)}</code>  ${statusIcon}`;
      if (srv.error) {
        text += `\n  <i>${escapeHtml(srv.error)}</i>`;
      }
      text += "\n";
    }

    await ctx.reply(text, { parse_mode: "HTML" });
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
