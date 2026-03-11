import { Hero } from "@/components/sections/hero";
import { Features } from "@/components/sections/features";
import { Providers } from "@/components/sections/providers";
import { Voice } from "@/components/sections/voice";
import { GettingStarted } from "@/components/sections/getting-started";
import { getLatestVersion } from "@/lib/version";
import { getNpmDownloads } from "@/lib/github";

export default async function Home() {
  const [version, downloads] = await Promise.all([
    getLatestVersion(),
    getNpmDownloads(),
  ]);

  return (
    <>
      <Hero version={version} downloads={downloads} />
      <Features />
      <Providers />
      <Voice />
      <GettingStarted />
    </>
  );
}
