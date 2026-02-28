import { getConfig } from "../config/index.js";

export function getPromptTimeout(): number {
  return getConfig().promptTimeoutMs;
}

export async function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  label: string = "Operation"
): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new Error(`${label} timed out after ${Math.round(ms / 1000)}s`)),
      ms
    );
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    clearTimeout(timer!);
  }
}
