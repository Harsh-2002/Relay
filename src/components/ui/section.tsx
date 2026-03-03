import { clsx } from "clsx";
import { Container } from "./container";
import { GridBackground } from "./grid-background";

interface SectionProps {
  children: React.ReactNode;
  id?: string;
  className?: string;
  background?: "primary" | "secondary";
  gridOpacity?: number;
}

export function Section({ children, id, className, background = "primary", gridOpacity }: SectionProps) {
  return (
    <section
      id={id}
      className={clsx(
        "relative py-24 lg:py-32 overflow-hidden",
        background === "primary" ? "bg-bg-primary" : "bg-bg-secondary",
        className
      )}
    >
      <GridBackground opacity={gridOpacity} />
      <div
        className="absolute top-0 left-0 right-0 h-px pointer-events-none"
        style={{
          background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.06), transparent)",
        }}
      />
      <Container className="relative">{children}</Container>
    </section>
  );
}

export function SectionHeader({
  title,
  subtitle,
  overline,
  className,
}: {
  title: string;
  subtitle?: string;
  overline?: string;
  className?: string;
}) {
  return (
    <div className={clsx("mb-16 text-center", className)}>
      {overline && (
        <p className="mb-3 text-xs font-mono font-medium uppercase tracking-[0.2em] text-accent/80">
          {overline}
        </p>
      )}
      <h2 className="text-3xl font-bold tracking-tight text-text-primary sm:text-4xl">
        {title}
      </h2>
      {subtitle && (
        <p className="mt-4 text-base text-text-tertiary max-w-2xl mx-auto leading-relaxed">
          {subtitle}
        </p>
      )}
    </div>
  );
}
