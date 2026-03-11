"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Container } from "@/components/ui/container";
import { AnimateIn } from "@/components/ui/animate-in";
import { Terminal } from "@/components/ui/terminal";
import { GridBackground } from "@/components/ui/grid-background";
import { siteConfig } from "@/lib/metadata";
import { ArrowRight } from "lucide-react";

const heroTerminalLines = [
  { type: "prompt" as const, text: "Schedule standup at 9am daily" },
  { type: "success" as const, text: "Cron job created: daily 09:00" },
  { type: "blank" as const, text: "" },
  { type: "prompt" as const, text: "Browse news.ycombinator.com" },
  { type: "success" as const, text: "Top 5 stories extracted" },
  { type: "blank" as const, text: "" },
  { type: "prompt" as const, text: "[voice] Check my GitHub PRs" },
  { type: "success" as const, text: "Transcribed. 3 open PRs found" },
  { type: "blank" as const, text: "" },
  { type: "prompt" as const, text: "Find TODOs in the project" },
  { type: "success" as const, text: "12 TODOs across 8 files" },
];

interface HeroProps {
  version: string;
}

export function Hero({ version }: HeroProps) {
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
              <Badge variant="default">
                Open Source &middot; MIT Licensed
              </Badge>
              <Badge variant="accent">v{version}</Badge>
            </div>

            <h1 className="text-4xl font-bold tracking-tight text-text-primary sm:text-5xl lg:text-6xl">
              Your personal AI agent &mdash;{" "}
              <span className="text-accent">powered by Telegram.</span>
            </h1>

            <p className="mt-6 text-lg text-text-secondary/80 max-w-2xl mx-auto leading-relaxed">
              Open-source AI assistant that browses the web, automates tasks,
              writes code, and speaks your language. 75+ AI providers.
            </p>

            <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4">
              <Button href="/docs/getting-started" variant="primary" size="lg">
                Get Started
                <ArrowRight size={16} />
              </Button>
              <Button
                href={siteConfig.github}
                variant="ghost"
                size="lg"
                target="_blank"
                rel="noopener noreferrer"
              >
                View on GitHub
              </Button>
            </div>

            {/* Compact terminal preview */}
            <AnimateIn delay={0.3}>
              <div className="mt-14 max-w-xl mx-auto">
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
