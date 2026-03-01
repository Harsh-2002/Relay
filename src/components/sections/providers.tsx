import { Section, SectionHeader } from "@/components/ui/section";
import { Card } from "@/components/ui/card";
import { AnimateIn } from "@/components/ui/animate-in";
import { Check } from "lucide-react";

const capabilities = [
  "Streaming responses",
  "File output (screenshots, artifacts)",
  "MCP server management",
  "Dynamic model listing",
  "Todo tracking",
  "Code diffs",
  "Session forking",
  "Revert changes",
  "File operations",
  "History",
  "Shell commands",
  "Custom commands",
  "Session sharing",
  "State persistence",
];

const aiProviders = [
  "Anthropic (Claude)",
  "OpenAI (GPT, o-series)",
  "Google (Gemini)",
  "DeepSeek",
  "Mistral",
  "Local models (Ollama, etc.)",
];

export function Providers() {
  return (
    <Section id="providers" background="primary">
      <SectionHeader
        title="Powered by OpenCode"
        subtitle="One interface, 75+ AI providers. OpenCode handles the backend so you get the full feature set with any model."
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2 mb-16">
        {/* Capabilities */}
        <AnimateIn>
          <Card className="h-full">
            <h3 className="text-lg font-semibold text-text-primary mb-4">
              Full Feature Set
            </h3>
            <p className="text-sm text-text-secondary mb-6">
              Every feature works with every model &mdash; no partial support or provider-specific limitations.
            </p>
            <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {capabilities.map((c) => (
                <li key={c} className="flex items-center gap-2 text-sm text-text-secondary">
                  <Check size={14} className="text-accent shrink-0" />
                  {c}
                </li>
              ))}
            </ul>
          </Card>
        </AnimateIn>

        {/* Providers */}
        <AnimateIn delay={0.1}>
          <Card className="h-full">
            <h3 className="text-lg font-semibold text-text-primary mb-4">
              AI Providers
            </h3>
            <p className="text-sm text-text-secondary mb-6">
              OpenCode supports 75+ AI providers through a unified interface. Switch models at runtime with <code className="text-xs bg-white/5 px-1.5 py-0.5 rounded">/models</code>.
            </p>
            <ul className="space-y-2">
              {aiProviders.map((p) => (
                <li key={p} className="flex items-center gap-2 text-sm text-text-secondary">
                  <Check size={14} className="text-accent shrink-0" />
                  {p}
                </li>
              ))}
            </ul>
            <p className="mt-4 text-xs text-text-tertiary">
              And many more &mdash; any provider supported by OpenCode works with Relay.
            </p>
          </Card>
        </AnimateIn>
      </div>
    </Section>
  );
}
