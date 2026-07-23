import { renderAssociationOg, ogSize } from "@/lib/og/association-card";

export const runtime = "nodejs";
export const alt = "Association — Qipu";
export const size = ogSize;
export const contentType = "image/png";

export default async function OG({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return renderAssociationOg("paris", slug);
}
