"use client";

import Link from "next/link";
import { Logo } from "./logo";
import { Github } from "lucide-react";
import { siteConfig } from "@/lib/metadata";

export function Nav() {
  return (
    <header className="fixed top-0 left-0 right-0 z-50 border-b border-white/[0.06] bg-black/60 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        <Link href="/" className="flex items-center">
          <Logo size="md" />
        </Link>

        <a
          href={siteConfig.github}
          target="_blank"
          rel="noopener noreferrer"
          className="p-2 text-text-secondary hover:text-text-primary transition-colors"
          aria-label="GitHub"
        >
          <Github size={20} />
        </a>
      </div>
    </header>
  );
}
