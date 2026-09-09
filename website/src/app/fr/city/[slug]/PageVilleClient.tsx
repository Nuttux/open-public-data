"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import Navbar from "@/components/fusion/Navbar";
import Footer from "@/components/fusion/Footer";
import ChartSource from "@/components/fusion/ChartSource";
import RelatedLinks, { type RelatedBlock } from "@/components/fiche/RelatedLinks";
import { V3Fold } from "@/components/fiche/v3";
import { useT, useLocale } from "@/lib/localeContext";
import { fmtDec } from "@/lib/fmt";
import type { BudgetPageData } from "@/lib/fusion-data";
import type { EvolutionData } from "@/lib/commune-evolution";
import type { InvestissementsData } from "@/lib/commune-investissements";
import type { MarchesData } from "@/lib/commune-marches";
import { displayFournisseur } from "@/lib/fournisseur-display";
import type { PeerComparison } from "@/lib/commune-peers";
import type { ChantiersData } from "@/lib/commune-chantiers";
import { displayNomElu, type Maire } from "@/lib/commune-maires";

/**
 * La page ville (bloc 2 de l'architecture multi-villes, 2026-09-09) — l'entrée
 * unique d'une commune nationale, en six écrans dans l'ordre des questions :
 * combien, où ça va, ce que ça construit, la dette, ce qu'elle achète,
 * comparer. Chaque section s'allume si la donnée existe et se tait sinon ;
 * les sources nouvelles sont des sous-lignes des blocs, jamais des blocs.
 * Grammaire des fiches v3 : un chiffre, des phrases, des lignes, des replis.
 */

export type CommuneMeta = {
  slug: string;
  insee: string;
  nom: string;
  dep_name: string;
  reg_name: string;
  pop: number;
};

export type CompareEntry = {
  slug: string;
  nom: string;
  pop: number;
  /** € par habitant par indicateur OFGL (impots_locaux, encours_dette, epargne_brute…). */
  kpis: Record<string, number | null>;
  /** Taux de taxe foncière sur le bâti voté par la commune (REI), en %. */
  taux?: { annee: number; tfb: number | null; mediane: number | null } | null;
};

export type PageVilleProps = {
  commune: CommuneMeta;
  budget: { data: BudgetPageData; availableYears: number[]; year: number };
  evolution: EvolutionData | null;
  invest: InvestissementsData | null;
  marches: MarchesData | null;
  /** Chantiers financés par l'État (Fonds vert), bloc 4. */
  chantiers?: ChantiersData | null;
  /** Le maire et la taille du conseil (RNE), bloc 4. */
  maire?: Maire | null;
  /** Taxe foncière (REI) — section nommée pour les villes ≥ 20 000 hab. */
  taxeFonciere?: {
    annee: number;
    tfb: number | null;
    mediane: number | null;
    epci: string | null;
    hist: Record<string, number>;
    source: string;
    source_url: string;
  } | null;
  /** Lien vers l'explorateur marchés, seulement quand la section déborde. */
  marchesHref?: string;
  peers: PeerComparison | null;
  compare: { me: CompareEntry; other: CompareEntry | null; options: { slug: string; nom: string; pop: number }[]; year: number } | null;
  sources: { dgfip: string; ofgl: string; decp: string };
  related?: RelatedBlock | null;
};

const COMPARE_KEYS = ["impots_locaux", "encours_dette", "epargne_brute"] as const;

function useFmt() {
  const { locale } = useLocale();
  const tag = locale === "en" ? "en-GB" : "fr-FR";
  const nf = (o: Intl.NumberFormatOptions) => new Intl.NumberFormat(tag, o);
  const int = nf({ maximumFractionDigits: 0 });
  const euro = (eur: number, signed = false): string => {
    const abs = Math.abs(eur);
    const sign = signed ? { signDisplay: "exceptZero" as const } : {};
    if (abs >= 1e9) return nf({ maximumFractionDigits: 2, minimumFractionDigits: 2, ...sign }).format(eur / 1e9) + " Md€";
    if (abs >= 1e6) return nf({ maximumFractionDigits: 1, ...sign }).format(eur / 1e6) + " M€";
    if (abs >= 1e3) return nf({ maximumFractionDigits: 0, ...sign }).format(eur / 1e3) + " k€";
    return nf({ maximumFractionDigits: 0, ...sign }).format(eur) + " €";
  };
  /** Montant découpé en (valeur, unité) pour les colonnes. */
  const split = (eur: number): { v: string; u: string } => {
    const abs = Math.abs(eur);
    if (abs >= 1e9) return { v: nf({ maximumFractionDigits: 2 }).format(eur / 1e9), u: "Md€" };
    if (abs >= 1e6) return { v: nf({ maximumFractionDigits: abs >= 1e8 ? 0 : 1 }).format(eur / 1e6), u: "M€" };
    if (abs >= 1e3) return { v: int.format(eur / 1e3), u: "k€" };
    return { v: int.format(eur), u: "€" };
  };
  const signedPct = (x: number) => `${x >= 0 ? "+" : "−"}${fmtDec(Math.abs(x), 1)} %`;
  return { euro, split, int, signedPct, locale };
}

