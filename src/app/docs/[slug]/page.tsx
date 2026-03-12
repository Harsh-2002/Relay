import Link from "next/link";
import { notFound } from "next/navigation";
import { MDXRemote } from "next-mdx-remote/rsc";
import remarkGfm from "remark-gfm";
import { getDocBySlug, getDocSlugs, extractToc, getDocNavigation } from "@/lib/mdx";
import { mdxComponents } from "@/components/docs/mdx-components";
import { Toc } from "@/components/docs/toc";
import { siteConfig } from "@/lib/metadata";
import { ArrowLeft, ArrowRight } from "lucide-react";
import type { Metadata } from "next";

interface Props {
  params: Promise<{ slug: string }>;
}

export async function generateStaticParams() {
  return getDocSlugs().map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const doc = getDocBySlug(slug);
  if (!doc) return {};

  const title = doc.frontmatter.title;
  const description = doc.frontmatter.description;
  const url = `${siteConfig.url}/docs/${slug}`;

  return {
    title,
    description,
    openGraph: {
      title: `${title} | Relay Docs`,
      description,
      url,
      type: "article",
    },
    twitter: {
      card: "summary",
      title: `${title} | Relay Docs`,
      description,
    },
    alternates: {
      canonical: url,
    },
  };
}

export default async function DocPage({ params }: Props) {
  const { slug } = await params;
  const doc = getDocBySlug(slug);
  if (!doc) notFound();

  const toc = extractToc(doc.content);
  const { prev, next } = getDocNavigation(slug);

  return (
    <div className="flex gap-4 lg:gap-8">
      <article className="flex-1 min-w-0 max-w-3xl">
        <header className="mb-5 sm:mb-8">
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-text-primary">
            {doc.frontmatter.title}
          </h1>
          {doc.frontmatter.description && (
            <p className="mt-2 text-base sm:text-lg text-text-secondary">
              {doc.frontmatter.description}
            </p>
          )}
        </header>

        <div className="prose prose-invert max-w-none">
          <MDXRemote source={doc.content} components={mdxComponents} options={{ mdxOptions: { remarkPlugins: [remarkGfm] } }} />
        </div>

        {/* Prev / Next navigation */}
        <nav className="mt-16 pt-8 border-t border-border-primary flex items-center justify-between gap-4">
          {prev ? (
            <Link
              href={`/docs/${prev.slug}`}
              className="group flex items-center gap-2 text-sm text-text-tertiary hover:text-text-primary transition-colors"
            >
              <ArrowLeft size={14} className="group-hover:-translate-x-0.5 transition-transform" />
              <span>{prev.frontmatter.title}</span>
            </Link>
          ) : (
            <span />
          )}
          {next ? (
            <Link
              href={`/docs/${next.slug}`}
              className="group flex items-center gap-2 text-sm text-text-tertiary hover:text-text-primary transition-colors ml-auto"
            >
              <span>{next.frontmatter.title}</span>
              <ArrowRight size={14} className="group-hover:translate-x-0.5 transition-transform" />
            </Link>
          ) : (
            <span />
          )}
        </nav>
      </article>

      {/* TOC - xl screens only */}
      <aside className="hidden xl:block w-48 shrink-0">
        <div className="sticky top-24">
          <Toc entries={toc} />
        </div>
      </aside>
    </div>
  );
}
