import { clsx } from "clsx";
import { Container } from "./container";

interface SectionProps {
  children: React.ReactNode;
  id?: string;
  className?: string;
  background?: "primary" | "secondary";
}

export function Section({ children, id, className, background = "primary" }: SectionProps) {
  return (
    <section
      id={id}
      className={clsx(
        "relative py-24 lg:py-32",
        background === "primary" ? "bg-bg-primary" : "bg-bg-secondary",
        className
      )}
    >
      <div
        className="absolute top-0 left-0 right-0 h-px pointer-events-none"
        style={{
          background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.06), transparent)",
        }}
      />
      <Container>{children}</Container>
    </section>
  );
}

export function SectionHeader({
  title,
  subtitle,
  className,
}: {
  title: string;
  subtitle?: string;
  className?: string;
}) {
  return (
    <div className={clsx("mb-16 text-center", className)}>
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
