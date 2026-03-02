import { Section, SectionHeader } from "@/components/ui/section";
import { Card } from "@/components/ui/card";
import { AnimateIn } from "@/components/ui/animate-in";
import { Check } from "lucide-react";

const capabilities = [
  "Streaming responses",
  "File output (screenshots, artifacts)",
  "Browser automation (Playwright)",
  "Web page fetching",
  "Persistent memory",
  "Filesystem access",
  "Dynamic model listing",
  "Todo tracking",
  "Code diffs",
  "Session forking",
  "Revert changes",
  "File operations",
  "Shell commands",
  "Custom commands",
  "Session sharing",
  "State persistence",
];

const aiProviders = [
  { name: "Anthropic", models: "Claude Opus, Sonnet, Haiku", color: "bg-orange-400" },
  { name: "OpenAI", models: "GPT-4, o-series", color: "bg-emerald-400" },
  { name: "Google", models: "Gemini Pro, 2.5", color: "bg-blue-400" },
  { name: "DeepSeek", models: "V3, R1", color: "bg-cyan-400" },
  { name: "Mistral", models: "Large, Codestral", color: "bg-amber-400" },
  { name: "Local models", models: "Ollama, LM Studio, etc.", color: "bg-text-tertiary" },
];

export function Providers() {
  return (
    <Section id="providers" background="primary">
      <SectionHeader
        overline="Providers"
        title="Powered by OpenCode"
        subtitle="One interface, 75+ AI providers. OpenCode handles the backend so you get the full feature set with any model."
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2 mb-16">
        {/* Capabilities */}
        <AnimateIn>
          <Card className="h-full">
            <h3 className="text-lg font-semibold text-text-primary mb-1">
              Full Feature Set
            </h3>
            <p className="text-sm text-text-secondary mb-6">
              Every feature works with every model &mdash; no partial support or provider-specific limitations.
            </p>
            <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {capabilities.map((c) => (
                <li key={c} className="flex items-center gap-2.5 text-sm text-text-secondary">
                  <span className="flex items-center justify-center w-4 h-4 rounded-full bg-accent/10">
                    <Check size={10} className="text-accent" strokeWidth={3} />
                  </span>
                  {c}
                </li>
              ))}
            </ul>
          </Card>
        </AnimateIn>

        {/* Providers */}
        <AnimateIn delay={0.1}>
          <Card className="h-full">
            <h3 className="text-lg font-semibold text-text-primary mb-1">
              AI Providers
            </h3>
            <p className="text-sm text-text-secondary mb-6">
              Switch models at runtime with <code className="text-xs font-mono bg-white/5 text-accent px-1.5 py-0.5 rounded border border-white/5">/models</code>
            </p>
            <ul className="space-y-3">
              {aiProviders.map((p) => (
                <li key={p.name} className="flex items-center gap-3">
                  <span className={`w-2 h-2 rounded-full ${p.color} shrink-0`} />
                  <span className="text-sm font-medium text-text-primary">{p.name}</span>
                  <span className="text-xs text-text-tertiary">{p.models}</span>
                </li>
              ))}
            </ul>
            <p className="mt-5 text-xs text-text-tertiary border-t border-border-primary pt-4">
              And many more &mdash; any provider supported by OpenCode works with Relay.
            </p>
          </Card>
        </AnimateIn>
      </div>
    </Section>
  );
}
