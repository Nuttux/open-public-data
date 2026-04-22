"use client";

import { useEffect, useMemo, useState } from "react";
import { useT } from "@/lib/localeContext";
import { useTrack } from "@/lib/analyticsContext";

type Taille = "t1" | "t2" | "t3" | "t4" | "t5plus";
type Zone = "any" | `arr${number}`;
type Menage = "seul" | "couple" | "famille12" | "famille3plus";
type Prio = "dalo" | "standard" | "mutation";
type Revenus = "plai" | "plus" | "pls" | "above";

type Profile = {
  taille: Taille;
  zone: Zone;
  menage: Menage;
  prio: Prio;
  revenus: Revenus;
};

const DEFAULT_PROFILE: Profile = {
  taille: "t3",
  zone: "any",
  menage: "couple",
  prio: "standard",
  revenus: "plus",
};

const TAILLE_MULT: Record<Taille, number> = {
  t1: 0.6, t2: 0.9, t3: 1.0, t4: 1.45, t5plus: 2.2,
};
const MENAGE_MULT: Record<Menage, number> = {
  seul: 1.1, couple: 1.0, famille12: 1.0, famille3plus: 1.3,
};
const PRIO_MULT: Record<Prio, number> = {
  dalo: 0.3, standard: 1.0, mutation: 1.55,
};
const REVENUS_MULT: Record<Exclude<Revenus, "above">, number> = {
  plai: 0.85, plus: 1.0, pls: 1.2,
};

/** Multiplicateurs par arrondissement dérivés de la part estimée de logement
 *  social dans le parc de résidences principales (source : inventaire SRU,
 *  rapports ministériels 2022-2024). Stock faible = forte tension. Cinq
 *  paliers pour rester lisible dans le dropdown. */
const ARR_TIER: Record<string, "tight_very" | "tight" | "std" | "loose" | "loose_very"> = {
  arr1: "tight_very", arr6: "tight_very", arr7: "tight_very", arr8: "tight_very",
  arr2: "tight", arr3: "tight", arr5: "tight", arr9: "tight", arr16: "tight",
  arr4: "std", arr10: "std", arr11: "std", arr12: "std", arr14: "std", arr15: "std", arr17: "std",
  arr13: "loose", arr18: "loose", arr20: "loose",
  arr19: "loose_very",
};
const TIER_MULT: Record<string, number> = {
  tight_very: 2.0,
  tight: 1.55,
  std: 1.0,
  loose: 0.8,
  loose_very: 0.6,
};

const zoneMult = (z: Zone): number => {
  if (z === "any") return 0.75;
  return TIER_MULT[ARR_TIER[z] ?? "std"];
};

const BASE_WAIT = 4.2;
const BASE_RATIO = 19;

const ALL_ARR = Array.from({ length: 20 }, (_, i) => `arr${i + 1}` as Zone);

/** One-decimal rounding, mirroring the Paris 2024 median format (4,2 ans).
 *  Keeps precision symmetric with the reference value so the user can compare
 *  their estimate to the median on equal footing. */
const roundWait = (n: number): number => {
  if (n < 0.5) return 0.5;
  return Math.round(n * 10) / 10;
};

/** Qualitative tier from wait ratio vs median (replaces the opaque
 *  percentile formula). */
const tierFor = (wait: number): "short" | "median" | "long" | "very_long" => {
  const r = wait / BASE_WAIT;
  if (r < 0.7) return "short";
  if (r < 1.3) return "median";
  if (r < 2.0) return "long";
  return "very_long";
};

const isTaille = (v: string): v is Taille =>
  ["t1", "t2", "t3", "t4", "t5plus"].includes(v);
const isMenage = (v: string): v is Menage =>
  ["seul", "couple", "famille12", "famille3plus"].includes(v);
const isPrio = (v: string): v is Prio =>
  ["dalo", "standard", "mutation"].includes(v);
const isRevenus = (v: string): v is Revenus =>
  ["plai", "plus", "pls", "above"].includes(v);
const isZone = (v: string): v is Zone =>
  v === "any" || (v.startsWith("arr") && /^arr\d{1,2}$/.test(v) && Number(v.slice(3)) >= 1 && Number(v.slice(3)) <= 20);

const readFromURL = (): Profile | null => {
  if (typeof window === "undefined") return null;
  const sp = new URLSearchParams(window.location.search);
  const t = sp.get("t");
  const z = sp.get("z");
  const m = sp.get("m");
  const p = sp.get("p");
  const r = sp.get("r");
  if (!t || !z || !m || !p || !r) return null;
  if (!isTaille(t) || !isZone(z) || !isMenage(m) || !isPrio(p) || !isRevenus(r)) return null;
  return { taille: t, zone: z, menage: m, prio: p, revenus: r };
};

const writeToURL = (p: Profile) => {
  if (typeof window === "undefined") return;
  const sp = new URLSearchParams(window.location.search);
  sp.set("t", p.taille);
  sp.set("z", p.zone);
  sp.set("m", p.menage);
  sp.set("p", p.prio);
  sp.set("r", p.revenus);
  const qs = sp.toString();
  window.history.replaceState(null, "", `${window.location.pathname}?${qs}${window.location.hash}`);
};

