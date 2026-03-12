"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Container } from "@/components/ui/container";
import { AnimateIn } from "@/components/ui/animate-in";
import { Terminal } from "@/components/ui/terminal";
import { GridBackground } from "@/components/ui/grid-background";
import { siteConfig } from "@/lib/metadata";
import { ArrowRight, Download } from "lucide-react";

const heroTerminalLines = [
  { type: "prompt" as const, text: "Summarize this article for me" },
  { type: "success" as const, text: "Key points extracted in 3 bullets" },
  { type: "blank" as const, text: "" },
  { type: "prompt" as const, text: "Write a script to rename my photos" },
  { type: "success" as const, text: "rename_photos.sh created, 48 files done" },
  { type: "blank" as const, text: "" },
  { type: "prompt" as const, text: "What's trending on Hacker News?" },
  { type: "success" as const, text: "Top 5 stories fetched" },
  { type: "blank" as const, text: "" },
  { type: "prompt" as const, text: "Remind me to review PRs at 5pm" },
  { type: "success" as const, text: "Reminder set for today 17:00" },
];

interface HeroProps {
  version: string;
  downloads: number | null;
}

export function Hero({ version, downloads }: HeroProps) {
  return (
    <section className="relative pt-32 pb-24 lg:pt-48 lg:pb-32 bg-bg-primary overflow-hidden">
      <GridBackground />
      {/* Subtle radial gradient */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            "radial-gradient(ellipse 80% 50% at 50% -20%, rgba(34, 197, 94, 0.08), transparent)",
        }}
      />

      <Container className="relative">
        <AnimateIn>
          <div className="text-center max-w-4xl mx-auto">
            <div className="flex items-center justify-center gap-2 mb-6">
              <Badge variant="accent">v{version}</Badge>
            </div>

            <h1 className="text-4xl font-bold tracking-tight text-text-primary sm:text-5xl lg:text-6xl">
              One chat. 75+ AI models.{" "}
              <span className="text-accent">Your tasks, automated.</span>
            </h1>

            <p className="mt-6 text-lg text-text-secondary/80 max-w-2xl mx-auto leading-relaxed">
              Open-source AI agent that lives in Telegram &mdash; browse the web,
              schedule tasks, run shell commands, and talk in your language.
              Self-hosted and free.
            </p>

            <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4">
              <Button href="/docs/getting-started" variant="primary" size="lg">
                Get Started
                <ArrowRight size={16} />
              </Button>
              <Button
                href="https://www.npmjs.com/package/@4via6/relay"
                variant="ghost"
                size="lg"
                target="_blank"
                rel="noopener noreferrer"
              >
                <Download size={16} />
                {downloads !== null && downloads > 0
                  ? `${downloads.toLocaleString()} downloads`
                  : "View on GitHub"}
              </Button>
            </div>

            {/* Compact terminal preview */}
            <AnimateIn delay={0.3}>
              <div className="mt-14 w-fit min-w-[380px] sm:min-w-[422px] mx-auto">
                <Terminal
                  lines={heroTerminalLines}
                  title="Relay on Telegram"
                  compact
                />
              </div>
            </AnimateIn>
          </div>
        </AnimateIn>
      </Container>
    </section>
  );
}
