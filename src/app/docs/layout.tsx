import { getAllDocs } from "@/lib/mdx";
import { Sidebar } from "@/components/docs/sidebar";
import { MobileSidebar } from "@/components/docs/mobile-sidebar";

export default function DocsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const docs = getAllDocs().map((d) => ({
    slug: d.slug,
    frontmatter: d.frontmatter,
  }));

  return (
    <div className="pt-16 min-h-screen">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex gap-6 lg:gap-8">
          {/* Sidebar - desktop only */}
          <aside className="hidden lg:block w-60 shrink-0 py-8">
            <div className="sticky top-24">
              <Sidebar docs={docs} />
            </div>
          </aside>

          {/* Main content */}
          <div className="flex-1 min-w-0 py-5 sm:py-8">{children}</div>
        </div>
      </div>

      {/* Mobile sidebar drawer */}
      <MobileSidebar docs={docs} />
    </div>
  );
}
