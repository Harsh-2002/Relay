import { existsSync, mkdirSync, readdirSync, statSync, unlinkSync } from "fs";
import { basename, join, resolve } from "path";

const UPLOAD_DIR = join(process.cwd(), "uploads");
const MAX_FILE_SIZE = 20 * 1024 * 1024; // 20 MB
const CLEANUP_MAX_AGE_MS = 60 * 60 * 1000; // 1 hour
const CLEANUP_INTERVAL_MS = 30 * 60 * 1000; // 30 minutes

function ensureUploadDir(): void {
  if (!existsSync(UPLOAD_DIR)) {
    mkdirSync(UPLOAD_DIR, { recursive: true, mode: 0o700 });
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
  ensureUploadDir();

  const safeName = sanitizeFileName(fileName);
  const localPath = join(UPLOAD_DIR, safeName);

  // Verify resolved path stays under UPLOAD_DIR
  if (!resolve(localPath).startsWith(resolve(UPLOAD_DIR))) {
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

  await Bun.write(localPath, buffer);
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
  return UPLOAD_DIR;
}

/**
 * Remove uploaded files older than maxAgeMs.
 */
export function cleanupUploads(maxAgeMs = CLEANUP_MAX_AGE_MS): void {
  if (!existsSync(UPLOAD_DIR)) return;
  const now = Date.now();
  for (const file of readdirSync(UPLOAD_DIR)) {
    const fp = join(UPLOAD_DIR, file);
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
