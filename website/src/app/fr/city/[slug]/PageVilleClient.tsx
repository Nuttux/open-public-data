"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useCountUp } from "@/lib/use-count-up";
import { useRevealOnScroll } from "@/lib/use-reveal-on-scroll";
import Navbar from "@/components/fusion/Navbar";
import Footer from "@/components/fusion/Footer";
import ChartSource from "@/components/fusion/ChartSource";
import RelatedLinks, { type RelatedBlock } from "@/components/fiche/RelatedLinks";
import { useT, useLocale } from "@/lib/localeContext";
import { aNom, deNom } from "@/lib/nom-commune";
import type { CommuneFonctions, FonctionPart } from "@/lib/commune-fonctions";
import { fmtDec } from "@/lib/fmt";
import type { BudgetPageData } from "@/lib/fusion-data";
import type { EvolutionData } from "@/lib/commune-evolution";
import type { InvestissementsData } from "@/lib/commune-investissements";
import type { MarchesData } from "@/lib/commune-marches";
import { displayFournisseur } from "@/lib/fournisseur-display";
import type { PeerComparison } from "@/lib/commune-peers";
import type { ChantiersData } from "@/lib/commune-chantiers";
import { displayNomElu, type Maire } from "@/lib/commune-maires";
import { NATURE_GROUPS } from "@/lib/budget-natures";

/* Les chapitres de dépense d'une commune, rangés dans les familles de natures
   du site pour en prendre la couleur. Un chapitre inconnu tombe en gris. */
const COULEUR_NATURE: Record<string, string> = Object.fromEntries(NATURE_GROUPS.map((g) => [g.key, g.color]));
function couleurChapitre(label: string): string {
  const l = label.toLowerCase();
  if (l.includes("personnel")) return COULEUR_NATURE.salaires;
  if (l.includes("équipement") || l.includes("equipement") || l.includes("immobilis")) return COULEUR_NATURE.chantiers;
  if (l.includes("gestion courante") || l.includes("subvention")) return COULEUR_NATURE.subventions;
  if (l.includes("achats") || l.includes("charges externes")) return COULEUR_NATURE.achats;
  if (l.includes("emprunt") || l.includes("dette") || l.includes("financi")) return COULEUR_NATURE.dette;
  if (l.includes("impôt") || l.includes("impot") || l.includes("taxe") || l.includes("reversement") || l.includes("atténuation")) return COULEUR_NATURE.reverses;
  return COULEUR_NATURE.autres;
}

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
  fonctions: CommuneFonctions | null;
  fonctionsSource: { label: string; url: string; annee: number };
  /** Les fiches nature de la commune (segment d'URL par chapitre affiché), quand elles existent. */
  natureFiches: Record<string, string>;
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
    if (abs >= 1e3) {
      // 999 500 € arrondi au millier donne « 1000 k€ », qui se lit mal et qu'on
      // n'écrit jamais : au-delà du millier de milliers, on passe en M€.
      if (Math.round(abs / 1e3) >= 1000) return { v: nf({ maximumFractionDigits: 1 }).format(eur / 1e6), u: "M€" };
      return { v: int.format(eur / 1e3), u: "k€" };
    }
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

/**
 * Les barres de tendance. Sans axe ni valeur, elles ne disaient qu'une forme :
 * une barre six fois plus haute qu'une autre ne dit pas si c'est trois cents
 * euros ou trois mille. `ends` écrit la valeur au-dessus de la première et de
 * la dernière barre, rien sur celles du milieu.
 */
function Bars({ points, year, height = 50, ends }: { points: { year: number; value: number; type?: "vote" | "execute" }[]; year: number; height?: number; ends?: (v: number) => string }) {
  const { euro } = useFmt();
  const max = Math.max(...points.map((p) => p.value), 1);
  return (
    <div className={`bars${ends ? " has-ends" : ""}`} aria-hidden="true">
      {points.map((p, i) => (
        <div key={p.year} className={p.year === year ? "now" : p.type === "vote" ? "vote" : ""} title={`${p.year} · ${euro(p.value)}`}>
          {ends && (i === 0 || i === points.length - 1) ? <em>{ends(p.value)}</em> : <em className="ghost" />}
          <b style={{ height: Math.max(3, Math.round((p.value / max) * height)) }} />
          <span>{p.year}</span>
        </div>
      ))}
    </div>
  );
}

