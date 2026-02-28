import { existsSync, mkdirSync } from "fs";
import { join } from "path";

const UPLOAD_DIR = join(process.cwd(), "uploads");

export async function downloadTelegramFile(
  botToken: string,
  filePath: string,
  fileName: string
): Promise<string> {
  if (!existsSync(UPLOAD_DIR)) {
    mkdirSync(UPLOAD_DIR, { recursive: true });
  }

  const url = `https://api.telegram.org/file/bot${botToken}/${filePath}`;
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Failed to download file: ${response.statusText}`);
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  const localPath = join(UPLOAD_DIR, fileName);
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
    throw new Error(`Failed to download file: ${response.statusText}`);
  }

  return Buffer.from(await response.arrayBuffer());
}

export function getUploadDir(): string {
  return UPLOAD_DIR;
}
