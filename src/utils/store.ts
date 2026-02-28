import { existsSync, mkdirSync, readFileSync, writeFileSync, renameSync } from "fs";
import { join } from "path";

// Bootstrap: read data dir from env directly (config hasn't loaded yet when stores are created)
const DATA_DIR = process.env.RELAY_DATA_DIR ?? join(process.cwd(), ".relay");

function ensureDir(dir: string): void {
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true, mode: 0o700 });
  }
}

/**
 * Simple JSON-file-backed persistence store.
 * Atomic writes via tmp+rename to prevent corruption on crash.
 */
export class JsonStore<T> {
  private filePath: string;
  private defaultValue: T;

  constructor(filename: string, defaultValue: T) {
    ensureDir(DATA_DIR);
    this.filePath = join(DATA_DIR, filename);
    this.defaultValue = defaultValue;
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
    const tmp = this.filePath + ".tmp";
    writeFileSync(tmp, JSON.stringify(data, null, 2), { mode: 0o600 });
    renameSync(tmp, this.filePath);
  }

  /** Read-modify-write helper. */
  update(fn: (current: T) => T): void {
    this.save(fn(this.load()));
  }
}
