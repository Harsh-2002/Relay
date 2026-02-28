export interface DocFrontmatter {
  title: string;
  description: string;
  order: number;
}

export interface DocPage {
  slug: string;
  frontmatter: DocFrontmatter;
  content: string;
}

export interface TocEntry {
  id: string;
  text: string;
  level: number;
}
