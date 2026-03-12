"use client";

import { Section, SectionHeader } from "@/components/ui/section";
import { AnimateIn } from "@/components/ui/animate-in";

const indianLanguages = [
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

const sttProviders = [
  { name: "Groq", note: "Fastest, free tier", color: "text-orange-400 bg-orange-400/10 ring-orange-400/20" },
  { name: "Sarvam AI", note: "Indian languages", color: "text-cyan-400 bg-cyan-400/10 ring-cyan-400/20" },
  { name: "OpenAI", note: "Whisper", color: "text-emerald-400 bg-emerald-400/10 ring-emerald-400/20" },
  { name: "AssemblyAI", note: "Universal", color: "text-violet-400 bg-violet-400/10 ring-violet-400/20" },
];

export function Voice() {
  return (
    <Section id="voice" background="secondary">
      <SectionHeader
        overline="Voice"
        title="Voice in Any Language"
        subtitle="Send voice messages and they're transcribed automatically. Four STT providers to choose from — including Indian language support."
      />

      {/* STT Providers */}
      <AnimateIn>
        <div className="mb-12">
          <p className="text-xs font-mono font-medium uppercase tracking-[0.15em] text-text-tertiary text-center mb-5">
            STT Providers
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 max-w-2xl mx-auto">
            {sttProviders.map((provider) => (
              <div
                key={provider.name}
                className="flex flex-col items-center gap-1.5 rounded-lg border border-border-primary bg-bg-card/80 backdrop-blur-xl px-4 py-3.5 transition-colors hover:border-border-hover"
              >
                <span className="text-sm font-medium text-text-primary">{provider.name}</span>
                <span className="text-[11px] text-text-tertiary text-center leading-tight">{provider.note}</span>
              </div>
            ))}
          </div>
        </div>
      </AnimateIn>

      {/* Indian language highlight */}
      <AnimateIn delay={0.1}>
        <div className="text-center">
          <div className="inline-flex items-center gap-2 mb-4">
            <div className="h-px w-8 bg-gradient-to-r from-transparent to-cyan-500/30" />
            <p className="text-xs font-mono font-medium uppercase tracking-[0.15em] text-cyan-400/70">
              Indian Language Support
            </p>
            <div className="h-px w-8 bg-gradient-to-l from-transparent to-cyan-500/30" />
          </div>
          <p className="text-sm text-text-tertiary mb-5">
            Sarvam AI transcribes and translates to English in one step
          </p>
          <div className="flex flex-wrap justify-center gap-2 max-w-xl mx-auto">
            {indianLanguages.map((lang) => (
              <span
                key={lang}
                className="inline-flex items-center rounded-full px-3 py-1.5 text-sm font-medium bg-white/[0.03] text-text-secondary border border-white/[0.06] hover:border-cyan-500/30 hover:text-cyan-400 transition-colors"
              >
                {lang}
              </span>
            ))}
          </div>
        </div>
      </AnimateIn>
    </Section>
  );
}
