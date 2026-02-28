import { clsx } from "clsx";

interface LogoProps {
  size?: "sm" | "md" | "lg";
  showText?: boolean;
  className?: string;
}

const sizes = {
  sm: { icon: 24, text: "text-lg" },
  md: { icon: 28, text: "text-xl" },
  lg: { icon: 32, text: "text-2xl" },
};

export function Logo({ size = "md", showText = true, className }: LogoProps) {
  const { icon, text } = sizes[size];

  return (
    <span className={clsx("inline-flex items-center gap-2", className)}>
      <svg
        width={icon}
        height={icon}
        viewBox="0 0 32 32"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <rect width="32" height="32" rx="8" fill="#22C55E" />
        <text
          x="16"
          y="22"
          textAnchor="middle"
          fill="#000000"
          fontSize="20"
          fontWeight="700"
          fontFamily="system-ui, sans-serif"
        >
          R
        </text>
      </svg>
      {showText && (
        <span className={clsx("font-bold tracking-tight text-text-primary", text)}>
          relay
          <span className="text-accent">{"\u00BB"}</span>
        </span>
      )}
    </span>
  );
}
