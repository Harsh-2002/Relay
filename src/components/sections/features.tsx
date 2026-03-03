import {
  Zap,
  Radio,
  Mic,
  GitBranch,
  FileSearch,
  GitCompareArrows,
  Puzzle,
  Terminal,
  Settings,
  Clock,
} from "lucide-react";
import { Section, SectionHeader } from "@/components/ui/section";
import { Card } from "@/components/ui/card";
import { AnimateIn } from "@/components/ui/animate-in";

const features = [
  {
    icon: Zap,
    title: "75+ AI Providers",
    description:
      "Anthropic, OpenAI, Google, DeepSeek, local models, and more via OpenCode.",
    accent: "text-amber-400",
    glow: "bg-amber-400/10 ring-amber-400/20",
  },
  {
    icon: Radio,
    title: "Streaming",
    description:
      "Watch AI responses appear in real-time with progressive message editing.",
    accent: "text-accent",
    glow: "bg-accent/10 ring-accent/20",
  },
  {
    icon: Mic,
    title: "Voice Input",
    description:
      "Send voice notes \u2014 auto transcription via Groq, Sarvam AI, OpenAI, or AssemblyAI.",
    accent: "text-cyan-400",
    glow: "bg-cyan-400/10 ring-cyan-400/20",
  },
  {
    icon: GitBranch,
    title: "Sessions",
    description:
      "Create, switch, fork, and delete coding sessions on the fly.",
    accent: "text-violet-400",
    glow: "bg-violet-400/10 ring-violet-400/20",
  },
  {
    icon: FileSearch,
    title: "File Operations",
    description:
      "Read, find, search, and browse files directly from Telegram.",
    accent: "text-accent",
    glow: "bg-accent/10 ring-accent/20",
  },
  {
    icon: GitCompareArrows,
    title: "Code Diffs",
    description:
      "View structured diffs and monitor changes across sessions.",
    accent: "text-rose-400",
    glow: "bg-rose-400/10 ring-rose-400/20",
  },
  {
    icon: Puzzle,
    title: "Built-in MCP Tools",
    description:
      "Browser, Fetch, Memory, and Filesystem tools built in. Add custom MCP servers too.",
    accent: "text-purple-400",
    glow: "bg-purple-400/10 ring-purple-400/20",
  },
  {
    icon: Clock,
    title: "Scheduled Tasks",
    description:
      "Automate recurring AI prompts with cron jobs \u2014 run daily, hourly, or on specific days.",
    accent: "text-teal-400",
    glow: "bg-teal-400/10 ring-teal-400/20",
  },
  {
    icon: Terminal,
    title: "Shell Access",
    description:
      "Run shell commands on the coding agent machine.",
    accent: "text-accent",
    glow: "bg-accent/10 ring-accent/20",
  },
  {
    icon: Settings,
    title: "Custom Prompts",
    description:
      "System prompts from files with automatic hot-reload.",
    accent: "text-text-secondary",
    glow: "bg-white/5 ring-white/10",
  },
];

export function Features() {
  return (
    <Section id="features" background="secondary">
      <SectionHeader
        overline="Features"
        title="Everything you need"
        subtitle="A complete Telegram interface for your AI coding workflow"
      />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {features.map((feature, i) => {
          const isLastOdd = i === features.length - 1 && features.length % 3 === 1;
          return (
            <AnimateIn key={feature.title} delay={i * 0.05} className={isLastOdd ? "sm:col-span-2 lg:col-span-3" : ""}>
              <Card className="h-full">
                <div className={`inline-flex items-center justify-center w-10 h-10 rounded-lg ${feature.glow} ring-1 mb-4`}>
                  <feature.icon size={20} className={feature.accent} />
                </div>
                <h3 className="text-lg font-semibold text-text-primary">
                  {feature.title}
                </h3>
                <p className="mt-2 text-sm text-text-secondary leading-relaxed">
                  {feature.description}
                </p>
              </Card>
            </AnimateIn>
          );
        })}
      </div>
    </Section>
  );
}
