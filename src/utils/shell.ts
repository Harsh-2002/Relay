/**
 * Cross-platform child_process wrappers.
 *
 * On Windows, npm/pm2/opencode are installed as .cmd shims.
 * Node's execFileSync/spawnSync/spawn can't find .cmd files directly.
 * These helpers resolve the command to its .cmd path on Windows.
 */
import {
  execFileSync,
  spawnSync,
  spawn,
  type ExecFileSyncOptions,
  type SpawnSyncOptions,
  type SpawnOptions,
  type ChildProcess,
  type SpawnSyncReturns,
} from "child_process";
const IS_WIN = process.platform === "win32";

/**
 * On Windows, resolve a command name to its full path.
 * Uses `where` to find .cmd/.exe files in PATH.
 * Falls back to cmd+args if resolution fails.
 */
function resolveCmd(cmd: string): string {
  if (!IS_WIN) return cmd;
  try {
    const result = execFileSync("cmd.exe", ["/c", "where", cmd], {
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "ignore"],
    }).trim();
    // `where` returns one path per line; use the first match
    const first = result.split(/\r?\n/)[0];
    return first || cmd;
  } catch {
    return cmd;
  }
}

// Cache resolved paths to avoid repeated `where` calls
const cmdCache = new Map<string, string>();

function getCmdPath(cmd: string): string {
  if (!IS_WIN) return cmd;
  let resolved = cmdCache.get(cmd);
  if (!resolved) {
    resolved = resolveCmd(cmd);
    cmdCache.set(cmd, resolved);
  }
  return resolved;
}

/**
 * Cross-platform execFileSync.
 * Resolves .cmd shims on Windows.
 */
export function execCmd(
  cmd: string,
  args: string[],
  options?: ExecFileSyncOptions
): string | Buffer {
  return execFileSync(getCmdPath(cmd), args, options);
}

/**
 * Cross-platform spawnSync.
 * Resolves .cmd shims on Windows.
 */
export function spawnCmd(
  cmd: string,
  args: string[],
  options?: SpawnSyncOptions
): SpawnSyncReturns<string | Buffer> {
  return spawnSync(getCmdPath(cmd), args, options);
}

/**
 * Cross-platform async spawn.
 * Resolves .cmd shims on Windows.
 */
export function spawnAsync(
  cmd: string,
  args: string[],
  options?: SpawnOptions
): ChildProcess {
  return spawn(getCmdPath(cmd), args, options ?? {});
}

/**
 * Cross-platform sleep (synchronous).
 * Uses `timeout` on Windows, `sleep` on Unix.
 */
export function sleepSync(seconds: number): void {
  if (IS_WIN) {
    // timeout.exe is a native Windows binary, no .cmd resolution needed
    execFileSync("timeout.exe", ["/t", String(seconds), "/nobreak"], {
      stdio: "ignore",
    });
  } else {
    spawnSync("sleep", [String(seconds)]);
  }
}
