import { exec } from "child_process";
import { existsSync } from "fs";
import { homedir } from "os";
import { join } from "path";
import type { Bot } from "grammy";
import { InlineKeyboard } from "grammy";
import { getProvider } from "../providers/index.js";
import { getOrCreateSession } from "../session.js";
import { chunkMessage } from "../utils/chunker.js";
import { formatCatchError } from "../utils/errors.js";
import { escapeHtml } from "../utils/html.js";
import { execCmd } from "../utils/shell.js";

// ── OpenCode binary detection ──────────────────────────────────────

let cachedBin: string | null = null;

function resolveOpencodeBin(): string {
  if (cachedBin) return cachedBin;

  // Try PATH first
  try {
    const result = execCmd("which", ["opencode"], { encoding: "utf-8", stdio: ["pipe", "pipe", "ignore"] });
    const path = (result as string).trim();
    if (path) { cachedBin = path; return path; }
  } catch { /* not in PATH */ }

  // Fall back to default install location
  const fallback = join(homedir(), ".opencode", "bin", "opencode");
  if (existsSync(fallback)) { cachedBin = fallback; return fallback; }

  // Last resort — hope it's in PATH at runtime
  cachedBin = "opencode";
  return "opencode";
}

// ── ANSI stripping ─────────────────────────────────────────────────

