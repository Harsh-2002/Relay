import { Hero } from "@/components/sections/hero";
import { Features } from "@/components/sections/features";
import { Providers } from "@/components/sections/providers";
import { Voice } from "@/components/sections/voice";
import { Commands } from "@/components/sections/commands";
import { Architecture } from "@/components/sections/architecture";
import { GettingStarted } from "@/components/sections/getting-started";

export default function Home() {
  return (
    <>
      <Hero />
      <Features />
      <Providers />
      <Commands />
      <Architecture />
      <Voice />
      <GettingStarted />
    </>
  );
}
