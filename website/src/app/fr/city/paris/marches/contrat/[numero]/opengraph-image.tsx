import { OG_CARD_SIZE } from "@/lib/og/card";
import { renderParisContratOg } from "@/lib/og/fr-paris-cards";

export const runtime = "nodejs";
export const size = OG_CARD_SIZE;
export const contentType = "image/png";
export const alt = "Marché public de la Ville de Paris — Qipu";

export default async function OG({ params }: { params: Promise<{ numero: string }> }) {
  const { numero } = await params;
  return renderParisContratOg(numero);
}
