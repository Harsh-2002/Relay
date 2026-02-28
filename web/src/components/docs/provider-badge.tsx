import { clsx } from "clsx";

interface ProviderBadgeProps {
  provider: "opencode" | "claude" | "codex";
}

const colors = {
  opencode: "bg-green-500/10 text-green-400 border-green-500/20",
  claude: "bg-orange-500/10 text-orange-400 border-orange-500/20",
  codex: "bg-blue-500/10 text-blue-400 border-blue-500/20",
};

const labels = {
  opencode: "OpenCode",
  claude: "Claude",
  codex: "Codex",
};

export function ProviderBadge({ provider }: ProviderBadgeProps) {
  return (
    <span
      className={clsx(
        "inline-flex items-center rounded px-1.5 py-0.5 text-xs font-medium border",
        colors[provider]
      )}
    >
      {labels[provider]}
    </span>
  );
}
