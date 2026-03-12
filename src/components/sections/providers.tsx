import { Section, SectionHeader } from "@/components/ui/section";
import { Card } from "@/components/ui/card";
import { AnimateIn } from "@/components/ui/animate-in";

const aiProviders = [
  { name: "Anthropic", models: "Claude Opus 4.6, Sonnet 4.6, Haiku 4.5", color: "bg-orange-400" },
  { name: "OpenAI", models: "GPT-5.4, GPT-5.2, GPT-5, GPT-5 mini", color: "bg-emerald-400" },
  { name: "Google", models: "Gemini 3.1 Pro, 3.1 Flash, 3.1 Flash Lite", color: "bg-blue-400" },
  { name: "DeepSeek", models: "V3, R1, VL2", color: "bg-cyan-400" },
  { name: "Mistral", models: "Large 3, Mistral 3, Devstral 2", color: "bg-amber-400" },
  { name: "Local models", models: "Ollama, LM Studio, etc.", color: "bg-text-tertiary" },
];

export function Providers() {
  return (
    <Section id="providers" background="primary">
      <SectionHeader
        overline="Providers"
        title="Powered by OpenCode"
        subtitle="One interface, 75+ AI providers. Switch models at runtime with /models — every feature works with every model."
      />

      <AnimateIn>
        <Card className="max-w-2xl mx-auto">
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
    </Section>
  );
}
