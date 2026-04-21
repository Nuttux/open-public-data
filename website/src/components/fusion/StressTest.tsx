"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { fmtDec } from "@/lib/fmt";
import { useT } from "@/lib/localeContext";

type Props = {
  /** Dette financière actuelle en €. */
  dette: number;
  /** Capacité de désendettement actuelle en années (dette/épargne brute). */
  capaciteBaseline: number;
  /** Taux moyen actuel de la dette (%). */
  tauxBaseline: number;
  /** Année de référence. */
  year: number;
  /** Si true, synchronise l'état avec l'URL (?t, ?r, ?i) — permet partage. */
  urlSync?: boolean;
};

type Preset = {
  id: string;
  labelKey: string;
  descKey: string;
  taux_delta_pp: number; // points de pourcentage absolus
  recettes_delta_pct: number;
  invest_mult: number;
};

const PRESETS: Preset[] = [
  {
    id: "covid",
    labelKey: "fx.det.stress.preset.covid.label",
    descKey: "fx.det.stress.preset.covid.desc",
    taux_delta_pp: 0,
    recettes_delta_pct: -5, // observé Paris 2020 : recettes ~ −5 %
    invest_mult: 1,
  },
  {
    id: "taux",
    labelKey: "fx.det.stress.preset.taux.label",
    descKey: "fx.det.stress.preset.taux.desc",
    taux_delta_pp: 2.0, // taux moyen passe de 2,4 % à ~4,4 %
    recettes_delta_pct: 0,
    invest_mult: 1,
  },
  {
    id: "jo",
    labelKey: "fx.det.stress.preset.jo.label",
    descKey: "fx.det.stress.preset.jo.desc",
    taux_delta_pp: 0,
    recettes_delta_pct: 0,
    invest_mult: 1.2,
  },
  {
    id: "triple",
    labelKey: "fx.det.stress.preset.triple.label",
    descKey: "fx.det.stress.preset.triple.desc",
    taux_delta_pp: 1.5,
    recettes_delta_pct: -4,
    invest_mult: 1.1,
  },
  {
    id: "ecroulement",
    labelKey: "fx.det.stress.preset.ecroulement.label",
    descKey: "fx.det.stress.preset.ecroulement.desc",
    taux_delta_pp: 4,
    recettes_delta_pct: -15,
    invest_mult: 1.3,
  },
];

// ─── Modèle ─────────────────────────────────────────────────────────────

type ComputeInput = {
  taux: number;
  recettesDelta: number;
  investMult: number;
  dette: number;
  epargneBaseline: number;
  tauxBaseline: number;
};

function computeCapacite(i: ComputeInput) {
  // 1. Choc sur épargne brute via effet de levier recettes (~×5 pour Paris).
  //    Un −5 % de recettes => épargne s'effondre de ~25 %.
  const recettesEffect = i.recettesDelta * LEVERAGE_RECETTES / 100;

  // 2. Choc sur épargne via surcoût d'intérêts (propagation en régime permanent
  //    — toute la dette stock est supposée refinancée au nouveau taux).
  const extraInterest = i.dette * ((i.taux - i.tauxBaseline) / 100);

  const epargneNew = i.epargneBaseline * (1 + recettesEffect) - extraInterest;

  // 3. Stock de dette : seule la part d'invest. supplémentaire financée par
  //    emprunt grossit la dette.
  const investDelta = i.investMult - 1;
  const detteNew = i.dette * (1 + investDelta * BORROW_RATIO);

  // 4. Capacité = stock / flux. Si épargne ≤ 0, la ville ne rembourse plus
  //    par ses propres revenus — état terminal.
  const isCollapsed = epargneNew <= 0;
  const capacite = isCollapsed
    ? Number.POSITIVE_INFINITY
    : detteNew / epargneNew;

  const ratio = Number.isFinite(capacite) ? capacite / SCALE_MAX : 1;
  const pos = Math.min(1, Math.max(0, ratio)) * 100;

  let status: "confortable" | "attention" | "alerte" | "critique" | "tutelle" = "confortable";
  if (isCollapsed) status = "tutelle";
  else if (capacite >= CRITICAL_YEARS) status = "critique";
  else if (capacite >= THRESHOLD_YEARS) status = "alerte";
  else if (capacite >= THRESHOLD_YEARS - 3) status = "attention";

  return { capacite, pos, status, detteNew, epargneNew, isCollapsed };
}