function Amt({ n, size = 14 }: { n: number; size?: number }) {
  const { split } = useFmt();
  const { v, u } = split(n);
  return (
    <span className="fx-v3-amt tnum" style={{ fontSize: size, textAlign: "right" }}>
      {v}
      <span className="u">{u}</span>
    </span>
  );
}

function Bars({ points, year, height = 50 }: { points: { year: number; value: number; type?: "vote" | "execute" }[]; year: number; height?: number }) {
  const { euro } = useFmt();
  const max = Math.max(...points.map((p) => p.value), 1);
  return (
    <div className="bars" aria-hidden="true">
      {points.map((p) => (
        <div key={p.year} className={p.year === year ? "now" : p.type === "vote" ? "vote" : ""} title={`${p.year} · ${euro(p.value)}`}>
          <b style={{ height: Math.max(3, Math.round((p.value / max) * height)) }} />
          <span>{p.year}</span>
        </div>
      ))}
    </div>
  );
}

/**
 * La barre empilée d'une section : sa forme avant ses lignes. Chaque section
 * avait exactement la même silhouette (titre, phrase, deux colonnes, note), si
 * bien que rien n'accrochait l'œil et que tout se ressemblait. Monochrome, du
 * plus gros au plus petit, la queue regroupée sous « autres ».
 */
function StackedBar({ items, total, autres, max = 6 }: { items: { label: string; value: number }[]; total: number; autres: string; max?: number }) {
  const sorted = items.slice().sort((a, b) => b.value - a.value);
  const head = sorted.slice(0, max);
  const tail = sorted.slice(max).reduce((n, x) => n + x.value, 0);
  const rest = Math.max(0, total - head.reduce((n, x) => n + x.value, 0) - tail);
  const segs = [...head, ...(tail + rest > 0 ? [{ label: autres, value: tail + rest }] : [])];
  if (segs.length < 2 || total <= 0) return null;
  const pct = (v: number) => (v / total) * 100;
  return (
    <div className="fx-pv-stackwrap">
      <div className="fx-pv-stack" aria-hidden="true">
        {segs.map((x, i) => (
          <i key={x.label} className={`s${Math.min(i, 6)}`} style={{ width: `${pct(x.value)}%` }} />
        ))}
      </div>
      <div className="fx-pv-stacklegend">
        {segs.map((x, i) => (
          <span key={x.label}>
            <em><i className={`s${Math.min(i, 6)}`} aria-hidden="true" />{x.label}</em>
            <b>{Math.round(pct(x.value))} %</b>
          </span>
        ))}
      </div>
    </div>
  );
}

/**
 * La barre de puces des sections — le seul chemin de la page, sur mobile comme
 * sur desktop. L'ancien sommaire était en `display:none` sous 820 px, ce qui
 * laissait une page de sept écrans sans navigation (le burger, personne ne
 * l'ouvre). Elle se colle sous la barre du haut, défile au doigt, et noircit
 * la section en cours ; la puce active se ramène toujours dans le champ.
 */
function SectionChips({ items, label }: { items: { id: string; label: string }[]; label: string }) {
  const [active, setActive] = useState(items[0]?.id ?? "");
  const barRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const targets = items.map((i) => document.getElementById(i.id)).filter((el): el is HTMLElement => Boolean(el));
    if (!targets.length) return;
    // La section active = la dernière dont le titre est passé sous la barre.
    const pick = () => {
      let current = targets[0].id;
      for (const el of targets) {
        if (el.getBoundingClientRect().top <= 140) current = el.id;
      }
      setActive(current);
    };
    pick();
    window.addEventListener("scroll", pick, { passive: true });
    window.addEventListener("resize", pick);
    return () => {
      window.removeEventListener("scroll", pick);
      window.removeEventListener("resize", pick);
    };
  }, [items]);

  useEffect(() => {
    const bar = barRef.current;
    const chip = bar?.querySelector<HTMLAnchorElement>(`a[href="#${active}"]`);
    if (!bar || !chip) return;
    const cl = chip.offsetLeft;
    const cr = cl + chip.offsetWidth;
    if (cl < bar.scrollLeft + 8) bar.scrollTo({ left: Math.max(0, cl - 16), behavior: "smooth" });
    else if (cr > bar.scrollLeft + bar.clientWidth - 8) bar.scrollTo({ left: cr - bar.clientWidth + 16, behavior: "smooth" });
  }, [active]);

  return (
    <nav className="fx-pv-chips" aria-label={label} ref={barRef}>
      {items.map((s) => (
        <a key={s.id} href={`#${s.id}`} className={s.id === active ? "is-active" : ""} aria-current={s.id === active ? "true" : undefined}>
          {s.label}
        </a>
      ))}
    </nav>
  );
}

function ShareButton({ label, title, done }: { label: string; title: string; done: string }) {
  const [ok, setOk] = useState(false);
  const share = async () => {
    const url = typeof window !== "undefined" ? window.location.href : "";
    try {
      if (typeof navigator !== "undefined" && navigator.share) {
        await navigator.share({ title, url });
      } else if (navigator?.clipboard) {
        await navigator.clipboard.writeText(url);
        setOk(true);
        setTimeout(() => setOk(false), 2000);
      }
    } catch {
      /* annulé par la personne */
    }
  };
  return (
    <button type="button" className="fx-pv-share" onClick={share} aria-live="polite">
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M4 12v7a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-7" />
        <path d="M16 6l-4-4-4 4" />
        <path d="M12 2v13" />
      </svg>
      {ok ? done : label}
    </button>
  );
}

