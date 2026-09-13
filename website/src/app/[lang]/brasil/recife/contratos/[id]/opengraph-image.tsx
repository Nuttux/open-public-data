import { renderRecifeContratoOg } from "@/lib/og/br-recife-cards";
import { OG_CARD_SIZE } from "@/lib/og/card";

export const runtime = "nodejs";
export const size = OG_CARD_SIZE;
export const contentType = "image/png";
export const alt = "Contrato do Recife — Qipu";

export default async function OG({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return renderRecifeContratoOg(id);
}
