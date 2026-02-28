import { notFound } from "next/navigation";
import { MDXRemote } from "next-mdx-remote/rsc";
import { getDocBySlug, getDocSlugs, extractToc } from "@/lib/mdx";
import { mdxComponents } from "@/components/docs/mdx-components";
import { Toc } from "@/components/docs/toc";
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

  return {
    title: doc.frontmatter.title,
    description: doc.frontmatter.description,
  };
}

export default async function DocPage({ params }: Props) {
  const { slug } = await params;
  const doc = getDocBySlug(slug);
  if (!doc) notFound();

  const toc = extractToc(doc.content);

  return (
    <div className="flex gap-8">
      <article className="flex-1 min-w-0 max-w-3xl">
        <header className="mb-8">
          <h1 className="text-3xl font-bold tracking-tight text-text-primary">
            {doc.frontmatter.title}
          </h1>
          {doc.frontmatter.description && (
            <p className="mt-2 text-lg text-text-secondary">
              {doc.frontmatter.description}
            </p>
          )}
        </header>

        <div className="prose prose-invert max-w-none">
          <MDXRemote source={doc.content} components={mdxComponents} />
        </div>
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
