import { Hero } from "@/components/sections/hero";
import { Features } from "@/components/sections/features";
import { UseCases } from "@/components/sections/use-cases";
import { Providers } from "@/components/sections/providers";
import { Voice } from "@/components/sections/voice";

import { Architecture } from "@/components/sections/architecture";
import { GettingStarted } from "@/components/sections/getting-started";
import { getLatestVersion } from "@/lib/version";

export default async function Home() {
  const version = await getLatestVersion();

  return (
    <>
      <Hero version={version} />
      <Features />
      <UseCases />
      <Providers />

      <Architecture />
      <Voice />
      <GettingStarted />
    </>
  );
}