function stripAnsi(text: string): string {
  return text.replace(/\x1B\[[0-9;]*[A-Za-z]/g, "");
}

// ── CLI exec helper ────────────────────────────────────────────────

function runCliCommand(args: string[], timeout: number): Promise<string> {
  const bin = resolveOpencodeBin();
  const cmd = `${bin} ${args.join(" ")}`;
  return new Promise((resolve, reject) => {
    exec(cmd, {
      timeout,
      maxBuffer: 1024 * 1024,
      env: { ...process.env, NO_COLOR: "1" },
    }, (err, stdout, stderr) => {
      if (err && !stdout && !stderr) return reject(err);
      const output = stripAnsi((stdout || "") + (stderr || "")).trim();
      resolve(output || "(no output)");
    });
  });
}

// ── Unified command map ────────────────────────────────────────────

interface CmdDef {
  label: string;
  type: "api" | "cli";
  description: string;
  args?: string[];
  timeout?: number;
}

const CMD_DEFS: Record<string, CmdDef> = {
  // Session API commands
  init:     { label: "Init",     type: "api", description: "Create/update AGENTS.md" },
  review:   { label: "Review",   type: "api", description: "Review code changes" },
  // CLI commands
  stats:    { label: "Stats",    type: "cli", description: "Token usage & cost",     args: ["stats"],          timeout: 30_000 },
  version:  { label: "Version",  type: "cli", description: "OpenCode version",       args: ["--version"],      timeout: 10_000 },
  upgrade:  { label: "Upgrade",  type: "cli", description: "Upgrade OpenCode",       args: ["upgrade"],        timeout: 120_000 },
  sessions: { label: "Sessions", type: "cli", description: "List CLI sessions",      args: ["session", "list"], timeout: 30_000 },
};

const CMD_KEYS = Object.keys(CMD_DEFS);

// ── Handlers ───────────────────────────────────────────────────────

// Commands that would kill/restart the bot process, causing a replay loop
const BLOCKED_PATTERNS = [
  /\brelay\s+(restart|stop|start)\b/i,
  /\bpm2\s+(restart|stop|delete|kill)\b/i,
  /\bkill\s+(-\d+\s+)?(\$\$|%|\d)/i,
  /\bkillall\s+node\b/i,
];

export function registerShellCommands(bot: Bot): void {
  bot.command("shell", async (ctx) => {
    const command = ctx.match?.trim();
    if (!command) {
      await ctx.reply("Usage: <code>/shell &lt;command&gt;</code>", { parse_mode: "HTML" });
      return;
    }

    if (BLOCKED_PATTERNS.some(p => p.test(command))) {
      await ctx.reply(
        `<b>Blocked:</b> This command would kill the bot process.\n\nUse /restart or /update instead.`,
        { parse_mode: "HTML" },
      );
      return;
    }

    try {
      await ctx.replyWithChatAction("typing");
      const sessionId = await getOrCreateSession();
      const provider = getProvider();

      const result = await provider.shell(sessionId, command);

      if (result === null) {
        await ctx.reply("Shell command returned no output.", { parse_mode: "HTML" });
        return;
      }

      const formatted = `<b>$ ${escapeHtml(command)}</b>\n\n<pre>${escapeHtml(result)}</pre>`;
      const chunks = chunkMessage(formatted);
      for (const chunk of chunks) {
        await ctx.reply(chunk, { parse_mode: "HTML" });
      }
    } catch (err: any) {
      await ctx.reply(formatCatchError(err, "running shell command"), { parse_mode: "HTML" });
    }
  });

  // ── /cmd — inline picker or direct execution ──

  bot.command("cmd", async (ctx) => {
    const input = ctx.match?.trim();

    // No args → show picker
    if (!input) {
      const kb = new InlineKeyboard();
      const keys = CMD_KEYS;
      for (let i = 0; i < keys.length; i += 2) {
        kb.row();
        const a = CMD_DEFS[keys[i]];
        kb.text(`${a.label}`, `cmd:${keys[i]}`);
        if (i + 1 < keys.length) {
          const b = CMD_DEFS[keys[i + 1]];
          kb.text(`${b.label}`, `cmd:${keys[i + 1]}`);
        }
      }

      let text = `<b>OpenCode Commands</b>\n\n`;
      for (const key of keys) {
        const def = CMD_DEFS[key];
        text += `<code>${escapeHtml(key)}</code>  —  ${escapeHtml(def.description)}\n`;
      }

      await ctx.reply(text, { parse_mode: "HTML", reply_markup: kb });
      return;
    }

    // With args → execute directly
    const spaceIdx = input.indexOf(" ");
    const cmdName = spaceIdx === -1 ? input : input.slice(0, spaceIdx);
    const cmdArgs = spaceIdx === -1 ? "" : input.slice(spaceIdx + 1);

    const def = CMD_DEFS[cmdName];
    if (!def) {
      const available = CMD_KEYS.map((k) => `<code>${escapeHtml(k)}</code>`).join(", ");
      await ctx.reply(
        `Unknown command: <code>${escapeHtml(cmdName)}</code>\n\n<b>Available:</b>  ${available}`,
        { parse_mode: "HTML" },
      );
      return;
    }

    await ctx.replyWithChatAction("typing");
    try {
      let output: string;

      if (def.type === "api") {
        const sessionId = await getOrCreateSession();
        const provider = getProvider();
        const result = await provider.runCommand(sessionId, cmdName, cmdArgs);
        output = result?.text ?? "(no output)";
      } else {
        output = await runCliCommand(def.args!, def.timeout!);
      }

      const formatted = `<b>${escapeHtml(def.label)}</b>\n\n<pre>${escapeHtml(output)}</pre>`;
      const chunks = chunkMessage(formatted);
      for (const chunk of chunks) {
        await ctx.reply(chunk, { parse_mode: "HTML" });
      }
    } catch (err: any) {
      await ctx.reply(formatCatchError(err, `running ${cmdName}`), { parse_mode: "HTML" });
    }
  });

  // ── Callback handler for /cmd picker buttons ──

  bot.callbackQuery(/^cmd:(.+)$/, async (ctx) => {
    const key = ctx.match[1];
    const def = CMD_DEFS[key];

    if (!def) {
      await ctx.answerCallbackQuery({ text: "Unknown command" });
      return;
    }

    await ctx.answerCallbackQuery({ text: `Running ${def.label}...` });

    try {
      let output: string;

      if (def.type === "api") {
        const sessionId = await getOrCreateSession();
        const provider = getProvider();
        const result = await provider.runCommand(sessionId, key, "");
        output = result?.text ?? "(no output)";
      } else {
        output = await runCliCommand(def.args!, def.timeout!);
      }

      const formatted = `<b>${escapeHtml(def.label)}</b>\n\n<pre>${escapeHtml(output)}</pre>`;
      const chunks = chunkMessage(formatted);
      for (const chunk of chunks) {
        await ctx.reply(chunk, { parse_mode: "HTML" });
      }
    } catch (err: any) {
      await ctx.reply(formatCatchError(err, `running ${key}`), { parse_mode: "HTML" });
    }
  });

  // ── /commands — list session API commands ──

  bot.command("commands", async (ctx) => {
    try {
      const provider = getProvider();
      const commands = await provider.getCommands();

      if (!commands || commands.length === 0) {
        await ctx.reply("No commands available.", { parse_mode: "HTML" });
        return;
      }

      const text =
        `<b>Commands</b>  (${commands.length})\n` +
        `<i>Use with /cmd &lt;command&gt;</i>\n\n` +
        commands
          .map((c) => {
            const desc = c.description ? ` — ${escapeHtml(c.description)}` : "";
            return `<code>${escapeHtml(c.name)}</code>${desc}`;
          })
          .join("\n");

      const chunks = chunkMessage(text);
      for (const chunk of chunks) {
        await ctx.reply(chunk, { parse_mode: "HTML" });
      }
    } catch (err: any) {
      await ctx.reply(formatCatchError(err, "listing commands"), { parse_mode: "HTML" });
    }
  });
}
