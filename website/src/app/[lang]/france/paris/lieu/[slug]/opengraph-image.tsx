import { OG_CARD_SIZE } from "@/lib/og/card";
import { renderParisLieuOg } from "@/lib/og/fr-paris-cards";

export const runtime = "nodejs";
export const size = OG_CARD_SIZE;
export const contentType = "image/png";
export const alt = "Lieu parisien — Qipu";

export default async function OG({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return renderParisLieuOg(slug);
}
