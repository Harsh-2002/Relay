"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { clsx } from "clsx";
import type { DocFrontmatter } from "@/types/docs";

interface SidebarProps {
  docs: { slug: string; frontmatter: DocFrontmatter }[];
}

export function Sidebar({ docs }: SidebarProps) {
  const pathname = usePathname();

  return (
    <nav className="space-y-1">
      <h3 className="px-3 mb-4 text-xs font-semibold text-text-tertiary uppercase tracking-wider">
        Documentation
      </h3>
      {docs.map((doc) => {
        const href = `/docs/${doc.slug}`;
        const active = pathname === href;

        return (
          <Link
            key={doc.slug}
            href={href}
            className={clsx(
              "block px-3 py-2 text-sm rounded-lg transition-colors",
              active
                ? "text-accent bg-accent/10 border-l-2 border-accent"
                : "text-text-secondary hover:text-text-primary hover:bg-bg-card"
            )}
          >
            {doc.frontmatter.title}
          </Link>
        );
      })}
    </nav>
  );
}
