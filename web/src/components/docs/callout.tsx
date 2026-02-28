import { clsx } from "clsx";
import { Info, AlertTriangle, Lightbulb } from "lucide-react";

interface CalloutProps {
  type?: "info" | "warning" | "tip";
  children: React.ReactNode;
}

const styles = {
  info: {
    border: "border-blue-500/30",
    bg: "bg-blue-500/5",
    icon: Info,
    iconColor: "text-blue-400",
  },
  warning: {
    border: "border-yellow-500/30",
    bg: "bg-yellow-500/5",
    icon: AlertTriangle,
    iconColor: "text-yellow-400",
  },
  tip: {
    border: "border-accent/30",
    bg: "bg-accent/5",
    icon: Lightbulb,
    iconColor: "text-accent",
  },
};

export function Callout({ type = "info", children }: CalloutProps) {
  const s = styles[type];
  const Icon = s.icon;

  return (
    <div
      className={clsx(
        "my-6 flex gap-3 rounded-lg border p-4",
        s.border,
        s.bg
      )}
    >
      <Icon size={18} className={clsx("shrink-0 mt-0.5", s.iconColor)} />
      <div className="text-sm text-text-secondary [&>p]:m-0">{children}</div>
    </div>
  );
}
