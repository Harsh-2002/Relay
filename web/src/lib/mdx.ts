import fs from "fs";
import path from "path";
import matter from "gray-matter";
import type { DocFrontmatter, DocPage, TocEntry } from "@/types/docs";

const DOCS_DIR = path.join(process.cwd(), "src/content/docs");

export function getDocSlugs(): string[] {
  if (!fs.existsSync(DOCS_DIR)) return [];
  return fs
    .readdirSync(DOCS_DIR)
    .filter((f) => f.endsWith(".mdx"))
    .map((f) => f.replace(/\.mdx$/, ""));
}

export function getDocBySlug(slug: string): DocPage | null {
  const filePath = path.join(DOCS_DIR, `${slug}.mdx`);
  if (!fs.existsSync(filePath)) return null;

  const raw = fs.readFileSync(filePath, "utf-8");
  const { data, content } = matter(raw);

  return {
    slug,
    frontmatter: data as DocFrontmatter,
    content,
  };
}

export function getAllDocs(): DocPage[] {
  return getDocSlugs()
    .map((slug) => getDocBySlug(slug))
    .filter((d): d is DocPage => d !== null)
    .sort((a, b) => a.frontmatter.order - b.frontmatter.order);
}

export function extractToc(content: string): TocEntry[] {
  const headingRegex = /^(#{2,3})\s+(.+)$/gm;
  const entries: TocEntry[] = [];
  let match;

  while ((match = headingRegex.exec(content)) !== null) {
    const level = match[1].length;
    const text = match[2].trim();
    const id = text
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, "")
      .replace(/\s+/g, "-");
    entries.push({ id, text, level });
  }

  return entries;
}
