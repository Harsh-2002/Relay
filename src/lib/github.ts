export async function getNpmDownloads(): Promise<number | null> {
  try {
    const res = await fetch(
      "https://api.npmjs.org/downloads/point/last-month/@4via6/relay",
      { signal: AbortSignal.timeout(5000) }
    );
    if (!res.ok) return null;
    const data = await res.json();
    return typeof data.downloads === "number" ? data.downloads : null;
  } catch {
    return null;
  }
}
