const DEFAULT_PROMPT_TIMEOUT = 5 * 60 * 1000; // 5 minutes

export function getPromptTimeout(): number {
  const env = process.env.PROMPT_TIMEOUT_MS;
  return env ? Number(env) : DEFAULT_PROMPT_TIMEOUT;
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
