"use client";

import { useState } from "react";
import type { PatrimoineMasse } from "@/lib/fusion-data";
import { fmtBillions, fmtDec, fmtMillions } from "@/lib/fmt";
import MasseFiche from "./MasseFiche";
import { useT, useLocale } from "@/lib/localeContext";
import { trLabel } from "@/lib/label-translate";

const fill = (s: string, vars: Record<string, string | number>) => {
  let r = s;
  for (const [k, v] of Object.entries(vars)) r = r.replace(`{${k}}`, String(v));
  return r;
};

type Props = {
  masses: PatrimoineMasse[];
  year: number;
};

export default function PatrimoineDrillList({ masses, year }: Props) {
  const t = useT();
  const { locale } = useLocale();
  const [open, setOpen] = useState<PatrimoineMasse | null>(null);
  const max = Math.max(...masses.map((m) => m.value), 1);

  return (
    <>
      <div className="fx-top-list">
        <div className="fx-top-head">
          <span>{t("fx.pdl.head_left")}</span>
          <span>{t("fx.pdl.head_right")}</span>
        </div>
        {masses.map((m, i) => {
          const pct = (m.value / max) * 100;
          const unit = m.value >= 1e9 ? t("fx.s.md_eur") : t("fx.s.m_eur");
          const display = m.value >= 1e9 ? fmtBillions(m.value) : fmtMillions(m.value, 0);
          const label = trLabel(m.label, locale);
          return (
            <button
              key={m.label}
              type="button"
              className="fx-top-row"
              onClick={() => setOpen(m)}
              aria-label={fill(t("fx.pdl.row_aria"), { label })}
            >
              <span className="r tnum">{String(i + 1).padStart(2, "0")}</span>
              <span className="name">
                {label}
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
              <span className="tag">{trLabel(m.tag, locale)}</span>
              <span className="arrow">→</span>
            </button>
          );
        })}
      </div>

      <MasseFiche masse={open} year={year} onClose={() => setOpen(null)} />
    </>
  );
}
