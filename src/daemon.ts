import { existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { execCmd, spawnCmd, sleepSync } from "./utils/shell.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROCESS_NAME = "relay";

interface Pm2ProcessInfo {
  status: string;
  pid: number;
  uptime: number;
  restarts: number;
  memory: number;
  cpu: number;
}

function formatUptime(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) return `${days}d ${hours % 24}h`;
  if (hours > 0) return `${hours}h ${minutes % 60}m`;
  if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
  return `${seconds}s`;
}

function formatMemory(bytes: number): string {
  const mb = bytes / (1024 * 1024);
  if (mb >= 1024) return `${(mb / 1024).toFixed(1)} GB`;
  return `${mb.toFixed(1)} MB`;
}

function isPm2Available(): boolean {
  try {
    execCmd("pm2", ["--version"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

function ensurePm2(): void {
  if (isPm2Available()) return;

  console.log("  pm2 not found. Installing globally...\n");
  try {
    execCmd("npm", ["install", "-g", "pm2"], { stdio: "inherit" });
    console.log();
  } catch {
    const hint = process.platform === "win32"
      ? "npm install -g pm2"
      : "sudo npm install -g pm2";
    console.error(
      `  Failed to install pm2. Try manually:\n\n    ${hint}\n`
    );
    process.exit(1);
  }

  if (!isPm2Available()) {
    console.error(
      "  pm2 installed but not found in PATH. You may need to restart your shell.\n"
    );
    process.exit(1);
  }
}

function getProcessInfo(): Pm2ProcessInfo | null {
  try {
    const result = execCmd("pm2", ["jlist"], {
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "ignore"],
    }) as string;
    const processes = JSON.parse(result);
    const proc = processes.find(
      (p: { name: string }) => p.name === PROCESS_NAME
    );
    if (!proc) return null;

    return {
      status: proc.pm2_env?.status ?? "unknown",
      pid: proc.pid ?? 0,
      uptime: Date.now() - (proc.pm2_env?.pm_uptime ?? Date.now()),
      restarts: proc.pm2_env?.restart_time ?? 0,
      memory: proc.monit?.memory ?? 0,
      cpu: proc.monit?.cpu ?? 0,
    };
  } catch {
    return null;
  }
}

function buildPassthroughArgs(): string[] {
  const args = process.argv.slice(2);
  // Remove the subcommand (start, restart, etc.)
  return args.slice(1);
}

function printStatus(info: Pm2ProcessInfo): void {
  console.log(`
  Relay daemon is running

    Status:    ${info.status}
    PID:       ${info.pid}
    Uptime:    ${formatUptime(info.uptime)}
    Memory:    ${formatMemory(info.memory)}
    CPU:       ${info.cpu}%
    Restarts:  ${info.restarts}
`);
}

function getCliEntryPath(): string {
  // When running from source (dist/daemon.js), the entry is dist/cli.js
  // When running as a package, __dirname points to the dist folder
  return join(__dirname, "cli.js");
}

export function daemonStart(): void {
  ensurePm2();

  const info = getProcessInfo();
  if (info && info.status === "online") {
    console.log(`\n  Relay daemon is already running (PID: ${info.pid})\n`);
    return;
  }

  const entryPath = getCliEntryPath();
  if (!existsSync(entryPath)) {
    console.error(
      `\n  Entry point not found: ${entryPath}\n  Run \`npm run build\` first.\n`
    );
    process.exit(1);
  }

  // If there's a stopped/errored process, delete it first
  if (info) {
    try {
      execCmd("pm2", ["delete", PROCESS_NAME], { stdio: "ignore" });
    } catch {
      // ignore
    }
  }

  const passthroughArgs = buildPassthroughArgs();
  const pm2Args = [
    "start",
    entryPath,
    "--name",
    PROCESS_NAME,
    "--time",
    "--max-restarts",
    "10",
    "--restart-delay",
    "5000",
  ];

  if (passthroughArgs.length > 0) {
    pm2Args.push("--", ...passthroughArgs);
  }

  try {
    execCmd("pm2", pm2Args, { stdio: "inherit" });
  } catch {
    console.error("\n  Failed to start daemon.\n");
    process.exit(1);
  }

  // Brief pause for pm2 to register the process
  sleepSync(1);

  const newInfo = getProcessInfo();
  if (newInfo) {
    printStatus(newInfo);
  } else {
    console.log("\n  Daemon started. Run `relay status` to check.\n");
  }
}

export function daemonStop(): void {
  if (!isPm2Available()) {
    console.log("\n  Relay daemon is not running.\n");
    return;
  }

  const info = getProcessInfo();
  if (!info) {
    console.log("\n  Relay daemon is not running.\n");
    return;
  }

  try {
    execCmd("pm2", ["stop", PROCESS_NAME], { stdio: "ignore" });
    execCmd("pm2", ["delete", PROCESS_NAME], { stdio: "ignore" });
  } catch {
    // ignore — may already be stopped
  }

  console.log("\n  Relay daemon stopped.\n");
}

export function daemonRestart(): void {
  ensurePm2();

  const info = getProcessInfo();
  if (!info || info.status !== "online") {
    console.error(
      "\n  Relay daemon is not running. Use `relay start` to start it.\n"
    );
    process.exit(1);
  }

  try {
    execCmd("pm2", ["restart", PROCESS_NAME], { stdio: "inherit" });
  } catch {
    console.error("\n  Failed to restart daemon.\n");
    process.exit(1);
  }

  sleepSync(1);

  const newInfo = getProcessInfo();
  if (newInfo) {
    printStatus(newInfo);
  }
}

export function daemonLogs(): void {
  if (!isPm2Available()) {
    console.error(
      "\n  Relay daemon is not running. Use `relay start` to start it.\n"
    );
    process.exit(1);
  }

  const info = getProcessInfo();
  if (!info) {
    console.error(
      "\n  Relay daemon is not running. Use `relay start` to start it.\n"
    );
    process.exit(1);
  }

  spawnCmd("pm2", ["logs", PROCESS_NAME, "--lines", "50"], {
    stdio: "inherit",
  });
}

export function daemonStatus(): void {
  if (!isPm2Available()) {
    console.log("\n  Relay daemon is not running.\n");
    return;
  }

  const info = getProcessInfo();
  if (!info) {
    console.log("\n  Relay daemon is not running.\n");
    return;
  }

  printStatus(info);
}