/** Le chiffre d'une section : c'est lui le titre, le H2 passe en second. */
/**
 * Un nombre qui compte jusqu'à sa valeur quand il entre à l'écran — la
 * mécanique de « ma contribution » sur le budget national, reprise telle
 * quelle. Le serveur rend la valeur finale ; le compteur ne part qu'au mount
 * côté client, de zéro, en 600 ms. Sans JavaScript, ou en mouvement réduit,
 * la valeur est là d'emblée.
 */
function CountUp({ value, fmt, revealed = true, duration = 600 }: { value: number; fmt: (v: number) => string; revealed?: boolean; duration?: number }) {
  const [started, setStarted] = useState(false);
  const [target, setTarget] = useState(0);
  const animated = useCountUp(target, duration);
  useEffect(() => {
    if (revealed && !started) { setTarget(value); setStarted(true); }
    else if (started) setTarget(value);
  }, [revealed, value, started]);
  return <>{started ? fmt(animated) : fmt(value)}</>;
}

/** Le grand chiffre d'une section. Avec `n` et `fmt`, il compte. */
function SecNum({ v, u, n, fmt, revealed }: { v: string; u: string; n?: number; fmt?: (x: number) => string; revealed?: boolean }) {
  return (
    <div className="fx-pv-secnum tnum">
      {n != null && fmt ? <CountUp value={n} fmt={fmt} revealed={revealed} /> : v}
      <span className="u">{u}</span>
    </div>
  );
}

/**
 * Une section qui glisse en place quand on la voit — 28 px depuis le bas,
 * 500 ms, une seule fois. `.fx-reveal` cache l'élément tant qu'il n'est pas
 * révélé : on ne pose la classe qu'après le mount, pour qu'un lecteur sans
 * JavaScript, un robot ou la vignette voient la page dans son état final.
 * Régression zéro, comme sur le budget national.
 */
function Reveal({ children }: { children: (revealed: boolean) => ReactNode }) {
  const ref = useRef<HTMLElement | null>(null);
  const revealed = useRevealOnScroll(ref, { threshold: 0.15 });
  const [armed, setArmed] = useState(false);
  useEffect(() => { setArmed(true); }, []);
  return <section ref={ref} className={`fx-pv-section${armed ? " fx-reveal" : ""}${revealed ? " is-revealed" : ""}`}>{children(revealed)}</section>;
}

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
        <a key={s.id} href={`#${s.id}`} className={s.id === active ? "is-active" : ""} aria-current={s.id === active ? "location" : undefined}>
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

