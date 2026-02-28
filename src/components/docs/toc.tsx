"use client";

import { useEffect, useState } from "react";
import { clsx } from "clsx";
import type { TocEntry } from "@/types/docs";

interface TocProps {
  entries: TocEntry[];
}

export function Toc({ entries }: TocProps) {
  const [activeId, setActiveId] = useState<string>("");

  useEffect(() => {
    const observer = new IntersectionObserver(
      (intersections) => {
        for (const entry of intersections) {
          if (entry.isIntersecting) {
            setActiveId(entry.target.id);
          }
        }
      },
      { rootMargin: "-80px 0px -80% 0px" }
    );

    for (const entry of entries) {
      const el = document.getElementById(entry.id);
      if (el) observer.observe(el);
    }

    return () => observer.disconnect();
  }, [entries]);

  if (entries.length === 0) return null;

  return (
    <nav className="space-y-1">
      <h4 className="px-3 mb-3 text-xs font-semibold text-text-tertiary uppercase tracking-wider">
        On this page
      </h4>
      {entries.map((entry) => (
        <a
          key={entry.id}
          href={`#${entry.id}`}
          className={clsx(
            "block py-1 text-xs transition-colors",
            entry.level === 2 ? "px-3" : "px-6",
            activeId === entry.id
              ? "text-accent"
              : "text-text-tertiary hover:text-text-secondary"
          )}
        >
          {entry.text}
        </a>
      ))}
    </nav>
  );
}
