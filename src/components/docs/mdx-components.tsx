import type { MDXComponents } from "mdx/types";
import Link from "next/link";

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-");
}

export const mdxComponents: MDXComponents = {
  h1: ({ children, ...props }) => (
    <h1 id={slugify(String(children))} className="text-3xl font-bold tracking-tight text-text-primary mt-8 mb-4" {...props}>
      {children}
    </h1>
  ),
  h2: ({ children, ...props }) => (
    <h2 id={slugify(String(children))} className="text-2xl font-semibold tracking-tight text-text-primary mt-12 mb-4 pb-2 border-b border-border-primary" {...props}>
      {children}
    </h2>
  ),
  h3: ({ children, ...props }) => (
    <h3 id={slugify(String(children))} className="text-xl font-semibold text-text-primary mt-8 mb-3" {...props}>
      {children}
    </h3>
  ),
  p: ({ children, ...props }) => (
    <p className="text-text-secondary leading-relaxed mb-4" {...props}>
      {children}
    </p>
  ),
  a: ({ children, href, ...props }) => {
    const isExternal = href?.startsWith("http") || href?.startsWith("//");
    if (isExternal) {
      return (
        <a href={href} className="text-accent hover:underline font-medium" target="_blank" rel="noopener noreferrer" {...props}>
          {children}
        </a>
      );
    }
    return (
      <Link href={href || "#"} className="text-accent hover:underline font-medium" {...props}>
        {children}
      </Link>
    );
  },
  ul: ({ children, ...props }) => (
    <ul className="list-disc list-inside space-y-1 mb-4 text-text-secondary" {...props}>
      {children}
    </ul>
  ),
  ol: ({ children, ...props }) => (
    <ol className="list-decimal list-inside space-y-1 mb-4 text-text-secondary" {...props}>
      {children}
    </ol>
  ),
  li: ({ children, ...props }) => (
    <li className="text-text-secondary" {...props}>
      {children}
    </li>
  ),
  code: ({ children, className, ...props }) => {
    // Inline code (not inside pre)
    if (!className) {
      return (
        <code className="bg-bg-card-hover px-1.5 py-0.5 rounded text-sm font-mono text-text-primary" {...props}>
          {children}
        </code>
      );
    }
    // Code block (inside pre) - pass through
    return (
      <code className={className} {...props}>
        {children}
      </code>
    );
  },
  pre: ({ children, ...props }) => (
    <pre className="my-4 rounded-lg border border-border-primary bg-bg-code p-4 overflow-x-auto text-sm" {...props}>
      {children}
    </pre>
  ),
  blockquote: ({ children, ...props }) => (
    <blockquote className="my-4 border-l-2 border-accent/50 pl-4 text-text-secondary italic" {...props}>
      {children}
    </blockquote>
  ),
  table: ({ children, ...props }) => (
    <div className="my-4 overflow-x-auto rounded-lg border border-border-primary">
      <table className="w-full text-sm" {...props}>
        {children}
      </table>
    </div>
  ),
  thead: ({ children, ...props }) => (
    <thead className="bg-bg-card" {...props}>
      {children}
    </thead>
  ),
  th: ({ children, ...props }) => (
    <th className="px-4 py-3 text-left font-semibold text-text-primary border-b border-border-primary" {...props}>
      {children}
    </th>
  ),
  td: ({ children, ...props }) => (
    <td className="px-4 py-3 text-text-secondary border-b border-border-primary" {...props}>
      {children}
    </td>
  ),
  hr: (props) => <hr className="my-8 border-border-primary" {...props} />,
};
