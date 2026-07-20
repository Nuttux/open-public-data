"use client";

import { useState } from "react";
import type { PatrimoineMasse } from "@/lib/fusion-data";
import { fill, fmtBillions, fmtDec, fmtMillions } from "@/lib/fmt";
import BalanceStack, { type BalanceSegment } from "./BalanceStack";
import MasseFiche from "./MasseFiche";
import { useT, useLocale } from "@/lib/localeContext";
import { trLabel } from "@/lib/label-translate";

// Turn an i18n string with <b>...</b> tags into React nodes.
function renderRich(s: string) {
  const parts = s.split(/(<b>[\s\S]*?<\/b>)/g);
  return parts.map((p, i) => {
    const m = p.match(/^<b>([\s\S]*)<\/b>$/);
    return m ? <b key={i}>{m[1]}</b> : <span key={i}>{p}</span>;
  });
}

type Props = {
  year: number;
  actif: PatrimoineMasse[];
  passif: PatrimoineMasse[];
  totals: { actif: number; passif: number };
};

export default function BilanBoard({ year, actif, passif, totals }: Props) {
  const t = useT();
  const { locale } = useLocale();
  const [openMasse, setOpenMasse] = useState<PatrimoineMasse | null>(null);

  const mdLabel = t("fx.s.md_eur");
  const mLabel = t("fx.s.m_eur");
  const fmt = (v: number) =>
    v >= 1e9 ? `${fmtBillions(v)} ${mdLabel}` : `${fmtMillions(v, 0)} ${mLabel}`;

  function collapseTiny(
    masses: PatrimoineMasse[],
    total: number,
    threshold: number,
    onClick: (m: PatrimoineMasse) => void,
  ): BalanceSegment[] {
    const big: BalanceSegment[] = [];
    const small: PatrimoineMasse[] = [];
    for (const m of masses) {
      const share = total > 0 ? m.value / total : 0;
      if (share >= threshold) {
        big.push({
          key: m.label,
          label: trLabel(m.label, locale),
          value: m.value,
          display: fmt(m.value),
          onClick: () => onClick(m),
          filled: m.label !== "Fonds propres",
        });
      } else {
        small.push(m);
      }
    }
    if (small.length > 1) {
      const bucket = small.reduce((s, m) => s + m.value, 0);
      big.push({
        key: "__autres__",
        label: fill(t("fx.bb.autres"), { n: small.length }),
        value: bucket,
        display: fmt(bucket),
        filled: false,
        tiny: true,
      });
    } else if (small.length === 1) {
      const m = small[0]!;
      big.push({
        key: m.label,
        label: trLabel(m.label, locale),
        value: m.value,
        display: fmt(m.value),
        onClick: () => onClick(m),
        filled: m.label !== "Fonds propres",
        tiny: true,
      });
    }
    return big;
  }

  const THRESHOLD = 0.01;
  const actifSegs = collapseTiny(actif, totals.actif, THRESHOLD, setOpenMasse);

  const passifSorted = passif.slice().sort((a, b) => {
    if (a.label === "Fonds propres") return -1;
    if (b.label === "Fonds propres") return 1;
    return b.value - a.value;
  });
  const passifSegs = collapseTiny(passifSorted, totals.passif, THRESHOLD, setOpenMasse);

  const detteFinanciere = passif.find((p) => p.label === "Dettes financières")?.value ?? 0;
  const fondsPropres = passif.find((p) => p.label === "Fonds propres")?.value ?? 0;
  const passifTotal = totals.passif || 1;

  return (
    <>
      <BalanceStack
        actif={{
          headLeft: <>{renderRich(t("fx.bb.actif_head_l"))}</>,
          headRight: <>{fmtBillions(totals.actif)}<span className="u">{mdLabel}</span></>,
          total: totals.actif,
          segments: actifSegs,
          legend: <>{renderRich(t("fx.bb.actif_legend"))}</>,
        }}
        passif={{
          headLeft: <>{renderRich(t("fx.bb.passif_head_l"))}</>,
          headRight: <>{fmtBillions(totals.passif)}<span className="u">{mdLabel}</span></>,
          total: totals.passif,
          segments: passifSegs,
          legend: (
            <>
              {renderRich(
                fill(t("fx.bb.passif_legend"), {
                  fp: fmtBillions(fondsPropres),
                  fpPct: fmtDec((fondsPropres / passifTotal) * 100, 0),
                  dett: fmtBillions(detteFinanciere),
                  dettPct: fmtDec((detteFinanciere / passifTotal) * 100, 0),
                }),
              )}
            </>
          ),
        }}
      />

      <MasseFiche masse={openMasse} year={year} onClose={() => setOpenMasse(null)} />
    </>
  );
}
