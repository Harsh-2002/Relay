"use client";

import { motion } from "framer-motion";
import { clsx } from "clsx";

interface TerminalLine {
  type: "command" | "output" | "prompt" | "success" | "blank" | "highlight" | "info";
  text: string;
}

interface TerminalProps {
  lines: TerminalLine[];
  title?: string;
  animated?: boolean;
  className?: string;
  compact?: boolean;
}

const lineStyles: Record<TerminalLine["type"], { prefix: string; className: string }> = {
  command: {
    prefix: "$",
    className: "text-text-primary",
  },
  output: {
    prefix: "",
    className: "text-text-tertiary",
  },
  prompt: {
    prefix: "?",
    className: "text-cyan-400",
  },
  success: {
    prefix: "\u2713",
    className: "text-accent",
  },
  blank: {
    prefix: "",
    className: "",
  },
  highlight: {
    prefix: "",
    className: "text-amber-400",
  },
  info: {
    prefix: "",
    className: "text-text-secondary",
  },
};

export function Terminal({
  lines,
  title = "Terminal",
  animated = true,
  className,
  compact = false,
}: TerminalProps) {
  return (
    <div
      className={clsx(
        "rounded-xl border border-white/10 bg-zinc-900/80 backdrop-blur-xl overflow-hidden shadow-2xl",
        className
      )}
    >
      {/* Title bar */}
      <div className="flex items-center gap-2 px-3 sm:px-4 py-3 border-b border-white/5">
        <div className="flex gap-1.5">
          <span className="w-2.5 h-2.5 sm:w-3 sm:h-3 rounded-full bg-red-500/80" />
          <span className="w-2.5 h-2.5 sm:w-3 sm:h-3 rounded-full bg-yellow-500/80" />
          <span className="w-2.5 h-2.5 sm:w-3 sm:h-3 rounded-full bg-green-500/80" />
        </div>
        <span className="flex-1 text-center text-xs text-text-tertiary font-mono truncate">
          {title}
        </span>
        <div className="w-[42px] sm:w-[54px]" />
      </div>

      {/* Content */}
      <div className={clsx(
        "font-mono text-xs sm:text-sm leading-relaxed overflow-x-auto",
        compact ? "p-3 sm:p-4" : "p-3 sm:p-5"
      )}>
        {lines.map((line, i) => {
          const style = lineStyles[line.type];

          if (line.type === "blank") {
            return <div key={i} className="h-3 sm:h-4" />;
          }

          const content = (
            <div key={i} className={clsx("flex whitespace-nowrap", compact ? "py-0.5" : "py-[3px]")}>
              {style.prefix && (
                <span
                  className={clsx(
                    "select-none shrink-0 mr-2",
                    line.type === "command" && "text-accent",
                    line.type === "prompt" && "text-cyan-400",
                    line.type === "success" && "text-accent"
                  )}
                >
                  {style.prefix}
                </span>
              )}
              <span className={style.className}>{line.text}</span>
            </div>
          );

          if (animated) {
            return (
              <motion.div
                key={i}
                initial={{ opacity: 0 }}
                whileInView={{ opacity: 1 }}
                viewport={{ once: true, margin: "-30px" }}
                transition={{
                  duration: 0.15,
                  ease: "easeOut",
                  delay: i * 0.03,
                }}
              >
                {content}
              </motion.div>
            );
          }

          return content;
        })}
      </div>
    </div>
  );
}
