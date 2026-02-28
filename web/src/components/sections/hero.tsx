import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Container } from "@/components/ui/container";
import { AnimateIn } from "@/components/ui/animate-in";
import { TelegramMock } from "@/components/telegram-mock";
import { siteConfig } from "@/lib/metadata";
import { ArrowRight } from "lucide-react";

export function Hero() {
  return (
    <section className="relative pt-32 pb-24 lg:pt-48 lg:pb-32 bg-bg-primary overflow-hidden">
      {/* Subtle radial gradient */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            "radial-gradient(ellipse 80% 50% at 50% -20%, rgba(34, 197, 94, 0.06), transparent)",
        }}
      />

      <Container className="relative">
        <AnimateIn>
          <div className="text-center max-w-4xl mx-auto">
            <Badge variant="default" className="mb-6">
              Open Source &middot; MIT Licensed &middot; v{siteConfig.version}
            </Badge>

            <h1 className="text-4xl font-bold tracking-tight text-text-primary sm:text-5xl lg:text-6xl">
              Control AI coding agents{" "}
              <span className="text-accent">from Telegram</span>
            </h1>

            <p className="mt-6 text-lg text-text-secondary max-w-2xl mx-auto leading-relaxed">
              Switch between OpenCode, Claude Code, and Codex &mdash; stream responses,
              manage sessions, run commands, all from your chat.
            </p>

            <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4">
              <Button href="/docs/getting-started" variant="primary" size="lg">
                Get Started
                <ArrowRight size={16} />
              </Button>
              <Button
                href={siteConfig.github}
                variant="ghost"
                size="lg"
                target="_blank"
                rel="noopener noreferrer"
              >
                View on GitHub
              </Button>
            </div>
          </div>
        </AnimateIn>

        <AnimateIn delay={0.2}>
          <div className="mt-20">
            <TelegramMock />
          </div>
        </AnimateIn>
      </Container>
    </section>
  );
}
