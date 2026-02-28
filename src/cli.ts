#!/usr/bin/env node
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { loadConfig, setConfig } from "./config/index.js";
import { runSetupWizard } from "./config/setup.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

function printVersion(): void {
  try {
    const pkg = JSON.parse(readFileSync(join(__dirname, "..", "package.json"), "utf-8"));
    console.log(`relay v${pkg.version}`);
  } catch {
    console.log("relay (unknown version)");
  }
}

function printHelp(): void {
  console.log(`
  relay — Telegram bot for AI coding agents

  Usage:
    relay                       Start the bot (foreground)
    relay onboard               Interactive configuration wizard
    relay start                 Start the bot as a background daemon
    relay stop                  Stop the background daemon
    relay restart               Restart the background daemon
    relay logs                  Tail daemon logs (Ctrl+C to exit)
    relay status                Show daemon status
    relay update                Update Relay to the latest version
    relay --help                Show this help message
    relay --version             Show version

  Options:
    --bot-token <token>         Telegram bot token
    --allowed-user-id <id>      Telegram user ID
    --provider <name>           Provider: opencode, claude, codex
    --bot-mode <mode>           Bot mode: polling, webhook
    --streaming-enabled <bool>  Enable streaming responses
    --log-level <level>         Log level: debug, info, warn, error
    --data-dir <path>           Data directory (default: .relay/)
    --system-prompt-file <path> System prompt file path

  Config is loaded from: .relay/config.json
  Run 'relay onboard' to create or update config interactively.

  Documentation: https://github.com/Harsh-2002/Relay
`);
}

const DAEMON_COMMANDS = new Set(["start", "stop", "restart", "logs", "status", "update"]);

async function main() {
  const args = process.argv.slice(2);
  const subcommand = args[0];

  // Route daemon subcommands before loading config
  if (subcommand && DAEMON_COMMANDS.has(subcommand)) {
    const daemon = await import("./daemon.js");
    switch (subcommand) {
      case "start":
        daemon.daemonStart();
        break;
      case "stop":
        daemon.daemonStop();
        break;
      case "restart":
        daemon.daemonRestart();
        break;
      case "logs":
        daemon.daemonLogs();
        break;
      case "status":
        daemon.daemonStatus();
        break;
      case "update": {
        const { update } = await import("./update.js");
        update();
        break;
      }
    }
    return;
  }

  // Check for 'onboard' subcommand before parsing flags
  const isOnboard = subcommand === "onboard";

  const result = loadConfig();

  if (result.showVersion) {
    printVersion();
    process.exit(0);
  }

  if (result.showHelp) {
    printHelp();
    process.exit(0);
  }

  if (isOnboard || result.needsSetup) {
    if (result.needsSetup && !isOnboard) {
      console.log("\n  No config found. Starting setup wizard...\n");
    }
    const config = await runSetupWizard(result.config.dataDir);
    setConfig(config);

    // If this was an explicit 'onboard' command, exit after saving
    if (isOnboard) {
      process.exit(0);
    }
  } else {
    setConfig(result.config);
  }

  // Now start the bot
  await import("./index.js");
}

main().catch((err) => {
  console.error("Fatal:", err?.message ?? err);
  process.exit(1);
});
