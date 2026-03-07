const FALLBACK_VERSION = "2.4.0";

export async function getLatestVersion(): Promise<string> {
  try {
    const res = await fetch(
      "https://registry.npmjs.org/@4via6/relay/latest",
      { signal: AbortSignal.timeout(5000) }
    );
    const data = await res.json();
    return data.version || FALLBACK_VERSION;
  } catch {
    return FALLBACK_VERSION;
  }
}
