import Link from "next/link";
import { siteConfig } from "@/lib/metadata";

export function Footer() {
  return (
    <footer className="border-t border-border-primary bg-bg-primary">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-12">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-4 text-sm text-text-tertiary">
            <Link href="/" className="font-semibold text-text-primary hover:text-accent transition-colors">
              Relay
            </Link>
            <span className="hidden sm:inline">&middot;</span>
            <a href={siteConfig.github} target="_blank" rel="noopener noreferrer" className="hover:text-text-secondary transition-colors">
              GitHub
            </a>
            <Link href="/docs/getting-started" className="hover:text-text-secondary transition-colors">
              Docs
            </Link>
          </div>
          <p className="text-xs text-text-tertiary">
            MIT License &middot; &copy; {new Date().getFullYear()} Relay
          </p>
        </div>
      </div>
    </footer>
  );
}
