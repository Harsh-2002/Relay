import { Section, SectionHeader } from "@/components/ui/section";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AnimateIn } from "@/components/ui/animate-in";
import { Check, X, Minus } from "lucide-react";

const providers = [
  {
    name: "OpenCode",
    description: "Full-featured AI coding agent with native API support",
    badge: "Full feature set",
    features: ["Streaming", "File output", "MCP management", "Todo tracking", "Code diffs"],
  },
  {
    name: "Claude Code",
    description: "Anthropic\u2019s coding agent with prompt-based capabilities",
    badge: "Most features",
    features: ["Streaming", "Session forking", "MCP support", "History", "Dynamic models"],
  },
  {
    name: "Codex",
    description: "OpenAI\u2019s reasoning-based coding agent",
    badge: "Core features",
    features: ["Streaming", "Sessions", "Shell access", "Dynamic models", "File operations"],
  },
];

type Support = "yes" | "no" | "partial";

const comparison: { feature: string; opencode: Support; claude: Support; codex: Support }[] = [
  { feature: "Streaming", opencode: "yes", claude: "yes", codex: "yes" },
  { feature: "File output", opencode: "yes", claude: "no", codex: "no" },
  { feature: "MCP management", opencode: "yes", claude: "partial", codex: "no" },
  { feature: "Model listing", opencode: "yes", claude: "yes", codex: "yes" },
  { feature: "Todo tracking", opencode: "yes", claude: "no", codex: "no" },
  { feature: "Code diffs", opencode: "yes", claude: "partial", codex: "partial" },
  { feature: "Session forking", opencode: "yes", claude: "yes", codex: "no" },
  { feature: "Revert changes", opencode: "yes", claude: "no", codex: "no" },
  { feature: "File operations", opencode: "yes", claude: "partial", codex: "partial" },
  { feature: "History", opencode: "yes", claude: "yes", codex: "no" },
  { feature: "Shell commands", opencode: "yes", claude: "partial", codex: "partial" },
  { feature: "Custom commands", opencode: "yes", claude: "no", codex: "no" },
  { feature: "Session sharing", opencode: "yes", claude: "no", codex: "no" },
  { feature: "State persistence", opencode: "yes", claude: "yes", codex: "yes" },
];

function StatusIcon({ status }: { status: Support }) {
  if (status === "yes") return <Check size={16} className="text-status-green" />;
  if (status === "partial") return <Minus size={16} className="text-status-yellow" />;
  return <X size={16} className="text-status-muted" />;
}

export function Providers() {
  return (
    <Section id="providers" background="primary">
      <SectionHeader
        title="Three providers, one interface"
        subtitle="Choose your preferred AI coding agent. Relay adapts to each provider\u2019s capabilities."
      />

      {/* Provider cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 mb-16">
        {providers.map((p, i) => (
          <AnimateIn key={p.name} delay={i * 0.1}>
            <Card className="h-full">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-text-primary">{p.name}</h3>
                <Badge variant="accent">{p.badge}</Badge>
              </div>
              <p className="text-sm text-text-secondary mb-4">{p.description}</p>
              <ul className="space-y-2">
                {p.features.map((f) => (
                  <li key={f} className="flex items-center gap-2 text-sm text-text-secondary">
                    <Check size={14} className="text-accent shrink-0" />
                    {f}
                  </li>
                ))}
              </ul>
            </Card>
          </AnimateIn>
        ))}
      </div>

      {/* Comparison table */}
      <AnimateIn>
        <div className="overflow-x-auto rounded-xl border border-border-primary">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border-primary bg-bg-card">
                <th className="px-6 py-4 text-left font-semibold text-text-primary">Feature</th>
                <th className="px-6 py-4 text-center font-semibold text-text-primary">OpenCode</th>
                <th className="px-6 py-4 text-center font-semibold text-text-primary">Claude</th>
                <th className="px-6 py-4 text-center font-semibold text-text-primary">Codex</th>
              </tr>
            </thead>
            <tbody>
              {comparison.map((row, i) => (
                <tr
                  key={row.feature}
                  className={i < comparison.length - 1 ? "border-b border-border-primary" : ""}
                >
                  <td className="px-6 py-3 text-text-secondary">{row.feature}</td>
                  <td className="px-6 py-3 text-center">
                    <span className="inline-flex justify-center">
                      <StatusIcon status={row.opencode} />
                    </span>
                  </td>
                  <td className="px-6 py-3 text-center">
                    <span className="inline-flex justify-center">
                      <StatusIcon status={row.claude} />
                    </span>
                  </td>
                  <td className="px-6 py-3 text-center">
                    <span className="inline-flex justify-center">
                      <StatusIcon status={row.codex} />
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </AnimateIn>
    </Section>
  );
}
