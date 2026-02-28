"use client";

import { CopyButton } from "@/components/copy-button";

interface CodeBlockProps {
  children: string;
  language?: string;
}

export function CodeBlock({ children, language }: CodeBlockProps) {
  return (
    <div className="group relative my-4 rounded-lg border border-border-primary bg-bg-code overflow-hidden">
      {language && (
        <div className="flex items-center justify-between px-4 py-2 border-b border-border-primary">
          <span className="text-xs text-text-tertiary font-mono">{language}</span>
          <CopyButton text={children} />
        </div>
      )}
      {!language && (
        <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
          <CopyButton text={children} />
        </div>
      )}
      <pre className="p-4 overflow-x-auto text-sm">
        <code className="font-mono text-text-secondary">{children}</code>
      </pre>
    </div>
  );
}
