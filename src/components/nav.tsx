"use client";

import Link from "next/link";
import { Logo } from "./logo";
import { Button } from "./ui/button";
import { MobileMenu } from "./mobile-menu";
import { Github } from "lucide-react";
import { siteConfig } from "@/lib/metadata";

const navLinks = [
  { label: "Features", href: "/#features" },
  { label: "Providers", href: "/#providers" },
  { label: "Commands", href: "/#commands" },
  { label: "Docs", href: "/docs/getting-started" },
];

export function Nav() {
  return (
    <header className="fixed top-0 left-0 right-0 z-50 border-b border-border-primary bg-black/80 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        <Link href="/" className="flex items-center">
          <Logo size="md" />
        </Link>

        <nav className="hidden lg:flex items-center gap-8">
          {navLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="text-sm text-text-secondary hover:text-text-primary transition-colors"
            >
              {link.label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-3">
          <a
            href={siteConfig.github}
            target="_blank"
            rel="noopener noreferrer"
            className="hidden sm:flex p-2 text-text-secondary hover:text-text-primary transition-colors"
            aria-label="GitHub"
          >
            <Github size={20} />
          </a>
          <Button
            href={`${siteConfig.github}#getting-started`}
            variant="primary"
            size="sm"
            className="hidden sm:inline-flex"
          >
            Get Started
          </Button>
          <MobileMenu />
        </div>
      </div>
    </header>
  );
}
