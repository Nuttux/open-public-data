"use client";

import type { ReactNode } from "react";
import { useState } from "react";
import type { LieuFicheData } from "@/lib/lieux-data";
import Link from "next/link";
import { useT, useLocale } from "@/lib/localeContext";
import { cap, fill, numLocale, seanceEn } from "@/lib/fmt";
import { normalizeObjet } from "@/lib/objet-normalizer";
import { useCity } from "./CityContext";
import { assocSlug } from "@/lib/assoc-slug";

/**
 * Fiche « lieu » v3 (2026-09-03) — un chiffre, deux blocs.
 *
 * L'ancienne fiche empilait neuf sections (Wikipédia sur deux paragraphes,
 * deux KPI, une barre, trois sections d'argent avec trois grammaires et trois
 * encadrés, les moments, le Bulletin, les sources) et trois lignes du temps
 * qui ne se croisaient jamais. Audit + maquette avant/après validés avec
 * Daniel : une phrase de description, UN chiffre, puis
 *
 *   1. « Où va l'argent » — deux lignes au plus, qui FONT le total : faire
 *      tourner le lieu (subventions versées à l'exploitant) et les travaux
 *      (chantiers réglés dans les comptes). Les contrats signés sont une
 *      sous-ligne des travaux avec le mot « plafond » : ils ne s'additionnent
 *      pas au versé et ne s'affichent plus comme un troisième montant.
 *   2. « Ce que le Conseil de Paris en a dit » — les moments jugés marquants,
 *      les plus récents d'abord, titre = le « pourquoi », détail = le fait ;
 *      le reste replié ; le Bulletin municipal tient en une ligne d'années.
 *
 * Plus de section Sources : chaque ligne porte son lien. Le récit BMO et la
 * synthèse longue restent dans l'export (chat, réutilisation).
 */

const MOIS_NUM: Record<string, number> = {
  JANVIER: 1, FEVRIER: 2, FÉVRIER: 2, MARS: 3, AVRIL: 4, MAI: 5, JUIN: 6, JUILLET: 7,
  AOUT: 8, AOÛT: 8, SEPTEMBRE: 9, OCTOBRE: 10, NOVEMBRE: 11, DECEMBRE: 12, DÉCEMBRE: 12,
};
/** « OCTOBRE 2020 » → 202010, pour trier les séances sans les traduire. */
function seanceKey(seance: string): number {
  const m = seance.match(/^([A-ZÉÛ]+)\s+(\d{4})$/);
  if (!m) return 0;
  return parseInt(m[2], 10) * 100 + (MOIS_NUM[m[1]] ?? 0);
}

/** « Faire tourner le théâtre » : l'article dépend du type de lieu. Repli
 *  neutre (« le lieu ») pour un type hors liste. */
const KIND_ARTICLE: Record<string, { fr: string; en: string }> = {
  "Théâtre": { fr: "le théâtre", en: "the theatre" },
  "Piscine": { fr: "la piscine", en: "the pool" },
  "Musée": { fr: "le musée", en: "the museum" },
  "Bibliothèque": { fr: "la bibliothèque", en: "the library" },
  "Médiathèque": { fr: "la médiathèque", en: "the library" },
  "Conservatoire": { fr: "le conservatoire", en: "the conservatoire" },
  "Salle de concert": { fr: "la salle", en: "the hall" },
  "Salle sportive": { fr: "la salle", en: "the hall" },
  "Gymnase": { fr: "le gymnase", en: "the gym" },
  "Stade": { fr: "le stade", en: "the stadium" },
  "Vélodrome": { fr: "le vélodrome", en: "the velodrome" },
  "Marché": { fr: "le marché", en: "the market" },
  "Marché couvert": { fr: "le marché", en: "the market" },
  "Parc": { fr: "le parc", en: "the park" },
  "Jardin": { fr: "le jardin", en: "the garden" },
  "Cimetière": { fr: "le cimetière", en: "the cemetery" },
  "Mairie": { fr: "la mairie", en: "the town hall" },
};

/** Première phrase d'un fait : une phrase entière, jamais une coupe au milieu
 *  d'un mot. Le point doit suivre un mot ordinaire (pas « M. » ni un sigle)
 *  et précéder une majuscule. */
