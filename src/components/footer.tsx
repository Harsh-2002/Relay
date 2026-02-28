import Link from "next/link";
import { Logo } from "./logo";
import { siteConfig } from "@/lib/metadata";

const footerLinks = {
  Documentation: [
    { label: "Getting Started", href: "/docs/getting-started" },
    { label: "Configuration", href: "/docs/configuration" },
    { label: "Providers", href: "/docs/providers" },
    { label: "Commands", href: "/docs/commands" },
    { label: "Features", href: "/docs/features" },
    { label: "Troubleshooting", href: "/docs/troubleshooting" },
  ],
  Project: [
    { label: "GitHub", href: siteConfig.github },
    { label: "npm", href: "https://www.npmjs.com/package/relay" },
    { label: "License (MIT)", href: `${siteConfig.github}/blob/main/LICENSE` },
    { label: "Releases", href: `${siteConfig.github}/releases` },
  ],
  Community: [
    { label: "Issues", href: `${siteConfig.github}/issues` },
    { label: "Discussions", href: `${siteConfig.github}/discussions` },
    { label: "Contributing", href: `${siteConfig.github}/blob/main/CONTRIBUTING.md` },
  ],
};

export function Footer() {
  return (
    <footer className="border-t border-border-primary bg-bg-primary">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-16">
        <div className="grid grid-cols-1 gap-12 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <Logo size="md" />
            <p className="mt-4 text-sm text-text-secondary max-w-xs">
              Control AI coding agents from Telegram. Open source, MIT licensed.
            </p>
          </div>

          {Object.entries(footerLinks).map(([title, links]) => (
            <div key={title}>
              <h3 className="text-sm font-semibold text-text-primary">{title}</h3>
              <ul className="mt-4 space-y-3">
                {links.map((link) => {
                  const isExternal = link.href.startsWith("http");
                  return (
                    <li key={link.href}>
                      {isExternal ? (
                        <a
                          href={link.href}
                          className="text-sm text-text-tertiary hover:text-text-secondary transition-colors"
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          {link.label}
                        </a>
                      ) : (
                        <Link
                          href={link.href}
                          className="text-sm text-text-tertiary hover:text-text-secondary transition-colors"
                        >
                          {link.label}
                        </Link>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>

        <div className="mt-16 pt-8 border-t border-border-primary flex flex-col sm:flex-row items-center justify-between gap-4">
          <p className="text-xs text-text-tertiary">
            MIT License &middot; Built with Next.js &middot; v{siteConfig.version}
          </p>
          <p className="text-xs text-text-tertiary">
            &copy; {new Date().getFullYear()} Relay
          </p>
        </div>
      </div>
    </footer>
  );
}
