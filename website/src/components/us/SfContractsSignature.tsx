"use client";

import ExempleCards, { type ExempleCardItem } from "@/components/fusion/ExempleCards";
import type { SfSignatureItem } from "@/app/[lang]/usa/san-francisco/contracts/data";
import { contractLabel, deptDisplayName, typeLabel } from "@/app/[lang]/usa/san-francisco/contracts/us-sf-contracts-types";
import { fmtUsdCompact } from "@/lib/us/format";

/**
 * Three real contracts at the top of the SF contracts page — the port of
 * Paris's MarchesSignature (components/fusion/MarchesSignature.tsx) onto the
 * us-municipal register. Same intent: a page about $43B of commitments opens
 * on three things the City actually signed, each one click from its fiche.
 *
 * The picks are argmaxes computed in `loadSfContractsSignature` — nothing is
 * chosen editorially here, and nothing is recomputed: this file only formats.
 * No photos exist for the SF register, so the cards render text-only (the
 * shared component already handles a null photo).
 */

/** "$2.2B" → { v: "$2.2", u: "B" } so the magnitude renders as the card unit. */
function splitUsd(n: number): { v: string; u: string } {
  const s = fmtUsdCompact(n);
  const m = /^(.*?)([TBM])$/.exec(s);
  return m ? { v: m[1], u: m[2] } : { v: s, u: "" };
}

const KICKER: Record<SfSignatureItem["kind"], string> = {
  biggest: "Biggest commitment running",
  overrun: "Paid past its ceiling",
  sole: "Signed without a bid",
};

/**
 * The register's titles are administrative shorthand and there is no
 * descriptive text anywhere in the source to fall back on (measured — see
 * us_sf_title_clean.py). The contract TYPE is the one plain-English fact
 * about what a contract is for, so it leads the meta line: a card reading
 * "Phmcy Scndry Dist." at least says "Purchasing (goods & equipment)".
 * Trimmed at the first qualifier so it stays a short label.
 */
function shortType(raw: string | null): string | null {
  if (!raw) return null;
  const label = typeLabel(raw);
  return label.split(/\s+[—(]/)[0].trim() || null;
}

export default function SfContractsSignature({ items }: { items: SfSignatureItem[] }) {
  if (items.length === 0) return null;

  const cards: ExempleCardItem[] = items.map((it) => {
    const r = it.row;
    const isOverrun = it.kind === "overrun" && it.overrun_usd != null;
    const { v, u } = splitUsd(isOverrun ? it.overrun_usd! : r.agreed_usd);
    const meta = [
      shortType(r.contract_type),
      (r.prime ?? "—").slice(0, 38),
      r.department ? deptDisplayName(r.department) : null,
      isOverrun
        ? `${fmtUsdCompact(r.agreed_usd)} agreed, ${fmtUsdCompact(r.paid_usd)} paid`
        : `${fmtUsdCompact(r.paid_usd)} paid so far`,
    ]
      .filter(Boolean)
      .join(" · ");

    return {
      href: `/usa/san-francisco/contracts/contract/${r.contract_no}`,
      kicker: KICKER[it.kind],
      // Ocre marks the two procurement exceptions, the same ink the register
      // rows and the contract fiche use for sole-source and overruns.
      kickerOcre: it.kind !== "biggest",
      title: contractLabel(r),
      amount: v,
      amountUnit: [u, isOverrun ? "over" : "agreed"].filter(Boolean).join(" "),
      meta,
      cta: "Open the contract",
      photoUrl: null,
      photoCredit: null,
    };
  });

  return <ExempleCards items={cards} />;
}
