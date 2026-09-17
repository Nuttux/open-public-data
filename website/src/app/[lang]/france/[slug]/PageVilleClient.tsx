"use client";

import Link from "@/components/LocalizedLink";
import { useRouter } from "@/lib/navigation";
import { Fragment, useEffect, useMemo, useRef, useState, useTransition, type ReactNode } from "react";
import { useCountUp } from "@/lib/use-count-up";
import { useTrack } from "@/lib/analyticsContext";
import { useRevealOnScroll } from "@/lib/use-reveal-on-scroll";
import Navbar from "@/components/fusion/Navbar";
import Footer from "@/components/fusion/Footer";
import ChartSource from "@/components/fusion/ChartSource";
import RelatedLinks, { type RelatedBlock } from "@/components/fiche/RelatedLinks";
import { NextDoor } from "@/components/fiche/Doors";
import { V3Hint } from "@/components/fiche/v3";
import { useT, useLocale, useTRaw } from "@/lib/localeContext";
import { deNom, nomDistinct } from "@/lib/nom-commune";
import type { CommuneFonctions, FonctionLigne, FonctionPart } from "@/lib/commune-fonctions";
import { makeFmt } from "@/lib/fmt";
import type { BudgetPageData } from "@/lib/fusion-data";
import type { EvolutionData } from "@/lib/commune-evolution";
import type { InvestissementsData } from "@/lib/commune-investissements";
import type { MarchesData } from "@/lib/commune-marches";
import { displayFournisseur } from "@/lib/fournisseur-display";
import CommunePicker from "@/components/fusion/CommunePicker";
import type { PeerComparison } from "@/lib/commune-peers";
import type { ChantiersData } from "@/lib/commune-chantiers";
import { displayNomElu, maireDepuisLabel, maireSourceLabel, type Maire, type MaireHistory } from "@/lib/commune-maires";

/* Les chapitres de dépense d'une commune, rangés dans les familles de natures
   du site pour en prendre la couleur. Un chapitre inconnu tombe en gris. */

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
  /** Pour écrire « Saint-Denis (Seine-Saint-Denis) » quand le nom est partagé. */
  dep_name: string;
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
  /** `rne_hist` : bornes d'années des versions archivées du répertoire, pour citer d'où vient « depuis 2014 au moins ». */
  sources: { dgfip: string; ofgl: string; decp: string; rne_hist?: MaireHistory | null };
  fonctions: CommuneFonctions | null;
  fonctionsSource: { label: string; url: string; annee: number };
  /** Les fiches nature de la commune (segment d'URL par chapitre affiché), quand elles existent. */
  natureFiches: Record<string, string>;
  related?: RelatedBlock | null;
};

// The comparison's five lines (2026-09-18, Daniel : « on devrait comparer quelles
// métriques ? ») : what the commune spends for me, what I pay (and the rate),
// what I owe, how the town hall runs. Per resident, except the staff share.
// Investment per resident would be the fifth ; the national index has no such
// column yet.
const CMP_ROWS = [
  { key: "depenses_totales", kind: "hab", labelKey: "fx.cmp2.kpi.depenses_totales" },
  { key: "impots_locaux", kind: "hab", labelKey: "fx.cmp2.kpi.impots_locaux" },
  { key: "encours_dette", kind: "hab", labelKey: "fx.cmp2.kpi.encours_dette" },
  { key: "frais_personnel", kind: "share", labelKey: "fx.pv.kpi.share_personnel" },
] as const;
type CmpRow = (typeof CMP_ROWS)[number];

