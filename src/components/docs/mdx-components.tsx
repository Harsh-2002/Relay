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
    <h1 id={slugify(String(children))} className="text-2xl sm:text-3xl font-bold tracking-tight text-text-primary mt-6 sm:mt-8 mb-4" {...props}>
      {children}
    </h1>
  ),
  h2: ({ children, ...props }) => (
    <h2 id={slugify(String(children))} className="text-xl sm:text-2xl font-semibold tracking-tight text-text-primary mt-8 sm:mt-12 mb-3 sm:mb-4 pb-2 border-b border-border-primary" {...props}>
      {children}
    </h2>
  ),
  h3: ({ children, ...props }) => (
    <h3 id={slugify(String(children))} className="text-lg sm:text-xl font-semibold text-text-primary mt-6 sm:mt-8 mb-2 sm:mb-3" {...props}>
      {children}
    </h3>
  ),
  p: ({ children, ...props }) => (
    <p className="text-sm sm:text-base text-text-secondary leading-relaxed mb-4" {...props}>
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
    <ul className="list-disc pl-4 space-y-1 mb-4 text-text-secondary text-sm sm:text-base" {...props}>
      {children}
    </ul>
  ),
  ol: ({ children, ...props }) => (
    <ol className="list-decimal pl-4 space-y-1 mb-4 text-text-secondary text-sm sm:text-base" {...props}>
      {children}
    </ol>
  ),
  li: ({ children, ...props }) => (
    <li className="text-text-secondary leading-relaxed" {...props}>
      {children}
    </li>
  ),
  code: ({ children, className, ...props }) => {
    if (!className) {
      return (
        <code className="bg-bg-card-hover px-1 py-0.5 rounded text-[13px] font-mono text-text-primary break-words" {...props}>
          {children}
        </code>
      );
    }
    return (
      <code className={className} {...props}>
        {children}
      </code>
    );
  },
  pre: ({ children, ...props }) => (
    <pre className="my-4 rounded-lg border border-border-primary bg-bg-code p-3 sm:p-4 overflow-x-auto text-[13px] sm:text-sm" {...props}>
      {children}
    </pre>
  ),
  blockquote: ({ children, ...props }) => (
    <blockquote className="my-4 border-l-2 border-accent/50 pl-3 sm:pl-4 text-text-secondary italic text-sm sm:text-base" {...props}>
      {children}
    </blockquote>
  ),
  table: ({ children, ...props }) => (
    <div className="my-4 overflow-x-auto rounded-lg border border-border-primary -mx-1 sm:mx-0">
      <table className="w-full text-[13px] sm:text-sm" {...props}>
        {children}
      </table>
    </div>
  ),
  thead: ({ children, ...props }) => (
    <thead className="bg-bg-card" {...props}>
      {children}
    </thead>
  ),
  tr: ({ children, ...props }) => (
    <tr className="border-b border-border-primary last:border-b-0" {...props}>
      {children}
    </tr>
  ),
  th: ({ children, ...props }) => (
    <th className="px-3 py-2 sm:px-4 sm:py-2.5 text-left text-[11px] sm:text-xs uppercase tracking-wider font-semibold text-text-primary whitespace-nowrap" {...props}>
      {children}
    </th>
  ),
  td: ({ children, ...props }) => (
    <td className="px-3 py-2 sm:px-4 sm:py-2.5 text-text-secondary align-top" {...props}>
      {children}
    </td>
  ),
  hr: (props) => <hr className="my-6 sm:my-8 border-border-primary" {...props} />,
};