// Seuil d'alerte réglementaire (préfet / CRC).
const THRESHOLD_YEARS = 12;
// Seuil au-delà duquel on considère que la tutelle préfectorale est quasi
// inévitable (pratique observée : les CRC placent en procédure d'alerte
// grave au-dessus de 20 ans).
const CRITICAL_YEARS = 20;
const SCALE_MAX = 30;

// ─── Paramètres du modèle (observés Paris 2019-2024) ────────────────────
//
// LEVERAGE_RECETTES : une baisse de 1 % des recettes de fonctionnement
// n'entraîne pas 1 % de baisse d'épargne brute, mais beaucoup plus. Pour
// Paris les recettes valent ~8 Md € mais l'épargne brute n'est que ~1,1 Md €
// — donc une variation absolue de recettes se projette directement sur
// l'épargne après absorption par les dépenses rigides (personnel, aide
// sociale). L'élasticité observée des dépenses aux recettes est ~0,35 :
// 65 % d'un choc de recettes passe à l'épargne, démultipliée par le ratio
// recettes/épargne (~7,5). Soit un levier global d'environ 5.
// Observation 2020 : recettes −5 %, épargne −33 % (levier ≈ 6,5).
const LEVERAGE_RECETTES = 5.0;

// BORROW_RATIO : part de l'investissement supplémentaire financée par
// emprunt (le reste venant de l'autofinancement et des subventions).
// Paris finance historiquement ~50 % de ses invest par nouvelle dette.
const BORROW_RATIO = 0.5;