export default function PageVilleClient({ commune, budget, evolution, invest, marches, maire, taxeFonciere, marchesHref, peers, compare, sources, related }: PageVilleProps) {
  const t = useT();
  const { euro, int, signedPct, locale } = useFmt();
  const en = locale === "en";
  const fill = (key: string, vars: Record<string, string | number>) => {
    let s = t(key);
    for (const [k, v] of Object.entries(vars)) s = s.split(`{${k}}`).join(String(v));
    return s;
  };
  const router = useRouter();

  const { data, availableYears, year } = budget;
  // « dépensés en 2024, comptes de la commune » → la légende est coupée autour
  // de l'année, qui devient un menu. Les six pastilles d'années occupaient le
  // premier écran avant même le chiffre, alors que presque personne n'en change.
  const [capBefore, capAfter] = (() => {
    const full = t("fx.natbud.v3.cap_exec");
    const i = full.indexOf("{year}");
    return i < 0 ? [full + " ", ""] : [full.slice(0, i), full.slice(i + 6)];
  })();
  const perHab = commune.pop > 0 ? data.depenses / commune.pop : 0;

  /* ── 1. Le chiffre : tendance, position ── */
  const years = data.yearsSummary;
  const prevYear = years.filter((y) => y.year < year).sort((a, b) => b.year - a.year)[0];
  const deltaYear = prevYear && prevYear.depenses > 0 ? ((data.depenses - prevYear.depenses) / prevYear.depenses) * 100 : null;
  const first = years[0];
  const sinceFirst = first && first.year !== year && first.year !== prevYear?.year && first.depenses > 0 ? ((data.depenses - first.depenses) / first.depenses) * 100 : null;

  // La position face aux villes de sa taille, en mots : seulement les trois
  // indicateurs OFGL sans jumeau DGFiP sur la page (impôts locaux, dette,
  // épargne), pour ne jamais afficher deux « par habitant » qui se contredisent.
  const position = useMemo(() => {
    if (!peers) return null;
    const above: string[] = [];
    const below: string[] = [];
    for (const k of COMPARE_KEYS) {
      const r = peers.rows.find((x) => x.key === k);
      if (!r || r.deltaPct == null) continue;
      const lab = t(`fx.pv.kpi.${k}`);
      if (r.deltaPct > 15) above.push(lab);
      else if (r.deltaPct < -15) below.push(lab);
    }
    const list = (xs: string[]) => (xs.length <= 1 ? xs.join("") : `${xs.slice(0, -1).join(", ")} ${t("fx.pv.and")} ${xs[xs.length - 1]}`);
    if (above.length && below.length) return fill("fx.pv.pos_mixed", { above: list(above), below: list(below) });
    if (above.length) return fill("fx.pv.pos_above", { list: list(above) });
    if (below.length) return fill("fx.pv.pos_below", { list: list(below) });
    return t("fx.pv.pos_avg");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [peers, locale]);

  /* ── 2. Dépenses et recettes : lignes, courbe, détail des comptes ── */
  const evoYear = evolution?.series.find((p) => p.year === year) ?? null;
  const strip = (l: string) => l.replace(/\s\((D|R)\)$/, "");
  const [openRow, setOpenRow] = useState<string | null>(null);
  const comptesFor = (side: "expenses" | "revenue", label: string) => data.comptes?.[side]?.[label] ?? [];
  // Sous-lignes « dont … » : les agrégats OFGL de l'année, rangés sous la
  // ligne DGFiP qui les contient. Une phrase, jamais un bloc.
  const dont = (side: "expenses" | "revenue", label: string): string | null => {
    if (!evoYear) return null;
    const l = strip(label);
    const parts: string[] = [];
    if (side === "revenue" && /^Dotations et subventions/.test(l)) {
      if (evoYear.dgf && evoYear.dgf > 0) parts.push(fill("fx.pv.dont_dgf", { n: euro(evoYear.dgf) }));
      if (evoYear.concours_etat && evoYear.concours_etat > 0) parts.push(fill("fx.pv.dont_concours", { n: euro(evoYear.concours_etat) }));
    }
    // Négatif = la commune reverse à l'intercommunalité : ce n'est plus une
    // recette, la sous-ligne se tait.
    if (side === "revenue" && /^Impôts et taxes/.test(l) && evoYear.fiscalite_reversee && evoYear.fiscalite_reversee > 0) {
      parts.push(fill("fx.pv.dont_reverse", { n: euro(evoYear.fiscalite_reversee) }));
    }
    if (side === "expenses" && /^Charges de gestion courante/.test(l) && evoYear.subventions_versees && evoYear.subventions_versees > 0) {
      parts.push(fill("fx.pv.dont_subv", { n: euro(evoYear.subventions_versees) }));
    }
    return parts.length ? parts.join(" · ") : null;
  };
  const Spark = ({ label }: { label: string }) => {
    const pts = (data.series[label] ?? []).filter((p) => p.year <= year);
    if (pts.length < 2) return <span />;
    const m = Math.max(...pts.map((p) => p.value), 1);
    return (
      <span className="fx-bud-spark" aria-hidden="true" title={pts.map((p) => `${p.year} : ${euro(p.value)}`).join(" · ")}>
        {pts.map((p) => <i key={p.year} className={p.year === year ? "now" : ""} style={{ height: Math.max(2, Math.round((p.value / m) * 18)) }} />)}
      </span>
    );
  };
  const Row = ({ side, label, value, total }: { side: "expenses" | "revenue"; label: string; value: number; total: number }) => {
    const items = comptesFor(side, label);
    const key = `${side}:${label}`;
    const open = openRow === key;
    const sub = dont(side, label);
    const canOpen = items.length > 0;
    return (
      <>
        <button
          type="button"
          className={`fx-bud-row fx-pv-row${canOpen ? "" : " fx-bud-row--static"}${open ? " open" : ""}`}
          onClick={() => canOpen && setOpenRow(open ? null : key)}
          aria-expanded={canOpen ? open : undefined}
          disabled={!canOpen}
        >
          <span className="n">
            {strip(label)}
            {canOpen ? <span className="chev" aria-hidden="true">{open ? "▾" : "▸"}</span> : null}
            {sub ? <span className="dont">{sub}</span> : null}
          </span>
          <Spark label={label} />
          <Amt n={value} />
          <span className="p tnum">{Math.round((value / total) * 100)} %</span>
        </button>
        {open ? (
          <div className="fx-pv-drill">
            {items.map((c) => (
              <div key={c.compte} className={`line${c.compte === "autres" ? " autres" : ""}`}>
                <span>{en ? c.label_en : c.label}</span>
                <Amt n={c.value} size={13} />
              </div>
            ))}
            <p className="fx-pv-drillnote">{t("fx.pv.drill_note")}</p>
          </div>
        ) : null}
      </>
    );
  };
  const dep = data.topDepenses.filter((x) => x.value / data.depenses >= 0.005);
  const rec = data.recettesBreakdown.filter((x) => x.value / data.recettes >= 0.005);
  const hasSeries = Object.values(data.series).some((s) => s.length > 1);
  const spanYears = years.filter((y) => y.year <= year).map((y) => y.year);
  const span = spanYears.length > 1 ? `${spanYears[0]}–${spanYears[spanYears.length - 1]}` : String(year);

  /* ── 3. Ce que la commune construit ── */
  const invYear = invest && invest.year === year ? invest : invest;
  const invPrev = invYear?.by_year?.filter((y) => y.year < invYear.year).sort((a, b) => b.year - a.year)[0];
  const invDelta = invYear && invPrev && invPrev.depenses > 0 ? ((invYear.total.depenses - invPrev.depenses) / invPrev.depenses) * 100 : null;
  const equipement = invYear?.depenses_par_groupe.find((g) => /équipement/i.test(g.groupe))?.montant ?? null;

  /* ── 4. La dette ── */
  const evoLast = evolution?.series[evolution.series.length - 1] ?? null;
  const evoFirst = evolution?.series[0] ?? null;
  const detteDelta = evoLast?.dette_hab != null && evoFirst?.dette_hab && evoFirst.year !== evoLast.year ? ((evoLast.dette_hab - evoFirst.dette_hab) / evoFirst.dette_hab) * 100 : null;
  const detteMedian = peers?.rows.find((r) => r.key === "encours_dette")?.median ?? null;
  const capacite = evoLast?.capacite_desendettement ?? null;
  const capaciteWords = (n: number) => {
    const r = Math.round(n * 2) / 2;
    if (r < 1) return t("fx.pv.cap_under1");
    return fill("fx.pv.cap_years", { n: r.toLocaleString(en ? "en-GB" : "fr-FR", { maximumFractionDigits: 1 }) });
  };

  /* ── 5. Ce que la commune achète ── */
  const ly = marches?.last_year && marches.last_year.year ? marches.last_year : null;
  const mCats = (ly?.by_category ?? marches?.by_category ?? []).slice(0, 5);
  const mTitu = (ly?.top_titulaires ?? marches?.top_titulaires ?? []).slice(0, 5);
  const mYears = (marches?.by_year ?? []).map((y) => y.year);
  const ecartees = marches?.total.annees_ecartees ?? [];

  /* ── 2b. Taxe foncière (villes ≥ 20 000 hab.) ── */
  const tfProduit = useMemo(() => {
    if (!taxeFonciere) return null;
    for (const items of Object.values(data.comptes?.revenue ?? {})) {
      const c = items.find((x) => x.compte === "73111");
      if (c) return c.value;
    }
    return null;
  }, [taxeFonciere, data.comptes]);
  const tfShare = tfProduit && data.recettes > 0 ? (tfProduit / data.recettes) * 100 : null;
  const tfHist = taxeFonciere
    ? Object.entries(taxeFonciere.hist).map(([y, v]) => ({ year: Number(y), value: v })).sort((a, b) => a.year - b.year)
    : [];
  const tfChanged = tfHist.length > 1 && Math.abs(tfHist[0].value - tfHist[tfHist.length - 1].value) > 0.001;
  /** Un taux se lit « 44,17 % » ou « 34 % » — jamais « 34,00 % ». */
  const tfRate = (x: number) => x.toLocaleString(en ? "en-GB" : "fr-FR", { maximumFractionDigits: 2 });

  /* ── 6. Comparer ── */
  const [otherSlug, setOtherSlug] = useState(compare?.other?.slug ?? "");
  const other = compare?.other ?? null;

  const H2 = ({ id, children, sub }: { id: string; children: React.ReactNode; sub?: React.ReactNode }) => (
    <>
      <h2 id={id} className="fx-v3-h2 fx-pv-h2">{children}</h2>
      {sub ? <p className="fx-v3-h2sub">{sub}</p> : null}
    </>
  );

  const toc = [
    { id: "depenses", label: t("fx.pv.toc.depenses") },
    ...(taxeFonciere && taxeFonciere.tfb != null ? [{ id: "taxe-fonciere", label: t("fx.pv.toc.taxe") }] : []),
    ...(invYear ? [{ id: "construit", label: t("fx.pv.toc.construit") }] : []),
    ...(evoLast?.dette != null ? [{ id: "dette", label: t("fx.pv.toc.dette") }] : []),
    ...(marches ? [{ id: "achats", label: t("fx.pv.toc.achats") }] : []),
    ...(compare ? [{ id: "comparer", label: t("fx.pv.toc.comparer") }] : []),
  ];

  return (
    <div className="theme-fusion">
      <Navbar />
      <main id="main-content" tabIndex={-1}>
        <div className="fx-wrap fx-v3 fx-bud-v3 fx-pv" style={{ padding: "48px 0" }}>
          <p className="fx-pv-kicker">
            {commune.dep_name} · {commune.reg_name} · {int.format(commune.pop)} {t("fx.natbud.hab")}
          </p>
          <h1 className="fx-pv-title">{fill("fx.pv.title", { nom: commune.nom })}</h1>
          {maire?.nom ? (
            <p className="fx-pv-maire">
              {fill("fx.pv.maire", { nom: `${maire.prenom ?? ""} ${displayNomElu(maire.nom)}`.trim() })}
              {maire.depuis ? ` ${fill("fx.pv.maire_depuis", { date: new Date(maire.depuis).toLocaleDateString(en ? "en-GB" : "fr-FR", { month: "long", year: "numeric" }) })}` : ""}
              {maire.conseillers ? ` · ${fill("fx.pv.conseillers", { n: maire.conseillers })}` : ""}
            </p>
          ) : null}

          {/* 1. Le chiffre */}
          <div className="fx-v3-herogrid">
            <div>
              <div className="fx-v3-hero-num tnum">{euro(data.depenses).replace(/\s?(Md€|M€|k€|€)$/, "")}<span className="u">{euro(data.depenses).match(/(Md€|M€|k€|€)$/)?.[0]}</span></div>
              <div className="fx-v3-hero-cap">
                {availableYears.length > 1 ? (
                  <>
                    {capBefore}
                    <select
                      className="fx-pv-yearsel"
                      aria-label={t("fx.pv.annee_label")}
                      value={year}
                      onChange={(e) => router.push(`/fr/city/${commune.slug}?year=${e.target.value}`, { scroll: false })}
                    >
                      {availableYears.map((y) => <option key={y} value={y}>{y}</option>)}
                    </select>
                    {capAfter}
                  </>
                ) : (
                  fill("fx.natbud.v3.cap_exec", { year })
                )}
              </div>
              {years.length > 1 && (
                <div className="fx-v3-trend fx-pv-trend-mob">
                  <Bars points={years.map((y) => ({ year: y.year, value: y.depenses, type: y.type }))} year={year} />
                  <div className="t">
                    {deltaYear != null && <b>{signedPct(deltaYear)} {fill("fx.bud.v3.vs", { y: prevYear.year })}</b>}
                    {sinceFirst != null && <span> · {signedPct(sinceFirst)} {fill("fx.bud.v3.depuis", { y: first.year })}</span>}
                  </div>
                </div>
              )}
              <div className="fx-v3-hero-meta">
                {perHab > 0 ? `${fill("fx.bud.v3.par_hab", { n: int.format(perHab) })} · ` : ""}
                {fill("fx.bud.v3.recettes_exec", { rec: euro(data.recettes) })}
                {` · ${t("fx.natbud.solde").toLowerCase()} ${euro(data.solde, true)}`}
              </div>
              {position ? <p className="fx-pv-position">{position}</p> : null}
              {commune.pop < 10000 && years.length > 1 ? <p className="fx-pv-petite">{t("fx.pv.petite_commune")}</p> : null}
              <ShareButton label={t("fx.pv.share_num")} title={fill("fx.pv.share_title", { nom: commune.nom, year, n: euro(data.depenses) })} done={t("fx.pv.share_done")} />
            </div>
            {years.length > 1 && (
              <div className="fx-v3-trend fx-pv-trend-desk">
                <div className="t">
                  {deltaYear != null && <b>{signedPct(deltaYear)} {fill("fx.bud.v3.vs", { y: prevYear.year })}</b>}
                  {sinceFirst != null && <span> · {signedPct(sinceFirst)} {fill("fx.bud.v3.depuis", { y: first.year })}</span>}
                </div>
                <Bars points={years.map((y) => ({ year: y.year, value: y.depenses, type: y.type }))} year={year} />
              </div>
            )}
          </div>

          <SectionChips items={toc} label={t("fx.pv.chips_aria")} />

          {/* 2. Dépenses et recettes */}
          <H2 id="depenses" sub={`${t("fx.natbud.v3.h2sub")} ${data.comptes && Object.keys(data.comptes.expenses).length ? t("fx.pv.h2sub_click") : ""}${hasSeries ? ` ${fill("fx.natbud.v3.span", { span })}` : ""}`}>{t("fx.bud.v3.h2")}</H2>
          <StackedBar items={dep.map((x) => ({ label: strip(x.label), value: x.value }))} total={data.depenses} autres={t("fx.pv.autres")} />
          <div className="fx-bud-cols">
            <div className="fx-bud-col">
              <h3><span>{t("fx.bud.v3.col_dep")}</span><span className="tnum">{euro(data.depenses)}</span></h3>
              {dep.map((x) => <Row key={x.label} side="expenses" label={x.label} value={x.value} total={data.depenses} />)}
            </div>
            <div className="fx-bud-col">
              <h3><span>{t("fx.bud.v3.col_rec")}</span><span className="tnum">{euro(data.recettes)}</span></h3>
              {rec.map((x) => <Row key={x.label} side="revenue" label={x.label} value={x.value} total={data.recettes} />)}
            </div>
          </div>
          <p className="fx-v3-foot">{t("fx.pv.fonction_absent")}</p>

          {/* 2b. Taxe foncière */}
          {taxeFonciere && taxeFonciere.tfb != null && (
            <section className="fx-pv-section">
              <H2 id="taxe-fonciere">{fill("fx.pv.tf.h2", { nom: commune.nom })}</H2>
              <p className="fx-v3-lead fx-pv-lead">
                {fill("fx.pv.tf.lead", { nom: commune.nom, year: taxeFonciere.annee, taux: tfRate(taxeFonciere.tfb) })}
                {taxeFonciere.mediane != null
                  ? ` ${fill(
                      taxeFonciere.tfb > taxeFonciere.mediane + 0.01
                        ? "fx.pv.tf.vs_above"
                        : taxeFonciere.tfb < taxeFonciere.mediane - 0.01
                          ? "fx.pv.tf.vs_below"
                          : "fx.pv.tf.vs_eq",
                      { med: tfRate(taxeFonciere.mediane) },
                    )}`
                  : ""}
                {tfChanged
                  ? ` ${fill(tfHist[tfHist.length - 1].value > tfHist[0].value ? "fx.pv.tf.up" : "fx.pv.tf.down", { y: tfHist[0].year })}`
                  : tfHist.length > 1
                    ? ` ${fill("fx.pv.tf.stable", { y: tfHist[0].year })}`
                    : ""}
              </p>
              {taxeFonciere.mediane != null && taxeFonciere.tfb != null ? (
                <div className="fx-pv-tfbars">
                  <div className="row">
                    <span className="lab">{commune.nom}</span>
                    <span className="track"><i className="me" style={{ width: `${(taxeFonciere.tfb / Math.max(taxeFonciere.tfb, taxeFonciere.mediane)) * 100}%` }} /></span>
                    <span className="val tnum">{tfRate(taxeFonciere.tfb)} %</span>
                  </div>
                  <div className="row">
                    <span className="lab">{t("fx.pv.tf.mediane_lab")}</span>
                    <span className="track"><i style={{ width: `${(taxeFonciere.mediane / Math.max(taxeFonciere.tfb, taxeFonciere.mediane)) * 100}%` }} /></span>
                    <span className="val tnum">{tfRate(taxeFonciere.mediane)} %</span>
                  </div>
                </div>
              ) : null}
              {tfProduit != null && (
                <p className="fx-v3-sentence">
                  {fill("fx.pv.tf.produit", { nom: commune.nom, year, n: euro(tfProduit), pct: tfShare != null ? Math.round(tfShare) : "—" })}
                </p>
              )}
              <p className="fx-v3-sentence fx-pv-tf-finance">{t("fx.pv.tf.finance")}</p>
              <p className="fx-v3-foot">{fill("fx.pv.tf.note", { year: taxeFonciere.annee })}</p>
            </section>
          )}

          {/* 3. Ce que la commune construit */}
          {invYear && invYear.total.depenses > 0 && (
            <section className="fx-pv-section">
              <H2 id="construit">{t("fx.pv.construit")}</H2>
              <p className="fx-v3-lead fx-pv-lead">
                {fill("fx.pv.construit_lead", { nom: commune.nom, year: invYear.year, total: euro(invYear.total.depenses), hab: int.format(invYear.total.depenses_eur_hab ?? (commune.pop > 0 ? invYear.total.depenses / commune.pop : 0)) })}
                {equipement ? ` ${fill("fx.pv.construit_equip", { n: euro(equipement) })}` : ""}
                {invDelta != null && invPrev ? ` ${fill("fx.pv.construit_delta", { pct: signedPct(invDelta), y: invPrev.year })}` : ""}
              </p>
              <div className="fx-pv-two">
                <div>
                  <div className="fx-pv-colhead"><span>{t("fx.pv.financement")}</span><span className="tnum">{euro(invYear.total.recettes)}</span></div>
                  {invYear.financement_par_groupe.map((g) => (
                    <div key={g.groupe} className="fx-pv-line"><span>{g.groupe}</span><Amt n={g.montant} /></div>
                  ))}
                </div>
                <div>
                  <div className="fx-pv-colhead"><span>{t("fx.pv.invest_va")}</span><span className="tnum">{euro(invYear.total.depenses)}</span></div>
                  {invYear.depenses_par_groupe.map((g) => (
                    <div key={g.groupe} className="fx-pv-line"><span>{g.groupe}</span><Amt n={g.montant} /></div>
                  ))}
                </div>
              </div>
              <p className="fx-v3-foot">{t("fx.pv.construit_note")}</p>
            </section>
          )}

          {/* 4. La dette */}
          {evoLast && evoLast.dette != null && (
            <section className="fx-pv-section">
              <H2 id="dette">{t("fx.pv.dette")}</H2>
              <div className="fx-pv-dettegrid">
                <p className="fx-v3-lead fx-pv-lead">
                  {fill("fx.pv.dette_lead", { nom: commune.nom, year: evoLast.year, n: euro(evoLast.dette), hab: int.format(evoLast.dette_hab ?? 0) })}
                  {capacite != null && capacite > 0 ? ` ${fill("fx.pv.dette_cap", { years: capaciteWords(capacite) })}` : ""}
                  {detteMedian != null ? ` ${fill("fx.pv.dette_median", { n: int.format(Math.round(detteMedian)) })}` : ""}
                </p>
                {evolution && evolution.series.length > 1 && (
                  <div className="fx-v3-trend">
                    <div className="t">{detteDelta != null && evoFirst ? <b>{signedPct(detteDelta)} {fill("fx.pv.dette_since", { y: evoFirst.year })}</b> : null}</div>
                    <Bars points={evolution.series.filter((p) => p.dette_hab != null).map((p) => ({ year: p.year, value: p.dette_hab as number }))} year={evoLast.year} />
                  </div>
                )}
              </div>
              <p className="fx-v3-foot">{t("fx.pv.dette_note")}</p>
            </section>
          )}

          {/* 5. Ce que la commune achète */}
          {marches && (
            <section className="fx-pv-section">
              <H2 id="achats">{t("fx.pv.achats")}</H2>
              <p className="fx-v3-lead fx-pv-lead">
                {ly
                  ? fill("fx.pv.achats_lead", { nom: commune.nom, year: ly.year as number, nb: int.format(ly.nb_marches), n: euro(ly.montant) })
                  : mYears.length === 1
                    ? fill("fx.pv.achats_lead", { nom: commune.nom, year: mYears[0], nb: int.format(marches.total.nb_marches), n: euro(marches.total.montant) })
                    : fill("fx.pv.achats_lead_cumul", { nom: commune.nom, nb: int.format(marches.total.nb_marches), n: euro(marches.total.montant), y0: mYears[0] ?? "", y1: mYears[mYears.length - 1] ?? "" })}
              </p>
              <StackedBar
                items={mCats.map((c) => ({ label: c.categorie.replace(/ & /g, en ? " and " : " et "), value: c.montant }))}
                total={mCats.reduce((n, c) => n + c.montant, 0)}
                autres={t("fx.pv.autres")}
                max={5}
              />
              <div className="fx-pv-one">
                <div>
                  <div className="fx-pv-colhead">
                    <span>{t("fx.pv.fournisseurs")}</span>
                    <span className={mTitu.some((f) => !f.personne_physique && f.siren) ? "hint" : "tnum"}>
                      {mTitu.some((f) => !f.personne_physique && f.siren) ? t("fx.pv.fournisseur_hint") : mTitu.length >= 5 ? fill("fx.pv.top_n", { n: mTitu.length }) : ""}
                    </span>
                  </div>
                  {mTitu.map((f) => {
                    const nom = f.personne_physique ? t("fx.pv.entrepreneurs") : displayFournisseur(f.nom);
                    const objet = "objet" in f ? (f as { objet?: string }).objet : undefined;
                    const href = !f.personne_physique && f.siren ? `/fr/city/${commune.slug}/fournisseur/${f.siren}` : null;
                    const body = (
                      <>
                        <span>
                          {href ? <span className="fx-pv-nm">{nom}</span> : nom}
                          {objet ? <span className="fx-pv-sub2">{objet}</span> : null}
                        </span>
                        <Amt n={f.montant} />
                      </>
                    );
                    return href
                      ? <Link key={f.nom} href={href} className="fx-pv-line fx-pv-linerow">{body}</Link>
                      : <div key={f.nom} className="fx-pv-line">{body}</div>;
                  })}
                </div>
              </div>
              {marches.top_marches.length > 1 && (
                <V3Fold label={fill("fx.pv.voir_marches", { n: marches.top_marches.length })} text>
                  {marches.top_marches.map((m, i) => (
                    <div key={i} className="fx-pv-line">
                      <span>
                        {m.objet || "—"}
                        <span className="fx-pv-sub2">
                          {m.siren && m.titulaire ? <Link href={`/fr/city/${commune.slug}/fournisseur/${m.siren}`} className="fx-pv-nm">{displayFournisseur(m.titulaire)}</Link> : m.titulaire}
                          {[m.annee, m.nb_lots && m.nb_lots > 1 ? fill("fx.pv.lots", { n: m.nb_lots }) : null].filter(Boolean).map((x) => ` · ${x}`).join("")}
                        </span>
                      </span>
                      <Amt n={m.montant} />
                    </div>
                  ))}
                </V3Fold>
              )}
              {marchesHref ? <p className="fx-v3-sentence"><Link className="fx-pv-link" href={marchesHref}>{fill("fx.pv.tous_marches", { n: int.format(marches.total.nb_marches) })}<i className="fx-pv-arrow" aria-hidden="true" /></Link></p> : null}
              <p className="fx-v3-foot">
                {marches.coverage_note}
                {mYears.length ? ` ${fill("fx.pv.annees_publiees", { years: mYears.join(", ") })}` : ""}
                {ecartees.length ? ` ${fill("fx.pv.annees_ecartees", { years: ecartees.join(", ") })}` : ""}
              </p>
            </section>
          )}

          {/* 6. Comparer */}
          {compare && (
            <section className="fx-pv-section">
              <H2 id="comparer">{t("fx.pv.comparer")}</H2>
              <div className="fx-pv-pick">
                <span>{fill("fx.pv.face_a", { nom: commune.nom })}</span>
                <select
                  aria-label={t("fx.pv.changer")}
                  value={otherSlug}
                  onChange={(e) => {
                    setOtherSlug(e.target.value);
                    if (e.target.value) router.push(`/fr/compare/${commune.slug}/${e.target.value}`);
                  }}
                >
                  {!other ? <option value="">{t("fx.pv.changer")}</option> : null}
                  {compare.options.map((o) => (
                    <option key={o.slug} value={o.slug}>{o.nom} · {int.format(o.pop)} {t("fx.natbud.hab")}</option>
                  ))}
                </select>
              </div>
              {other ? (
                <div className="fx-pv-vs">
                  <div className="legend"><span><i className="a" />{commune.nom}</span><span><i className="b" />{other.nom}</span></div>
                  {COMPARE_KEYS.map((k) => {
                    const a = compare.me.kpis[k];
                    const b = other.kpis[k];
                    const max = Math.max(Math.abs(a ?? 0), Math.abs(b ?? 0), 1);
                    return (
                      <div key={k} className="row">
                        <span className="lab">{t(`fx.cmp2.kpi.${k}`)}</span>
                        <div className="track">
                          <span className="a" style={{ width: `${(Math.abs(a ?? 0) / max) * 100}%` }} />
                          <span className="b" style={{ width: `${(Math.abs(b ?? 0) / max) * 100}%` }} />
                        </div>
                        <span className="val tnum">
                          <b>{a != null ? int.format(Math.round(a)) : "—"} €</b> · {b != null ? int.format(Math.round(b)) : "—"} € {t("fx.pv.par_hab")}
                        </span>
                      </div>
                    );
                  })}
                  {compare.me.taux?.tfb != null && other.taux?.tfb != null ? (
                    <div className="row">
                      <span className="lab">{t("fx.pv.kpi_tfb")}</span>
                      <div className="track">
                        <span className="a" style={{ width: `${(compare.me.taux.tfb / Math.max(compare.me.taux.tfb, other.taux.tfb, 0.01)) * 100}%` }} />
                        <span className="b" style={{ width: `${(other.taux.tfb / Math.max(compare.me.taux.tfb, other.taux.tfb, 0.01)) * 100}%` }} />
                      </div>
                      <span className="val tnum"><b>{compare.me.taux.tfb.toLocaleString(en ? "en-GB" : "fr-FR", { maximumFractionDigits: 2 })} %</b> · {other.taux.tfb.toLocaleString(en ? "en-GB" : "fr-FR", { maximumFractionDigits: 2 })} % {fill("fx.pv.taux_annee", { y: compare.me.taux.annee })}</span>
                    </div>
                  ) : null}
                  <p className="fx-v3-sentence"><Link className="fx-pv-link" href={`/fr/compare/${commune.slug}/${other.slug}`}>{t("fx.pv.comparaison_complete")}<i className="fx-pv-arrow" aria-hidden="true" /></Link></p>
                </div>
              ) : null}
              <p className="fx-v3-foot">{fill("fx.pv.comparer_note", { year: compare.year })}{compare.me.taux ? ` ${t("fx.pv.taux_note")}` : ""}</p>
            </section>
          )}

          <ChartSource
            source={[t("fx.natbud.source"), evolution ? t("fx.natev.source") : null, marches ? t("fx.natmar.source") : null, maire?.nom ? t("fx.pv.src_rne") : null].filter(Boolean).join(" · ") + ` · ${year}`}
            dataHref={sources.dgfip}
            methodAnchor="c-villes"
          />
          <RelatedLinks block={related} />
        </div>
      </main>
      <Footer />
    </div>
  );
}
