import { Section, SectionHeader } from "@/components/ui/section";
import { AnimateIn } from "@/components/ui/animate-in";
import { MessageSquare, ArrowRight, ArrowUpDown, Cpu, Puzzle } from "lucide-react";

export function Architecture() {
  return (
    <Section id="architecture" background="primary">
      <SectionHeader
        title="How it works"
        subtitle="A clean provider abstraction that adapts to each backend"
      />

      {/* Flow diagram */}
      <AnimateIn>
        <div className="flex flex-col items-center gap-6 lg:gap-8 mb-16">
          {/* Main flow row */}
          <div className="flex flex-col lg:flex-row items-center justify-center gap-6 lg:gap-8">
            {/* Step 1: Telegram */}
            <div className="flex flex-col items-center gap-3 rounded-xl border border-border-primary bg-bg-card p-6 w-full lg:w-64">
              <MessageSquare size={32} className="text-text-secondary" />
              <h3 className="font-semibold text-text-primary">Telegram</h3>
              <p className="text-xs text-text-tertiary text-center">
                Send messages, voice, photos, or commands
              </p>
            </div>

            <ArrowRight size={24} className="text-text-tertiary rotate-90 lg:rotate-0 shrink-0" />

            {/* Step 2: Relay */}
            <div className="flex flex-col items-center gap-3 rounded-xl border border-accent/30 bg-accent/5 p-6 w-full lg:w-64 shadow-[0_0_30px_rgba(34,197,94,0.06)]">
              <span className="text-2xl font-bold tracking-tight text-accent">Relay</span>
              <p className="text-xs text-text-tertiary text-center">
                Routes to the active provider, handles formatting
              </p>
            </div>

            <ArrowRight size={24} className="text-text-tertiary rotate-90 lg:rotate-0 shrink-0" />

            {/* Step 3: Provider */}
            <div className="flex flex-col items-center gap-3 rounded-xl border border-border-primary bg-bg-card p-6 w-full lg:w-64">
              <Cpu size={32} className="text-text-secondary" />
              <h3 className="font-semibold text-text-primary">AI Provider</h3>
              <p className="text-xs text-text-tertiary text-center">
                OpenCode processes your request & responds
              </p>
            </div>
          </div>

          {/* MCP Tools connection */}
          <div className="flex flex-col items-center gap-4">
            <ArrowUpDown size={20} className="text-text-tertiary" />
            <div className="flex flex-col items-center gap-3 rounded-xl border border-purple-500/30 bg-purple-500/5 p-6 w-full max-w-sm">
              <Puzzle size={28} className="text-purple-400" />
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
