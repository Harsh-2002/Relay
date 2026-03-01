"use client";

import { Section, SectionHeader } from "@/components/ui/section";
import { Button } from "@/components/ui/button";
import { AnimateIn } from "@/components/ui/animate-in";
import { Terminal } from "@/components/ui/terminal";
import { ArrowRight } from "lucide-react";

const steps = [
  {
    step: 1,
    title: "Install",
    description: "Install Relay globally from npm.",
    code: "npm install -g @4via6/relay",
  },
  {
    step: 2,
    title: "Configure",
    description: "Run the interactive setup wizard. It walks you through bot token, user ID, and preferences.",
    code: "relay onboard",
  },
  {
    step: 3,
    title: "Chat",
    description: "Start Relay and send a message to your bot in Telegram.",
    code: "relay start",
  },
];

const terminalLines = [
  { type: "command" as const, text: "npm install -g @4via6/relay" },
  { type: "command" as const, text: "relay onboard" },
  { type: "blank" as const, text: "" },
  { type: "prompt" as const, text: "Telegram bot token: 123456:ABC-DEF..." },
  { type: "success" as const, text: "Bot token verified \u2014 @YourBot" },
  { type: "blank" as const, text: "" },
  { type: "prompt" as const, text: "Your Telegram user ID: 987654321" },
  { type: "success" as const, text: "User ID saved" },
  { type: "blank" as const, text: "" },
  { type: "prompt" as const, text: "Enable streaming responses? Yes" },
  { type: "success" as const, text: "Streaming enabled" },
  { type: "blank" as const, text: "" },
  { type: "prompt" as const, text: "Speech-to-text provider: Auto (recommended)" },
  { type: "success" as const, text: "Configuration saved to .relay/config.json" },
  { type: "blank" as const, text: "" },
  { type: "command" as const, text: "relay start" },
  { type: "success" as const, text: "Relay is running \u2014 send a message in Telegram!" },
];

export function GettingStarted() {
  return (
    <Section id="getting-started" background="secondary">
      <SectionHeader
        title="Get started in 60 seconds"
        subtitle="Three steps to control your AI coding agent from Telegram"
      />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-16 items-start">
        {/* Left column — steps */}
        <div className="space-y-8">
          {steps.map((s, i) => (
            <AnimateIn key={s.step} delay={i * 0.1}>
              <div className="flex gap-4">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent/10 ring-1 ring-accent/20 text-accent text-sm font-bold mt-0.5">
                  {s.step}
                </span>
                <div>
                  <h3 className="text-base font-semibold text-text-primary mb-1">
                    {s.title}
                  </h3>
                  <p className="text-sm text-text-secondary leading-relaxed mb-2">
                    {s.description}
                  </p>
                  <code className="inline-block text-xs font-mono bg-white/5 text-text-tertiary px-2.5 py-1 rounded-md border border-white/5">
                    $ {s.code}
                  </code>
                </div>
              </div>
            </AnimateIn>
          ))}

          <AnimateIn delay={0.3}>
            <div className="pl-12">
              <Button href="/docs/getting-started" variant="ghost" size="md">
                Read the full documentation
                <ArrowRight size={16} />
              </Button>
            </div>
          </AnimateIn>
        </div>

        {/* Right column — terminal mockup */}
        <AnimateIn delay={0.2}>
          <Terminal
            lines={terminalLines}
            title="relay onboard"
          />
        </AnimateIn>
      </div>
    </Section>
  );
}
