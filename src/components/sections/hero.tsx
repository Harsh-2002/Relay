import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Container } from "@/components/ui/container";
import { AnimateIn } from "@/components/ui/animate-in";
import { siteConfig } from "@/lib/metadata";
import { ArrowRight } from "lucide-react";

export function Hero() {
  return (
    <section className="relative pt-32 pb-24 lg:pt-48 lg:pb-32 bg-bg-primary overflow-hidden">
      {/* Grid pattern */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          backgroundImage:
            "repeating-linear-gradient(0deg, rgba(255,255,255,0.03) 0 1px, transparent 1px 64px), repeating-linear-gradient(90deg, rgba(255,255,255,0.03) 0 1px, transparent 1px 64px)",
          maskImage: "linear-gradient(to bottom, white 0%, transparent 70%)",
          WebkitMaskImage: "linear-gradient(to bottom, white 0%, transparent 70%)",
        }}
      />
      {/* Subtle radial gradient */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            "radial-gradient(ellipse 80% 50% at 50% -20%, rgba(34, 197, 94, 0.08), transparent)",
        }}
      />

      <Container className="relative">
        <AnimateIn>
          <div className="text-center max-w-4xl mx-auto">
            <Badge variant="default" className="mb-6">
              Open Source &middot; MIT Licensed
            </Badge>

            <h1 className="text-4xl font-bold tracking-tight text-text-primary sm:text-5xl lg:text-7xl">
              Control AI coding agents{" "}
              <span className="text-accent">from Telegram</span>
            </h1>

            <p className="mt-6 text-lg text-text-secondary/80 max-w-2xl mx-auto leading-relaxed">
              Powered by OpenCode with 75+ AI providers &mdash; stream responses,
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
      </Container>
    </section>
  );
}
