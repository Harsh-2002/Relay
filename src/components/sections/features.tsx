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
} from "lucide-react";
import { Section, SectionHeader } from "@/components/ui/section";
import { Card } from "@/components/ui/card";
import { AnimateIn } from "@/components/ui/animate-in";

const features = [
  {
    icon: Zap,
    title: "Multi-Provider",
    description:
      "Switch between OpenCode, Claude Code, and Codex with one config change.",
  },
  {
    icon: Radio,
    title: "Streaming",
    description:
      "Watch AI responses appear in real-time with progressive message editing.",
  },
  {
    icon: Mic,
    title: "Voice Input",
    description:
      "Send voice notes \u2014 auto transcription via Groq, OpenAI, or AssemblyAI.",
  },
  {
    icon: GitBranch,
    title: "Sessions",
    description:
      "Create, switch, fork, and delete coding sessions on the fly.",
  },
  {
    icon: FileSearch,
    title: "File Operations",
    description:
      "Read, find, search, and browse files directly from Telegram.",
  },
  {
    icon: GitCompareArrows,
    title: "Code Diffs",
    description:
      "View structured diffs and monitor changes across sessions.",
  },
  {
    icon: Puzzle,
    title: "MCP Servers",
    description:
      "Extend AI capabilities with Model Context Protocol servers.",
  },
  {
    icon: Terminal,
    title: "Shell Access",
    description:
      "Run shell commands on the coding agent machine.",
  },
  {
    icon: Settings,
    title: "Custom Prompts",
    description:
      "System prompts from files with automatic hot-reload.",
  },
];

export function Features() {
  return (
    <Section id="features" background="secondary">
      <SectionHeader
        title="Everything you need"
        subtitle="A complete Telegram interface for your AI coding workflow"
      />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {features.map((feature, i) => (
          <AnimateIn key={feature.title} delay={i * 0.05}>
            <Card className="h-full">
              <feature.icon size={24} className="text-accent mb-4" />
              <h3 className="text-lg font-semibold text-text-primary">
                {feature.title}
              </h3>
              <p className="mt-2 text-sm text-text-secondary leading-relaxed">
                {feature.description}
              </p>
            </Card>
          </AnimateIn>
        ))}
      </div>
    </Section>
  );
}
