"use client";

import { Section, SectionHeader } from "@/components/ui/section";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AnimateIn } from "@/components/ui/animate-in";
import { CopyButton } from "@/components/copy-button";
import { ArrowRight } from "lucide-react";

const steps = [
  {
    step: 1,
    title: "Install",
    description: "Install Relay globally via npm",
    code: "npm install -g relay",
  },
  {
    step: 2,
    title: "Configure",
    description: "Set your Telegram bot token and provider",
    code: "cp .env.example .env\n# Set BOT_TOKEN, ALLOWED_USER_ID, PROVIDER",
  },
  {
    step: 3,
    title: "Run",
    description: "Start the bot and open Telegram",
    code: "relay",
  },
];

export function GettingStarted() {
  return (
    <Section id="getting-started" background="secondary">
      <SectionHeader
        title="Get started in 60 seconds"
        subtitle="Three steps to control your AI coding agent from Telegram"
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {steps.map((s, i) => (
          <AnimateIn key={s.step} delay={i * 0.1}>
            <Card className="h-full" hover={false}>
              <div className="flex items-center gap-3 mb-4">
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent text-black text-sm font-bold">
                  {s.step}
                </span>
                <h3 className="text-lg font-semibold text-text-primary">{s.title}</h3>
              </div>
              <p className="text-sm text-text-secondary mb-4">{s.description}</p>
              <div className="relative rounded-lg border border-border-primary bg-bg-code p-3">
                <pre className="text-sm font-mono text-text-secondary pr-8">
                  <code>{s.code}</code>
                </pre>
                <CopyButton text={s.code} className="absolute top-2 right-2" />
              </div>
            </Card>
          </AnimateIn>
        ))}
      </div>

      <AnimateIn delay={0.3}>
        <div className="mt-12 text-center">
          <Button href="/docs/getting-started" variant="ghost" size="md">
            Read the full documentation
            <ArrowRight size={16} />
          </Button>
        </div>
      </AnimateIn>
    </Section>
  );
}
