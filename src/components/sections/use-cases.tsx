import { Search, Clock, Mic, Code, Server, Brain } from "lucide-react";
import { Section, SectionHeader } from "@/components/ui/section";
import { Card } from "@/components/ui/card";
import { AnimateIn } from "@/components/ui/animate-in";

const useCases = [
  {
    icon: Search,
    title: "Research Assistant",
    description:
      "Browse the web, fetch documentation, and summarize findings through chat.",
    accent: "text-blue-400",
    glow: "bg-blue-400/10 ring-blue-400/20",
  },
  {
    icon: Clock,
    title: "Task Automation",
    description:
      "Schedule daily reports, monitoring alerts, and recurring workflows with cron.",
    accent: "text-teal-400",
    glow: "bg-teal-400/10 ring-teal-400/20",
  },
  {
    icon: Mic,
    title: "Voice Assistant",
    description:
      "Speak in Hindi, Tamil, or 8 other Indian languages and get instant responses.",
    accent: "text-cyan-400",
    glow: "bg-cyan-400/10 ring-cyan-400/20",
  },
  {
    icon: Code,
    title: "Code Assistant",
    description:
      "Write, debug, and review code with full session management, diffs, and reverts.",
    accent: "text-accent",
    glow: "bg-accent/10 ring-accent/20",
  },
  {
    icon: Server,
    title: "DevOps & Monitoring",
    description:
      "Run shell commands, check server health, and manage GitHub issues and PRs.",
    accent: "text-amber-400",
    glow: "bg-amber-400/10 ring-amber-400/20",
  },
  {
    icon: Brain,
    title: "Knowledge Base",
    description:
      "Persistent memory, file management, and documentation lookup across projects.",
    accent: "text-purple-400",
    glow: "bg-purple-400/10 ring-purple-400/20",
  },
];

export function UseCases() {
  return (
    <Section id="use-cases" background="primary">
      <SectionHeader
        overline="Use Cases"
        title="One agent, many roles"
        subtitle="Relay adapts to whatever you need — from research to DevOps, all through Telegram"
      />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {useCases.map((useCase, i) => (
          <AnimateIn key={useCase.title} delay={i * 0.05}>
            <Card className="h-full">
              <div className={`inline-flex items-center justify-center w-10 h-10 rounded-lg ${useCase.glow} ring-1 mb-4`}>
                <useCase.icon size={20} className={useCase.accent} />
              </div>
              <h3 className="text-lg font-semibold text-text-primary">
                {useCase.title}
              </h3>
              <p className="mt-2 text-sm text-text-secondary leading-relaxed">
                {useCase.description}
              </p>
            </Card>
          </AnimateIn>
        ))}
      </div>
    </Section>
  );
}