export default function PageVilleClient({ commune, budget, evolution, invest, marches, maire, taxeFonciere, fonctions, fonctionsSource, natureFiches, marchesHref, peers, compare, sources, related }: PageVilleProps) {
  const { locale: pageLocale } = useLocale();
  const isEn = pageLocale === "en";
  const t = useT();
  const { euro, split, int, signedPct, locale } = useFmt();
  const en = locale === "en";
  const fill = (key: string, vars: Record<string, string | number>) => {
    let s = t(key);
    for (const [k, v] of Object.entries(vars)) s = s.split(`{${k}}`).join(String(v));
    return s;
  };
  const router = useRouter();

  // « +305,7 % » ne se convertit pas de tête : au-delà du double on dit
  // « 4,1 fois plus qu'en 2018 », en dessous de la moitié « 2 fois moins ».
  const deltaWords = (pct: number, y: number | string): string | null => {
    const ratio = 1 + pct / 100;
    const f = (x: number) => x.toLocaleString(en ? "en-GB" : "fr-FR", { maximumFractionDigits: 1 });
    if (pct >= 100) return fill("fx.pv.times_more", { n: f(ratio), y });
    if (pct <= -50 && ratio > 0) return fill("fx.pv.times_less", { n: f(1 / ratio), y });
    return null;
  };

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
  // Une seule fonction ouverte à la fois, et un seul domaine dans celle-ci :
  // la section reste lisible même quand une commune a douze domaines.
  const [openFonction, setOpenFonction] = useState<string | null>(null);
  const [openSous, setOpenSous] = useState<string | null>(null);
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
          id={`nat-${side}-${strip(label).replace(/[^a-z0-9]+/gi, "-").toLowerCase()}`}
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
    ...(fonctions && fonctions.fonctions.length >= 3 ? [{ id: "a-quoi-sert", label: t("fx.pv.toc.fonc") }] : []),
    { id: "depenses", label: t("fx.pv.toc.depenses") },
    ...(taxeFonciere && taxeFonciere.tfb != null ? [{ id: "taxe-fonciere", label: t("fx.pv.toc.taxe") }] : []),
    ...(invYear && invYear.total.depenses > 0 ? [{ id: "construit", label: t("fx.pv.toc.construit") }] : []),
    ...(evoLast?.dette != null ? [{ id: "dette", label: t("fx.pv.toc.dette") }] : []),
    ...(marches ? [{ id: "achats", label: t("fx.pv.toc.achats") }] : []),
    ...(compare ? [{ id: "comparer", label: t("fx.pv.toc.comparer") }] : []),
  ];

  return (
    <div className="theme-fusion">
      <Navbar />
      <main id="main-content" tabIndex={-1}>
        {/* Padding VERTICAL seul : `padding: "48px 0"` écrasait les 40 px
          horizontaux de .fx-wrap, et comme la page est plus étroite que le
          conteneur sur mobile, le texte touchait les deux bords de l'écran. */}
        <div className="fx-wrap fx-v3 fx-bud-v3 fx-pv" style={{ paddingTop: 48, paddingBottom: 48 }}>
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
              {/* Le héros garde sa décimale (« 213,9 M€ ») : `euro`, pas le `split` compact
                  des lignes, qui arrondit à l'unité au-dessus de 100 M€. */}
              <div className="fx-v3-hero-num tnum"><CountUp value={data.depenses} fmt={(x) => euro(x).replace(/\s?(Md€|M€|k€|€)$/, "")} /><span className="u">{euro(data.depenses).match(/(Md€|M€|k€|€)$/)?.[0]}</span></div>
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
                  <Bars points={years.map((y) => ({ year: y.year, value: y.depenses, type: y.type }))} year={year} ends={euro} />
                  <div className="t">
                    {deltaYear != null && <b>{deltaWords(deltaYear, prevYear.year) ?? `${signedPct(deltaYear)} ${fill("fx.bud.v3.vs", { y: prevYear.year })}`}</b>}
                    {sinceFirst != null && <span> · {deltaWords(sinceFirst, first.year) ?? `${signedPct(sinceFirst)} ${fill("fx.bud.v3.depuis", { y: first.year })}`}</span>}
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
                  {deltaYear != null && <b>{deltaWords(deltaYear, prevYear.year) ?? `${signedPct(deltaYear)} ${fill("fx.bud.v3.vs", { y: prevYear.year })}`}</b>}
                  {sinceFirst != null && <span> · {deltaWords(sinceFirst, first.year) ?? `${signedPct(sinceFirst)} ${fill("fx.bud.v3.depuis", { y: first.year })}`}</span>}
                </div>
                <Bars points={years.map((y) => ({ year: y.year, value: y.depenses, type: y.type }))} year={year} ends={euro} />
              </div>
            )}
          </div>

          <SectionChips items={toc} label={t("fx.pv.chips_aria")} />

          {/* 2a. À quoi sert l'argent — ventilation par fonction (DGFiP).
              Liste ouverte, même grammaire que « par nature » juste au-dessus :
              un libellé, une barre, un montant, une part. Les parts se calculent
              sur le ventilé, pas sur le total : la rubrique 01 (dette, fiscalité,
              opérations générales) n'appartient à aucune politique et fait sa
              propre ligne, en bas, sans pourcentage. */}
          {fonctions && fonctions.fonctions.length >= 3 && (() => {
            const parts = fonctions.fonctions;
            const nvd = fonctions.non_ventile_detail;
            const revd = fonctions.reversement_detail;
            const cg = fonctions.comparaison_globale;
            const maxMontant = Math.max(...parts.map((f) => f.montant), fonctions.non_ventile, fonctions.reversement, 1);
            const admin = parts.find((f) => f.cle === "f0_services_generaux") ?? null;
            // Une barre ne représente qu'une part positive. Les rares fonctions
            // nettes négatives (annulations d'exercices antérieurs supérieures
            // aux dépenses de l'année) n'en reçoivent pas.
            const barWidth = (n: number) => (n <= 0 ? null : `${Math.max(1.5, (n / maxMontant) * 100)}%`);
            const lbl = (x: { libelle: string; libelle_en: string }) => (isEn ? x.libelle_en : x.libelle);

            /** Le détail d'une ligne : ses natures, ou ses domaines et ses natures. */
            const Detail = ({ f }: { f: FonctionPart | NonNullable<typeof nvd> }) => {
              const sous = "sous_fonctions" in f ? f.sous_fonctions : undefined;
              return (
                <div className="fx-pv-fonc-detail">
                  {sous && sous.length ? (
                    <div className="col">
                      <h4>{t("fx.pv.fonc.pourquoi")}</h4>
                      {sous.map((sf) => {
                        const key = `${"cle" in f ? f.cle : "nv"}:${sf.code}`;
                        const open = openSous === key;
                        const peutOuvrir = Boolean(sf.natures && sf.natures.length);
                        return (
                          <div key={sf.code}>
                            <button
                              type="button"
                              className={`line${peutOuvrir ? " clic" : ""}${sf.autres ? " autres" : ""}${open ? " open" : ""}`}
                              onClick={() => peutOuvrir && setOpenSous(open ? null : key)}
                              aria-expanded={peutOuvrir ? open : undefined}
                              disabled={!peutOuvrir}
                            >
                              <span>{lbl(sf)}{peutOuvrir ? <span className="chev" aria-hidden="true">{open ? "▾" : "▸"}</span> : null}</span>
                              <Amt n={sf.montant} size={13} />
                            </button>
                            {open && sf.natures ? (
                              <div className="sub">
                                {sf.natures.map((n) => (
                                  <div key={n.code} className={`line${n.autres ? " autres" : ""}`}>
                                    <span>{lbl(n)}</span>
                                    <Amt n={n.montant} size={12} />
                                  </div>
                                ))}
                              </div>
                            ) : null}
                          </div>
                        );
                      })}
                    </div>
                  ) : null}
                  <div className="col">
                    <h4>{t("fx.pv.fonc.surquoi")}</h4>
                    {f.natures.map((n) => (
                      <div key={n.code} className={`line${n.autres ? " autres" : ""}`}>
                        <span>{lbl(n)}</span>
                        <Amt n={n.montant} size={13} />
                      </div>
                    ))}
                  </div>
                </div>
              );
            };

            return (
              <section className="fx-pv-fonc">
                <H2 id="a-quoi-sert" sub={fill("fx.pv.fonc.h2sub", { year: fonctionsSource.annee })}>{fill("fx.pv.fonc.h2", { denom: isEn ? commune.nom : deNom(commune.nom) })}</H2>
                {cg && cg.ecart_pct != null && fonctions.strate ? (
                  /* Le NIVEAU se dit une fois. Sans cette phrase, le lecteur
                     attribuerait aux choix de la commune ce qui n'est que son
                     niveau de dépense global. */
                  <p className="fx-pv-fonc-niveau">
                    {fill("fx.pv.fonc.niveau", { nom: commune.nom, n: int.format(Math.round(cg.eur_hab)) })}{" "}
                    <b className={cg.ecart_pct >= 0 ? "plus" : "moins"}>{cg.ecart_pct >= 0 ? "+" : "−"}{Math.abs(Math.round(cg.ecart_pct))}&nbsp;%</b>{" "}
                    {fill("fx.pv.fonc.niveau_suite", { sens: t(cg.ecart_pct >= 0 ? "fx.fonc.plus_que" : "fx.fonc.moins_que"), strate: isEn ? fonctions.strate.libelle_en : fonctions.strate.libelle, n: cg.n_communes })}
                  </p>
                ) : null}
                <h3 className="fx-pv-fonc-h3">
                  <span>{t("fx.pv.fonc.col")}</span>
                  <span className="fx-pv-fonc-h3-bande">{cg ? t("fx.pv.fonc.col_bande") : null}</span>
                  <span className="tnum">{euro(fonctions.total_ventile)}</span>
                </h3>
                <ul className="fx-pv-fonc-list">
                  {parts.map((f: FonctionPart) => {
                    const open = openFonction === f.cle;
                    const w = barWidth(f.montant);
                    return (
                      <li key={f.cle}>
                        {/* La ligne MÈNE à la fiche de la politique publique — une
                            vraie adresse, partageable et indexable, qui s'ouvre en
                            drawer depuis ici. Le chevron, lui, déplie le détail sur
                            place pour qui veut juste jeter un œil. */}
                        <div className={`fx-bud-row fx-pv-fonc-row${open ? " open" : ""}`}>
                          <Link href={`/fr/city/${commune.slug}/fonction/${f.slug}`} className="n" prefetch={false}>
                            {lbl(f)}
                          </Link>
                          {f.comparaison ? (
                            /* La PRIORITÉ : la part du budget face à la part médiane des
                               communes de même taille. La médiane est au centre ; le
                               segment part à droite (ocre) si la commune y met plus que
                               ses pairs, à gauche (marine) si moins. C'est la lecture
                               qui ne dépend pas de la richesse de la commune — en euros,
                               une ville dépensière est « au-dessus » partout. */
                            <span className="bande" aria-hidden="true" title={fill("fx.pv.fonc.bande_title", { part: f.comparaison.part, med: f.comparaison.part_mediane })}>
                              <i className="mid" />
                              <i className={`seg ${f.comparaison.ecart_pt >= 0 ? "plus" : "moins"}`} style={f.comparaison.ecart_pt >= 0
                                ? { left: "50%", width: `${Math.min(50, Math.abs(f.comparaison.ecart_pt) * 5)}%` }
                                : { right: "50%", width: `${Math.min(50, Math.abs(f.comparaison.ecart_pt) * 5)}%` }} />
                            </span>
                          ) : (
                            <span className="bar" aria-hidden="true">{w ? <i style={{ width: w }} /> : null}</span>
                          )}
                          <Amt n={f.montant} />
                          <span className="p tnum">
                            {f.share != null && f.share > 0 ? `${Math.round(f.share * 100)}\u00a0%` : ""}
                            {f.comparaison ? <span className="med">{fill("fx.pv.fonc.med_court", { n: Math.round(f.comparaison.part_mediane) })}</span> : null}
                          </span>
                          <button
                            type="button"
                            className="fx-pv-fonc-chev"
                            onClick={() => setOpenFonction(open ? null : f.cle)}
                            aria-expanded={open}
                            aria-label={fill(open ? "fx.pv.fonc.replier" : "fx.pv.fonc.deplier", { lib: lbl(f) })}
                          >
                            <span aria-hidden="true">{open ? "▾" : "▸"}</span>
                          </button>
                        </div>
                        {open ? <Detail f={f} /> : null}
                      </li>
                    );
                  })}
                  {revd ? (() => {
                    const open = openFonction === "rev";
                    const w = barWidth(revd.montant);
                    return (
                      <li>
                        <button
                          type="button"
                          className={`fx-bud-row fx-pv-fonc-row fx-pv-fonc-nv${open ? " open" : ""}`}
                          onClick={() => setOpenFonction(open ? null : "rev")}
                          aria-expanded={open}
                        >
                          <span className="n">
                            {lbl(revd)}<span className="chev" aria-hidden="true">{open ? "▾" : "▸"}</span>
                            <span className="dont">{t("fx.pv.fonc.rev_dont")}</span>
                          </span>
                          <span className="bar" aria-hidden="true">{w ? <i style={{ width: w }} /> : null}</span>
                          <Amt n={revd.montant} />
                          <span className="p tnum" />
                          <span />
                        </button>
                        {open ? <Detail f={revd} /> : null}
                      </li>
                    );
                  })() : null}
                  {nvd ? (() => {
                    const open = openFonction === "nv";
                    const w = barWidth(nvd.montant);
                    return (
                      <li>
                        <button
                          type="button"
                          className={`fx-bud-row fx-pv-fonc-row fx-pv-fonc-nv fx-pv-fonc-nvbtn${open ? " open" : ""}`}
                          onClick={() => setOpenFonction(open ? null : "nv")}
                          aria-expanded={open}
                        >
                          <span className="n">
                            {t("fx.pv.fonc.nv")}<span className="chev" aria-hidden="true">{open ? "▾" : "▸"}</span>
                            <span className="dont">{t("fx.pv.fonc.nv_dont")}</span>
                          </span>
                          <span className="bar" aria-hidden="true">{w ? <i style={{ width: w }} /> : null}</span>
                          <Amt n={nvd.montant} />
                          <span className="p tnum" />
                          <span />
                        </button>
                        {open ? <Detail f={nvd} /> : null}
                      </li>
                    );
                  })() : null}
                </ul>
                {admin ? <p className="fx-v3-foot">{t("fx.pv.fonc.admin_note")}</p> : null}
                <p className="fx-v3-foot">{t("fx.pv.fonc.note")}</p>
              </section>
            );
          })()}

          {/* 2. Dépenses et recettes */}
          <H2 id="depenses" sub={`${t("fx.natbud.v3.h2sub")} ${data.comptes && Object.keys(data.comptes.expenses).length ? t("fx.pv.h2sub_click") : ""}${hasSeries ? ` ${fill("fx.natbud.v3.span", { span })}` : ""}`}>{t("fx.bud.v3.h2")}</H2>
          {dep.length > 1 ? (
            <div className="fx-bud-forme fx-pv-forme">
              <div className="stack">
                {dep.map((x) => {
                  const pct = Math.round((x.value / data.depenses) * 100);
                  const id = `nat-expenses-${strip(x.label).replace(/[^a-z0-9]+/gi, "-").toLowerCase()}`;
                  const key = `expenses:${x.label}`;
                  const fiche = natureFiches[strip(x.label)];
                  const style = { width: `${(x.value / data.depenses) * 100}%`, background: couleurChapitre(x.label) };
                  return fiche ? (
                    <Link key={x.label} href={`/fr/city/${commune.slug}/nature/${fiche}`} scroll={false} style={style} title={`${strip(x.label)} · ${pct} %`} aria-label={`${strip(x.label)} · ${pct} %`} />
                  ) : (
                    <button
                      key={x.label}
                      type="button"
                      style={style}
                      title={`${strip(x.label)} · ${pct} %`}
                      aria-label={`${strip(x.label)} · ${pct} %`}
                      onClick={() => {
                        setOpenRow(openRow === key ? null : key);
                        document.getElementById(id)?.scrollIntoView({ block: "center", behavior: "smooth" });
                      }}
                    />
                  );
                })}
              </div>
              <div className="legend">
                {dep.map((x) => {
                  const fiche = natureFiches[strip(x.label)];
                  const inner = <><i style={{ background: couleurChapitre(x.label) }} /><b>{Math.round((x.value / data.depenses) * 100)} %</b> {strip(x.label)}</>;
                  return fiche
                    ? <Link key={x.label} href={`/fr/city/${commune.slug}/nature/${fiche}`} scroll={false}>{inner}</Link>
                    : <span key={x.label}>{inner}</span>;
                })}
              </div>
            </div>
          ) : null}
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
          {/* Sur desktop, les sections repliées se rangent deux par deux au lieu
              de s'étaler sur une colonne vide à droite. */}
          <div className="fx-pv-grid">
          {/* Chaque section est une preview — le chiffre, deux lignes — et un
              lien vers sa page. Plus de repli : personne ne le cliquait, et le
              contenu qu'il cachait a déjà sa propre adresse. */}

          {/* 2b. Taxe foncière — pas de page dédiée : le produit encaissé reste en ligne. */}
          {taxeFonciere && taxeFonciere.tfb != null && (
            <Reveal>{(revealed) => (<>
              <H2 id="taxe-fonciere">{fill("fx.pv.tf.h2", { nom: commune.nom, anom: aNom(commune.nom) })}</H2>
              <SecNum v={tfRate(taxeFonciere.tfb ?? 0)} u="%" n={taxeFonciere.tfb ?? 0} fmt={tfRate} revealed={revealed} />
              <p className="fx-pv-l1">
                {fill("fx.pv.tf.l1", { year: taxeFonciere.annee })}
                {tfChanged
                  ? ` · ${fill(tfHist[tfHist.length - 1].value > tfHist[0].value ? "fx.pv.tf.up_short" : "fx.pv.tf.down_short", { y: tfHist[0].year })}`
                  : tfHist.length > 1 ? ` · ${fill("fx.pv.tf.stable_short", { y: tfHist[0].year })}` : ""}
              </p>
              {taxeFonciere.mediane != null ? <p className="fx-pv-l2">{fill("fx.pv.tf.l2", { med: tfRate(taxeFonciere.mediane) })}</p> : null}
              {tfProduit != null ? <p className="fx-pv-l2">{fill("fx.pv.tf.produit", { nom: commune.nom, year, n: euro(tfProduit), pct: tfShare != null ? Math.round(tfShare) : "—" })}</p> : null}
            </>)}</Reveal>
          )}

          {/* 3. Ce que la commune construit → la page investissements */}
          {invYear && invYear.total.depenses > 0 && (
            <Reveal>{(revealed) => (<>
              <H2 id="construit">{t("fx.pv.construit")}</H2>
              <SecNum {...split(invYear.total.depenses)} n={invYear.total.depenses} fmt={(x) => split(x).v} revealed={revealed} />
              <p className="fx-pv-l1">{fill("fx.pv.construit_l1", { year: invYear.year, hab: int.format(invYear.total.depenses_eur_hab ?? (commune.pop > 0 ? invYear.total.depenses / commune.pop : 0)) })}</p>
              {(equipement || (invDelta != null && invPrev)) ? (
                <p className="fx-pv-l2">
                  {equipement ? fill("fx.pv.construit_equip", { n: euro(equipement) }) : ""}
                  {invDelta != null && invPrev ? ` ${fill("fx.pv.construit_delta", { pct: signedPct(invDelta), y: invPrev.year })}` : ""}
                </p>
              ) : null}
              <p className="fx-pv-more"><Link href={`/fr/city/${commune.slug}/investissements`} className="fx-pv-link">{t("fx.pv.construit_fold")}<i className="fx-pv-arrow" aria-hidden="true" /></Link></p>
            </>)}</Reveal>
          )}

          {/* 4. La dette → la page évolution */}
          {evoLast && evoLast.dette != null && (
            <Reveal>{(revealed) => (<>
              <H2 id="dette">{t("fx.pv.dette")}</H2>
              <SecNum v={int.format(evoLast.dette_hab ?? 0)} u="€" n={evoLast.dette_hab ?? 0} fmt={(x) => int.format(Math.round(x))} revealed={revealed} />
              <p className="fx-pv-l1">{fill("fx.pv.dette_l1", { year: evoLast.year, n: euro(evoLast.dette ?? 0) })}</p>
              {(detteMedian != null || (detteDelta != null && evoFirst)) ? (
                <p className="fx-pv-l2">
                  {detteMedian != null ? fill("fx.pv.dette_median_short", { n: int.format(Math.round(detteMedian)) }) : ""}
                  {detteDelta != null && evoFirst ? `${detteMedian != null ? " · " : ""}${deltaWords(detteDelta, evoFirst.year) ?? `${signedPct(detteDelta)} ${fill("fx.pv.dette_since", { y: evoFirst.year })}`}` : ""}
                </p>
              ) : null}
              {capacite != null && capacite > 0 ? <p className="fx-pv-l2">{fill("fx.pv.dette_cap", { years: capaciteWords(capacite) })}</p> : null}
              {evolution && evolution.series.length > 1 ? <p className="fx-pv-more"><Link href={`/fr/city/${commune.slug}/evolution`} className="fx-pv-link">{t("fx.pv.dette_fold")}<i className="fx-pv-arrow" aria-hidden="true" /></Link></p> : null}
            </>)}</Reveal>
          )}

          {/* 5. Ce que la commune achète — les cinq plus gros marchés en ligne,
              l'explorateur quand il existe (au-delà de 50 marchés, la page
              /marches renvoie ici en dessous). */}
          {marches && (
            <Reveal>{(revealed) => (<>
              <H2 id="achats">{t("fx.pv.achats")}</H2>
              <SecNum {...split(ly ? ly.montant : marches.total.montant)} n={ly ? ly.montant : marches.total.montant} fmt={(x) => split(x).v} revealed={revealed} />
              <p className="fx-pv-l1">
                {ly
                  ? fill("fx.pv.achats_l1", { year: ly.year as number, nb: int.format(ly.nb_marches) })
                  : mYears.length === 1
                    ? fill("fx.pv.achats_l1", { year: mYears[0], nb: int.format(marches.total.nb_marches) })
                    : fill("fx.pv.achats_l1_cumul", { nb: int.format(marches.total.nb_marches), y0: mYears[0] ?? "", y1: mYears[mYears.length - 1] ?? "" })}
              </p>
              {mTitu[0] ? (() => {
                const f0 = mTitu[0];
                const nom0 = f0.personne_physique ? t("fx.pv.entrepreneurs") : displayFournisseur(f0.nom);
                const objet0 = "objet" in f0 ? (f0 as { objet?: string }).objet : undefined;
                const href0 = !f0.personne_physique && f0.siren ? `/fr/city/${commune.slug}/fournisseur/${f0.siren}` : null;
                return (
                  <p className="fx-pv-l2">
                    {t("fx.pv.achats_l2")}
                    {href0 ? <Link href={href0} className="fx-pv-nm">{nom0}</Link> : nom0}
                    {`, ${euro(f0.montant)}`}
                    {objet0 ? `, ${objet0.charAt(0).toLowerCase()}${objet0.slice(1)}` : ""}
                  </p>
                );
              })() : null}
              {marches.top_marches.length > 1 && (
                <div className="fx-pv-top5">
                  <div className="fx-pv-colhead"><span>{fill("fx.pv.plus_gros", { n: Math.min(5, marches.top_marches.length) })}</span><span /></div>
                  {marches.top_marches.slice(0, 5).map((m, i) => (
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
                </div>
              )}
              {marchesHref ? <p className="fx-pv-more"><Link className="fx-pv-link" href={marchesHref}>{fill("fx.pv.tous_marches", { n: int.format(marches.total.nb_marches) })}<i className="fx-pv-arrow" aria-hidden="true" /></Link></p> : null}
              <p className="fx-v3-foot">
                {marches.coverage_note}
                {mYears.length ? ` ${fill("fx.pv.annees_publiees", { years: mYears.join(", ") })}` : ""}
                {ecartees.length ? ` ${fill("fx.pv.annees_ecartees", { years: ecartees.join(", ") })}` : ""}
              </p>
            </>)}</Reveal>
          )}
          </div>

          {/* 6. Comparer — hors de la grille, en pleine largeur, visible d'emblée
              avec une voisine choisie par défaut : c'est le mécanisme le plus
              engageant de la page, un <select> vide ne donnait envie à personne. */}
          {compare && (
            <Reveal>{() => (<>
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
                  <p className="fx-pv-more"><Link className="fx-pv-link" href={`/fr/compare/${commune.slug}/${other.slug}`}>{t("fx.pv.comparaison_complete")}<i className="fx-pv-arrow" aria-hidden="true" /></Link></p>
                  <p className="fx-v3-foot">{fill("fx.pv.comparer_note", { year: compare.year })}{compare.me.taux ? ` ${t("fx.pv.taux_note")}` : ""}</p>
                </div>
              ) : null}
            </>)}</Reveal>
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
