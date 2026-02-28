"use client";

import { Section, SectionHeader } from "@/components/ui/section";
import { Button } from "@/components/ui/button";
import { AnimateIn } from "@/components/ui/animate-in";
import { CopyButton } from "@/components/copy-button";
import { ArrowRight } from "lucide-react";

const steps = [
  {
    step: 1,
    title: "Install",
    code: "npm install -g relay",
  },
  {
    step: 2,
    title: "Configure",
    code: "cp .env.example .env",
    note: "Set BOT_TOKEN, ALLOWED_USER_ID, and PROVIDER",
  },
  {
    step: 3,
    title: "Run",
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

      <div className="max-w-2xl mx-auto space-y-3">
        {steps.map((s, i) => (
          <AnimateIn key={s.step} delay={i * 0.1}>
            <div className="space-y-2">
              <p className="text-sm font-medium text-text-primary pl-11">{s.title}</p>
              <div className="flex items-center gap-4">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-accent/10 ring-1 ring-accent/20 text-accent text-xs font-bold">
                  {s.step}
                </span>
                <div className="flex-1 min-w-0 flex items-center rounded-lg border border-border-primary bg-bg-code">
                  <pre className="flex-1 px-4 py-3 text-sm font-mono text-text-secondary overflow-x-auto">
                    <code><span className="select-none text-text-tertiary">$ </span>{s.code}</code>
                  </pre>
                  <CopyButton text={s.code} className="shrink-0 mr-2" />
                </div>
              </div>
              {s.note && (
                <p className="text-xs text-text-tertiary pl-11">{s.note}</p>
              )}
            </div>
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
