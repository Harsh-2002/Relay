import { clsx } from "clsx";

interface ContainerProps {
  children: React.ReactNode;
  className?: string;
  size?: "default" | "narrow";
}

export function Container({ children, className, size = "default" }: ContainerProps) {
  return (
    <div
      className={clsx(
        "mx-auto w-full px-4 sm:px-6 lg:px-8",
        size === "default" ? "max-w-7xl" : "max-w-3xl",
        className
      )}
    >
      {children}
    </div>
  );
}
