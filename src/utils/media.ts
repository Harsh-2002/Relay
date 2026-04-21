import { existsSync, mkdirSync, readdirSync, statSync, unlinkSync, writeFileSync } from "fs";
import { basename, join, resolve } from "path";
import { getDataDir } from "./store.js";

const MAX_FILE_SIZE = 20 * 1024 * 1024; // 20 MB
const CLEANUP_MAX_AGE_MS = 60 * 60 * 1000; // 1 hour
const CLEANUP_INTERVAL_MS = 30 * 60 * 1000; // 30 minutes

// Resolved lazily on each call — setDataDir() runs in index.ts AFTER this
// module's imports finish, so capturing the path at module load would bind
// every upload to process.cwd()+"/uploads" instead of the real dataDir.
function getUploadDirInternal(): string {
  return join(getDataDir(), "uploads");
}

function ensureUploadDir(dir: string): void {
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true, mode: 0o700 });
  }
}

/**
 * Sanitize a file name to prevent path traversal.
 * Strips directory components and removes unsafe characters.
 */
function sanitizeFileName(name: string): string {
  let safe = basename(name);
  safe = safe.replace(/[\x00-\x1f]/g, "");
  if (!safe || safe === "." || safe === "..") {
    safe = `file_${Date.now()}`;
  }
  return safe;
}

export async function downloadTelegramFile(
  botToken: string,
  filePath: string,
  fileName: string
): Promise<string> {
  const uploadDir = getUploadDirInternal();
  ensureUploadDir(uploadDir);

  const safeName = sanitizeFileName(fileName);
  const localPath = join(uploadDir, safeName);

  // Verify resolved path stays under uploadDir
  if (!resolve(localPath).startsWith(resolve(uploadDir))) {
    throw new Error("Invalid file name");
  }

  const url = `https://api.telegram.org/file/bot${botToken}/${filePath}`;
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Failed to download file (HTTP ${response.status})`);
  }

  const contentLength = Number(response.headers.get("content-length") || 0);
  if (contentLength > MAX_FILE_SIZE) {
    throw new Error(`File too large (${Math.round(contentLength / 1024 / 1024)}MB). Maximum is 20MB.`);
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  if (buffer.length > MAX_FILE_SIZE) {
    throw new Error(`File too large (${Math.round(buffer.length / 1024 / 1024)}MB). Maximum is 20MB.`);
  }

  writeFileSync(localPath, buffer, { mode: 0o600 });
  return localPath;
}

export async function downloadTelegramFileBuffer(
  botToken: string,
  filePath: string
): Promise<Buffer> {
  const url = `https://api.telegram.org/file/bot${botToken}/${filePath}`;
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Failed to download file (HTTP ${response.status})`);
  }

  const contentLength = Number(response.headers.get("content-length") || 0);
  if (contentLength > MAX_FILE_SIZE) {
    throw new Error(`File too large (${Math.round(contentLength / 1024 / 1024)}MB). Maximum is 20MB.`);
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  if (buffer.length > MAX_FILE_SIZE) {
    throw new Error(`File too large (${Math.round(buffer.length / 1024 / 1024)}MB). Maximum is 20MB.`);
  }

  return buffer;
}

export function getUploadDir(): string {
  return getUploadDirInternal();
}

/**
 * Remove uploaded files older than maxAgeMs.
 */
export function cleanupUploads(maxAgeMs = CLEANUP_MAX_AGE_MS): void {
  const uploadDir = getUploadDirInternal();
  if (!existsSync(uploadDir)) return;
  const now = Date.now();
  for (const file of readdirSync(uploadDir)) {
    const fp = join(uploadDir, file);
    try {
      const stat = statSync(fp);
      if (now - stat.mtimeMs > maxAgeMs) unlinkSync(fp);
    } catch {
      // File may have been deleted between readdir and stat
    }
  }
}

let cleanupInterval: ReturnType<typeof setInterval> | null = null;

/**
 * Start periodic upload cleanup (call once at startup).
 */
export function startUploadCleanup(): void {
  cleanupUploads();
  cleanupInterval = setInterval(() => cleanupUploads(), CLEANUP_INTERVAL_MS);
}

/**
 * Stop the periodic upload cleanup (call on shutdown).
 */
export function stopUploadCleanup(): void {
  if (cleanupInterval) {
    clearInterval(cleanupInterval);
    cleanupInterval = null;
  }
}
