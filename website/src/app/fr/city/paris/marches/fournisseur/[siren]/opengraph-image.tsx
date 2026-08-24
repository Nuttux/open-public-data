import { OG_CARD_SIZE } from "@/lib/og/card";
import { renderParisFournisseurOg } from "@/lib/og/fr-paris-cards";

export const runtime = "nodejs";
export const size = OG_CARD_SIZE;
export const contentType = "image/png";
export const alt = "Fournisseur de la Ville de Paris — Qipu";

export default async function OG({ params }: { params: Promise<{ siren: string }> }) {
  const { siren } = await params;
  return renderParisFournisseurOg(siren);
}
