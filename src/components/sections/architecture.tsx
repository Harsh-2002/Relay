import { Section, SectionHeader } from "@/components/ui/section";
import { AnimateIn } from "@/components/ui/animate-in";
import { MessageSquare, ArrowDown, Cpu, Puzzle, Server } from "lucide-react";

export function Architecture() {
  return (
    <Section id="architecture" background="primary">
      <SectionHeader
        overline="Architecture"
        title="How it works"
        subtitle="A clean pipeline from your phone to the AI and back"
      />

      {/* Vertical layered stack */}
      <AnimateIn>
        <div className="flex flex-col items-center gap-3 mb-16">
          {/* Layer 1: Telegram */}
          <div className="flex flex-col items-center gap-3 rounded-xl border border-border-primary bg-bg-card/80 backdrop-blur-xl p-6 w-full max-w-xs">
            <MessageSquare size={32} className="text-text-secondary" />
            <h3 className="font-semibold text-text-primary">Telegram</h3>
            <p className="text-xs text-text-tertiary text-center">
              Send messages, voice, photos, or commands
            </p>
          </div>

          <ArrowDown size={24} className="text-text-tertiary shrink-0" />

          {/* Layer 2: Relay */}
          <div className="flex flex-col items-center gap-3 rounded-xl border border-accent/30 bg-accent/5 backdrop-blur-xl p-6 w-full max-w-xs shadow-[0_0_30px_rgba(34,197,94,0.06)]">
            <span className="text-2xl font-bold tracking-tight text-accent">Relay</span>
            <p className="text-xs text-text-tertiary text-center">
              grammY bot — auth, Telegram formatting, streaming edits
            </p>
          </div>

          {/* Arrow with "OpenCode SDK" label */}
          <div className="flex flex-col items-center gap-1">
            <ArrowDown size={24} className="text-text-tertiary shrink-0" />
            <span className="text-[10px] font-medium text-text-tertiary tracking-wide uppercase">
              OpenCode SDK
            </span>
          </div>

          {/* Layer 3: OpenCode */}
          <div className="flex flex-col items-center gap-3 rounded-xl border border-blue-500/30 bg-blue-500/5 backdrop-blur-xl p-6 w-full max-w-xs">
            <Server size={32} className="text-blue-400" />
            <h3 className="font-semibold text-text-primary">OpenCode</h3>
            <p className="text-xs text-text-tertiary text-center">
              AI orchestrator — sessions, tool execution, code analysis
            </p>
          </div>

          {/* Splitting arrows to bottom row */}
          <div className="flex w-full max-w-lg justify-center gap-[calc(50%-1.5rem)]">
            <ArrowDown size={24} className="text-text-tertiary shrink-0" />
            <ArrowDown size={24} className="text-text-tertiary shrink-0" />
          </div>

          {/* Layer 4: AI Provider + MCP Tools side by side */}
          <div className="flex flex-col lg:flex-row items-center lg:items-start justify-center gap-4 w-full max-w-lg">
            {/* AI Provider */}
            <div className="flex flex-col items-center gap-3 rounded-xl border border-border-primary bg-bg-card/80 backdrop-blur-xl p-6 w-full lg:flex-1">
              <Cpu size={32} className="text-text-secondary" />
              <h3 className="font-semibold text-text-primary">AI Provider</h3>
              <p className="text-xs text-text-tertiary text-center">
                Claude, GPT, Gemini, DeepSeek, 75+ models
              </p>
            </div>

            {/* MCP Tools */}
            <div className="flex flex-col items-center gap-3 rounded-xl border border-border-primary bg-bg-card/80 backdrop-blur-xl p-6 w-full lg:flex-1">
              <Puzzle size={28} className="text-text-secondary" />
              <h3 className="font-semibold text-text-primary">MCP Tools</h3>
              <p className="text-xs text-text-tertiary text-center">
                Browser, Fetch, Memory, Filesystem
              </p>
            </div>
          </div>
        </div>
      </AnimateIn>
    </Section>
  );
}
