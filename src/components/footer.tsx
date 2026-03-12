"use client";

import Link from "next/link";
import { ArrowUp } from "lucide-react";

export function Footer() {
  return (
    <footer className="border-t border-border-primary bg-zinc-950">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-10">
        <div className="flex flex-col items-center gap-4 text-center">
          <button
            onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
            className="inline-flex items-center justify-center w-9 h-9 rounded-full border border-border-primary text-text-tertiary hover:text-text-primary hover:border-border-hover transition-colors cursor-pointer"
            aria-label="Scroll to top"
          >
            <ArrowUp size={16} />
          </button>
          <Link
            href="/"
            className="text-lg font-bold text-text-primary hover:text-accent transition-colors"
          >
            Relay
          </Link>
          <p className="text-sm text-text-tertiary">
            Your personal AI agent — powered by Telegram.
          </p>
          <p className="text-xs text-text-tertiary">
            &copy; {new Date().getFullYear()} Relay &middot; MIT License
          </p>
        </div>
      </div>
    </footer>
  );
}
