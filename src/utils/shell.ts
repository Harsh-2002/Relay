/**
 * Cross-platform child_process wrappers.
 *
 * On Windows, npm/pm2/opencode are installed as .cmd shims.
 * Node's execFileSync/spawnSync/spawn can't find .cmd files
 * without `shell: true`. These helpers add it automatically.
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
 * Cross-platform execFileSync.
 * Adds `shell: true` on Windows so .cmd shims are found.
 */
export function execCmd(
  cmd: string,
  args: string[],
  options?: ExecFileSyncOptions
): string | Buffer {
  return execFileSync(cmd, args, {
    ...options,
    ...(IS_WIN && { shell: true }),
  });
}

/**
 * Cross-platform spawnSync.
 * Adds `shell: true` on Windows so .cmd shims are found.
 */
export function spawnCmd(
  cmd: string,
  args: string[],
  options?: SpawnSyncOptions
): SpawnSyncReturns<string | Buffer> {
  return spawnSync(cmd, args, {
    ...options,
    ...(IS_WIN && { shell: true }),
  });
}

/**
 * Cross-platform async spawn.
 * Adds `shell: true` on Windows so .cmd shims are found.
 */
export function spawnAsync(
  cmd: string,
  args: string[],
  options?: SpawnOptions
): ChildProcess {
  return spawn(cmd, args, {
    ...options,
    ...(IS_WIN && { shell: true }),
  });
}

/**
 * Cross-platform sleep (synchronous).
 * Uses `timeout` on Windows, `sleep` on Unix.
 */
export function sleepSync(seconds: number): void {
  if (IS_WIN) {
    spawnSync("timeout", ["/t", String(seconds), "/nobreak"], {
      shell: true,
      stdio: "ignore",
    });
  } else {
    spawnSync("sleep", [String(seconds)]);
  }
}