function firstSentence(s: string): string {
  const m = s.match(/^[\s\S]*?[a-zà-ÿ0-9)»%][.!?](?=\s+[A-ZÀ-Ý«])/);
  return m ? m[0] : s;
}

const spanTxt = (a: number, b: number) => (a === b ? String(a) : `${a}–${b}`);
const minMax = (ys: number[]): [number, number] | null => {
  const v = ys.filter((y) => !Number.isNaN(y));
  return v.length ? [Math.min(...v), Math.max(...v)] : null;
};

function Eur({ v, u, size = 22 }: { v: string; u: string; size?: number }) {
  return (
    <span className="fx-v3-amt tnum" style={{ fontSize: size }}>
      {v}
      <span className="u">{u}</span>
    </span>
  );
}

function Fold({ label, children }: { label: string; children: ReactNode }) {
  return (
    <details className="fx-v3-fold">
      <summary>{label}</summary>
      {children}
    </details>
  );
}

export default function LieuFiche({ lieu }: { lieu: LieuFicheData }) {
  const t = useT();
  const { locale } = useLocale();
  const { basePath } = useCity();
  const locStr = numLocale(locale);
  const en = locale === "en";

  const fmtEur = (n: number): { v: string; u: string } => {
    if (n >= 1e9) return { v: new Intl.NumberFormat(locStr, { maximumFractionDigits: 2 }).format(n / 1e9), u: t("fx.s.md_eur") };
    if (n >= 1e6) return { v: new Intl.NumberFormat(locStr, { maximumFractionDigits: 1 }).format(n / 1e6), u: t("fx.s.m_eur") };
    return { v: new Intl.NumberFormat(locStr, { maximumFractionDigits: 0 }).format(n / 1000), u: "k €" };
  };
  const eurTxt = (n: number) => { const f = fmtEur(n); return `${f.v} ${f.u}`; };

  /* ── L'argent : versé/payé d'un côté, plafonds de contrats de l'autre ── */
  const subv = lieu.subventions_exploitant;
  const subvTotal = subv?.total_eur ?? 0;
  const investTotal = lieu.invest.reduce((a, r) => a + r.montant_eur, 0);
  const travauxTotal = investTotal + (lieu.mandate?.total_eur ?? 0);
  const reelTotal = subvTotal + travauxTotal;
  const marches = [...(lieu.marches ?? [])].sort((a, b) => (b.montant_max || 0) - (a.montant_max || 0));
  const plafond = marches.reduce((a, m) => a + (m.montant_max || 0), 0);
  const nChantiers = (lieu.mandate?.operations.length ?? 0) + lieu.invest.length;

  const travauxSpan = minMax([
    ...(lieu.mandate ? [parseInt(lieu.mandate.periode[0], 10), parseInt(lieu.mandate.periode[1], 10)] : []),
    ...lieu.invest.map((r) => parseInt(String(r.annee), 10)),
  ]);
  const verseSpan = minMax([
    ...(subv ? [parseInt(subv.annees[0], 10), parseInt(subv.annees[1], 10)] : []),
    ...(travauxSpan ?? []),
  ]);
  const marcheSpan = minMax(marches.map((m) => parseInt((m.date_notification ?? "").slice(0, 4), 10)));
  const kindArt = KIND_ARTICLE[lieu.kind_fr];
  const kindTxt = kindArt ? (en ? kindArt.en : kindArt.fr) : t("fx.lieu.line.lieu_generique");
  /* Tout ce qui s'affiche en tête de ligne, en barre de part et en pourcentage
   * porte sur la MÊME fenêtre que le chiffre de tête. Sinon la ligne annonçait
   * 39,2 M€ sur 2009-2022 pendant que le chiffre de tête en excluait 4,1 :
   * deux nombres justes qui ne s'additionnent pas sous les yeux du lecteur.
   * Ce qui tombe avant le seuil est dit en une ligne, sous les graphes. */
  const showBars = subvTotal > 0 && travauxTotal > 0;

  /* La fenêtre commune. Les deux flux ne commencent pas la même année : la
   * Ville publie l'investissement depuis 2009 et les subventions depuis 2013.
   * Additionner les deux « depuis 2009 » donnait un total qu'aucune période ne
   * produit, et deux lieux n'étaient pas comparables entre eux. Le chiffre de
   * tête couvre donc la fenêtre où les deux flux existent ; ce qui tombe avant
   * est montré juste sous les graphes, nommé, jamais retiré. */
  const seuil = lieu.seuil_commun ?? 0;
  const pctTxt = (n: number) => `${Math.round((n / (heroTotal || 1)) * 100)}${en ? "%" : "\u00a0%"}`;

  /* ── Deux séries annuelles, une par source, jamais empilées : les
   *    subventions à l'exploitant sont publiées depuis 2018, le détail des
   *    chantiers sur la plage que la Ville publie. Chacune vit sous sa ligne, sur ses
   *    propres années ; un trou est une absence de donnée, pas un zéro. */
  const yearly = (pairs: [number, number][]) => {
    const m = new Map<number, number>();
    pairs.forEach(([y, v]) => { if (Number.isFinite(y) && y > 1900 && v > 0) m.set(y, (m.get(y) ?? 0) + v); });
    return [...m.entries()].sort((a, b) => a[0] - b[0]).map(([year, value]) => ({ year, value }));
  };
  const exploitSeries = yearly((subv?.rows ?? []).map((r) => [parseInt(r.annee, 10), r.montant_eur]));
  const travauxSeries = yearly([
    ...lieu.invest.map((r) => [parseInt(String(r.annee), 10), r.montant_eur] as [number, number]),
    ...(lieu.mandate?.operations ?? []).flatMap((o) => Object.entries(o.mandate_par_annee).map(([y, v]) => [parseInt(y, 10), v] as [number, number])),
  ]);
  /* L'axe commun. Les deux lignes d'argent ne couvrent pas les mêmes
   * exercices, et ce n'est pas un choix : la Ville publie les subventions à
   * partir de 2013 et la dépense d'investissement à partir de 2009. Dessiner
   * chaque graphe sur ses propres années met côte à côte deux axes différents,
   * que l'œil compare quand même. On les pose sur le MÊME axe, du premier au
   * dernier exercice de la fiche.
   *
   * Un exercice que la source ne publie pas ne peut pas rester vide : un vide
   * se lit comme un zéro, et c'est exactement l'erreur qui faisait croire à un
   * théâtre à l'arrêt pendant sa rénovation. Il porte donc une marque propre,
   * un tiret pointillé, et la légende le nomme. */
  const avantSeuil = (s: { year: number; value: number }[]) =>
    s.filter((r) => r.year < seuil).reduce((a, r) => a + r.value, 0);
  const depuisSeuil = (s: { year: number; value: number }[]) =>
    s.filter((r) => r.year >= seuil).reduce((a, r) => a + r.value, 0);
  const subvDansFenetre = seuil ? depuisSeuil(exploitSeries) : subvTotal;
  const travauxDansFenetre = seuil ? depuisSeuil(travauxSeries) : travauxTotal;
  const heroTotal = seuil ? subvDansFenetre + travauxDansFenetre : reelTotal;
  const barMaxF = Math.max(subvDansFenetre, travauxDansFenetre);
  const horsFenetre = seuil
    ? [
        { montant: avantSeuil(travauxSeries), label: t("fx.lieu.line.travaux").toLowerCase(),
          serie: travauxSeries },
        { montant: avantSeuil(exploitSeries), label: fill(t("fx.lieu.line.exploitant"), { k: kindTxt }),
          serie: exploitSeries },
      ].filter((h) => h.montant > 0)
    : [];
  const heroDepuis = seuil
    ? Math.max(seuil, Math.min(...[...exploitSeries, ...travauxSeries]
        .filter((r) => r.year >= seuil).map((r) => r.year), seuil))
    : (verseSpan?.[0] ?? 0);


  /* L'axe des deux graphes. Un seul, du seuil commun au dernier exercice de la
   * fiche, pour que les deux lignes se lisent l'une sous l'autre : même
   * position, même largeur de barre, même année en dessous.
   *
   * Le seuil est celui du chiffre de tête (le premier exercice de subvention
   * publié, 2013). Faire commencer l'axe plus tôt donnait un tiers de graphe
   * vide avant la première barre de subvention et posait la question « pourquoi
   * cette année-là » à chaque lecture ; ce qui tombe avant est dit en une ligne
   * sous les graphes, avec sa période.
   *
   * Un exercice sans barre à l'intérieur de l'axe ne peut pas rester blanc : un
   * blanc se lit comme un zéro, et c'est l'erreur qui faisait croire à un
   * théâtre à l'arrêt pendant sa rénovation. Il porte un pointillé discret. */
  const axe = (() => {
    const ys = [...exploitSeries, ...travauxSeries].map((r) => r.year).filter((y) => y >= seuil);
    if (!ys.length) return null;
    return { de: seuil || Math.min(...ys), a: Math.max(...ys) };
  })();

  /* ── Cliquer une année ────────────────────────────────────────────────
   * Un montant sur un graphe est la trace d'une décision : une délibération
   * votée en séance. Son titre, écrit par la Ville, dit déjà pourquoi l'argent
   * est parti (« Subvention (15.800.000 euros) et 2e avenant avec
   * l'association Théâtre Musical de Paris »). On le publie tel quel sous le
   * graphe, avec son lien : le lecteur passe du chiffre à la décision sans
   * qu'on ait à écrire un motif à sa place.
   *
   * L'année est celle du VOTE, pas celle du paiement — les deux diffèrent
   * souvent d'un exercice. La légende le dit, elle ne le masque pas. */
  const delibs = lieu.delibs_par_annee || null;
  const [ouvert, setOuvert] = useState<{ annee: number; tone: string } | null>(null);
  /* Les délibérations sont rattachées au LIEU, pas au type d'argent. Chaque
   * ligne ne montre donc que celles de son genre : sans ce tri, une subvention
   * de fonctionnement s'affichait sous « Travaux et rénovation ». */
  const genrePour = (tone: "x" | "w") => (tone === "x" ? "subvention" : "travaux");
  const delibsDe = (y: number, tone: "x" | "w") =>
    (delibs?.[String(y)] || []).filter((d) => (d.genres || []).includes(genrePour(tone)));

  const Years = ({ series, tone }: { series: { year: number; value: number }[]; tone: "x" | "w" }) => {
    const dans = series.filter((r) => !axe || r.year >= axe.de);
    if (dans.length < 3 || !axe) return null;
    const max = Math.max(...dans.map((r) => r.value), 1);
    const parAn = new Map(dans.map((r) => [r.year, r.value]));
    const annees: number[] = [];
    for (let y = axe.de; y <= axe.a; y++) annees.push(y);
    const sel = ouvert && ouvert.tone === tone ? ouvert.annee : null;
    const lignes = sel !== null ? delibsDe(sel, tone) : [];
    return (
      <>
        <div className={`fx-v3-years ${tone} clic`}>
          {annees.map((y, i) => {
            const v = parAn.get(y);
            const n = delibsDe(y, tone).length;
            const corps = (
              <>
                {v === undefined ? <em /> : <i style={{ height: Math.max(2, Math.round((v / max) * 40)) }} />}
                {n > 0 && <b aria-hidden="true" />}
                {(i === 0 || i === annees.length - 1) && <span className={i === 0 ? "yr" : "yr end"}>{y}</span>}
              </>
            );
            const titre = v === undefined
              ? `${y} · ${t("fx.lieu.years.non_publie")}`
              : `${y} · ${eurTxt(v)}`;
            // TOUTE année porte le clic, pas seulement celles qui ont une
            // décision : le panneau donne d'abord le montant de l'exercice.
            // Un survol ne sert à rien sur un téléphone, et obliger à déplier
            // une liste de quinze lignes pour lire un chiffre était du travail
            // demandé au lecteur pour rien.
            if (v === undefined) {
              return <div key={y} className="hors" title={titre}>{corps}</div>;
            }
            return (
              <button key={y} type="button" className={sel === y ? "on" : ""}
                      aria-expanded={sel === y} aria-label={titre}
                      title={n ? `${titre} · ${fill(t("fx.lieu.delib.n"), { n })}` : titre}
                      onClick={() => setOuvert(sel === y ? null : { annee: y, tone })}>
                {corps}
              </button>
            );
          })}
        </div>
        {sel === null && <p className="fx-v3-aide">{t("fx.lieu.delib.aide")}</p>}
        {sel !== null && (
          <div className="fx-v3-delib">
            <p className="hd">
              <span className="an mono">{sel}</span>
              <span className="mt">{eurTxt(parAn.get(sel) ?? 0)}</span>
              {lignes.length > 0
                ? fill(t("fx.lieu.delib.titre"), { n: lignes.length })
                : t("fx.lieu.delib.aucune")}
            </p>
            {lignes.map((d) => (
              <a key={d.reference + d.titre.slice(0, 20)} className="dl"
                 href={d.source_url || undefined} target="_blank" rel="noopener noreferrer">
                <span className="ref mono">{d.reference}</span>
                <span className="ti">{d.titre}</span>
              </a>
            ))}
            {lignes.length > 0 && (
              <p className="fx-v3-foot" style={{ marginTop: 10 }}>{t("fx.lieu.delib.note")}</p>
            )}
          </div>
        )}
      </>
    );
  };

  /* ── Les décisions : vedettes d'abord, récentes d'abord ──────────────── */
  type Moment = LieuFicheData["moments"][number];
  const hasRanking = lieu.moments.some((m) => m.vedette === false);
  const sorted = [...lieu.moments].sort((a, b) => seanceKey(b.seance) - seanceKey(a.seance));
  const shown = hasRanking ? sorted.filter((m) => m.vedette !== false) : sorted.slice(0, 4);
  const rest = hasRanking ? sorted.filter((m) => m.vedette === false) : sorted.slice(4);
  const restSpan = minMax(rest.map((m) => Math.floor(seanceKey(m.seance) / 100)).filter((y) => y > 0));
  const bmo = [...lieu.bmo_extraits].sort((a, b) => b.date.localeCompare(a.date));

  /* ── Lead : première phrase de Wikipédia, le reste à un clic ─────────── */
  const extract = (en ? lieu.wiki.extract_en : null) || lieu.wiki.extract || "";
  const cut = extract.indexOf(". ");
  const leadMain = cut > 0 ? extract.slice(0, cut + 1) : extract;

  const MomentRow = (m: Moment) => (
    <a key={m.id} className="fx-v3-mom fx-row-link" href={m.source_url ?? undefined} target="_blank" rel="noopener noreferrer">
      <span className="d tnum">{seanceEn(m.seance, locale)}</span>
      <span className="t">{cap((en && m.pourquoi_en) || m.pourquoi || m.fait)}</span>
      <span className="c" aria-hidden="true">↗</span>
      {m.pourquoi && <span className="s">{firstSentence((en && m.fait_en) || m.fait)}</span>}
    </a>
  );

  const MarcheRow = (m: (typeof marches)[number]) => (
    <Link key={m.numero_marche} href={`${basePath}/marches/contrat/${encodeURIComponent(m.numero_marche)}`} scroll={false} className="fx-v3-row fx-row-link">
      <span className="lbl">
        {m.objet_clair || normalizeObjet(m.objet)}
        <span aria-hidden="true" className="muted"> →</span>
        {m.fournisseur && <span className="sub">{m.fournisseur}{m.date_notification ? ` · ${m.date_notification.slice(0, 4)}` : ""}</span>}
      </span>
      <Eur {...fmtEur(m.montant_max)} size={14} />
    </Link>
  );

  return (
    <div className="fx-v3">
      {/* ── Le premier écran : le nom (au-dessus, dans la page), le chiffre,
       *    les deux flux et la photo, ensemble. Avant, le chiffre n'arrivait
       *    qu'à 800 px du haut, sous la ligne de flottaison d'un portable :
       *    toute la promesse de la page est l'argent et il fallait défiler
       *    pour le voir. La photo passe à droite du chiffre au lieu de le
       *    repousser ; le petit livre de compte reprend les deux couleurs des
       *    graphes du dessous, pour que l'œil les retrouve. */}
      {(reelTotal > 0 || plafond > 0 || lieu.photo) && (
        <div className={`fx-lieu-hero${lieu.photo ? "" : " sans-photo"}`}>
          <div className="fx-lieu-hero-txt">
            {reelTotal > 0 ? (
              <>
                <div className="fx-v3-hero-num tnum">{fmtEur(heroTotal).v}<span className="u">{fmtEur(heroTotal).u}</span></div>
                <div className="fx-v3-hero-cap">
                  {verseSpan && verseSpan[0] !== verseSpan[1]
                    ? fill(t("fx.lieu.hero.verse"), { y: heroDepuis })
                    : fill(t("fx.lieu.hero.verse_one"), { y: verseSpan?.[1] ?? "" })}
                </div>
                {(subvDansFenetre > 0 || travauxDansFenetre > 0) && (
                  <div className="fx-lieu-ledger" aria-hidden="true">
                    {subvDansFenetre > 0 && (
                      <div className="r x">
                        <span className="l">{cap(fill(t("fx.lieu.line.exploitant"), { k: kindTxt }))}</span>
                        <span className="a tnum">{eurTxt(subvDansFenetre)}</span>
                        <span className="p tnum">{pctTxt(subvDansFenetre)}</span>
                        <span className="b"><span style={{ width: `${(subvDansFenetre / (heroTotal || 1)) * 100}%` }} /></span>
                      </div>
                    )}
                    {travauxDansFenetre > 0 && (
                      <div className="r w">
                        <span className="l">{t("fx.lieu.line.travaux")}</span>
                        <span className="a tnum">{eurTxt(travauxDansFenetre)}</span>
                        <span className="p tnum">{pctTxt(travauxDansFenetre)}</span>
                        <span className="b"><span style={{ width: `${(travauxDansFenetre / (heroTotal || 1)) * 100}%` }} /></span>
                      </div>
                    )}
                  </div>
                )}
              </>
            ) : plafond > 0 ? (
              <>
                <div className="fx-v3-hero-num tnum">{fmtEur(plafond).v}<span className="u">{fmtEur(plafond).u}</span></div>
                <div className="fx-v3-hero-cap">{t("fx.lieu.hero.engage")}</div>
              </>
            ) : null}
            {leadMain && (
              <p className="fx-v3-lead">
                {leadMain}{" "}
                {lieu.wiki.url && (
                  <a href={lieu.wiki.url} target="_blank" rel="noopener noreferrer" className="fx-v3-lead-link">
                    {en ? "Wikipedia ↗" : "Wikipédia ↗"}
                  </a>
                )}
              </p>
            )}
          </div>
          {lieu.photo && (
            <div className="fx-lieu-hero-photo">
              <img src={lieu.photo} alt={lieu.name} className="fx-v3-photo" />
              {lieu.photo_credit?.url && (
                <a href={lieu.photo_credit.url} target="_blank" rel="noopener noreferrer" className="fx-v3-credit">
                  {lieu.photo_credit.licence ? `© ${lieu.photo_credit.licence} · ` : ""}
                  {lieu.photo_credit.source}
                </a>
              )}
            </div>
          )}
        </div>
      )}
      {reelTotal === 0 && plafond === 0 && lieu.residents.length === 0 && (
        <p className="fx-v3-foot" style={{ margin: "20px 0 32px" }}>{t("fx.lieu.argent_absent")}</p>
      )}

      {/* ── Où va l'argent ─────────────────────────────────────────────── */}
      {(subv || travauxTotal > 0 || marches.length > 0 || lieu.residents.length > 0) && (
        <section className="fx-v3-section">
          <h2 className="fx-v3-h2">{t("fx.lieu.h.argent")}</h2>
          <div className="fx-v3-rule" />

          {subv && (
            <div className="fx-v3-line">
              <div className="t">
                <Link href={`${basePath}/subventions/association/${assocSlug(subv.nom_fiche)}`} scroll={false} style={{ color: "inherit" }}>
                  {cap(fill(t("fx.lieu.line.exploitant"), { k: kindTxt }))}<span aria-hidden="true" className="muted"> →</span>
                </Link>
              </div>
              <div className="a">
                <Eur {...fmtEur(subvDansFenetre)} />
                <div className="q">{t("fx.lieu.q.verses")} · {subv.rows.length > 1 ? spanTxt(parseInt(subv.annees[0], 10), parseInt(subv.annees[1], 10)) : subv.annees[0]}</div>
              </div>
              <div className="s">
                {t("fx.lieu.line.exploitant_sub")}{" "}
                <Link href={`${basePath}/subventions/association/${assocSlug(subv.nom_fiche)}`} scroll={false}>{subv.nom_fiche} →</Link>
                {subv.note_publique && <> {(en && subv.note_publique_en) || subv.note_publique}</>}
              </div>
              <Years series={exploitSeries} tone="x" />
              {showBars && <div className="bar x"><div className="track"><span style={{ width: `${(subvDansFenetre / (barMaxF || 1)) * 100}%` }} /></div><i className="tnum">{pctTxt(subvDansFenetre)}</i></div>}
              {subv.rows.length > 1 && (
                <div className="fold-wrap">
                  <Fold label={fill(t("fx.lieu.subv_deplier"), { n: subv.rows.length })}>
                    {subv.rows.map((r) => (
                      <div key={r.annee} className="fx-v3-row">
                        <span className="lbl mono">{r.annee}</span>
                        <Eur {...fmtEur(r.montant_eur)} size={14} />
                      </div>
                    ))}
                  </Fold>
                </div>
              )}
            </div>
          )}

          {(travauxTotal > 0 || marches.length > 0) && (() => {
            const paye = travauxTotal > 0;
            return (
              <div className="fx-v3-line">
                <div className="t">{t("fx.lieu.line.travaux")}</div>
                <div className="a">
                  <Eur {...fmtEur(paye ? travauxDansFenetre : plafond)} />
                  <div className="q">
                    {paye
                      ? <>{t("fx.lieu.q.payes")}{axe && travauxDansFenetre > 0
                            ? ` · ${spanTxt(Math.max(axe.de, travauxSpan ? travauxSpan[0] : axe.de), travauxSpan ? travauxSpan[1] : axe.a)}`
                            : (travauxSpan ? ` · ${spanTxt(...travauxSpan)}` : "")}</>
                      : <>{t("fx.lieu.q.plafond")}{marcheSpan ? ` · ${spanTxt(...marcheSpan)}` : ""}</>}
                  </div>
                </div>
                {paye && (
                  <div className="s">{fill(t(nChantiers === 1 ? "fx.lieu.line.travaux_sub1" : "fx.lieu.line.travaux_sub"), { n: nChantiers })}</div>
                )}
                {marches.length > 0 && (
                  <div className="s">
                    {cap(fill(t(marches.length === 1 ? "fx.lieu.line.contrats1" : "fx.lieu.line.contrats"), {
                      n: marches.length,
                      a: marcheSpan ? spanTxt(...marcheSpan) : "",
                      m: eurTxt(plafond),
                    }))}
                  </div>
                )}
                <Years series={travauxSeries} tone="w" />
                {showBars && <div className="bar w"><div className="track"><span style={{ width: `${(travauxDansFenetre / (barMaxF || 1)) * 100}%` }} /></div><i className="tnum">{pctTxt(travauxDansFenetre)}</i></div>}
                <div className="fold-wrap">
                  {paye && nChantiers > 0 && (
                    <Fold label={fill(t(nChantiers === 1 ? "fx.lieu.fold_chantier1" : "fx.lieu.fold_chantiers"), { n: nChantiers })}>
                      {lieu.mandate?.operations.map((o) => {
                        const ys = minMax(Object.keys(o.mandate_par_annee).map(Number));
                        return (
                          <a key={o.ap_cle ?? o.ap_texte} className="fx-v3-row fx-row-link" href={o.source_url} target="_blank" rel="noopener noreferrer">
                            <span className="lbl">
                              {o.ap_texte}
                              <span aria-hidden="true" className="muted"> ↗</span>
                              <span className="sub">{ys ? `${spanTxt(...ys)} · ` : ""}{t("fx.lieu.src_ca")}</span>
                            </span>
                            <Eur {...fmtEur(o.total_mandate)} size={14} />
                          </a>
                        );
                      })}
                      {lieu.invest.map((r, i) => {
                        const body = (
                          <>
                            <span className="lbl">
                              {r.nom_projet}
                              {r.id && <span aria-hidden="true" className="muted"> →</span>}
                              <span className="sub">{r.annee} · {t("fx.lieu.src_ca")}</span>
                            </span>
                            <Eur {...fmtEur(r.montant_eur)} size={14} />
                          </>
                        );
                        return r.id ? (
                          <Link key={i} href={`${basePath}/investissements/projet/${encodeURIComponent(r.id)}`} scroll={false} className="fx-v3-row fx-row-link">{body}</Link>
                        ) : (
                          <div key={i} className="fx-v3-row">{body}</div>
                        );
                      })}
                    </Fold>
                  )}
                  {marches.length > 0 && (
                    <Fold label={fill(t(marches.length === 1 ? "fx.lieu.fold_contrat1" : "fx.lieu.fold_contrats"), { n: marches.length })}>
                      {marches.map(MarcheRow)}
                    </Fold>
                  )}
                </div>
              </div>
            );
          })()}

          {lieu.residents.length > 0 && (
            <div className="fx-v3-line">
              <div className="t">{t("fx.lieu.h.residents")}</div>
              <div className="a" />
              <div className="s">{t("fx.lieu.residents_intro")}</div>
              <div className="fold-wrap" style={{ marginTop: 4 }}>
                {lieu.residents.map((r, i) => (
                  <Link key={i} href={`${basePath}/subventions/association/${assocSlug(r.beneficiaire)}`} scroll={false} className="fx-v3-row fx-row-link">
                    <span className="lbl">{r.beneficiaire} <span aria-hidden="true" className="muted">→</span></span>
                    {r.montant_total > 0 && <Eur {...fmtEur(r.montant_total)} size={14} />}
                  </Link>
                ))}
              </div>
            </div>
          )}

          {horsFenetre.length > 0 && (
            <p className="fx-v3-avant">
              {horsFenetre.map((h, i) => {
                const ys = h.serie.filter((r) => r.year < seuil).map((r) => r.year);
                return (
                  <span key={i}>
                    {i > 0 ? " " : ""}
                    {cap(fill(t("fx.lieu.avant_seuil"), {
                      m: eurTxt(h.montant), l: h.label, a: Math.min(...ys), b: Math.max(...ys), s: seuil,
                    }))}
                  </span>
                );
              })}
            </p>
          )}

          {(marches.length > 0 || lieu.mandate) && (
            <p className="fx-v3-foot">
              {marches.length > 0 ? (heroTotal > 0 ? fill(t("fx.lieu.note.total"), { t: eurTxt(heroTotal) }) : t("fx.lieu.note.plafond_seul")) : ""}
              {lieu.mandate && t("fx.lieu.line.travaux_caveat")
                ? ` ${fill(t("fx.lieu.line.travaux_caveat"), { y: lieu.mandate.periode[1] })}` : ""}
            </p>
          )}
        </section>
      )}

      {/* ── Ce que le Conseil de Paris en a dit ────────────────────────── */}
      {(lieu.moments.length > 0 || bmo.length > 0) && (
        <section className="fx-v3-section">
          <h2 className="fx-v3-h2">{t("fx.lieu.h.conseil")}</h2>
          {lieu.moments.length > 0 && (
            <p className="fx-v3-h2sub">
              {(() => {
                const lus = lieu.stats.n_lus ?? lieu.moments.length;
                const n = shown.length;
                const key = n === 1 && lus === 1 ? "fx.lieu.conseil_sub_11"
                  : n === 1 ? (hasRanking ? "fx.lieu.conseil_sub_1" : "fx.lieu.conseil_sub_all_1")
                  : lus === 1 ? "fx.lieu.conseil_sub_lus1"
                  : hasRanking ? "fx.lieu.conseil_sub" : "fx.lieu.conseil_sub_all";
                return fill(t(key), { n, lus });
              })()}
            </p>
          )}
          <div className="fx-v3-rule" />
          {shown.map(MomentRow)}
          <div className="fx-v3-more">
            {rest.length > 0 && (
              <Fold label={fill(t(rest.length === 1 ? "fx.lieu.more_moments1" : "fx.lieu.more_moments"), { n: rest.length, a: restSpan ? spanTxt(...restSpan) : "" })}>
                {rest.map(MomentRow)}
              </Fold>
            )}
            {bmo.length > 0 && (
              <p>
                {t("fx.lieu.bmo_line")}{" "}
                {bmo.map((b, i) => (
                  <span key={i}>
                    {i > 0 ? " · " : ""}
                    <a href={b.source_url} target="_blank" rel="noopener noreferrer" title={((en && b.extrait_en) || b.extrait).slice(0, 160)}>{b.date.slice(0, 4)}</a>
                  </span>
                ))}
              </p>
            )}
            {lieu.moments.length > 0 && (
              <p><a href={lieu.sources.delibs.url} target="_blank" rel="noopener noreferrer">{t("fx.lieu.delibs_all")}</a></p>
            )}
          </div>
        </section>
      )}
    </div>
  );
}

// nudge 1789140718

// nudge 1789140752

// nudge 1789140932
