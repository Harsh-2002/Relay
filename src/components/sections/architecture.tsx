import { Section, SectionHeader } from "@/components/ui/section";
import { AnimateIn } from "@/components/ui/animate-in";
import { MessageSquare, ArrowRight, Cpu } from "lucide-react";
import { Logo } from "@/components/logo";

const codeSnippet = `interface Provider {
  // Core messaging
  prompt(sessionId: string, text: string): Promise<PromptResult>;
  promptStream?(sessionId: string, text: string): AsyncGenerator<StreamChunk>;

  // Session management
  createSession(title?: string): Promise<SessionInfo>;
  listSessions(): Promise<SessionInfo[]>;
  deleteSession(id: string): Promise<void>;

  // File operations, shell, MCP, models...
  // 30+ methods adapting to each backend
}`;

export function Architecture() {
  return (
    <Section id="architecture" background="primary">
      <SectionHeader
        title="How it works"
        subtitle="A clean provider abstraction that adapts to each backend"
      />

      {/* Flow diagram */}
      <AnimateIn>
        <div className="flex flex-col lg:flex-row items-center justify-center gap-6 lg:gap-8 mb-16">
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
          <div className="flex flex-col items-center gap-3 rounded-xl border border-accent/30 bg-accent/5 p-6 w-full lg:w-64">
            <Logo size="sm" showText={false} />
            <h3 className="font-semibold text-accent">Relay</h3>
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
              OpenCode, Claude Code, or Codex processes & responds
            </p>
          </div>
        </div>
      </AnimateIn>

      {/* Code snippet */}
      <AnimateIn delay={0.1}>
        <div className="max-w-3xl mx-auto rounded-xl border border-border-primary bg-bg-code overflow-hidden">
          <div className="flex items-center gap-2 px-4 py-3 border-b border-border-primary">
            <div className="w-3 h-3 rounded-full bg-border-hover" />
            <div className="w-3 h-3 rounded-full bg-border-hover" />
            <div className="w-3 h-3 rounded-full bg-border-hover" />
            <span className="ml-2 text-xs text-text-tertiary font-mono">
              src/providers/types.ts
            </span>
          </div>
          <pre className="p-4 overflow-x-auto text-sm font-mono leading-relaxed">
            <code className="text-text-secondary">{codeSnippet}</code>
          </pre>
        </div>
      </AnimateIn>
    </Section>
  );
}
