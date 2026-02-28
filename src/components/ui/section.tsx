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
        "py-24 lg:py-32",
        background === "primary" ? "bg-bg-primary" : "bg-bg-secondary",
        className
      )}
    >
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
      <h2 className="text-3xl font-semibold tracking-tight text-text-primary sm:text-4xl">
        {title}
      </h2>
      {subtitle && (
        <p className="mt-4 text-lg text-text-secondary max-w-2xl mx-auto">
          {subtitle}
        </p>
      )}
    </div>
  );
}
