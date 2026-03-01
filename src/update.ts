import { execSync } from "child_process";
import { readFileSync, existsSync } from "fs";
import { join, dirname, resolve, normalize } from "path";
import { fileURLToPath } from "url";
import { execCmd } from "./utils/shell.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PACKAGE_NAME = "@4via6/relay";

function getLocalVersion(): string {
  try {
    const pkg = JSON.parse(
      readFileSync(join(__dirname, "..", "package.json"), "utf-8")
    );
    return pkg.version ?? "unknown";
  } catch {
    return "unknown";
  }
}

function getLatestVersion(): string | null {
  try {
    return (execCmd("npm", ["view", PACKAGE_NAME, "version"], {
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "ignore"],
    }) as string).trim();
  } catch {
    return null;
  }
}

function isGitRepo(): boolean {
  return existsSync(join(__dirname, "..", ".git"));
}

function isGlobalNpmInstall(): boolean {
  try {
    const globalPrefix = normalize(
      (execCmd("npm", ["prefix", "-g"], {
        encoding: "utf-8",
        stdio: ["pipe", "pipe", "ignore"],
      }) as string).trim()
    );
    // Normalize both paths to handle Windows backslashes and trailing separators
    const pkgRoot = normalize(resolve(__dirname, ".."));
    return pkgRoot.startsWith(globalPrefix);
  } catch {
    return false;
  }
}

function isDaemonRunning(): boolean {
  try {
    const result = execCmd("pm2", ["jlist"], {
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "ignore"],
    }) as string;
    const processes = JSON.parse(result);
    const proc = processes.find(
      (p: { name: string }) => p.name === "relay"
    );
    return proc?.pm2_env?.status === "online";
  } catch {
    return false;
  }
}

function restartDaemon(): void {
  try {
    execCmd("pm2", ["restart", "relay"], { stdio: "ignore" });
    console.log("  Daemon restarted.\n");
  } catch {
    console.log("  Failed to restart daemon. Run `relay restart` manually.\n");
  }
}

function updateFromNpm(): boolean {
  console.log(`  Updating ${PACKAGE_NAME} via npm...\n`);
  try {
    execCmd("npm", ["install", "-g", `${PACKAGE_NAME}@latest`], {
      stdio: "inherit",
    });
    return true;
  } catch {
    console.error(
      "\n  Update failed. Try manually:\n\n    sudo npm install -g @4via6/relay@latest\n"
    );
    return false;
  }
}

function updateFromSource(): boolean {
  console.log("  Updating from source (git pull)...\n");
  const root = join(__dirname, "..");
  try {
    execSync("git pull && npm install && npm run build", {
      cwd: root,
      stdio: "inherit",
    });
    return true;
  } catch {
    console.error(
      "\n  Update failed. Try manually:\n\n    git pull && npm install && npm run build\n"
    );
    return false;
  }
}

export function update(): void {
  const localVersion = getLocalVersion();
  const latestVersion = getLatestVersion();

  console.log(`\n  Current version: ${localVersion}`);
  if (latestVersion) {
    console.log(`  Latest on npm:   ${latestVersion}`);
  }
  console.log();

  const fromSource = isGitRepo();
  const fromNpm = !fromSource && isGlobalNpmInstall();

  // If npm install and already on latest, skip
  if (fromNpm && latestVersion && localVersion === latestVersion) {
    console.log("  Already up to date.\n");
    return;
  }

  let success: boolean;

  if (fromNpm) {
    success = updateFromNpm();
  } else if (fromSource) {
    success = updateFromSource();
  } else {
    // Fallback: try npm global update
    console.log("  Could not detect install method. Trying npm update...\n");
    success = updateFromNpm();
  }

  if (!success) {
    process.exit(1);
  }

  const newVersion = getLocalVersion();
  console.log(`\n  Updated to v${newVersion}\n`);

  if (isDaemonRunning()) {
    console.log("  Daemon is running — restarting...");
    restartDaemon();
  }
}
