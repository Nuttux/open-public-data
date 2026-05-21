"use client";

import { useEffect, useState } from "react";
import type { CSSProperties } from "react";
import Navbar from "@/components/fusion/Navbar";
import Footer from "@/components/fusion/Footer";
import SectionHead from "@/components/fusion/SectionHead";
import Button from "@/components/fusion/Button";
import DataProvenance from "@/components/fusion/DataProvenance";
import { useLocale } from "@/lib/localeContext";
import { TIMELINE_AXIS_START, TIMELINE_AXIS_END } from "@/lib/methodology";

type SourceRow = {
  portal: string;
  url: string;
  datasets: string;
  freshness: string;
};

type AuditCheck = {
  id: string;
  category: string;
  label: string;
  status: "pass" | "warn" | "fail";
  threshold?: string;
  actual?: string;
  note?: string;
  sources?: string[];
};

type AuditPayload = {
  schema_version: number;
  generated_at: string;
  project: string;
  summary: { total: number; pass: number; warn: number; fail: number };
  checks: AuditCheck[];
};

type CoverageRow = {
  label: string;
  volume?: string;
  href?: string;
  status: "ok" | "warn" | "info";
  statusLabel: string;
  segments: { start: number; end: number; text: string; kind?: "frozen" | "partial" }[];
};

type ToolChip = { chartId: string; kicker: string };

const AXIS_START = TIMELINE_AXIS_START;
const AXIS_END = TIMELINE_AXIS_END;
const AXIS_SPAN = AXIS_END - AXIS_START + 1;

function barStyle(start: number, end: number): CSSProperties {
  const left = ((start - AXIS_START) / AXIS_SPAN) * 100;
  const width = ((end - start + 1) / AXIS_SPAN) * 100;
  return { left: `${left}%`, width: `${width}%` };
}

// ── French data ──────────────────────────────────────────────────────────────

const SOURCES_FR: SourceRow[] = [
  { portal: "OpenData Paris", url: "opendata.paris.fr", datasets: "Budget M57, marchés publics, subventions, logements sociaux, AP, bilan comptable, dette-garantie — 8 datasets", freshness: "Quotidien à annuel selon dataset" },
  { portal: "data.gouv.fr — DECP", url: "data.gouv.fr / decp", datasets: "Données Essentielles de la Commande Publique consolidées (filtre SIRET 217500* Paris)", freshness: "Fichiers annuels 2019-2026" },
  { portal: "INSEE — SIRENE", url: "data.gouv.fr / sirene", datasets: "Registre entreprises (SIRET, APE, effectifs, établissements) · enrichissement tier2 gratuit", freshness: "Mensuel" },
  { portal: "Base Adresse Nationale", url: "api-adresse.data.gouv.fr", datasets: "Géocodage des adresses de projets d'investissement", freshness: "Temps réel" },
  { portal: "cdn.paris.fr (PDFs)", url: "cdn.paris.fr", datasets: "Annexes CA (investissements localisés), Rapport d'Orientation Budgétaire, compte de gestion", freshness: "Annuel (juin N+1)" },
  { portal: "DRIHL Île-de-France", url: "drihl.ile-de-france…gouv.fr", datasets: "Inventaire SRU, parc social au 1er janvier, Socle demandes/attributions logement social", freshness: "Annuel" },
];

