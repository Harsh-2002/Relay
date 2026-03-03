import Link from "next/link";
import { siteConfig } from "@/lib/metadata";

const columns = [
  {
    title: "Product",
    links: [
      { label: "Features", href: "/#features" },
      { label: "Providers", href: "/#providers" },

    ],
  },
  {
    title: "Developers",
    links: [
      { label: "Documentation", href: "/docs/getting-started" },
      { label: "Configuration", href: "/docs/configuration" },
      { label: "Troubleshooting", href: "/docs/troubleshooting" },
    ],
  },
  {
    title: "Community",
    links: [
      { label: "GitHub", href: siteConfig.github, external: true },
      { label: "Issues", href: `${siteConfig.github}/issues`, external: true },
      { label: "Releases", href: `${siteConfig.github}/releases`, external: true },
      { label: "MIT License", href: `${siteConfig.github}/blob/main/LICENSE`, external: true },
    ],
  },
];

export function Footer() {
  return (
    <footer className="border-t border-border-primary bg-zinc-950">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        {/* Main footer grid */}
        <div className="grid grid-cols-2 gap-8 py-16 sm:grid-cols-4">
          {/* Brand column */}
          <div className="col-span-2 sm:col-span-1">
            <Link
              href="/"
              className="text-lg font-bold text-text-primary hover:text-accent transition-colors"
            >
              Relay
            </Link>
            <p className="mt-3 text-sm text-text-tertiary leading-relaxed max-w-xs">
              Your AI coding agent, always on — always in Telegram.
            </p>
          </div>

          {/* Link columns */}
          {columns.map((col) => (
            <div key={col.title}>
              <h3 className="text-sm font-semibold text-text-primary mb-4">
                {col.title}
              </h3>
              <ul className="space-y-2.5">
                {col.links.map((link) => {
                  const isExternal = "external" in link && link.external;
                  const Tag = isExternal ? "a" : Link;
                  const extraProps = isExternal
                    ? { target: "_blank", rel: "noopener noreferrer" }
                    : {};

                  return (
                    <li key={link.label}>
                      <Tag
                        href={link.href}
                        className="text-sm text-text-tertiary hover:text-text-secondary transition-colors"
                        {...extraProps}
                      >
                        {link.label}
                      </Tag>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>

        {/* Bottom bar */}
        <div className="border-t border-white/5 py-6 flex flex-col sm:flex-row items-center justify-between gap-3">
          <p className="text-xs text-text-tertiary">
            &copy; {new Date().getFullYear()} Relay &middot; MIT License
          </p>
        </div>
      </div>
    </footer>
  );
}
