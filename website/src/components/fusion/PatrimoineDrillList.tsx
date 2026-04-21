"use client";

import { useState } from "react";
import type { PatrimoineMasse } from "@/lib/fusion-data";
import { fmtBillions, fmtDec, fmtMillions } from "@/lib/fmt";
import MasseFiche from "./MasseFiche";

type Props = {
  masses: PatrimoineMasse[];
  year: number;
};

export default function PatrimoineDrillList({ masses, year }: Props) {
  const [open, setOpen] = useState<PatrimoineMasse | null>(null);
  const max = Math.max(...masses.map((m) => m.value), 1);

  return (
    <>
      <div className="fx-top-list">
        <div className="fx-top-head">
          <span>Rang · Composante</span>
          <span>Valeur nette · Part · Détail</span>
        </div>
        {masses.map((m, i) => {
          const pct = (m.value / max) * 100;
          const unit = m.value >= 1e9 ? "Md €" : "M €";
          const display = m.value >= 1e9 ? fmtBillions(m.value) : fmtMillions(m.value, 0);
          return (
            <button
              key={m.label}
              type="button"
              className="fx-top-row"
              onClick={() => setOpen(m)}
              aria-label={`Détail ${m.label}`}
            >
              <span className="r tnum">{String(i + 1).padStart(2, "0")}</span>
              <span className="name">
                {m.label}
                {m.sub && <span className="loc">{m.sub}</span>}
              </span>
              <span className="bar">
                <span className="fill" style={{ width: `${pct}%` }} />
              </span>
              <span className="v tnum">
                {display}
                <span className="u">{unit}</span>
              </span>
              <span className="share tnum">
                {fmtDec(m.share * 100, 1)}
                <span className="u">%</span>
              </span>
              <span className="tag">{m.tag}</span>
              <span className="arrow">→</span>
            </button>
          );
        })}
      </div>

      <MasseFiche masse={open} year={year} onClose={() => setOpen(null)} />
    </>
  );
}
