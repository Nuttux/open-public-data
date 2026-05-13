"use client";

import Link from "next/link";
import { useState } from "react";
import { fmtDec } from "@/lib/fmt";
import { useT } from "@/lib/localeContext";
import {
  LEVERAGE_RECETTES_MAX,
  BORROW_RATIO_MAX,
  CAPACITE_DESENDETTEMENT_ALERTE_ANS,
  CAPACITE_DESENDETTEMENT_CRITIQUE_ANS,
} from "@/lib/methodology";

type Preset = {
  id: string;
  labelKey: string;
  descKey: string;
  t: number; // taux (pp ajoutés au baseline → encoded directly in URL absolute)
  r: number; // recettes delta %
  i: number; // invest multiplier
  capFn: (baseline: { capaciteBaseline: number; dette: number; epargne: number; tauxBaseline: number }) => number;
};

const LEVERAGE_RECETTES = LEVERAGE_RECETTES_MAX;
const BORROW_RATIO = BORROW_RATIO_MAX;

function capForScenario(
  baseline: { dette: number; epargne: number; tauxBaseline: number },
  tauxDeltaPp: number,
  recettesPct: number,
  investMult: number,
): { capacite: number; isCollapsed: boolean } {
  const recettesEffect = (recettesPct * LEVERAGE_RECETTES) / 100;
  const extraInterest = baseline.dette * (tauxDeltaPp / 100);
  const epargneNew = baseline.epargne * (1 + recettesEffect) - extraInterest;
  const detteNew = baseline.dette * (1 + (investMult - 1) * BORROW_RATIO);
  if (epargneNew <= 0) {
    return { capacite: Number.POSITIVE_INFINITY, isCollapsed: true };
  }
  return { capacite: detteNew / epargneNew, isCollapsed: false };
}

const PRESETS: Array<Omit<Preset, "capFn"> & { taux_dp: number; rec_p: number; inv_m: number }> = [
  { id: "covid", labelKey: "fx.det.stress.preset.covid.label", descKey: "fx.det.stress.preset.covid.desc", t: 0, r: -5, i: 1, taux_dp: 0, rec_p: -5, inv_m: 1 },
  { id: "taux", labelKey: "fx.det.stress.preset.taux.label", descKey: "fx.det.stress.preset.taux.desc", t: 2, r: 0, i: 1, taux_dp: 2, rec_p: 0, inv_m: 1 },
  { id: "jo", labelKey: "fx.det.stress.preset.jo.label", descKey: "fx.det.stress.preset.jo.desc", t: 0, r: 0, i: 1.2, taux_dp: 0, rec_p: 0, inv_m: 1.2 },
  { id: "triple", labelKey: "fx.det.stress.preset.triple.label", descKey: "fx.det.stress.preset.triple.desc", t: 1.5, r: -4, i: 1.1, taux_dp: 1.5, rec_p: -4, inv_m: 1.1 },
  { id: "ecroulement", labelKey: "fx.det.stress.preset.ecroulement.label", descKey: "fx.det.stress.preset.ecroulement.desc", t: 4, r: -15, i: 1.3, taux_dp: 4, rec_p: -15, inv_m: 1.3 },
];

const THRESHOLD = CAPACITE_DESENDETTEMENT_ALERTE_ANS;
const CRITICAL = CAPACITE_DESENDETTEMENT_CRITIQUE_ANS;
const SCALE = 30;

type Props = {
  dette: number;
  capaciteBaseline: number;
  tauxBaseline: number;
  year: number;
};

