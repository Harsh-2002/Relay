export async function getGitHubStars(): Promise<number | null> {
  try {
    const res = await fetch(
      "https://api.github.com/repos/Harsh-2002/Relay",
      {
        signal: AbortSignal.timeout(5000),
        headers: { Accept: "application/vnd.github.v3+json" },
      }
    );
    if (!res.ok) return null;
    const data = await res.json();
    return typeof data.stargazers_count === "number" ? data.stargazers_count : null;
  } catch {
    return null;
  }
}