function useFmt() {
  const { locale } = useLocale();
  const tag = locale === "en" ? "en-GB" : "fr-FR";
  const nf = (o: Intl.NumberFormatOptions) => new Intl.NumberFormat(tag, o);
  const int = nf({ maximumFractionDigits: 0 });
  const euro = (eur: number, signed = false): string => {
    const abs = Math.abs(eur);
    const sign = signed ? { signDisplay: "exceptZero" as const } : {};
    if (abs >= 1e9) return nf({ maximumFractionDigits: 2, minimumFractionDigits: 2, ...sign }).format(eur / 1e9) + "\u00a0Md€";
    if (abs >= 1e6) return nf({ maximumFractionDigits: 1, ...sign }).format(eur / 1e6) + "\u00a0M€";
    if (abs >= 1e3) return nf({ maximumFractionDigits: 0, ...sign }).format(eur / 1e3) + "\u00a0k€";
    return nf({ maximumFractionDigits: 0, ...sign }).format(eur) + "\u00a0€";
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
  const signedPct = (x: number) => `${x >= 0 ? "+" : "−"}${makeFmt(locale).fmtDec(Math.abs(x), 1)} %`;
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

function SectionChips({ items, label, onPick }: { items: { id: string; label: string; value?: string }[]; label: string; onPick?: (id: string) => void }) {
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
        <a key={s.id} href={`#${s.id}`} className={s.id === active ? "is-active" : ""} aria-current={s.id === active ? "location" : undefined} onClick={() => onPick?.(s.id)}>
          {s.label}{s.value ? <b className="tnum">{s.value}</b> : null}
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

export default function PageVilleClient({ commune, budget, evolution, invest, marches, maire, taxeFonciere, fonctions, natureFiches, marchesHref, peers, compare, sources, related }: PageVilleProps) {
  const { locale: pageLocale } = useLocale();
  const isEn = pageLocale === "en";
  const t = useT();
  // The door to Paris names Paris : without the city rewrite of t(), which
  // read « Lyon, en détail » on Lyon's page (2026-09-17).
  const tRaw = useTRaw();
  const track = useTrack();
  const { euro, split, int, signedPct, locale } = useFmt();
  const en = locale === "en";
  const fill = (key: string, vars: Record<string, string | number>) => {
    let s = t(key);
    for (const [k, v] of Object.entries(vars)) s = s.split(`{${k}}`).join(String(v));
    return s;
  };
  const router = useRouter();
  // « · depuis 2014 au moins, réélu en 2020 et 2026 » — ou « · depuis mars 2026 » d'un maire nouveau.
  const maireDepuis = maire ? maireDepuisLabel(maire, t, en ? "en-GB" : "fr-FR") : null;

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
  // Une petite commune dont le total a VRAIMENT bougé : un seul chantier suffit
  // à l'expliquer, et le lecteur mérite de le savoir avant de conclure. Sur une
  // petite commune stable, la même phrase n'explique rien et encombre.
  const volatile = commune.pop < 10000 && years.length > 1 && deltaYear != null && Math.abs(deltaYear) > 20;

  // Pas de phrase de position dans le héros. Elle disait « au-dessus pour la
  // dette, en dessous pour les impôts et l'épargne » : un verdict SANS AUCUN
  // CHIFFRE, sur trois indicateurs dont le bon sens diffère — une dette haute
  // se lit comme un reproche, une épargne basse aussi, des impôts bas comme un
  // compliment. Trois directions incompatibles dans une phrase, et rien pour
  // les vérifier. Les mêmes faits sont plus bas, dans leur section, avec leurs
  // nombres : « 1 793 € par habitant · communes de sa taille : 1 317 € ».

  /* ── 2. Dépenses et recettes : lignes, courbe, détail des comptes ── */
  const evoYear = evolution?.series.find((p) => p.year === year) ?? null;
  const strip = (l: string) => l.replace(/\s\((D|R)\)$/, "");
  const [openRow, setOpenRow] = useState<string | null>(null);
  // One scene, two ways to cut it (2026-09-16): by public policy when the
  // commune has that axis, by nature of spending otherwise — and, by nature,
  // one column at a time. The four other numbers are rows that open.
  const hasFonctions = !!fonctions && fonctions.fonctions.length >= 3;
  const [scene, setScene] = useState<"fonction" | "nature">(hasFonctions ? "fonction" : "nature");
  const [side, setSide] = useState<"expenses" | "revenue">("expenses");
  const [openFolds, setOpenFolds] = useState<Set<string>>(() => new Set());
  const toggleFold = (id: string, open: boolean) => setOpenFolds((prev) => { const n = new Set(prev); if (open) n.add(id); else n.delete(id); return n; });
  // On the phone the two columns showed fourteen lines before the first section: four each, the rest on demand.
  const [ledgerOpen, setLedgerOpen] = useState(false);
  const LEDGER_CAP = 4;
  // Les deux compartiments sans fiche — reversé, non ventilé — se déplient sur
  // place. Les politiques, elles, mènent à leur fiche : une seule règle sur la
  // page, un clic ouvre la fiche quand elle existe, sinon déplie.
  const [openFonction, setOpenFonction] = useState<string | null>(null);
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
  const Row = ({ side, label, value, total, tail = false }: { side: "expenses" | "revenue"; label: string; value: number; total: number; tail?: boolean }) => {
    const items = comptesFor(side, label);
    const key = `${side}:${label}`;
    const open = openRow === key;
    const sub = dont(side, label);
    const canOpen = items.length > 0;
    const id = `nat-${side}-${strip(label).replace(/[^a-z0-9]+/gi, "-").toLowerCase()}`;
    const fiche = side === "expenses" ? natureFiches[strip(label)] : undefined;
    const swatch = null;
    // La même règle que partout : la fiche quand elle existe, sinon le dépliement.
    if (fiche) {
      return (
        <Link href={`/france/${commune.slug}/nature/${fiche}`} id={id} className={`fx-bud-row fx-pv-row fx-pv-row--fiche${tail ? " fx-pv-row--tail" : ""}`} scroll={false} prefetch={false}>
          {/* Même chevron que les lignes qui déplient : les deux gestes mènent au
              détail, le lecteur n'a pas à savoir lequel ouvre une page. */}
          <span className="n">{swatch}{strip(label)}<span className="chev" aria-hidden="true">▸</span>{sub ? <span className="dont">{sub}</span> : null}</span>
          <Spark label={label} />
          <Amt n={value} />
          <span className="p tnum">{Math.round((value / total) * 100)} %</span>
        </Link>
      );
    }
    return (
      <>
        <button
          type="button"
          id={id}
          className={`fx-bud-row fx-pv-row${canOpen ? "" : " fx-bud-row--static"}${open ? " open" : ""}${tail ? " fx-pv-row--tail" : ""}`}
          onClick={() => canOpen && setOpenRow(open ? null : key)}
          aria-expanded={canOpen ? open : undefined}
          disabled={!canOpen}
        >
          <span className="n">
            {swatch}{strip(label)}
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
  const depHabMedian = peers?.rows.find((r) => r.key === "depenses_totales")?.median ?? null;
  const capacite = evoLast?.capacite_desendettement ?? null;
  const capaciteWords = (n: number) => {
    const r = Math.round(n * 2) / 2;
    if (r < 1) return t("fx.pv.cap_under1");
    return fill("fx.pv.cap_years", { n: r.toLocaleString(en ? "en-GB" : "fr-FR", { maximumFractionDigits: 1 }) });
  };

  /* ── 5. Ce que la commune achète ── */
  // The last year speaks for the commune only when it holds a few contracts: Clermont's
  // DECP stops in 2023 with one contract, and « 1,2 M€ · un seul marché » read as an
  // error. Under five, the row says the whole published span instead (2026-09-16).
  const ly = marches?.last_year && marches.last_year.year && marches.last_year.nb_marches >= 5 ? marches.last_year : null;
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
  const [cmpPending, startCmp] = useTransition();
  /** L'URL de la page avec un paramètre changé, les autres conservés (année, comparaison). */
  const withParam = (key: string, value: string) => {
    const sp = new URLSearchParams(typeof window === "undefined" ? "" : window.location.search);
    sp.set(key, value);
    return `/france/${commune.slug}?${sp.toString()}`;
  };
  const other = compare?.other ?? null;
  // The verdicts of the comparison : against the neighbour, against the towns of
  // the same size (the strata median of the national index). Under 5 % apart
  // reads as « like ».
  const pctDiff = (a: number, b: number) => (Math.abs(b) < 1 ? null : ((a - b) / Math.abs(b)) * 100);
  const verdictVs = (a: number, b: number, nom: string) => {
    const pd = pctDiff(a, b);
    if (pd == null) return null;
    const r = Math.round(Math.abs(pd));
    return r < 5 ? fill("fx.pv.vs.same", { nom }) : fill(pd > 0 ? "fx.pv.vs.more" : "fx.pv.vs.less", { p: int.format(r), nom });
  };
  const verdictStrate = (pd: number) => {
    const r = Math.round(Math.abs(pd));
    return r < 5 ? t("fx.pv.vs.strate_same") : fill(pd > 0 ? "fx.pv.vs.strate_more" : "fx.pv.vs.strate_less", { p: int.format(r) });
  };
  const cmpVal = (e: CompareEntry, row: CmpRow): number | null =>
    row.kind === "share"
      ? (e.kpis.frais_personnel != null && e.kpis.depenses_totales ? (e.kpis.frais_personnel / e.kpis.depenses_totales) * 100 : null)
      : (e.kpis[row.key] ?? null);
  const cmpRow = (row: CmpRow) => {
    if (!compare) return null;
    const a = cmpVal(compare.me, row);
    const b = other ? cmpVal(other, row) : null;
    const max = Math.max(Math.abs(a ?? 0), Math.abs(b ?? 0), 1);
    const peer = row.kind === "hab" ? peers?.rows.find((r) => r.key === row.key) ?? null : null;
    const fmtV = (v: number | null) => (v == null ? "—" : row.kind === "share" ? `${int.format(Math.round(v))} %` : `${int.format(Math.round(v))} €`);
    const vsNeighbour = other && a != null && b != null ? verdictVs(a, b, nomDistinct(other)) : null;
    const vsStrate = peer && peer.deltaPct != null ? verdictStrate(peer.deltaPct) : null;
    return (
      <div className="row">
        <span className="lab">{t(row.labelKey)}</span>
        <div className="track">
          <span className="a" style={{ width: `${(Math.abs(a ?? 0) / max) * 100}%` }} />
          {other ? <span className="b" style={{ width: `${(Math.abs(b ?? 0) / max) * 100}%` }} /> : null}
        </div>
        <span className="val tnum">
          <span><b>{fmtV(a)}</b>{other ? <> · {fmtV(b)}</> : null}{row.kind === "hab" ? <> {t("fx.pv.par_hab")}</> : null}</span>
          {vsNeighbour || vsStrate ? <span className="fx-pv-vs-verdict">{vsNeighbour}{vsNeighbour && vsStrate ? " · " : ""}{vsStrate}</span> : null}
        </span>
      </div>
    );
  };

  const H2 = ({ id, children, sub, hint, main }: { id: string; children: React.ReactNode; sub?: React.ReactNode; hint?: React.ReactNode; main?: boolean }) => (
    <>
      <h2 id={id} className={main ? "fx-v3-h2 fx-pv-h2 fx-pv-h2--main" : "fx-v3-h2 fx-pv-h2"}>{children}</h2>
      {sub ? <p className="fx-v3-h2sub">{sub}</p> : null}
      {hint ? <V3Hint>{hint}</V3Hint> : null}
    </>
  );

  // The chips are the page's doors: each carries the number it opens; a chip on a row opens the row (2026-09-16).
  const toc = [
    ...(compare ? [{ id: "comparer", label: t("fx.pv.toc.comparer"), value: other ? fill("fx.pv.chip_vs", { nom: nomDistinct(other) }) : undefined }] : []),
    { id: "a-quoi-sert", label: t("fx.pv.toc.fonc"), value: euro(data.depenses) },
    ...(invYear && invYear.total.depenses > 0 ? [{ id: "construit", label: t("fx.pv.toc.construit"), value: euro(invYear.total.depenses) }] : []),
    ...(marches ? [{ id: "achats", label: t("fx.pv.toc.achats"), value: euro(ly ? ly.montant : marches.total.montant) }] : []),
    ...(taxeFonciere && taxeFonciere.tfb != null ? [{ id: "taxe-fonciere", label: t("fx.pv.toc.taxe"), value: `${tfRate(taxeFonciere.tfb)} %` }] : []),
    ...(evoLast?.dette != null ? [{ id: "dette", label: t("fx.pv.toc.dette"), value: `${int.format(Math.round(evoLast.dette_hab ?? 0))} €/hab` }] : []),
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
              {maireDepuis ? ` ${maireDepuis}` : ""}
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
                    <span className="fx-pv-nowrap">{capBefore}
                    <select
                      className="fx-pv-yearsel"
                      aria-label={t("fx.pv.annee_label")}
                      value={year}
                      onChange={(e) => router.push(withParam("year", e.target.value), { scroll: false })}
                    >
                      {availableYears.map((y) => <option key={y} value={y}>{y}</option>)}
                    </select></span>
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
                  {volatile ? <p className="fx-pv-petite">{t("fx.pv.petite_commune")}</p> : null}
                </div>
              )}
              <div className="fx-v3-hero-meta">
                {/* « Est-ce beaucoup ? » answered in the first line, in numbers: the same figure for towns of its size (2026-09-16). */}
                {perHab > 0 ? `${fill("fx.bud.v3.par_hab", { n: int.format(perHab) })}${depHabMedian != null ? ` · ${fill("fx.pv.strate_hab", { n: int.format(Math.round(depHabMedian)) })}` : ""} · ` : ""}
                {fill("fx.bud.v3.recettes_exec", { rec: euro(data.recettes) })}
                {` · ${t("fx.natbud.solde").toLowerCase()} ${euro(data.solde, true)}`}
              </div>
              <ShareButton label={t("fx.pv.share_num")} title={fill("fx.pv.share_title", { nom: commune.nom, year, n: euro(data.depenses) })} done={t("fx.pv.share_done")} />
            </div>
            {/* La mise en garde sur la volatilité ne s'affiche que si le total a
                vraiment bougé : sur une petite commune stable, elle n'explique
                rien et encombre. Elle est posée sous la tendance, à côté du
                chiffre qu'elle justifie. */}
            {years.length > 1 && (
              <div className="fx-v3-trend fx-pv-trend-desk">
                <div className="t">
                  {deltaYear != null && <b>{deltaWords(deltaYear, prevYear.year) ?? `${signedPct(deltaYear)} ${fill("fx.bud.v3.vs", { y: prevYear.year })}`}</b>}
                  {sinceFirst != null && <span> · {deltaWords(sinceFirst, first.year) ?? `${signedPct(sinceFirst)} ${fill("fx.bud.v3.depuis", { y: first.year })}`}</span>}
                </div>
                <Bars points={years.map((y) => ({ year: y.year, value: y.depenses, type: y.type }))} year={year} ends={euro} />
                {volatile ? <p className="fx-pv-petite">{t("fx.pv.petite_commune")}</p> : null}
              </div>
            )}
          </div>

          <SectionChips items={toc} label={t("fx.pv.chips_aria")} onPick={(id) => { if (["taxe-fonciere", "dette", "construit", "achats"].includes(id)) toggleFold(id, true); }} />

          {/* 2. Comparer — right under the number (2026-09-18) : « est-ce beaucoup ? »
              is the reader's second question, the neighbours are what they scroll
              for, and a neighbour is the most clicked link of the site. Five lines,
              each with its verdict against the neighbour and against the towns of
              the same size ; the strata verdicts show even before a neighbour is
              picked. The picker sits under the bars, once the reader has seen them. */}
          {compare && (
            <Reveal>{() => (<>
              <H2 id="comparer" main>{t("fx.pv.comparer")}</H2>
              <div className="fx-pv-pick">
                <span className="fx-pv-pick-now">
                  {fill("fx.pv.face_a", { nom: commune.nom })}{other ? <> <b>{nomDistinct(other)}</b></> : null}
                </span>
                {!other ? <CommunePicker
                  label={t("fx.pv.changer")}
                  exclude={commune.slug}
                  current={null}
                  suggestions={compare.options
                    .sort((a, b) => Math.abs(a.pop - commune.pop) - Math.abs(b.pop - commune.pop))
                    .slice(0, 6)
                    .map((o) => ({ ...o, dep_name: commune.dep_name }))}
                  onPick={(c) => startCmp(() => router.push(withParam("vs", c.slug), { scroll: false }))}
                /> : null}
              </div>
              <div className={`fx-pv-vs${cmpPending ? " is-pending" : ""}`} aria-busy={cmpPending}>
                {other ? <div className="legend"><span><i className="a" />{commune.nom}</span><span><i className="b" />{other.nom}</span></div> : null}
                {CMP_ROWS.map((row, i) => (
                  <Fragment key={row.key}>
                    {cmpRow(row)}
                    {i === 1 && other && compare.me.taux?.tfb != null && other.taux?.tfb != null ? (
                      <div className="row">
                        <span className="lab">{t("fx.pv.kpi_tfb")}</span>
                        <div className="track">
                          <span className="a" style={{ width: `${(compare.me.taux.tfb / Math.max(compare.me.taux.tfb, other.taux.tfb, 0.01)) * 100}%` }} />
                          <span className="b" style={{ width: `${(other.taux.tfb / Math.max(compare.me.taux.tfb, other.taux.tfb, 0.01)) * 100}%` }} />
                        </div>
                        <span className="val tnum">
                          <span><b>{compare.me.taux.tfb.toLocaleString(en ? "en-GB" : "fr-FR", { maximumFractionDigits: 2 })} %</b> · {other.taux.tfb.toLocaleString(en ? "en-GB" : "fr-FR", { maximumFractionDigits: 2 })} % {fill("fx.pv.taux_annee", { y: compare.me.taux.annee })}</span>
                          <span className="fx-pv-vs-verdict">{verdictVs(compare.me.taux.tfb, other.taux.tfb, nomDistinct(other))}</span>
                        </span>
                      </div>
                    ) : null}
                  </Fragment>
                ))}
                {other ? (<>
                  <div className="fx-pv-pick fx-pv-pick--after">
                    <CommunePicker
                  label={t("fx.pv.changer")}
                  exclude={commune.slug}
                  current={other ? { slug: other.slug, nom: other.nom, pop: other.pop } : null}
                  suggestions={compare.options
                    .filter((o) => o.slug !== other?.slug)
                    .sort((a, b) => Math.abs(a.pop - commune.pop) - Math.abs(b.pop - commune.pop))
                    .slice(0, 6)
                    .map((o) => ({ ...o, dep_name: commune.dep_name }))}
                  onPick={(c) => startCmp(() => router.push(withParam("vs", c.slug), { scroll: false }))}
                />
                  </div>
                  <p className="fx-pv-more"><Link className="fx-pv-link" href={`/france/comparer/${commune.slug}/${other.slug}`}>{t("fx.pv.comparaison_complete")}<i className="fx-pv-arrow" aria-hidden="true" /></Link></p>
                </>) : null}
                <p className="fx-v3-foot">{fill("fx.pv.comparer_note", { year: compare.year })}{compare.me.taux ? ` ${t("fx.pv.taux_note")}` : ""}</p>
              </div>
            </>)}</Reveal>
          )}


          {/* ── The scene: « À quoi sert l'argent ? », cut by public policy or by nature. The
              invitation is the whole sub-line: a reader skims, a long sentence hides it. */}
          <H2 id="a-quoi-sert" hint={scene === "fonction" ? t("fx.pv.fonc.h2sub") : t("fx.pv.nature_sub")}>{fill("fx.pv.fonc.h2", { denom: isEn ? commune.nom : deNom(commune.nom) })}</H2>
          <div className="fx-sec-switch fx-pv-switch" role="group" aria-label={t("fx.pv.g.aria")}>
            {hasFonctions ? (
              <>
                <button type="button" aria-pressed={scene === "fonction"} onClick={() => { if (scene !== "fonction") { track("filter_change", { page: "commune", field: "scene_group", value: "fonction" }); setScene("fonction"); } }}>{t("fx.pv.g.fonction")}</button>
                <button type="button" aria-pressed={scene === "nature"} onClick={() => { if (scene !== "nature") { track("filter_change", { page: "commune", field: "scene_group", value: "nature" }); setScene("nature"); } }}>{t("fx.pv.g.nature")}</button>
                <span className="fx-pv-switch-sep" aria-hidden="true" />
              </>
            ) : null}
            {scene === "nature" ? (
              <>
                <button type="button" aria-pressed={side === "expenses"} onClick={() => { if (side !== "expenses") { track("filter_change", { page: "commune", field: "ledger_side", value: "expenses" }); setSide("expenses"); } }}>{t("fx.pv.g.depenses")}</button>
                <button type="button" aria-pressed={side === "revenue"} onClick={() => { if (side !== "revenue") { track("filter_change", { page: "commune", field: "ledger_side", value: "revenue" }); setSide("revenue"); } }}>{t("fx.pv.g.recettes")}</button>
              </>
            ) : null}
          </div>
          {/* 2a. À quoi sert l'argent — ventilation par fonction (DGFiP).
              Liste ouverte, même grammaire que « par nature » juste au-dessus :
              un libellé, une barre, un montant, une part. Les parts se calculent
              sur le ventilé, pas sur le total : la rubrique 01 (dette, fiscalité,
              opérations générales) n'appartient à aucune politique et fait sa
              propre ligne, en bas, sans pourcentage. */}
          {scene === "fonction" && fonctions && fonctions.fonctions.length >= 3 && (() => {
            const parts = fonctions.fonctions;
            const nvd = fonctions.non_ventile_detail;
            const revd = fonctions.reversement_detail;
            const cg = fonctions.comparaison_globale;
            const maxMontant = Math.max(...parts.map((f) => f.montant), fonctions.non_ventile, fonctions.reversement, 1);
            // Une barre ne représente qu'une part positive. Les rares fonctions
            // nettes négatives (annulations d'exercices antérieurs supérieures
            // aux dépenses de l'année) n'en reçoivent pas.
            const barWidth = (n: number) => (n <= 0 ? null : `${Math.max(1.5, (n / maxMontant) * 100)}%`);
            const lbl = (x: { libelle: string; libelle_en: string }) => (isEn ? x.libelle_en : x.libelle);

            /** Le dépliement d'un compartiment sans fiche : ses natures, une colonne. */
            const DetailNatures = ({ rows }: { rows: FonctionLigne[] }) => (
              <div className="fx-pv-drill">
                {rows.map((n) => (
                  <div key={n.code} className={`line${n.autres ? " autres" : ""}`}>
                    <span>{lbl(n)}</span>
                    <Amt n={n.montant} size={13} />
                  </div>
                ))}
              </div>
            );

            return (
              <section className="fx-pv-fonc">
                {cg && cg.ecart_pct != null && fonctions.strate ? (
                  /* Le NIVEAU se dit une fois. Sans cette phrase, le lecteur
                     attribuerait aux choix de la commune ce qui n'est que son
                     niveau de dépense global. */
                  <p className="fx-pv-fonc-niveau">
                    {fill("fx.pv.fonc.niveau_court", { nom: commune.nom })}{" "}
                    <b className={cg.ecart_pct >= 0 ? "plus" : "moins"}>{Math.abs(Math.round(cg.ecart_pct))}&nbsp;%</b>{" "}
                    {fill("fx.pv.fonc.niveau_court_suite", { sens: t(cg.ecart_pct >= 0 ? "fx.fonc.plus_que" : "fx.fonc.moins_que"), strate: isEn ? fonctions.strate.libelle_en : fonctions.strate.libelle })}
                  </p>
                ) : null}
                <h3 className="fx-pv-fonc-h3">
                  <span>{t("fx.pv.fonc.col")}</span>
                  <span className="fx-pv-fonc-h3-bande">{cg ? t("fx.pv.fonc.col_bande") : null}</span>
                  <span className="tnum">{euro(fonctions.total_ventile)}</span>
                </h3>
                {parts.some((f) => f.comparaison) ? (
                  /* La bande ne se lit pas seule, surtout sur téléphone où elle
                     n'a pas d'en-tête : sa clé est dite une fois, au-dessus. */
                  <p className="fx-pv-fonc-legende">
                    <span><i className="sw mid" aria-hidden="true" />{t("fx.pv.fonc.legende_mid")}</span>
                    <span><i className="sw plus" aria-hidden="true" />{fill("fx.pv.fonc.legende_plus", { nom: commune.nom })}</span>
                    <span><i className="sw moins" aria-hidden="true" />{t("fx.pv.fonc.legende_moins")}</span>
                  </p>
                ) : null}
                <ul className="fx-pv-fonc-list">
                  {parts.map((f: FonctionPart) => {
                    const w = barWidth(f.montant);
                    return (
                      <li key={f.cle}>
                        {/* Toute la ligne mène à la fiche de la politique publique —
                            une vraie adresse, qui s'ouvre en drawer depuis ici. */}
                        <Link href={`/france/${commune.slug}/fonction/${f.slug}`} className="fx-bud-row fx-pv-fonc-row" prefetch={false}>
                          <span className="n">{lbl(f)}</span>
                          {f.comparaison ? (
                            /* La PRIORITÉ : la part du budget face à la part médiane des
                               communes de même taille. La médiane est au centre ; le
                               segment part à droite (ocre) si la commune y met plus que
                               ses pairs, à gauche (marine) si moins. */
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
                          {f.comparaison ? (
                            /* Sur téléphone, l'écart est écrit sous la bande, en mots : « moins
                               qu'ailleurs (21 %) ». Masqué sur grand écran, où la colonne
                               « ailleurs » le dit déjà. */
                            <span className="ecart tnum">
                              {Math.abs(f.comparaison.ecart_pt) < 0.5 ? (
                                fill("fx.pv.fonc.ecart_egal", { n: Math.round(f.comparaison.part_mediane) })
                              ) : (
                                <>
                                  <b className={f.comparaison.ecart_pt > 0 ? "plus" : "moins"}>{t(f.comparaison.ecart_pt > 0 ? "fx.pv.fonc.ecart_plus" : "fx.pv.fonc.ecart_moins")}</b>
                                  {` ${fill("fx.pv.fonc.ecart_ailleurs", { n: Math.round(f.comparaison.part_mediane) })}`}
                                </>
                              )}
                            </span>
                          ) : null}
                        </Link>
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
                        </button>
                        {open ? <DetailNatures rows={revd.natures} /> : null}
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
                          className={`fx-bud-row fx-pv-fonc-row fx-pv-fonc-nv${open ? " open" : ""}`}
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
                        </button>
                        {open ? <DetailNatures rows={nvd.natures} /> : null}
                      </li>
                    );
                  })() : null}
                </ul>
                <p className="fx-v3-foot">{t("fx.pv.fonc.note")}</p>
              </section>
            );
          })()}

          {/* 2. Dépenses et recettes */}
          {scene === "nature" ? (
            <div className="fx-bud-cols fx-bud-cols--one">
              {side === "expenses" ? (
                <div className="fx-bud-col" data-folded={ledgerOpen ? undefined : "1"}>
                  <h3><span>{t("fx.bud.v3.col_dep")}</span><span className="tnum">{euro(data.depenses)}</span></h3>
                  {dep.map((x, i) => <Row key={x.label} side="expenses" label={x.label} value={x.value} total={data.depenses} tail={i >= LEDGER_CAP} />)}
                  {dep.length > LEDGER_CAP + 1 ? (
                    <button type="button" className="fx-pv-ledger-more" onClick={() => setLedgerOpen((o) => !o)} aria-expanded={ledgerOpen}>
                      {ledgerOpen ? t("fx.pv.ledger_less") : fill("fx.pv.ledger_more", { n: dep.length - LEDGER_CAP })}
                    </button>
                  ) : null}
                </div>
              ) : (
                <div className="fx-bud-col" data-folded={ledgerOpen ? undefined : "1"}>
                  <h3><span>{t("fx.bud.v3.col_rec")}</span><span className="tnum">{euro(data.recettes)}</span></h3>
                  {rec.map((x, i) => <Row key={x.label} side="revenue" label={x.label} value={x.value} total={data.recettes} tail={i >= LEDGER_CAP} />)}
                  {rec.length > LEDGER_CAP + 1 ? (
                    <button type="button" className="fx-pv-ledger-more" onClick={() => setLedgerOpen((o) => !o)} aria-expanded={ledgerOpen}>
                      {ledgerOpen ? t("fx.pv.ledger_less") : fill("fx.pv.ledger_more", { n: rec.length - LEDGER_CAP })}
                    </button>
                  ) : null}
                </div>
              )}
            </div>
          ) : null}
          {/* ── The other numbers (2026-09-16): four rows, the concrete first — works,
              purchases, then taxes, debt. Each row shows its number and its two lines
              without a click; what needs a table sits behind a link that says what it opens. */}
          <section className="fx-pv-section fx-pv-autres">
            <H2 id="autres">{t("fx.pv.h.autres")}</H2>
            {invYear && invYear.total.depenses > 0 && (
              <div className="fx-pv-row2" id="construit">
                <h3 className="fx-pv-row2-l">{t("fx.pv.row.construit")}</h3>
                <p className="fx-pv-row2-num">
                  <b className="tnum">{split(invYear.total.depenses).v}<small>{split(invYear.total.depenses).u}</small></b>
                  <span>{fill("fx.pv.construit_l1", { year: invYear.year, hab: int.format(invYear.total.depenses_eur_hab ?? (commune.pop > 0 ? invYear.total.depenses / commune.pop : 0)) })}</span>
                </p>
                {(equipement || (invDelta != null && invPrev)) ? (
                  <p className="fx-pv-l2">
                    {equipement ? fill("fx.pv.construit_equip", { n: euro(equipement) }) : ""}
                    {invDelta != null && invPrev ? ` ${fill("fx.pv.construit_delta", { pct: signedPct(invDelta), y: invPrev.year })}` : ""}
                  </p>
                ) : null}
                {/* Les pages /investissements et /evolution ont été supprimées en
                    septembre 2026 — elles redirigent vers l'ancre de cette rangée. Le
                    contenu revient donc ICI, en deux colonnes sobres, derrière un lien. */}
                <details className="fx-pv-fold" data-fold="construit" open={openFolds.has("construit")} onToggle={(e) => toggleFold("construit", (e.currentTarget as HTMLDetailsElement).open)}>
                  <summary><span>{t("fx.pv.fold.construit")}</span><span className="chev" aria-hidden="true" /></summary>
                  <div className="fx-pv-fold-body">
                    <div className="fx-pv-two">
                      <div>
                        <div className="fx-pv-colhead"><span>{t("fx.pv.financement")}</span><span className="tnum">{euro(invYear.total.recettes)}</span></div>
                        {invYear.financement_par_groupe.map((g) => (
                          <div key={g.groupe} className="fx-pv-line"><span>{g.groupe}</span><Amt n={g.montant} size={13} /></div>
                        ))}
                      </div>
                      <div>
                        <div className="fx-pv-colhead"><span>{t("fx.pv.invest_va")}</span><span className="tnum">{euro(invYear.total.depenses)}</span></div>
                        {invYear.depenses_par_groupe.map((g) => (
                          <div key={g.groupe} className="fx-pv-line"><span>{g.groupe}</span><Amt n={g.montant} size={13} /></div>
                        ))}
                      </div>
                    </div>
                    <p className="fx-v3-foot">{t("fx.pv.construit_note")}</p>
                  </div>
                </details>
              </div>
            )}
            {marches && (() => {
              // The door to every contract stays in the page; the coverage note sits with the table.
              const more = marchesHref ? <p className="fx-pv-more"><Link className="fx-pv-link" href={marchesHref}>{fill("fx.pv.tous_marches", { n: int.format(marches.total.nb_marches) })}<i className="fx-pv-arrow" aria-hidden="true" /></Link></p> : null;
              const note = (
                <p className="fx-v3-foot">
                  {marches.coverage_note}
                  {mYears.length ? ` ${fill("fx.pv.annees_publiees", { years: mYears.join(", ") })}` : ""}
                  {ecartees.length ? ` ${fill("fx.pv.annees_ecartees", { years: ecartees.join(", ") })}` : ""}
                </p>
              );
              const f0 = mTitu[0];
              const nom0 = f0 ? (f0.personne_physique ? t("fx.pv.entrepreneurs") : displayFournisseur(f0.nom)) : null;
              const objet0 = f0 && "objet" in f0 ? (f0 as { objet?: string }).objet : undefined;
              const href0 = f0 && !f0.personne_physique && f0.siren ? `/france/${commune.slug}/fournisseur/${f0.siren}` : null;
              const nTop = Math.min(5, marches.top_marches.length);
              return (
                <div className="fx-pv-row2" id="achats">
                  <h3 className="fx-pv-row2-l">{t("fx.pv.row.achats")}</h3>
                  <p className="fx-pv-row2-num">
                    <b className="tnum">{split(ly ? ly.montant : marches.total.montant).v}<small>{split(ly ? ly.montant : marches.total.montant).u}</small></b>
                    <span>
                      {ly
                        ? fill(ly.nb_marches === 1 ? "fx.pv.achats_l1_one" : "fx.pv.achats_l1", { year: ly.year as number, nb: int.format(ly.nb_marches) })
                        : mYears.length === 1
                          ? fill(marches.total.nb_marches === 1 ? "fx.pv.achats_l1_one" : "fx.pv.achats_l1", { year: mYears[0], nb: int.format(marches.total.nb_marches) })
                          : fill("fx.pv.achats_l1_cumul", { nb: int.format(marches.total.nb_marches), y0: mYears[0] ?? "", y1: mYears[mYears.length - 1] ?? "" })}
                    </span>
                  </p>
                  {f0 ? (
                    <p className="fx-pv-l2">
                      {t("fx.pv.achats_l2")}
                      {href0 ? <Link href={href0} className="fx-pv-nm">{nom0}</Link> : nom0}
                      {`, ${euro(f0.montant)}`}
                      {objet0 ? `, ${objet0.charAt(0).toLowerCase()}${objet0.slice(1)}` : ""}
                    </p>
                  ) : null}
                  {marches.top_marches.length > 1 ? (
                    <details className="fx-pv-fold" data-fold="achats" open={openFolds.has("achats")} onToggle={(e) => toggleFold("achats", (e.currentTarget as HTMLDetailsElement).open)}>
                      <summary><span>{fill(nTop >= marches.total.nb_marches ? "fx.pv.fold.achats_all" : "fx.pv.fold.achats", { n: nTop })}</span><span className="chev" aria-hidden="true" /></summary>
                      <div className="fx-pv-fold-body">
                        <div className="fx-pv-top5">
                          {marches.top_marches.slice(0, 5).map((m, i) => (
                            <div key={i} className="fx-pv-line">
                              <span>
                                {m.slug ? <Link href={`/france/${commune.slug}/marche/${m.slug}`} className="fx-pv-nm fx-pv-objet" prefetch={false}>{m.objet || "—"}</Link> : (m.objet || "—")}
                                <span className="fx-pv-sub2">
                                  {m.siren && m.titulaire ? <Link href={`/france/${commune.slug}/fournisseur/${m.siren}`} className="fx-pv-nm">{displayFournisseur(m.titulaire)}</Link> : m.titulaire}
                                  {[m.annee, m.nb_lots && m.nb_lots > 1 ? fill("fx.pv.lots", { n: m.nb_lots }) : null].filter(Boolean).map((x) => ` · ${x}`).join("")}
                                </span>
                              </span>
                              <Amt n={m.montant} />
                            </div>
                          ))}
                        </div>
                        {note}
                      </div>
                    </details>
                  ) : note}
                  {more}
                </div>
              );
            })()}
            {taxeFonciere && taxeFonciere.tfb != null && (
              <div className="fx-pv-row2" id="taxe-fonciere">
                <h3 className="fx-pv-row2-l">{t("fx.pv.row.taxe")}</h3>
                <p className="fx-pv-row2-num">
                  <b className="tnum">{tfRate(taxeFonciere.tfb ?? 0)}<small>%</small></b>
                  <span>
                    {fill("fx.pv.tf.l1", { year: taxeFonciere.annee })}
                    {tfChanged
                      ? ` · ${fill(tfHist[tfHist.length - 1].value > tfHist[0].value ? "fx.pv.tf.up_short" : "fx.pv.tf.down_short", { y: tfHist[0].year })}`
                      : tfHist.length > 1 ? ` · ${fill("fx.pv.tf.stable_short", { y: tfHist[0].year })}` : ""}
                  </span>
                </p>
                {taxeFonciere.mediane != null ? <p className="fx-pv-l2">{fill("fx.pv.tf.l2", { med: tfRate(taxeFonciere.mediane) })}</p> : null}
                {tfProduit != null ? <p className="fx-pv-l2">{fill("fx.pv.tf.produit", { nom: commune.nom, year, n: euro(tfProduit), pct: tfShare != null ? Math.round(tfShare) : "—" })}</p> : null}
              </div>
            )}
            {evoLast && evoLast.dette != null && (
              <div className="fx-pv-row2" id="dette">
                <h3 className="fx-pv-row2-l">{t("fx.pv.row.dette")}</h3>
                <p className="fx-pv-row2-num">
                  <b className="tnum">{int.format(Math.round(evoLast.dette_hab ?? 0))}<small>€</small></b>
                  <span>{fill("fx.pv.dette_l1", { year: evoLast.year, n: euro(evoLast.dette ?? 0) })}</span>
                </p>
                {(detteMedian != null || (detteDelta != null && evoFirst)) ? (
                  <p className="fx-pv-l2">
                    {detteMedian != null ? fill("fx.pv.dette_median_short", { n: int.format(Math.round(detteMedian)) }) : ""}
                    {detteDelta != null && evoFirst ? `${detteMedian != null ? " · " : ""}${deltaWords(detteDelta, evoFirst.year) ?? `${signedPct(detteDelta)} ${fill("fx.pv.dette_since", { y: evoFirst.year })}`}` : ""}
                  </p>
                ) : null}
                {capacite != null && capacite > 0 ? <p className="fx-pv-l2">{fill("fx.pv.dette_cap", { years: capaciteWords(capacite) })}</p> : null}
                {evolution && evolution.series.length > 1 && evoFirst ? (
                  <details className="fx-pv-fold" data-fold="dette" open={openFolds.has("dette")} onToggle={(e) => toggleFold("dette", (e.currentTarget as HTMLDetailsElement).open)}>
                    <summary><span>{fill("fx.pv.fold.dette", { y: evoFirst.year })}</span><span className="chev" aria-hidden="true" /></summary>
                    <div className="fx-pv-fold-body">
                      <div className="fx-v3-trend fx-pv-trend-fold">
                        <Bars points={evolution.series.filter((p) => p.dette_hab != null).map((p) => ({ year: p.year, value: p.dette_hab as number }))} year={evoLast.year} ends={(v) => `${int.format(Math.round(v))} €`} />
                      </div>
                      <p className="fx-v3-foot">{t("fx.pv.dette_note")}</p>
                    </div>
                  </details>
                ) : <p className="fx-v3-foot">{t("fx.pv.dette_note")}</p>}
              </div>
            )}
          </section>
          <ChartSource
            source={[t("fx.natbud.source"), evolution ? t("fx.natev.source") : null, marches ? t("fx.natmar.source") : null, maire?.nom ? maireSourceLabel(sources.rne_hist, t) : null].filter(Boolean).join(" · ") + ` · ${year}`}
            dataHref={sources.dgfip}
            methodAnchor="c-villes"
          />
          <RelatedLinks block={related} />
          {/* The page's last door (2026-09-16): the reader has seen one commune;
              Paris is where the site goes deepest, and where a town sees what
              its own page could become. */}
          <NextDoor href="/france/paris" kicker={tRaw("fx.pv.next.kicker")} title={tRaw("fx.pv.next.title")} sub={tRaw("fx.pv.next.sub")} />
        </div>
      </main>
      <Footer />
    </div>
  );
}