export default function StressTestTeaser({ dette, capaciteBaseline, tauxBaseline }: Props) {
  const t = useT();
  const [activeId, setActiveId] = useState<string | null>(null);
  const epargne = dette / capaciteBaseline;

  const presets = PRESETS.map((p) => {
    const { capacite, isCollapsed } = capForScenario({ dette, epargne, tauxBaseline }, p.taux_dp, p.rec_p, p.inv_m);
    return { ...p, capacite, isCollapsed };
  });

  const active = activeId ? presets.find((p) => p.id === activeId) : null;
  const displayed = active ? active.capacite : capaciteBaseline;
  const isCollapsed = active?.isCollapsed ?? false;
  const status: "confortable" | "attention" | "alerte" | "critique" | "tutelle" = isCollapsed
    ? "tutelle"
    : displayed >= CRITICAL
    ? "critique"
    : displayed >= THRESHOLD
    ? "alerte"
    : displayed >= THRESHOLD - 3
    ? "attention"
    : "confortable";

  const urlFor = (p: (typeof presets)[number]) => {
    const params = new URLSearchParams();
    params.set("t", String(tauxBaseline + p.taux_dp));
    params.set("r", String(p.rec_p));
    params.set("i", p.inv_m.toFixed(2));
    return `/ville/paris/dette/stress-test?${params.toString()}`;
  };

  return (
    <div className="fx-stress-teaser">
      <div className="fx-stress-teaser-head">
        <div>
          <div className="fx-stress-teaser-lbl">
            {active ? t(active.labelKey) : t("fx.det.stress.teaser.now")}
          </div>
          <div className={`fx-stress-teaser-val tnum ${status}`}>
            {isCollapsed ? (
              <span style={{ fontSize: "0.6em" }}>∞</span>
            ) : (
              <>
                {fmtDec(displayed, 1)}
                <span className="u"> {t("fx.det.s02.kpi.ans")}</span>
              </>
            )}
          </div>
        </div>
        <Link href="/ville/paris/dette/stress-test" className="fx-stress-teaser-cta">
          {t("fx.det.stress.teaser.cta")} →
        </Link>
      </div>

      <div className="fx-stress-teaser-scale" aria-hidden>
        <div className="fx-stress-teaser-track crit">
          <div
            className="fx-stress-teaser-threshold"
            style={{ left: `${(THRESHOLD / SCALE) * 100}%` }}
          />
          <div
            className="fx-stress-teaser-critical"
            style={{ left: `${(CRITICAL / SCALE) * 100}%` }}
          />
          <div
            className={`fx-stress-teaser-cursor ${status}`}
            style={{
              left: `${Math.min(1, Math.max(0, (Number.isFinite(displayed) ? displayed : SCALE) / SCALE)) * 100}%`,
            }}
          />
        </div>
        <div className="fx-stress-teaser-axis">
          <span>0</span>
          <span>{THRESHOLD} {t("fx.det.stress.teaser.threshold_short")}</span>
          <span>{CRITICAL}</span>
          <span>{SCALE}+</span>
        </div>
      </div>

      <div className="fx-stress-teaser-presets">
        <div className="fx-stress-teaser-hint muted">
          {t("fx.det.stress.teaser.hint")}
        </div>
        <div className="fx-stress-teaser-presets-grid">
          <button
            type="button"
            className={`fx-stress-teaser-preset ${activeId === null ? "active" : ""}`}
            onClick={() => setActiveId(null)}
          >
            <div className="l">{t("fx.det.stress.teaser.now")}</div>
            <div className="v tnum">{fmtDec(capaciteBaseline, 1)} {t("fx.det.s02.kpi.ans")}</div>
          </button>
          {presets.map((p) => {
            const cls =
              p.isCollapsed || p.capacite >= CRITICAL
                ? "critique"
                : p.capacite >= THRESHOLD
                ? "alerte"
                : "";
            return (
              <button
                key={p.id}
                type="button"
                className={`fx-stress-teaser-preset ${activeId === p.id ? "active" : ""}`}
                onClick={() => setActiveId(p.id)}
              >
                <div className="l">{t(p.labelKey)}</div>
                <div className={`v tnum ${cls}`}>
                  → {p.isCollapsed ? "∞" : `${fmtDec(p.capacite, 1)} ${t("fx.det.s02.kpi.ans")}`}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      <div className="fx-stress-teaser-links">
        {active && (
          <Link href={urlFor(active)} className="fx-stress-teaser-deeplink">
            {t("fx.det.stress.teaser.open_scenario")} →
          </Link>
        )}
      </div>
    </div>
  );
}
