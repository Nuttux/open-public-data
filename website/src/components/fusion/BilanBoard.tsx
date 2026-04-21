"use client";

import { useState } from "react";
import type { PatrimoineMasse } from "@/lib/fusion-data";
import { fmtBillions, fmtDec, fmtMillions } from "@/lib/fmt";
import BalanceStack, { type BalanceSegment } from "./BalanceStack";
import MasseFiche from "./MasseFiche";

type Props = {
  year: number;
  actif: PatrimoineMasse[];
  passif: PatrimoineMasse[];
  totals: { actif: number; passif: number };
};

function fmt(v: number) {
  return v >= 1e9 ? `${fmtBillions(v)} Md €` : `${fmtMillions(v, 0)} M €`;
}

/**
 * Collapse segments whose share is below `threshold` into a single
 * "Autres · N postes" bucket so the visual proportions stay honest without
 * giving pixel space to sub-percent rows. The bucket is a non-interactive
 * light segment at the end.
 */
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
        label: m.label,
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
      label: `Autres · ${small.length} postes mineurs`,
      value: bucket,
      display: fmt(bucket),
      filled: false,
      tiny: true,
    });
  } else if (small.length === 1) {
    const m = small[0]!;
    big.push({
      key: m.label,
      label: m.label,
      value: m.value,
      display: fmt(m.value),
      onClick: () => onClick(m),
      filled: m.label !== "Fonds propres",
      tiny: true,
    });
  }
  return big;
}

export default function BilanBoard({ year, actif, passif, totals }: Props) {
  const [openMasse, setOpenMasse] = useState<PatrimoineMasse | null>(null);

  // Tiny segments (< 1 %) are collapsed into an "Autres" bucket so the visual
  // hierarchy reflects the actual weights (Actif immobilisé = 97 % should look
  // like 97 % of the column, not 70 %).
  const THRESHOLD = 0.01;
  const actifSegs = collapseTiny(actif, totals.actif, THRESHOLD, setOpenMasse);

  // For passif: sort Fonds propres to the top (visually anchors "patrimoine net"),
  // then the other segments by decreasing size, tiny ones collapsed.
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
          headLeft: <>Actif · <b>ce que la Ville possède</b></>,
          headRight: <>{fmtBillions(totals.actif)}<span className="u">Md €</span></>,
          total: totals.actif,
          segments: actifSegs,
          legend: (
            <>
              L&apos;<b>actif immobilisé</b> (bâtiments, terrains, voirie,
              équipements) représente l&apos;essentiel du patrimoine.
              Cliquez sur un segment pour ouvrir le détail des sous-postes.
            </>
          ),
        }}
        passif={{
          headLeft: <>Passif · <b>fonds propres + ce que la Ville doit</b></>,
          headRight: <>{fmtBillions(totals.passif)}<span className="u">Md €</span></>,
          total: totals.passif,
          segments: passifSegs,
          legend: (
            <>
              Les <b>fonds propres</b> ({fmtBillions(fondsPropres)} Md €,{" "}
              {fmtDec((fondsPropres / passifTotal) * 100, 0)} %) constituent le
              patrimoine net accumulé. La <b>dette financière</b>{" "}
              ({fmtBillions(detteFinanciere)} Md €,{" "}
              {fmtDec((detteFinanciere / passifTotal) * 100, 0)} %) pèse le reste.
            </>
          ),
        }}
      />

      <MasseFiche masse={openMasse} year={year} onClose={() => setOpenMasse(null)} />
    </>
  );
}