const COVERAGE_FR: CoverageRow[] = [
  { label: "Budget exécuté (CA)", volume: "25 629 lignes", href: "https://opendata.paris.fr/explore/dataset/comptes-administratifs-budgets-principaux-a-partir-de-2019-m57-ville-departement/", status: "ok", statusLabel: "À jour", segments: [{ start: 2018, end: 2024, text: "2018-2024" }] },
  { label: "Budget voté (BP)", volume: "8 598 lignes", href: "https://opendata.paris.fr/explore/dataset/budgets-votes-principaux-a-partir-de-2019-m57-ville-departement/", status: "ok", statusLabel: "À jour", segments: [{ start: 2019, end: 2026, text: "2019-2026" }] },
  { label: "Subventions", volume: "38 839 lignes · gap 2020-2021 (format non-comparable)", href: "https://opendata.paris.fr/explore/dataset/subventions-versees-annexe-compte-administratif-a-partir-de-2018/", status: "info", statusLabel: "Partiel", segments: [{ start: 2018, end: 2019, text: "2018-2019", kind: "partial" }, { start: 2022, end: 2024, text: "2022-2024" }] },
  { label: "Marchés publics", volume: "23 053 contrats (Ville + DECP national)", href: "https://opendata.paris.fr/explore/dataset/liste-des-marches-de-la-collectivite-parisienne/", status: "ok", statusLabel: "À jour", segments: [{ start: 2013, end: 2026, text: "2013-2026 · fusion opendata.paris.fr + DECP nationale" }] },
  { label: "Concurrence (offresRecues DECP)", volume: "champ non historisé avant 2024", href: "https://www.data.gouv.fr/fr/datasets/donnees-essentielles-de-la-commande-publique-fichiers-consolides/", status: "info", statusLabel: "Partiel", segments: [{ start: 2024, end: 2025, text: "2024-2025", kind: "partial" }] },
  { label: "Investissements (dataset AP)", volume: "dataset gelé", href: "https://opendata.paris.fr/explore/dataset/comptes-administratifs-autorisations-de-programmes-a-partir-de-2018-m57-ville-de/", status: "warn", statusLabel: "Gelé", segments: [{ start: 2018, end: 2022, text: "2018-2022 · gelé", kind: "frozen" }] },
  { label: "Investissements (PDF IL)", volume: "~450 projets/an", href: "https://cdn.paris.fr/paris/2025/06/25/ca-2024-annexe-il-UtMj.PDF", status: "info", statusLabel: "Partiel", segments: [{ start: 2018, end: 2024, text: "2018-2024 (CA)", kind: "partial" }, { start: 2025, end: 2026, text: "2025-2026 (BP)", kind: "partial" }] },
  { label: "Match projets ↔ marchés", volume: "4 322 appariements (seed)", href: "https://github.com/AbstractsMachine/france-open-data-pipeline/blob/main/pipeline/seeds/seed_match_projet_marches.csv", status: "ok", statusLabel: "À jour", segments: [{ start: 2018, end: 2024, text: "2018-2024 · hash stable objet+titulaire" }] },
  { label: "Logements sociaux financés", volume: "4 174 opérations", href: "https://opendata.paris.fr/explore/dataset/logements-sociaux-finances-a-paris/", status: "ok", statusLabel: "À jour", segments: [{ start: 2013, end: 2024, text: "2001-2024 (affiché 2013+)" }] },
  { label: "Tension logement (Socle DRIHL)", volume: "20 arrondissements · 195 828 demandes / 9 098 attributions", href: "https://www.drihl.ile-de-france.developpement-durable.gouv.fr/socle-de-donnees-demandes-et-attributions-de-a1414.html", status: "info", statusLabel: "Partiel", segments: [{ start: 2024, end: 2024, text: "2024 (série démarrée)", kind: "partial" }] },
  { label: "Bilan comptable", volume: "1 bilan/an", href: "https://opendata.paris.fr/explore/dataset/bilan-comptable/", status: "ok", statusLabel: "À jour", segments: [{ start: 2019, end: 2024, text: "2019-2024" }] },
  { label: "Hors-bilan (dette garantie)", volume: "9 960 emprunts · 12,3 Md€ capital restant dû 2024", href: "https://opendata.paris.fr/explore/dataset/dette-garantie/", status: "ok", statusLabel: "À jour", segments: [{ start: 2019, end: 2024, text: "2019-2024" }] },
];

const TOOLS_FR: ToolChip[] = [
  { chartId: "budget-sankey-paris", kicker: "Budget" },
  { chartId: "subventions-treemap-paris", kicker: "Subventions" },
  { chartId: "marches-fournisseurs-paris", kicker: "Marchés" },
  { chartId: "investissements-map-paris", kicker: "Investissements" },
  { chartId: "logement-map-paris", kicker: "Logement" },
  { chartId: "dette-sankey-paris", kicker: "Dette" },
];

// ── English data ─────────────────────────────────────────────────────────────

const SOURCES_EN: SourceRow[] = [
  { portal: "OpenData Paris", url: "opendata.paris.fr", datasets: "M57 budget, public contracts, grants, social housing, AP, balance sheet, guaranteed debt — 8 datasets", freshness: "Daily to annual depending on dataset" },
  { portal: "data.gouv.fr — DECP", url: "data.gouv.fr / decp", datasets: "Consolidated Essential Public Procurement Data (SIRET 217500* Paris filter)", freshness: "Yearly files 2019-2026" },
  { portal: "INSEE — SIRENE", url: "data.gouv.fr / sirene", datasets: "Business register (SIRET, activity codes, headcount, sites) · free tier2 enrichment", freshness: "Monthly" },
  { portal: "Base Adresse Nationale", url: "api-adresse.data.gouv.fr", datasets: "Address geocoding for investment projects", freshness: "Real time" },
  { portal: "cdn.paris.fr (PDFs)", url: "cdn.paris.fr", datasets: "CA appendices (localised investments), Budget Orientation Report, management account", freshness: "Annual (June N+1)" },
  { portal: "DRIHL Île-de-France", url: "drihl.ile-de-france…gouv.fr", datasets: "SRU inventory, social housing stock at January 1st, Socle of applications/allocations", freshness: "Annual" },
];