export default function StressTest({ dette, capaciteBaseline, tauxBaseline, year, urlSync }: Props) {
  const t = useT();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // Épargne brute déduite des valeurs actuelles.
  const epargneBaseline = dette / capaciteBaseline;

  const hydratedRef = useRef(false);
  const [taux, setTaux] = useState(tauxBaseline);
  const [recettesDelta, setRecettesDelta] = useState(0); // %
  const [investMult, setInvestMult] = useState(1);

  // Hydrate depuis l'URL au mount (Next.js : searchParams arrive côté client).
  useEffect(() => {
    if (!urlSync || hydratedRef.current) return;
    const parse = (v: string | null, fallback: number) => {
      if (v == null) return fallback;
      const n = Number(v);
      return Number.isFinite(n) ? n : fallback;
    };
    setTaux(parse(searchParams.get("t"), tauxBaseline));
    setRecettesDelta(parse(searchParams.get("r"), 0));
    setInvestMult(parse(searchParams.get("i"), 1));
    hydratedRef.current = true;
  }, [urlSync, searchParams, tauxBaseline]);

  // Pousse l'URL à chaque changement (seulement après hydration + en mode sync).
  useEffect(() => {
    if (!urlSync || !hydratedRef.current) return;
    const params = new URLSearchParams(Array.from(searchParams.entries()));
    const isBaseline =
      Math.abs(taux - tauxBaseline) < 0.01 &&
      Math.abs(recettesDelta) < 0.5 &&
      Math.abs(investMult - 1) < 0.01;
    if (isBaseline) {
      params.delete("t");
      params.delete("r");
      params.delete("i");
    } else {
      params.set("t", taux.toFixed(1));
      params.set("r", String(Math.round(recettesDelta)));
      params.set("i", investMult.toFixed(2));
    }
    const q = params.toString();
    router.replace(q ? `${pathname}?${q}` : pathname, { scroll: false });
  }, [taux, recettesDelta, investMult, urlSync, router, pathname, searchParams, tauxBaseline]);

  const result = useMemo(() => computeCapacite({
    taux,
    recettesDelta,
    investMult,
    dette,
    epargneBaseline,
    tauxBaseline,
  }), [taux, recettesDelta, investMult, dette, epargneBaseline, tauxBaseline]);

  const applyPreset = (p: Preset) => {
    setTaux(tauxBaseline + p.taux_delta_pp);
    setRecettesDelta(p.recettes_delta_pct);
    setInvestMult(p.invest_mult);
  };

  const resetBaseline = () => {
    setTaux(tauxBaseline);
    setRecettesDelta(0);
    setInvestMult(1);
  };

  const presetResults = useMemo(
    () =>
      PRESETS.map((p) => {
        const { capacite } = computeCapacite({
          taux: tauxBaseline + p.taux_delta_pp,
          recettesDelta: p.recettes_delta_pct,
          investMult: p.invest_mult,
          dette,
          epargneBaseline,
          tauxBaseline,
        });
        return { ...p, capacite };
      }),
    [dette, epargneBaseline, tauxBaseline],
  );

  return (
    <div className="fx-stress">
      <p className="fx-stress-lead">
        {t("fx.det.stress.lead")}{" "}
        <b>
          {fmtDec(capaciteBaseline, 1)} {t("fx.det.s02.kpi.ans")}
        </b>
        .{" "}
        {t("fx.det.stress.threshold")}{" "}
        <b>
          {THRESHOLD_YEARS} {t("fx.det.s02.kpi.ans")}
        </b>
        .
      </p>

      <div className="fx-stress-grid">
        <div className="fx-stress-controls">
          <SliderRow
            label={t("fx.det.stress.slider.taux")}
            hint={`${t("fx.det.stress.actual")} ${fmtDec(tauxBaseline, 1)} %`}
            min={0}
            max={10}
            step={0.1}
            value={taux}
            onChange={setTaux}
            format={(v) => `${fmtDec(v, 1)} %`}
            baseline={tauxBaseline}
            baselineFormat={(v) => `${fmtDec(v, 1)} %`}
          />
          <SliderRow
            label={t("fx.det.stress.slider.recettes")}
            hint={t("fx.det.stress.actual_base")}
            min={-30}
            max={10}
            step={1}
            value={recettesDelta}
            onChange={setRecettesDelta}
            format={(v) => `${v >= 0 ? "+" : ""}${v} %`}
            baseline={0}
            baselineFormat={() => "0 %"}
          />
          <SliderRow
            label={t("fx.det.stress.slider.invest")}
            hint={t("fx.det.stress.actual_index")}
            min={0.3}
            max={2.5}
            step={0.05}
            value={investMult}
            onChange={setInvestMult}
            format={(v) => `× ${fmtDec(v, 2)}`}
            baseline={1}
            baselineFormat={() => "× 1,00"}
          />
          <button
            type="button"
            className="fx-stress-reset"
            onClick={resetBaseline}
          >
            {t("fx.det.stress.reset")}
          </button>
        </div>

        <div className="fx-stress-result">
          <div className="fx-stress-result-label">
            {t("fx.det.stress.result_label")}
          </div>
          <div className={`fx-stress-result-value tnum ${result.status}`}>
            {result.isCollapsed ? (
              <span style={{ fontSize: "0.55em" }}>∞</span>
            ) : (
              <>
                {fmtDec(result.capacite, 1)}
                <span className="u"> {t("fx.det.s02.kpi.ans")}</span>
              </>
            )}
          </div>

          <div className="fx-stress-scale" aria-hidden>
            <div className="fx-stress-scale-track">
              <div
                className="fx-stress-scale-threshold"
                style={{ left: `${(THRESHOLD_YEARS / SCALE_MAX) * 100}%` }}
                title={`Seuil ${THRESHOLD_YEARS} ans`}
              />
              <div
                className="fx-stress-scale-critical"
                style={{ left: `${(CRITICAL_YEARS / SCALE_MAX) * 100}%` }}
                title={`Seuil critique ${CRITICAL_YEARS} ans`}
              />
              <div
                className="fx-stress-scale-baseline"
                style={{ left: `${(capaciteBaseline / SCALE_MAX) * 100}%` }}
                title={`Baseline ${year}`}
              />
              <div
                className={`fx-stress-scale-cursor ${result.status}`}
                style={{ left: `${result.pos}%` }}
              />
            </div>
            <div className="fx-stress-scale-axis">
              <span>0</span>
              <span className="tnum">{THRESHOLD_YEARS}</span>
              <span className="tnum">{CRITICAL_YEARS}</span>
              <span>{SCALE_MAX}+</span>
            </div>
          </div>

          <div className={`fx-stress-status ${result.status}`}>
            {result.status === "tutelle" && t("fx.det.stress.status.tutelle")}
            {result.status === "critique" && t("fx.det.stress.status.critique")}
            {result.status === "alerte" && t("fx.det.stress.status.alerte")}
            {result.status === "attention" && t("fx.det.stress.status.attention")}
            {result.status === "confortable" && t("fx.det.stress.status.confortable")}
          </div>

          {result.status === "tutelle" && (
            <div className="fx-stress-collapse">
              <b>{t("fx.det.stress.collapse.lbl")}</b>
              <p>{t("fx.det.stress.collapse.p1")}</p>
              <p className="muted">{t("fx.det.stress.collapse.p2")}</p>
            </div>
          )}
          {result.status === "critique" && !result.isCollapsed && (
            <div className="fx-stress-collapse warn">
              <b>{t("fx.det.stress.critical.lbl")}</b>
              <p>{t("fx.det.stress.critical.p")}</p>
            </div>
          )}

          <div className="fx-stress-insight">
            <span className="lbl">{t("fx.det.stress.insight_lbl")}</span>{" "}
            {t("fx.det.stress.insight")}
          </div>
        </div>
      </div>

      <div className="fx-stress-presets">
        <div className="fx-stress-presets-title">{t("fx.det.stress.presets_title")}</div>
        <div className="fx-stress-presets-grid">
          {presetResults.map((p) => {
            const isAlerte = p.capacite >= THRESHOLD_YEARS;
            return (
              <button
                key={p.id}
                type="button"
                className="fx-stress-preset"
                onClick={() => applyPreset(p)}
              >
                <div className="l">{t(p.labelKey)}</div>
                <div className="d muted">{t(p.descKey)}</div>
                <div className={`v tnum ${isAlerte ? "alerte" : ""}`}>
                  → {fmtDec(p.capacite, 1)} {t("fx.det.s02.kpi.ans")}
                  {isAlerte && <span className="flag"> ⚠</span>}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      <p className="fx-stress-disclaimer">{t("fx.det.stress.disclaimer")}</p>
    </div>
  );
}

type SliderRowProps = {
  label: string;
  hint: string;
  min: number;
  max: number;
  step: number;
  value: number;
  onChange: (v: number) => void;
  format: (v: number) => string;
  baseline: number;
  baselineFormat: (v: number) => string;
};

function SliderRow({
  label,
  hint,
  min,
  max,
  step,
  value,
  onChange,
  format,
  baseline,
  baselineFormat,
}: SliderRowProps) {
  const basePos = ((baseline - min) / (max - min)) * 100;
  return (
    <div className="fx-stress-slider">
      <div className="fx-stress-slider-head">
        <span className="label">{label}</span>
        <span className="value tnum">{format(value)}</span>
      </div>
      <div className="fx-stress-slider-track-wrap">
        <div
          className="fx-stress-slider-baseline-mark"
          style={{ left: `${basePos}%` }}
          aria-hidden
        />
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          className="fx-stress-slider-input"
          aria-label={label}
        />
      </div>
      <div className="fx-stress-slider-hint muted">
        {hint} · base {baselineFormat(baseline)}
      </div>
    </div>
  );
}
