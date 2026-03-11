import { Section, SectionHeader } from "@/components/ui/section";
import { AnimateIn } from "@/components/ui/animate-in";
import { MessageSquare, ArrowDown, ArrowUp, Cpu, Puzzle, Server, Clock } from "lucide-react";

function Pill({ children }: { children: React.ReactNode }) {
  return (
    <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-white/5 text-text-tertiary border border-white/[0.06]">
      {children}
    </span>
  );
}

export function Architecture() {
  return (
    <Section id="architecture" background="primary">
      <SectionHeader
        overline="Architecture"
        title="How it works"
        subtitle="From your chat to AI action and back — in real time"
      />

      {/* Vertical layered stack */}
      <AnimateIn>
        <div className="flex flex-col items-center gap-3 mb-16">
          {/* Layer 1: Telegram */}
          <div className="flex flex-col items-center gap-3 rounded-xl border border-border-primary bg-bg-card/80 backdrop-blur-xl p-6 w-full max-w-md">
            <MessageSquare size={32} className="text-text-secondary" />
            <h3 className="font-semibold text-text-primary">Telegram</h3>
            <div className="flex flex-wrap justify-center gap-1.5">
              <Pill>Text</Pill>
              <Pill>Voice</Pill>
              <Pill>Photos</Pill>
              <Pill>Files</Pill>
              <Pill>Commands</Pill>
            </div>
          </div>

          <ArrowDown size={24} className="text-text-tertiary shrink-0" />

          {/* Layer 2: Relay */}
          <div className="flex flex-col items-center gap-3 rounded-xl border border-accent/30 bg-accent/5 backdrop-blur-xl p-6 w-full max-w-md shadow-[0_0_30px_rgba(34,197,94,0.06)]">
            <span className="text-2xl font-bold tracking-tight text-accent">Relay</span>
            <div className="flex flex-wrap justify-center items-center gap-1.5">
              <Pill>Auth</Pill>
              <ArrowDown size={10} className="text-text-tertiary -rotate-90" />
              <Pill>STT</Pill>
              <ArrowDown size={10} className="text-text-tertiary -rotate-90" />
              <Pill>Prompt Queue</Pill>
              <ArrowDown size={10} className="text-text-tertiary -rotate-90" />
              <Pill>Streaming</Pill>
            </div>
            <p className="text-[11px] text-text-tertiary text-center">
              grammY bot — HTML chunking, markdown conversion, rate limiting
            </p>
          </div>

          {/* Bidirectional arrow with "OpenCode SDK" label */}
          <div className="flex flex-col items-center gap-1">
            <div className="flex items-center gap-1.5">
              <ArrowDown size={20} className="text-text-tertiary" />
              <ArrowUp size={20} className="text-text-tertiary" />
            </div>
            <span className="text-[10px] font-medium text-text-tertiary tracking-wide uppercase">
              OpenCode SDK
            </span>
          </div>

          {/* Layer 3: OpenCode */}
          <div className="flex flex-col items-center gap-3 rounded-xl border border-blue-500/30 bg-blue-500/5 backdrop-blur-xl p-6 w-full max-w-md">
            <Server size={32} className="text-blue-400" />
            <h3 className="font-semibold text-text-primary">OpenCode</h3>
            <div className="flex flex-wrap justify-center gap-1.5">
              <Pill>Sessions</Pill>
              <Pill>Agents</Pill>
              <Pill>Tool Dispatch</Pill>
              <Pill>Task Execution</Pill>
            </div>
            <p className="text-[11px] text-text-tertiary text-center">
              AI orchestrator — sessions, agents, 75+ providers
            </p>
          </div>

          {/* Splitting arrows — three on desktop, one on mobile */}
          <div className="hidden lg:flex w-full max-w-2xl justify-center gap-[calc(33%-1.5rem)] mt-3">
            <ArrowDown size={24} className="text-text-tertiary shrink-0" />
            <ArrowDown size={24} className="text-text-tertiary shrink-0" />
            <ArrowDown size={24} className="text-text-tertiary shrink-0" />
          </div>
          <ArrowDown size={24} className="text-text-tertiary shrink-0 lg:hidden mt-3" />

          {/* Layer 4: AI Provider + MCP Tools + Cron Engine */}
          <div className="flex flex-col lg:flex-row items-center lg:items-stretch justify-center gap-3 lg:gap-4 w-full max-w-xs lg:max-w-2xl">
            {/* AI Provider */}
            <div className="flex flex-col items-center gap-3 rounded-xl border border-amber-500/30 bg-amber-500/5 backdrop-blur-xl p-6 w-full lg:flex-1">
              <Cpu size={32} className="text-amber-400" />
              <h3 className="font-semibold text-text-primary">AI Provider</h3>
              <p className="text-xs text-text-tertiary text-center">
                Claude, GPT, Gemini, DeepSeek, 75+ models
              </p>
            </div>

            <ArrowDown size={24} className="text-text-tertiary shrink-0 lg:hidden" />

            {/* MCP Tools */}
            <div className="flex flex-col items-center gap-3 rounded-xl border border-purple-500/30 bg-purple-500/5 backdrop-blur-xl p-6 w-full lg:flex-1">
              <Puzzle size={32} className="text-purple-400" />
              <h3 className="font-semibold text-text-primary">MCP Tools</h3>
              <p className="text-xs text-text-tertiary text-center">
                Browser, Fetch, Memory, Filesystem, GitHub, Context7
              </p>
            </div>

            <ArrowDown size={24} className="text-text-tertiary shrink-0 lg:hidden" />

            {/* Cron Engine */}
            <div className="flex flex-col items-center gap-3 rounded-xl border border-teal-500/30 bg-teal-500/5 backdrop-blur-xl p-6 w-full lg:flex-1">
              <Clock size={32} className="text-teal-400" />
              <h3 className="font-semibold text-text-primary">Cron Engine</h3>
              <p className="text-xs text-text-tertiary text-center">
                Isolated sessions, timezone-aware scheduling
              </p>
            </div>
          </div>
        </div>
      </AnimateIn>
    </Section>
  );
}