const COVERAGE_EN: CoverageRow[] = [
  { label: "Executed budget (CA)", volume: "25,629 rows", href: "https://opendata.paris.fr/explore/dataset/comptes-administratifs-budgets-principaux-a-partir-de-2019-m57-ville-departement/", status: "ok", statusLabel: "Up to date", segments: [{ start: 2018, end: 2024, text: "2018-2024" }] },
  { label: "Voted budget (BP)", volume: "8,598 rows", href: "https://opendata.paris.fr/explore/dataset/budgets-votes-principaux-a-partir-de-2019-m57-ville-departement/", status: "ok", statusLabel: "Up to date", segments: [{ start: 2019, end: 2026, text: "2019-2026" }] },
  { label: "Grants", volume: "38,839 rows · 2020-2021 gap (non-comparable format)", href: "https://opendata.paris.fr/explore/dataset/subventions-versees-annexe-compte-administratif-a-partir-de-2018/", status: "info", statusLabel: "Partial", segments: [{ start: 2018, end: 2019, text: "2018-2019", kind: "partial" }, { start: 2022, end: 2024, text: "2022-2024" }] },
  { label: "Public contracts", volume: "23,053 contracts (City + national DECP)", href: "https://opendata.paris.fr/explore/dataset/liste-des-marches-de-la-collectivite-parisienne/", status: "ok", statusLabel: "Up to date", segments: [{ start: 2013, end: 2026, text: "2013-2026 · opendata.paris.fr + national DECP merge" }] },
  { label: "Competition (DECP offresRecues)", volume: "field not historised before 2024", href: "https://www.data.gouv.fr/fr/datasets/donnees-essentielles-de-la-commande-publique-fichiers-consolides/", status: "info", statusLabel: "Partial", segments: [{ start: 2024, end: 2025, text: "2024-2025", kind: "partial" }] },
  { label: "Investments (AP dataset)", volume: "dataset frozen", href: "https://opendata.paris.fr/explore/dataset/comptes-administratifs-autorisations-de-programmes-a-partir-de-2018-m57-ville-de/", status: "warn", statusLabel: "Frozen", segments: [{ start: 2018, end: 2022, text: "2018-2022 · frozen", kind: "frozen" }] },
  { label: "Investments (IL PDFs)", volume: "~450 projects/yr", href: "https://cdn.paris.fr/paris/2025/06/25/ca-2024-annexe-il-UtMj.PDF", status: "info", statusLabel: "Partial", segments: [{ start: 2018, end: 2024, text: "2018-2024 (CA)", kind: "partial" }, { start: 2025, end: 2026, text: "2025-2026 (BP)", kind: "partial" }] },
  { label: "Project ↔ contract match", volume: "4,322 matches (seed)", href: "https://github.com/AbstractsMachine/france-open-data-pipeline/blob/main/pipeline/seeds/seed_match_projet_marches.csv", status: "ok", statusLabel: "Up to date", segments: [{ start: 2018, end: 2024, text: "2018-2024 · stable hash object+awardee" }] },
  { label: "Funded social housing", volume: "4,174 operations", href: "https://opendata.paris.fr/explore/dataset/logements-sociaux-finances-a-paris/", status: "ok", statusLabel: "Up to date", segments: [{ start: 2013, end: 2024, text: "2001-2024 (shown 2013+)" }] },
  { label: "Housing pressure (DRIHL Socle)", volume: "20 districts · 195,828 applications / 9,098 allocations", href: "https://www.drihl.ile-de-france.developpement-durable.gouv.fr/socle-de-donnees-demandes-et-attributions-de-a1414.html", status: "info", statusLabel: "Partial", segments: [{ start: 2024, end: 2024, text: "2024 (series starting)", kind: "partial" }] },
  { label: "Balance sheet", volume: "1 bs/yr", href: "https://opendata.paris.fr/explore/dataset/bilan-comptable/", status: "ok", statusLabel: "Up to date", segments: [{ start: 2019, end: 2024, text: "2019-2024" }] },
  { label: "Off-balance-sheet (guaranteed debt)", volume: "9,960 loans · €12.3bn outstanding in 2024", href: "https://opendata.paris.fr/explore/dataset/dette-garantie/", status: "ok", statusLabel: "Up to date", segments: [{ start: 2019, end: 2024, text: "2019-2024" }] },
];

const TOOLS_EN: ToolChip[] = [
  { chartId: "budget-sankey-paris", kicker: "Budget" },
  { chartId: "subventions-treemap-paris", kicker: "Grants" },
  { chartId: "marches-fournisseurs-paris", kicker: "Contracts" },
  { chartId: "investissements-map-paris", kicker: "Investments" },
  { chartId: "logement-map-paris", kicker: "Housing" },
  { chartId: "dette-sankey-paris", kicker: "Debt" },
];

// ── Component ────────────────────────────────────────────────────────────────

