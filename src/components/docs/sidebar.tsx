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
    <nav className="space-y-0.5">
      <h3 className="px-3 mb-3 text-[11px] font-semibold text-text-tertiary uppercase tracking-widest">
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
              "flex items-center gap-2.5 px-3 py-1.5 text-[13px] rounded-lg transition-colors",
              active
                ? "text-accent bg-accent/[0.08] font-medium"
                : "text-text-secondary hover:text-text-primary hover:bg-white/[0.03]"
            )}
          >
            <span
              className={clsx(
                "h-1.5 w-1.5 rounded-full shrink-0",
                active ? "bg-accent" : "bg-text-tertiary/50"
              )}
            />
            {doc.frontmatter.title}
          </Link>
        );
      })}
    </nav>
  );
}
