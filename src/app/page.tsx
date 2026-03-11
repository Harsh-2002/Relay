import { Hero } from "@/components/sections/hero";
import { Features } from "@/components/sections/features";
import { Providers } from "@/components/sections/providers";
import { Voice } from "@/components/sections/voice";
import { GettingStarted } from "@/components/sections/getting-started";
import { getLatestVersion } from "@/lib/version";
import { getGitHubStars } from "@/lib/github";

export default async function Home() {
  const [version, stars] = await Promise.all([
    getLatestVersion(),
    getGitHubStars(),
  ]);

  return (
    <>
      <Hero version={version} stars={stars} />
      <Features />
      <Providers />
      <Voice />
      <GettingStarted />
    </>
  );
}