export default function MethodeClient() {
  const { locale } = useLocale();
  const isFr = locale === "fr";
  const [audit, setAudit] = useState<AuditPayload | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/data/data_quality_audit.json")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => { if (!cancelled && data) setAudit(data); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  const SOURCES = isFr ? SOURCES_FR : SOURCES_EN;
  const COVERAGE = isFr ? COVERAGE_FR : COVERAGE_EN;
  const TOOLS = isFr ? TOOLS_FR : TOOLS_EN;

  const years: number[] = [];
  for (let y = AXIS_START; y <= AXIS_END; y++) years.push(y);

  return (
    <div className="theme-fusion">
      <Navbar />
      <main id="main-content" tabIndex={-1}>

      {/* HERO ──────────────────────────────────────────────────────────── */}
      <section className="fx-page-header">
        <div className="fx-wrap">
          <div className="fx-page-kicker">{isFr ? "— Méthode" : "— Method"}</div>
          <h1 className="fx-page-title">
            {isFr ? <>Tout est <em>déjà</em> public.</> : <>It&apos;s all <em>already</em> public.</>}
          </h1>
          <p className="fx-page-lede">
            {isFr
              ? "Tout ce que vous lisez ici, la Ville l'a déjà publié quelque part — un dataset OpenData, une annexe comptable, un PDF du compte de gestion. Notre boulot : relier, renommer en français courant, rendre l'ensemble lisible. Le pipeline est ouvert, chaque chiffre se recalcule depuis la source."
              : "Everything you read here, the City has already published somewhere — an OpenData dataset, an accounting appendix, a PDF from the management account. Our job: connect, rename in plain language, make it all readable. The pipeline is open, every figure can be recalculated from the source."}
          </p>
          <div className="fx-page-actions" style={{ marginTop: 28 }}>
            <Button variant="primary" href="#sources">{isFr ? "Voir les sources" : "See the sources"}</Button>
            <Button href="https://github.com/AbstractsMachine/france-open-data-pipeline">{isFr ? "Le code sur GitHub ↗" : "Code on GitHub ↗"}</Button>
          </div>
          <div className="fx-toc" style={{ marginTop: 32 }}>
            <a href="#sources">01 · {isFr ? "Sources" : "Sources"}</a>
            <a href="#construction">02 · {isFr ? "Construction" : "Construction"}</a>
            <a href="#couverture">03 · {isFr ? "Couverture" : "Coverage"}</a>
            <a href="#audit">04 · {isFr ? "Audit & limites" : "Audit & limits"}</a>
            <a href="#engagements">05 · {isFr ? "Engagements" : "Commitments"}</a>
          </div>
        </div>
      </section>

      {/* 01 · D'OÙ ÇA VIENT ────────────────────────────────────────────── */}
      <section id="sources" className="fx-section">
        <div className="fx-wrap">
          <SectionHead
            number="01"
            kind={isFr ? "Sources" : "Sources"}
            title={isFr ? <>D&apos;où vient <em>chaque chiffre</em></> : <>Where <em>each figure</em> comes from</>}
            subtitle={isFr ? "Six portails officiels. Aucun autre." : "Six official portals. Nothing else."}
          />

          <p style={{ maxWidth: 780, marginBottom: 28, lineHeight: 1.55 }}>
            {isFr
              ? <><b>De la Ville, et seulement de la Ville.</b> Aucune donnée n&apos;est reconstruite, aucune n&apos;est estimée. Les ratios financiers qualitatifs non publiés en open data (taux moyen pondéré, maturité de dette) sont explicitement marqués « indicatifs » sur leur fiche.</>
              : <><b>From the City, and only from the City.</b> No data is reconstructed or estimated. Qualitative financial ratios not published as open data (weighted average rate, debt maturity) are explicitly flagged as "indicative" on their panel.</>}
          </p>

          <div className="fx-sources-table">
            <div className="fx-sources-table-head">
              <span>{isFr ? "Portail" : "Portal"}</span>
              <span>URL</span>
              <span>{isFr ? "Contenu utilisé" : "Content used"}</span>
              <span>{isFr ? "Mise à jour" : "Freshness"}</span>
            </div>
            {SOURCES.map((s, i) => (
              <div key={i} className="fx-sources-table-row">
                <span className="portal">{s.portal}</span>
                <span className="url"><code>{s.url}</code></span>
                <span className="datasets">{s.datasets}</span>
                <span className="fresh">{s.freshness}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 02 · COMMENT C'EST CONSTRUIT ──────────────────────────────────── */}
      <section id="construction" className="fx-section">
        <div className="fx-wrap">
          <SectionHead
            number="02"
            kind={isFr ? "Construction" : "Construction"}
            title={isFr ? <>De la source au <em>site</em>, en quatre étapes</> : <>From source to <em>site</em>, in four steps</>}
            subtitle={isFr ? "Un seul pipeline, rejoué à chaque nouvelle donnée publiée." : "One pipeline, replayed whenever new data is published."}
          />

          <div className="fx-flow-simple">
            <div className="fx-flow-simple-step">
              <div className="k">01</div>
              <h3>{isFr ? "On récupère" : "We fetch"}</h3>
              <p>{isFr
                ? "On télécharge les datasets publiés par la Ville, par l'État (DECP, INSEE) et par les services déconcentrés (DRIHL). On lit aussi les PDFs joints aux comptes annuels. Rien n'est transformé à cette étape : on archive la source telle quelle."
                : "We download datasets published by the City, by the State (DECP, INSEE) and by decentralised services (DRIHL). We also read the PDFs attached to annual accounts. Nothing is transformed here: the source is archived as-is."}</p>
            </div>
            <span className="fx-flow-simple-arrow">→</span>
            <div className="fx-flow-simple-step">
              <div className="k">02</div>
              <h3>{isFr ? "On relie & traduit" : "We stitch & translate"}</h3>
              <p>{isFr
                ? "On traduit les nomenclatures comptables en français courant et on joint les sources entre elles — par SIRET pour savoir qui reçoit, par adresse pour savoir où, par numéro de marché pour relier un contrat à son projet."
                : "We translate accounting nomenclatures into plain language and stitch the sources together — by SIRET to know who receives, by address to know where, by contract number to link a contract to its project."}</p>
            </div>
            <span className="fx-flow-simple-arrow">→</span>
            <div className="fx-flow-simple-step">
              <div className="k">03</div>
              <h3>{isFr ? "On enrichit" : "We enrich"}</h3>
              <p>{isFr
                ? "L'enrichissement tourne en deux niveaux. Gratuit : l'API publique SIRENE pour vérifier ~5 800 bénéficiaires (forme juridique, activité, siège). Optionnel : un modèle de langage classe les subventions par thème, géolocalise les projets d'investissement ambigus, vulgarise les intitulés techniques de marchés."
                : "Enrichment runs in two tiers. Free: public SIRENE API to verify ~5,800 recipients (legal form, activity, registered office). Optional: a language model tags grants by theme, geolocates ambiguous investment projects, and simplifies technical contract titles."}</p>
            </div>
            <span className="fx-flow-simple-arrow">→</span>
            <div className="fx-flow-simple-step">
              <div className="k">04</div>
              <h3>{isFr ? "On publie" : "We publish"}</h3>
              <p>{isFr
                ? "Le résultat est figé en fichiers JSON, versionnés avec le code. Le site lit ces fichiers directement — pas de base de données live, pas de calcul côté navigateur. Ce que vous voyez est exactement ce qui a été calculé."
                : "The result is frozen as JSON files, versioned with the code. The site reads these files directly — no live database, no browser-side computation. What you see is exactly what was computed."}</p>
            </div>
          </div>

          <p className="fx-note" style={{ marginTop: 18 }}>
            {isFr
              ? <><b>Règle absolue sur l&apos;enrichissement</b> : un modèle de langage n&apos;est utilisé que pour du texte — catégoriser, décrire, résumer, retrouver une adresse. <b>Aucun montant, aucun agrégat financier ne passe jamais par un LLM.</b> Les chiffres sortent d&apos;un calcul SQL déterministe sur les données brutes.</>
              : <><b>Hard rule on enrichment</b>: a language model is only used on text — to categorise, describe, summarise, find an address. <b>No amount, no financial aggregate ever goes through an LLM.</b> Numbers come from deterministic SQL run on raw data.</>}
          </p>

          {/* Tools bandeau — chaque chip ouvre la modal Provenance ──── */}
          <h3 style={{ marginTop: 44, marginBottom: 10, fontFamily: "var(--f-display)", fontSize: 22 }}>
            {isFr ? "La provenance, outil par outil" : "Provenance, tool by tool"}
          </h3>
          <p style={{ maxWidth: 720, marginBottom: 18, color: "var(--muted)", lineHeight: 1.55 }}>
            {isFr
              ? "Cliquer ouvre la chaîne complète source → BigQuery → mart, avec un lien direct vers chaque table publique."
              : "Click to open the full chain source → BigQuery → mart, with a direct link to each public table."}
          </p>
          <div className="fx-tool-tabs">
            {TOOLS.map((tool, i) => (
              <DataProvenance
                key={tool.chartId}
                chartId={tool.chartId}
                triggerClassName="fx-tool-tab"
                triggerChildren={
                  <>
                    <span className="num">{String(i + 1).padStart(2, "0")}</span>
                    <span className="lbl">{tool.kicker} ⓘ</span>
                  </>
                }
              />
            ))}
          </div>

          {/* Anti-double-counting (migrated from FAQ Q5 + Q7) ──────────── */}
          <div style={{ marginTop: 40, padding: "20px 22px", background: "var(--cream)", borderLeft: "3px solid var(--ink)" }}>
            <h3 style={{ marginBottom: 8, fontFamily: "var(--f-display)", fontSize: 18 }}>
              {isFr ? "Pourquoi Budget, Subventions et Marchés ne s'additionnent pas" : "Why Budget, Grants and Contracts don't add up"}
            </h3>
            <p style={{ marginBottom: 0, lineHeight: 1.6 }}>
              {isFr
                ? <>Ces trois pages sont des <b>lectures complémentaires</b>, pas trois calculs du même chiffre. Le budget contient une ligne agrégée de subventions ; notre page Subventions détaille cette même ligne côté bénéficiaires. Les marchés affichent des plafonds contractuels pluriannuels qui peuvent recouvrir plusieurs lignes budgétaires. Un même euro peut donc apparaître dans plusieurs pages sous des angles différents — on ne les additionne jamais. Côté pipeline, <code>core_budget</code>, <code>core_subventions</code>, <code>core_marches_publics</code> et <code>core_ap_projets</code> ne sont jamais UNIONés.</>
                : <>These three pages are <b>complementary readings</b>, not three computations of the same figure. The budget contains an aggregated grants line; our Grants page details that same line by recipient. Contracts show multi-year ceiling commitments which can span several budget lines. A given euro can therefore appear on several pages from different angles — we never sum them. In the pipeline, <code>core_budget</code>, <code>core_subventions</code>, <code>core_marches_publics</code> and <code>core_ap_projets</code> are never UNIONed.</>}
            </p>
          </div>

        </div>
      </section>

      {/* 03 · CE QUI EST À JOUR ────────────────────────────────────────── */}
      <section id="couverture" className="fx-section">
        <div className="fx-wrap">
          <SectionHead
            number="03"
            kind={isFr ? "Couverture & fraîcheur" : "Coverage & freshness"}
            title={isFr ? <>Ce qui est <em>à jour</em>, ce qui ne l&apos;est pas</> : <>What is <em>up to date</em>, what is not</>}
            subtitle={isFr ? "Les données publiées par la Ville ne sont pas toutes maintenues au même rythme." : "Not all data published by the City is maintained at the same pace."}
          />

          <div className="fx-timeline">
            <div className="fx-timeline-axis">
              <span className="lbl">{isFr ? "Outil" : "Tool"}</span>
              <div className="fx-timeline-years">
                {years.map((y) => (
                  <span key={y}>{y % 2 === 1 ? `'${String(y).slice(-2)}` : String(y).slice(-2)}</span>
                ))}
              </div>
            </div>
            {COVERAGE.map((row) => (
              <div key={row.label} className="fx-timeline-row">
                <div className="fx-timeline-label">
                  <div className="fx-timeline-label-main">
                    <span className="t">{row.label}</span>
                    {row.volume && <span className="vol">{row.volume}</span>}
                  </div>
                  <span className={`fx-timeline-status ${row.status}`}>{row.statusLabel}</span>
                </div>
                <div className="fx-timeline-bar">
                  {row.segments.map((s, i) => (
                    <span key={i} className={s.kind ?? ""} style={barStyle(s.start, s.end)}>
                      {s.text}
                    </span>
                  ))}
                </div>
                <div className="fx-timeline-link">
                  {row.href && (
                    <a href={row.href} target="_blank" rel="noopener noreferrer" aria-label={isFr ? `Source de ${row.label}` : `Source for ${row.label}`}>
                      {isFr ? "source ↗" : "source ↗"}
                    </a>
                  )}
                </div>
              </div>
            ))}
          </div>
          <p className="fx-note" style={{ marginTop: 18 }}>
            {isFr
              ? <><b>Règle</b> : l&apos;année en cours est toujours provisoire tant que le compte administratif définitif n&apos;est pas publié (~juin N+1). Les chiffres d&apos;une année non-close reposent sur le voté.</>
              : <><b>Rule</b>: the current year is always provisional until the final administrative account is published (~June N+1). Figures for an unclosed year are based on the voted budget.</>}
          </p>
        </div>
      </section>

      {/* 04 · AUDIT & LIMITES ──────────────────────────────────────────── */}
      <section id="audit" className="fx-section">
        <div className="fx-wrap">
          <SectionHead
            number="04"
            kind={isFr ? "Audit & limites" : "Audit & limits"}
            title={isFr ? <>Comment on <em>vérifie</em> nos chiffres</> : <>How we <em>verify</em> our figures</>}
            subtitle={isFr
              ? "Un audit re-jouable qui tourne à chaque update. Toute personne peut le relancer."
              : "A replayable audit that runs after every update. Anyone can re-run it."}
          />

          <p style={{ maxWidth: 820, marginBottom: 24, lineHeight: 1.6 }}>
            {isFr
              ? <>Trois familles de contrôles tournent sur chaque mise à jour : <b>réconciliation</b> (les totaux <code>core</code> doivent rejouer les totaux <code>staging</code>, au centime près), <b>complétude</b> (les enrichissements LLM et géoloc doivent dépasser des seuils documentés), <b>limites connues</b> (les trous de la source — années manquantes, datasets gelés — sont marqués comme tels). Le script <code>run_data_quality_audit.py</code> écrit le résultat en JSON, lu ci-dessous. <b>Aucun chiffre n&apos;est tapé à la main dans cette page.</b></>
              : <>Three families of checks run on every update: <b>reconciliation</b> (<code>core</code> totals must replay <code>staging</code> totals to the cent), <b>completeness</b> (LLM and geoloc enrichments must clear documented thresholds), <b>known limitations</b> (gaps in the source — missing years, frozen datasets — are flagged as such). The <code>run_data_quality_audit.py</code> script writes the result to JSON, loaded below. <b>Not a single figure on this page is typed by hand.</b></>}
          </p>

          {audit ? (
            <>
              <div className="fx-meth-stats" style={{ marginBottom: 24 }}>
                <div className="fx-meth-stat">
                  <span className="n">{isFr ? "Contrôles" : "Checks"}</span>
                  <span className="v">{audit.summary.total}</span>
                  <span className="c">{isFr ? "rejoués à chaque update" : "replayed on every update"}</span>
                </div>
                <div className="fx-meth-stat">
                  <span className="n">{isFr ? "Réussis" : "Passing"}</span>
                  <span className="v" style={{ color: "var(--fx-ok, #1e7e34)" }}>{audit.summary.pass}</span>
                  <span className="c">{isFr ? "dans les seuils" : "within thresholds"}</span>
                </div>
                <div className="fx-meth-stat">
                  <span className="n">{isFr ? "Warnings" : "Warnings"}</span>
                  <span className="v" style={{ color: "var(--fx-warn, #b97400)" }}>{audit.summary.warn}</span>
                  <span className="c">{isFr ? "limitations source documentées" : "documented source limitations"}</span>
                </div>
                <div className="fx-meth-stat">
                  <span className="n">{isFr ? "Échecs" : "Failures"}</span>
                  <span className="v" style={{ color: audit.summary.fail === 0 ? "var(--fx-ok, #1e7e34)" : "var(--fx-fail, #c0392b)" }}>{audit.summary.fail}</span>
                  <span className="c">{isFr ? "bloquant pour la publication" : "blocking publication"}</span>
                </div>
              </div>

              <p className="fx-note" style={{ marginBottom: 24 }}>
                {isFr
                  ? <>Dernier rejeu : <b>{new Date(audit.generated_at).toLocaleString("fr-FR", { dateStyle: "long", timeStyle: "short" })}</b> · Projet BigQuery <code>{audit.project}</code></>
                  : <>Last run: <b>{new Date(audit.generated_at).toLocaleString("en-GB", { dateStyle: "long", timeStyle: "short" })}</b> · BigQuery project <code>{audit.project}</code></>}
              </p>

              <div className="fx-audit-table">
                <div className="fx-audit-table-head">
                  <span>{isFr ? "Contrôle" : "Check"}</span>
                  <span>{isFr ? "Catégorie" : "Category"}</span>
                  <span>{isFr ? "Seuil" : "Threshold"}</span>
                  <span>{isFr ? "Statut · mesure" : "Status · value"}</span>
                </div>
                {audit.checks.map((c) => (
                  <div key={c.id} className="fx-audit-table-row">
                    <span className="check-label">{c.label}</span>
                    <span className="check-category">{c.category}</span>
                    <span className="check-threshold">{c.threshold ?? "—"}</span>
                    <span className="check-status">
                      <span
                        aria-label={c.status}
                        style={{
                          display: "inline-block",
                          padding: "2px 8px",
                          borderRadius: 4,
                          fontWeight: 600,
                          marginRight: 8,
                          color: c.status === "pass" ? "var(--fx-ok, #1e7e34)" : c.status === "warn" ? "var(--fx-warn, #b97400)" : "var(--fx-fail, #c0392b)",
                          background: c.status === "pass" ? "rgba(30, 126, 52, 0.10)" : c.status === "warn" ? "rgba(185, 116, 0, 0.10)" : "rgba(192, 57, 43, 0.10)",
                        }}
                      >
                        {c.status === "pass" ? "✓" : c.status === "warn" ? "⚠" : "✗"} {c.status.toUpperCase()}
                      </span>
                      {c.actual}
                    </span>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <p className="fx-note">{isFr ? "Chargement de l'audit…" : "Loading audit…"}</p>
          )}

          {/* LLM confidence ────────────────────────────────────────────── */}
          <div style={{ marginTop: 40 }}>
            <h3 style={{ marginBottom: 10, fontFamily: "var(--f-display)", fontSize: 20 }}>
              {isFr ? "Confiance LLM : auto-déclarée, pas encore mesurée" : "LLM confidence: self-declared, not yet measured"}
            </h3>
            <p style={{ lineHeight: 1.6, maxWidth: 820 }}>
              {isFr
                ? <>Les caches d&apos;enrichissement (thématique des subventions, géoloc des projets AP) portent une colonne <code>ode_confiance</code>. C&apos;est un score <b>auto-déclaré par le LLM</b>. Pour en faire une garantie externe, on tire un échantillon stratifié (60 lignes thématique + 40 géoloc) qu&apos;on annote à la main, et on compare la précision <em>mesurée</em> à la confidence déclarée par bucket. Le script et les échantillons : <a href="https://github.com/AbstractsMachine/france-open-data-pipeline/tree/main/pipeline/scripts/audit/calibration_samples" target="_blank" rel="noopener noreferrer">calibration_samples ↗</a>. La précision mesurée sera publiée ici dès qu&apos;elle est disponible.</>
                : <>Enrichment caches (grant theme, AP project geoloc) carry an <code>ode_confiance</code> column. It&apos;s a score <b>self-declared by the LLM</b>. To turn it into an external guarantee, we draw a stratified sample (60 theme + 40 geoloc rows), label it by hand, and compare measured precision to declared confidence per bucket. Script and samples: <a href="https://github.com/AbstractsMachine/france-open-data-pipeline/tree/main/pipeline/scripts/audit/calibration_samples" target="_blank" rel="noopener noreferrer">calibration_samples ↗</a>. Measured precision will appear here as soon as it is available.</>}
            </p>
          </div>

          {/* Divergence from City (migrated FAQ Q1+Q8) ─────────────────── */}
          <div style={{ marginTop: 36 }}>
            <h3 style={{ marginBottom: 10, fontFamily: "var(--f-display)", fontSize: 20 }}>
              {isFr ? "Quand nos chiffres diffèrent de ceux annoncés par la Ville" : "When our figures differ from the City's"}
            </h3>
            <p style={{ lineHeight: 1.6, maxWidth: 820 }}>
              {isFr
                ? <>Sur un même dataset, nos agrégats sont identiques à ceux de la Ville : on ne change pas les montants, on regroupe et on renomme. Les écarts viennent de trois causes : <b>(1) périmètre</b> — on publie le budget principal, la Ville peut communiquer un « groupe Ville » qui inclut les satellites ; <b>(2) timing</b> — notre chiffre vient du dernier dataset ouvert, qui peut être un cran derrière la communication officielle ; <b>(3) renommage</b> — on traduit chapitres et fonctions en libellés grand public, mais les agrégats restent ceux du M57. Si l&apos;écart persiste, c&apos;est un bug — <a href="/contact">dites-le-nous</a>.</>
                : <>On a given dataset, our aggregates match the City&apos;s: we don&apos;t change amounts, we regroup and rename. Gaps come from three causes: <b>(1) scope</b> — we publish the main budget, the City may communicate a "City group" that includes satellites; <b>(2) timing</b> — our figure comes from the latest open dataset, which can lag official communication by one step; <b>(3) renaming</b> — we translate chapters and functions to plain language, but aggregates remain those of M57. If the gap persists, it&apos;s a bug — <a href="/contact">tell us</a>.</>}
            </p>
          </div>

          {/* Compact cross-check footer ────────────────────────────────── */}
          <div style={{ marginTop: 32, padding: "16px 20px", background: "var(--cream)", display: "flex", gap: 18, flexWrap: "wrap", fontFamily: "var(--f-mono)", fontSize: 13 }}>
            <a href="/data/data_quality_audit.json" target="_blank" rel="noopener noreferrer">{isFr ? "JSON brut ↗" : "Raw JSON ↗"}</a>
            <a href="https://github.com/AbstractsMachine/france-open-data-pipeline/blob/main/pipeline/scripts/audit/run_data_quality_audit.py" target="_blank" rel="noopener noreferrer">{isFr ? "Script audit ↗" : "Audit script ↗"}</a>
            <a href="https://github.com/AbstractsMachine/france-open-data-pipeline/blob/main/docs/data-quality.md" target="_blank" rel="noopener noreferrer">{isFr ? "Doc data-quality ↗" : "Data-quality doc ↗"}</a>
            <a href="https://github.com/AbstractsMachine/france-open-data-pipeline/blob/main/docs/architecture-modelling.md" target="_blank" rel="noopener noreferrer">{isFr ? "Doc architecture ↗" : "Architecture doc ↗"}</a>
          </div>
        </div>
      </section>

      {/* 05 · ENGAGEMENTS ─────────────────────────────────────────────── */}
      <section id="engagements" className="fx-section">
        <div className="fx-wrap">
          <SectionHead
            number="05"
            kind={isFr ? "Engagements" : "Commitments"}
            title={isFr ? <>Pipeline AGPL, <em>corrections</em> traçables</> : <>AGPL pipeline, <em>traceable</em> corrections</>}
          />
          <p style={{ lineHeight: 1.6, maxWidth: 780 }}>
            {isFr
              ? <>Le pipeline (Python + dbt) est publié sous AGPL-3.0. Chaque chiffre se recalcule depuis sa source, chaque page expose son JSON. Erreur signalée = corrigée dans le code et consignée dans le changelog avec la date et l&apos;origine du signalement. On corrige en place et on garde la trace — pour que tout ancien screenshot reste vérifiable.</>
              : <>The pipeline (Python + dbt) is published under AGPL-3.0. Every figure can be recalculated from its source, every page exposes its JSON. Error reported = corrected in the code and recorded in the changelog with the date and source of the report. We correct in place and keep the trace — so any old screenshot remains verifiable.</>}
          </p>
          <div style={{ marginTop: 24, display: "flex", gap: 10, flexWrap: "wrap" }}>
            <Button variant="primary" href="/contact">{isFr ? "Signaler une erreur" : "Report an error"}</Button>
            <Button href="https://github.com/AbstractsMachine/france-open-data-pipeline">{isFr ? "Code sur GitHub ↗" : "Code on GitHub ↗"}</Button>
            <Button href="https://github.com/AbstractsMachine/france-open-data-pipeline/commits/main">{isFr ? "Historique des commits ↗" : "Commit history ↗"}</Button>
          </div>
        </div>
      </section>

      </main>
      <Footer />
    </div>
  );
}
