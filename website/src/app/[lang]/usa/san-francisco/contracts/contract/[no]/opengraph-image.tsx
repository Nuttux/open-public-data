import { renderSfContractOg } from "@/lib/og/us-sf-cards";
import { OG_CARD_SIZE } from "@/lib/og/card";

export const runtime = "nodejs";
export const size = OG_CARD_SIZE;
export const contentType = "image/png";
export const alt = "San Francisco contract — Qipu";

export default async function OG({ params }: { params: Promise<{ no: string }> }) {
  const { no } = await params;
  return renderSfContractOg(no);
}
