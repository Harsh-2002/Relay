import { Hero } from "@/components/sections/hero";
import { Features } from "@/components/sections/features";
import { Providers } from "@/components/sections/providers";
import { Voice } from "@/components/sections/voice";

import { Architecture } from "@/components/sections/architecture";
import { GettingStarted } from "@/components/sections/getting-started";

export default function Home() {
  return (
    <>
      <Hero />
      <Features />
      <Providers />

      <Architecture />
      <Voice />
      <GettingStarted />
    </>
  );
}
