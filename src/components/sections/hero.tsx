"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Container } from "@/components/ui/container";
import { AnimateIn } from "@/components/ui/animate-in";
import { Terminal } from "@/components/ui/terminal";
import { siteConfig } from "@/lib/metadata";
import { ArrowRight } from "lucide-react";

const heroTerminalLines = [
  { type: "command" as const, text: "relay onboard" },
  { type: "success" as const, text: "OpenCode detected (v1.2.15)" },
  { type: "success" as const, text: "Bot token verified \u2014 @YourBot" },
  { type: "success" as const, text: "User ID saved" },
  { type: "success" as const, text: "MCP tools configured: Browser, Memory" },
  { type: "success" as const, text: "Configuration saved to ~/.relay/config.json" },
];

export function Hero() {
  return (
    <section className="relative pt-32 pb-24 lg:pt-48 lg:pb-32 bg-bg-primary overflow-hidden">
      {/* Grid pattern */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          backgroundImage:
            "repeating-linear-gradient(0deg, rgba(255,255,255,0.03) 0 1px, transparent 1px 64px), repeating-linear-gradient(90deg, rgba(255,255,255,0.03) 0 1px, transparent 1px 64px)",
          maskImage: "linear-gradient(to bottom, white 0%, transparent 70%)",
          WebkitMaskImage: "linear-gradient(to bottom, white 0%, transparent 70%)",
        }}
      />
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
              <Badge variant="accent">v2.2</Badge>
            </div>

            <h1 className="text-4xl font-bold tracking-tight text-text-primary sm:text-5xl lg:text-7xl">
              Control AI coding agents{" "}
              <span className="text-accent">from Telegram</span>
            </h1>

            <p className="mt-6 text-lg text-text-secondary/80 max-w-2xl mx-auto leading-relaxed">
              Powered by OpenCode with 75+ AI providers &mdash; stream responses,
              manage sessions, run commands, all from your chat.
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
              <div className="mt-14 max-w-md mx-auto">
                <Terminal
                  lines={heroTerminalLines}
                  title="Terminal"
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
