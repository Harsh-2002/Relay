"use client";

import { Section, SectionHeader } from "@/components/ui/section";
import { AnimateIn } from "@/components/ui/animate-in";
import { Card } from "@/components/ui/card";
import { Mic, RefreshCw, MessageSquare } from "lucide-react";

const languages = [
  "Hindi",
  "Tamil",
  "Telugu",
  "Kannada",
  "Malayalam",
  "Bengali",
  "Marathi",
  "Gujarati",
  "Odia",
  "Punjabi",
];

const steps = [
  {
    icon: Mic,
    label: "Record",
    description: "Send a voice message in any Indian language",
  },
  {
    icon: RefreshCw,
    label: "Transcribe & Translate",
    description: "Sarvam AI transcribes and translates to English",
  },
  {
    icon: MessageSquare,
    label: "Respond",
    description: "AI responds with full context",
  },
];

export function Voice() {
  return (
    <Section id="voice" background="secondary">
      <SectionHeader
        title="Speak Your Language"
        subtitle="Send voice messages in Hindi, Tamil, Telugu, and 7+ more Indian languages. Sarvam AI transcribes and translates automatically."
      />

      {/* Flow steps */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-16">
        {steps.map((step, i) => (
          <AnimateIn key={step.label} delay={i * 0.1}>
            <Card className="text-center h-full">
              <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-accent/10 ring-1 ring-accent/20 mb-4">
                <step.icon size={22} className="text-accent" />
              </div>
              <h3 className="text-base font-semibold text-text-primary mb-2">
                {step.label}
              </h3>
              <p className="text-sm text-text-secondary leading-relaxed">
                {step.description}
              </p>
            </Card>
          </AnimateIn>
        ))}
      </div>

      {/* Language pills */}
      <AnimateIn delay={0.3}>
        <div className="text-center">
          <p className="text-sm text-text-tertiary mb-4">Supported languages</p>
          <div className="flex flex-wrap justify-center gap-2 max-w-xl mx-auto">
            {languages.map((lang) => (
              <span
                key={lang}
                className="inline-flex items-center rounded-full px-3 py-1.5 text-sm font-medium bg-white/5 text-text-secondary border border-white/10 hover:border-accent/30 hover:text-accent transition-colors"
              >
                {lang}
              </span>
            ))}
          </div>
        </div>
      </AnimateIn>

      {/* STT fallback note */}
      <AnimateIn delay={0.4}>
        <p className="mt-10 text-center text-xs text-text-tertiary">
          4 STT providers with automatic fallback &mdash; Groq &middot; Sarvam AI &middot; AssemblyAI &middot; OpenAI
        </p>
      </AnimateIn>
    </Section>
  );
}
