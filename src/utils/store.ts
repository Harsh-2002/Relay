import { existsSync, mkdirSync, readFileSync, writeFileSync, renameSync } from "fs";
import { join } from "path";

// Bootstrap: read data dir from env directly (config hasn't loaded yet when stores are created)
let DATA_DIR = process.env.RELAY_DATA_DIR ?? join(process.cwd(), ".relay");

export function setDataDir(dir: string): void {
  DATA_DIR = dir;
}

export function getDataDir(): string {
  return DATA_DIR;
}

function ensureDir(dir: string): void {
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true, mode: 0o700 });
  }
}

/**
 * Simple JSON-file-backed persistence store.
 * Atomic writes via tmp+rename to prevent corruption on crash.
 *
 * DATA_DIR is resolved lazily (at every read/write), not at construction.
 * Stores are created at module-import time in cron.ts, watch.ts, session.ts,
 * but setDataDir() only runs later in index.ts after config has loaded. If
 * we captured the path in the constructor, every store would point at
 * process.cwd()+"/.relay" forever and ignore the real dataDir from config —
 * in production that meant stores wrote to /home/dev/Relay/.relay/ while
 * config was read from ~/.relay/.
 */
export class JsonStore<T> {
  private filename: string;
  private defaultValue: T;

  constructor(filename: string, defaultValue: T) {
    this.filename = filename;
    this.defaultValue = defaultValue;
  }

  private get filePath(): string {
    ensureDir(DATA_DIR);
    return join(DATA_DIR, this.filename);
  }

  /** Load current value from disk, or return default if file missing/corrupt. */
  load(): T {
    try {
      if (!existsSync(this.filePath)) return structuredClone(this.defaultValue);
      const raw = readFileSync(this.filePath, "utf-8");
      return JSON.parse(raw) as T;
    } catch {
      return structuredClone(this.defaultValue);
    }
  }

  /** Overwrite the file with new data (atomic write). */
  save(data: T): void {
    const target = this.filePath;
    const tmp = target + ".tmp";
    writeFileSync(tmp, JSON.stringify(data, null, 2), { mode: 0o600 });
    renameSync(tmp, target);
  }

  /** Read-modify-write helper. */
  update(fn: (current: T) => T): void {
    this.save(fn(this.load()));
  }
}