export default function WaitSimulator() {
  const t = useT();
  const track = useTrack();
  const [profile, setProfile] = useState<Profile>(DEFAULT_PROFILE);
  const [ready, setReady] = useState(false);
  const [copied, setCopied] = useState(false);

  const updateProfile = (next: Profile, changedField: keyof Profile) => {
    track("logement_simulator_change", {
      field: changedField,
      value: next[changedField],
      profile: { ...next },
    });
    setProfile(next);
  };

  useEffect(() => {
    const fromUrl = readFromURL();
    if (fromUrl) setProfile(fromUrl);
    setReady(true);
  }, []);

  useEffect(() => {
    if (!ready) return;
    writeToURL(profile);
  }, [profile, ready]);

  const eligible = profile.revenus !== "above";

  const AXIS_MAX = BASE_WAIT * 2.5;
  const MEDIAN_PCT = (BASE_WAIT / AXIS_MAX) * 100;

  const { waitRounded, ratio, tier, sharePct } = useMemo(() => {
    if (!eligible) {
      return { waitRounded: 0, ratio: 0, tier: "median" as const, sharePct: 0 };
    }
    const m =
      TAILLE_MULT[profile.taille] *
      zoneMult(profile.zone) *
      MENAGE_MULT[profile.menage] *
      PRIO_MULT[profile.prio] *
      REVENUS_MULT[profile.revenus as Exclude<Revenus, "above">];
    const w = Math.max(0.5, BASE_WAIT * m);
    const r = Math.max(2, Math.round(BASE_RATIO * (w / BASE_WAIT)));
    const pct = Math.min(100, (w / AXIS_MAX) * 100);
    return {
      waitRounded: roundWait(w),
      ratio: r,
      tier: tierFor(w),
      sharePct: pct,
    };
  }, [profile, eligible, AXIS_MAX]);

  const fmtYears = (n: number): string => {
    if (n < 0.5) return t("fx.sim.lt1");
    return n.toFixed(1).replace(".", t("fx.sim.decimal"));
  };
  const medianLabel = BASE_WAIT.toFixed(1).replace(".", t("fx.sim.decimal"));

  const fields = [
    {
      key: "taille",
      label: t("fx.sim.f.taille"),
      value: profile.taille,
      set: (v: string) => isTaille(v) && updateProfile({ ...profile, taille: v }, "taille"),
      options: [
        { value: "t1", label: t("fx.sim.opt.t1") },
        { value: "t2", label: t("fx.sim.opt.t2") },
        { value: "t3", label: t("fx.sim.opt.t3") },
        { value: "t4", label: t("fx.sim.opt.t4") },
        { value: "t5plus", label: t("fx.sim.opt.t5plus") },
      ],
    },
    {
      key: "menage",
      label: t("fx.sim.f.menage"),
      value: profile.menage,
      set: (v: string) => isMenage(v) && updateProfile({ ...profile, menage: v }, "menage"),
      options: [
        { value: "seul", label: t("fx.sim.opt.seul") },
        { value: "couple", label: t("fx.sim.opt.couple") },
        { value: "famille12", label: t("fx.sim.opt.famille12") },
        { value: "famille3plus", label: t("fx.sim.opt.famille3plus") },
      ],
    },
    {
      key: "prio",
      label: t("fx.sim.f.prio"),
      value: profile.prio,
      set: (v: string) => isPrio(v) && updateProfile({ ...profile, prio: v }, "prio"),
      options: [
        { value: "dalo", label: t("fx.sim.opt.dalo") },
        { value: "standard", label: t("fx.sim.opt.standard") },
        { value: "mutation", label: t("fx.sim.opt.mutation") },
      ],
    },
    {
      key: "revenus",
      label: t("fx.sim.f.revenus"),
      value: profile.revenus,
      set: (v: string) => isRevenus(v) && updateProfile({ ...profile, revenus: v }, "revenus"),
      options: [
        { value: "plai", label: t("fx.sim.opt.plai") },
        { value: "plus", label: t("fx.sim.opt.plus") },
        { value: "pls", label: t("fx.sim.opt.pls") },
        { value: "above", label: t("fx.sim.opt.above") },
      ],
    },
  ];

  const zoneOptgroups: Array<{ label: string; items: Zone[] }> = [
    { label: t("fx.sim.zgrp.any"), items: ["any"] },
    { label: t("fx.sim.zgrp.tight_very"), items: ALL_ARR.filter((a) => ARR_TIER[a] === "tight_very") },
    { label: t("fx.sim.zgrp.tight"), items: ALL_ARR.filter((a) => ARR_TIER[a] === "tight") },
    { label: t("fx.sim.zgrp.std"), items: ALL_ARR.filter((a) => ARR_TIER[a] === "std") },
    { label: t("fx.sim.zgrp.loose"), items: ALL_ARR.filter((a) => ARR_TIER[a] === "loose") },
    { label: t("fx.sim.zgrp.loose_very"), items: ALL_ARR.filter((a) => ARR_TIER[a] === "loose_very") },
  ];

  const arrLabel = (z: Zone): string => {
    if (z === "any") return t("fx.sim.opt.zone.any");
    const n = Number(z.slice(3));
    if (n === 1) return t("fx.sim.opt.zone.arr1");
    return t("fx.sim.opt.zone.arrN").replace("{n}", String(n));
  };

  const copyShareLink = async () => {
    if (typeof window === "undefined") return;
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
      track("share_click", {
        method: "copy",
        entity_type: "wait_simulator",
        url: window.location.href,
        profile: { ...profile },
      });
    } catch {
      // clipboard unavailable — silently fail
    }
  };

  return (
    <>
      <div className="fx-sim">
        <div className="fx-sim-form">
          <div className="fx-sim-form-head">{t("fx.sim.form_head")}</div>
          <div className="fx-sim-form-grid">
            <label className="fx-sim-field fx-sim-field-wide">
              <span className="fx-sim-field-label">{t("fx.sim.f.zone")}</span>
              <select
                className="fx-sim-select"
                value={profile.zone}
                onChange={(e) => isZone(e.target.value) && updateProfile({ ...profile, zone: e.target.value }, "zone")}
              >
                {zoneOptgroups.map((g) => (
                  <optgroup key={g.label} label={g.label}>
                    {g.items.map((z) => (
                      <option key={z} value={z}>
                        {arrLabel(z)}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </label>
            {fields.map((f, i) => (
              <label
                className={`fx-sim-field${i === 0 ? " fx-sim-field-wide" : ""}`}
                key={f.key}
              >
                <span className="fx-sim-field-label">{f.label}</span>
                <select
                  className="fx-sim-select"
                  value={f.value}
                  onChange={(e) => f.set(e.target.value)}
                >
                  {f.options.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </label>
            ))}
          </div>
        </div>

        <div className="fx-sim-result" aria-live="polite">
          {eligible ? (
            <>
              <div className="fx-sim-result-head-row">
                <div className="fx-sim-result-head">{t("fx.sim.result_head")}</div>
                <span className={`fx-sim-tier fx-sim-tier-${tier}`}>
                  {t(`fx.sim.tier.${tier}`)}
                </span>
              </div>
              <div className="fx-sim-big">
                <span className="fx-sim-big-tilde" aria-hidden>~</span>
                <span className="v tnum">{fmtYears(waitRounded)}</span>
                <span className="u">{t("fx.sim.unit_years")}</span>
              </div>

              <div
                className="fx-sim-compare"
                role="img"
                aria-label={`${t("fx.sim.compare.you")} ~${fmtYears(waitRounded)} ${t("fx.sim.unit_years")} · ${t("fx.sim.compare.median")} ${medianLabel} ${t("fx.sim.unit_years")}`}
              >
                <div className="fx-sim-compare-track">
                  <span
                    className="fx-sim-compare-median"
                    style={{ left: `${MEDIAN_PCT}%` }}
                    aria-hidden
                  />
                  <div
                    className="fx-sim-compare-you"
                    style={{ left: `${sharePct}%` }}
                  >
                    <span className="lbl">{t("fx.sim.compare.you")}</span>
                    <span className="dot" aria-hidden />
                  </div>
                </div>
                <div className="fx-sim-compare-axis">
                  <span className="ax ax-start">0</span>
                  <span
                    className="ax ax-median"
                    style={{ left: `${MEDIAN_PCT}%` }}
                  >
                    {t("fx.sim.compare.median")} · {medianLabel} {t("fx.sim.unit_years")}
                  </span>
                  <span className="ax ax-end">{t("fx.sim.compare.axis_end")}</span>
                </div>
              </div>

              <div className="fx-sim-result-foot">
                <div className="fx-sim-ratio">
                  <div className="fx-sim-k">{t("fx.sim.k.ratio")}</div>
                  <div className="fx-sim-v tnum">
                    {ratio} : 1
                    <span className="fx-sim-v-u">{t("fx.sim.k.ratio_u")}</span>
                  </div>
                </div>
                <button
                  type="button"
                  className="fx-sim-share"
                  onClick={copyShareLink}
                >
                  {copied ? t("fx.sim.share.copied") : t("fx.sim.share.copy")}
                </button>
              </div>
            </>
          ) : (
            <>
              <div className="fx-sim-result-head fx-sim-result-head-alert">
                {t("fx.sim.ineligible.head")}
              </div>
              <h3 className="fx-sim-ineligible-title">{t("fx.sim.ineligible.title")}</h3>
              <p className="fx-sim-ineligible-p">{t("fx.sim.ineligible.p1")}</p>
              <p className="fx-sim-ineligible-p">{t("fx.sim.ineligible.p2")}</p>
            </>
          )}
        </div>
      </div>

      <p className="fx-note fx-sim-note">
        <b>{t("fx.sim.disclaimer_label")}</b> : {t("fx.sim.disclaimer")}
      </p>
    </>
  );
}
