import { renderSfPlaceOg } from "@/lib/og/us-sf-cards";
import { OG_CARD_SIZE } from "@/lib/og/card";

export const runtime = "nodejs";
export const size = OG_CARD_SIZE;
export const contentType = "image/png";
export const alt = "San Francisco place — Qipu";

export default async function OG({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return renderSfPlaceOg(slug);
}
