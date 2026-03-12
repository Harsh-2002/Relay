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
        "rounded-xl border border-border-primary bg-bg-card/80 backdrop-blur-xl p-6 lg:p-8",
        hover && "transition-colors duration-300 hover:border-border-hover",
        className
      )}
    >
      {children}
    </div>
  );
}
