// Metadata and JSON-LD (Dataset + BreadcrumbList) live in page.tsx, computed
// from the data the page displays (lib/seo/sections/marseille.ts). This layout
// used to carry a second, hardcoded title and Dataset that duplicated them.
export default function InvestissementsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
