import { clsx } from "clsx";

interface CardProps {
  children: React.ReactNode;
  className?: string;
  hover?: boolean;
}

export function Card({ children, className, hover = true }: CardProps) {
  return (
    <div
      className={clsx(
        "rounded-xl border border-border-primary bg-bg-card p-6 lg:p-8",
        hover && "transition-all duration-200 hover:border-border-hover hover:-translate-y-0.5",
        className
      )}
    >
      {children}
    </div>
  );
}
