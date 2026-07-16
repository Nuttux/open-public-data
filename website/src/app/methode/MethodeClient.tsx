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
          <h1 className="fx-page-title">
            {isFr ? <>Notre méthode, <em>expliquée</em>.</> : <>Our method, <em>explained</em>.</>}
          </h1>
          <p className="fx-page-lede">
            {isFr
              ? "Les comptes de la Ville de Paris sont publics, mais éparpillés sur plusieurs portails et écrits dans un vocabulaire technique. Sur ce site, on les rassemble et on les présente en français courant."
              : "The City of Paris accounts are public, but scattered across several portals and written in technical language. This site brings them together and presents them in plain French."}
          </p>
          <div className="fx-toc" style={{ marginTop: 32 }}>
            <a href="#construction">01 · {isFr ? "Construction" : "Construction"}</a>
            <a href="#sources">02 · {isFr ? "Sources & provenance" : "Sources & provenance"}</a>
            <a href="#audit">03 · {isFr ? "Fraîcheur & audit" : "Freshness & audit"}</a>
            <a href="#engagements">04 · {isFr ? "Engagements" : "Commitments"}</a>
          </div>
        </div>
      </section>

      {/* 01 · CONSTRUCTION ─────────────────────────────────────────────── */}
      <section id="construction" className="fx-section">
        <div className="fx-wrap">
          <SectionHead
            number="01"
            kind={isFr ? "Construction" : "Construction"}
            title={isFr ? <>De la donnée brute au <em>chiffre lisible</em></> : <>From raw data to a <em>readable figure</em></>}
            subtitle={isFr ? "Toutes les sources passent par les mêmes quatre étapes, à chaque mise à jour." : "All sources go through the same four steps, on every update."}
          />

          <div className="fx-flow-simple">
            <div className="fx-flow-simple-step">
              <div className="k">01</div>
              <h3>{isFr ? "On récupère" : "We fetch"}</h3>
              <p>{isFr
                ? "On commence par télécharger les jeux de données ouverts publiés par la Ville, par l'État (commande publique nationale, registre des entreprises) et par les services déconcentrés en région (logement social). Quand un poste budgétaire n'apparaît pas dans ces fichiers (c'est souvent le cas du détail des investissements localisés à l'arrondissement), on va le lire directement dans le PDF du compte administratif. Aucune transformation à ce stade : on archive la source telle qu'elle a été publiée."
                : "We start by downloading the open datasets published by the City, by the State (national public procurement, business register) and by the regional decentralised services (social housing). When a budget item doesn't appear in those files (often the case for the detail of investments localised by arrondissement), we go read it directly in the administrative account PDF. No transformation at this stage: the source is archived as it was published."}</p>
            </div>
            <span className="fx-flow-simple-arrow">→</span>
            <div className="fx-flow-simple-step">
              <div className="k">02</div>
              <h3>{isFr ? "On relie & traduit" : "We stitch & translate"}</h3>
              <p>{isFr
                ? "Les libellés comptables officiels (chapitres, fonctions, codes M57) sont d'abord traduits en français courant. Puis les sources sont reliées entre elles. On identifie une entreprise qui touche une subvention via son numéro SIRET. Pour un projet d'investissement, c'est l'adresse précise qui permet de le situer. Et pour un marché public, son numéro permet de remonter au projet qu'il finance."
                : "The official accounting labels (chapters, functions, M57 codes) are first translated into plain language. Then sources are connected to each other. We identify the company receiving a grant by its SIRET number. For an investment project, the precise address is what locates it. And for a public contract, its number lets us trace back to the project it funds."}</p>
            </div>
            <span className="fx-flow-simple-arrow">→</span>
            <div className="fx-flow-simple-step">
              <div className="k">03</div>
              <h3>{isFr ? "On enrichit" : "We enrich"}</h3>
              <p>{isFr
                ? "Certaines informations utiles manquent dans les fichiers publiés. Pour chaque bénéficiaire de subvention, on complète sa fiche depuis le registre national des entreprises tenu par l'INSEE : forme juridique, activité principale, siège social. Quand l'adresse d'un projet d'investissement est ambiguë ou qu'un marché porte un libellé trop technique, un modèle de langage propose une catégorie ou une localisation, qu'on peut toujours retrouver dans la source d'origine."
                : "Some useful information is missing from the published files. For each grant recipient, we complete its record from the national business register kept by INSEE: legal form, main activity, registered office. When an investment project's address is ambiguous or a contract has too technical a label, a language model proposes a category or location, which can always be traced back in the source of origin."}</p>
            </div>
            <span className="fx-flow-simple-arrow">→</span>
            <div className="fx-flow-simple-step">
              <div className="k">04</div>
              <h3>{isFr ? "On publie" : "We publish"}</h3>
              <p>{isFr
                ? "À l'arrivée, les chiffres sont enregistrés dans des fichiers stables. Le site les affiche tels quels, sans rien recalculer en direct, donc deux visites successives montrent exactement les mêmes valeurs. Le contenu d'une page ne change que quand le pipeline est relancé et qu'une nouvelle version du site est publiée."
                : "Once everything is computed, the figures are saved in stable files. The site displays them as-is, without any live recalculation, so two successive visits show exactly the same values. A page's content only changes when the pipeline is re-run and a new version of the site is published."}</p>
            </div>
          </div>

          <p className="fx-note" style={{ marginTop: 18 }}>
            {isFr
              ? <><b>Règle absolue.</b> Un modèle de langage n&apos;est jamais utilisé pour produire un montant. Son rôle se limite au texte : catégoriser, décrire, retrouver une adresse. Tous les agrégats financiers du site sortent de calculs reproductibles, exécutés directement sur les données brutes.</>
              : <><b>Hard rule.</b> A language model is never used to produce an amount. Its role is limited to text: categorising, describing, finding an address. All of the site&apos;s financial aggregates come from reproducible calculations, run directly on raw data.</>}
          </p>
        </div>
      </section>

      {/* 02 · SOURCES & PROVENANCE ────────────────────────────────────── */}
      <section id="sources" className="fx-section">
        <div className="fx-wrap">
          <SectionHead
            number="02"
            kind={isFr ? "Sources & provenance" : "Sources & provenance"}
            title={isFr ? <>D&apos;où viennent <em>les chiffres</em></> : <>Where the <em>figures</em> come from</>}
            subtitle={isFr ? "Six portails publics. Et pour chaque outil du site, le chemin complet entre la source et l'écran." : "Six public portals. And for each tool on the site, the full path from source to screen."}
          />

          <p style={{ maxWidth: 780, marginBottom: 28, lineHeight: 1.55 }}>
            {isFr
              ? <><b>De la Ville, et seulement de la Ville</b> : aucune donnée publiée ici n&apos;a été reconstruite ou estimée à partir d&apos;ailleurs. Pour les rares ratios financiers qualitatifs que la Ville ne publie pas en données ouvertes (taux moyen pondéré, maturité de la dette par exemple), on marque explicitement les valeurs comme « indicatives » sur la fiche concernée.</>
              : <><b>From the City, and only from the City</b>: no data published here has been reconstructed or estimated from elsewhere. For the few qualitative financial ratios the City does not publish as open data (weighted average rate, debt maturity for example), values are explicitly marked as "indicative" on the relevant panel.</>}
          </p>

          <p id="personnes-physiques" style={{ maxWidth: 780, marginBottom: 28, lineHeight: 1.55 }}>
            {isFr
              ? <><b>Personnes physiques : agrégées, jamais nominatives.</b> L&apos;annexe au compte administratif liste aussi des aides versées à des personnes physiques — quelques centaines d&apos;euros chacune, étiquetées « Personnes physiques » par la Ville elle-même. Le jeu de données source les publie nominativement ; ce site fait un autre choix : les montants restent visibles en agrégat par exercice, mais aucun nom de particulier n&apos;est indexé ni cherchable. Un nom associé à une aide renseigne sur la situation sociale d&apos;une personne, sans apport pour le contrôle citoyen au niveau individuel — ces lignes n&apos;indiquent d&apos;ailleurs ni objet ni direction. Certains exercices (2020-2021) arrivent déjà agrégés en une ligne dans la source. Le détail nominatif reste accessible dans le jeu de données de la Ville.</>
              : <><b>Individuals: aggregated, never by name.</b> The administrative-account annex also lists aid paid to individuals — a few hundred euros each, labelled &ldquo;Personnes physiques&rdquo; by the City itself. The source dataset publishes them by name; this site makes a different choice: amounts remain visible as a per-year aggregate, but no individual&apos;s name is indexed or searchable. A name attached to an aid payment reveals a person&apos;s social situation, with no public-scrutiny value at the individual level — these rows carry neither purpose nor department. Some years (2020-2021) already arrive aggregated as a single line in the source. The name-level detail remains available in the City&apos;s dataset.</>}
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

          {/* Provenance par outil — quel dataset alimente quel graphique ── */}
          <h3 style={{ marginTop: 44, marginBottom: 10, fontFamily: "var(--f-display)", fontSize: 22 }}>
            {isFr ? "Le parcours d'un chiffre, outil par outil" : "Tracing a figure, tool by tool"}
          </h3>
          <p style={{ maxWidth: 720, marginBottom: 18, color: "var(--muted)", lineHeight: 1.55 }}>
            {isFr
              ? "Cliquez sur un outil pour voir d'où viennent ses chiffres : chaque étape du traitement, jusqu'au jeu de données public dont ils sont issus."
              : "Click a tool to see where its figures come from: each step of processing, all the way back to the public dataset they are drawn from."}
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
        </div>
      </section>

      {/* 03 · FRAÎCHEUR & AUDIT ────────────────────────────────────────── */}
      <section id="audit" className="fx-section">
        <div className="fx-wrap">
          <SectionHead
            number="03"
            kind={isFr ? "Fraîcheur & audit" : "Freshness & audit"}
            title={isFr ? <>Ce qui est <em>à jour</em>, ce qui est <em>vérifié</em></> : <>What is <em>up to date</em>, what is <em>verified</em></>}
            subtitle={isFr
              ? "Toutes les sources ne sont pas maintenues au même rythme. Et un audit automatique rejoue les chiffres à chaque mise à jour."
              : "Not all sources are maintained at the same pace. And an automated audit replays the figures on every update."}
          />

          {/* Couverture par outil ─────────────────────────────────────── */}
          <h3 style={{ marginTop: 36, marginBottom: 14, fontFamily: "var(--f-display)", fontSize: 22 }}>
            {isFr ? "Couverture par outil" : "Coverage by tool"}
          </h3>
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

          {/* Contrôles automatiques ───────────────────────────────────── */}
          <h3 style={{ marginTop: 48, marginBottom: 14, fontFamily: "var(--f-display)", fontSize: 22 }}>
            {isFr ? "Contrôles automatiques" : "Automated checks"}
          </h3>
          <p style={{ maxWidth: 820, marginBottom: 24, lineHeight: 1.6 }}>
            {isFr
              ? <>À chaque mise à jour, des contrôles automatiques rejouent les calculs et confrontent les totaux affichés aux sources brutes, au centime près. Les informations enrichies par modèle (catégories, localisations) doivent rester au-dessus de seuils de fiabilité documentés. Et les trous éventuels des sources publiques apparaissent comme tels sur la page concernée. <b>Aucun chiffre n&apos;est tapé à la main.</b></>
              : <>On every update, automated checks replay the calculations and match the displayed totals against the raw sources, to the cent. Model-enriched information (categories, locations) must stay above documented reliability thresholds. And any gaps in the public sources are flagged as such on the relevant page. <b>No figure on this page is typed by hand.</b></>}
          </p>

          {audit ? (
            <>
              <div className="fx-meth-stats" style={{ marginBottom: 16 }}>
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

              <p className="fx-note" style={{ marginBottom: 20 }}>
                {isFr
                  ? <>Dernier rejeu : <b>{new Date(audit.generated_at).toLocaleString("fr-FR", { dateStyle: "long", timeStyle: "short" })}</b>.</>
                  : <>Last run: <b>{new Date(audit.generated_at).toLocaleString("en-GB", { dateStyle: "long", timeStyle: "short" })}</b>.</>}
              </p>

              <details className="fx-collapsible">
                <summary>{isFr ? `Voir le détail des ${audit.summary.total} contrôles` : `View all ${audit.summary.total} checks`}</summary>
                <div className="fx-audit-table" style={{ marginTop: 12 }}>
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
              </details>
            </>
          ) : (
            <p className="fx-note">{isFr ? "Chargement de l'audit…" : "Loading audit…"}</p>
          )}

          {/* Limites connues — fusion LLM confidence + divergences Ville ── */}
          <h3 style={{ marginTop: 48, marginBottom: 14, fontFamily: "var(--f-display)", fontSize: 22 }}>
            {isFr ? "Limites connues" : "Known limitations"}
          </h3>
          <p style={{ lineHeight: 1.6, maxWidth: 820, marginBottom: 18 }}>
            {isFr
              ? <><b>Le modèle se note lui-même.</b> Quand le modèle de langage propose une catégorie pour une subvention ou une localisation pour un projet, il attache à sa réponse un score de confiance. Ce score, c&apos;est le modèle qui se l&apos;auto-déclare. Pour le rendre fiable au-delà de cette auto-évaluation, il faudra le comparer à un échantillon vérifié à la main. Ce travail est en cours et sera publié ici (<a href="https://github.com/AbstractsMachine/france-open-data-pipeline/tree/main/pipeline/scripts/audit/calibration_samples" target="_blank" rel="noopener noreferrer">script et échantillons ↗</a>).</>
              : <><b>The model rates itself.</b> When the language model proposes a category for a grant or a location for a project, it attaches a confidence score to its answer. That score is self-declared. To make it reliable beyond this self-evaluation, it will need to be compared against a hand-labelled sample. That work is underway and will be published here (<a href="https://github.com/AbstractsMachine/france-open-data-pipeline/tree/main/pipeline/scripts/audit/calibration_samples" target="_blank" rel="noopener noreferrer">script and samples ↗</a>).</>}
          </p>
          <p style={{ lineHeight: 1.6, maxWidth: 820 }}>
            {isFr
              ? <><b>Quand nos chiffres diffèrent de ceux de la Ville.</b> Sur un même jeu de données, nos totaux sont strictement identiques à ceux de la Ville : on ne retouche jamais un montant. Quand un écart apparaît, c&apos;est généralement pour une de trois raisons. Soit le périmètre diffère : on publie le budget principal seul, alors que la Ville peut communiquer un « groupe Ville » qui inclut ses structures satellites. Soit notre chiffre vient du dernier jeu de données publié, lui-même parfois en retard sur une communication officielle. Soit on a traduit un libellé sans que l&apos;agrégat correspondant ne change. Si un écart persiste sans explication évidente, c&apos;est probablement un bug. <a href="/contact">Signalez-le</a>.</>
              : <><b>When our figures differ from the City&apos;s.</b> On a given dataset, our totals are strictly identical to the City&apos;s: we never alter an amount. When a gap shows up, it usually comes from one of three reasons. Either the scope differs: we publish the main budget alone, while the City may communicate a &quot;City group&quot; that includes its satellite entities. Or our figure comes from the latest published dataset, itself sometimes lagging an official communication. Or we have translated a label without the underlying aggregate changing. If a gap persists without an obvious explanation, it&apos;s probably a bug. <a href="/contact">Report it</a>.</>}
          </p>

          {/* Compact cross-check footer ────────────────────────────────── */}
          <div style={{ marginTop: 32, padding: "16px 20px", background: "var(--cream)", display: "flex", gap: 18, flexWrap: "wrap", fontFamily: "var(--f-mono)", fontSize: 13 }}>
            <a href="/data/data_quality_audit.json" target="_blank" rel="noopener noreferrer">{isFr ? "JSON brut ↗" : "Raw JSON ↗"}</a>
            <a href="https://github.com/AbstractsMachine/france-open-data-pipeline/blob/main/pipeline/scripts/audit/run_data_quality_audit.py" target="_blank" rel="noopener noreferrer">{isFr ? "Script audit ↗" : "Audit script ↗"}</a>
          </div>
        </div>
      </section>

      {/* 04 · ENGAGEMENTS ─────────────────────────────────────────────── */}
      <section id="engagements" className="fx-section">
        <div className="fx-wrap">
          <SectionHead
            number="04"
            kind={isFr ? "Engagements" : "Commitments"}
            title={isFr ? <>Pipeline AGPL, <em>corrections</em> traçables</> : <>AGPL pipeline, <em>traceable</em> corrections</>}
          />
          <p style={{ lineHeight: 1.6, maxWidth: 780 }}>
            {isFr
              ? <>Le code qui produit ces chiffres est publié en libre accès, sous licence AGPL-3.0. N&apos;importe qui peut le récupérer et refaire les calculs depuis les sources publiques pour obtenir exactement les mêmes résultats. Quand une erreur est signalée, elle est corrigée dans le code et inscrite dans l&apos;historique public du projet avec sa date et son origine. On ne réécrit jamais l&apos;historique : tout ancien screenshot ou citation reste rattachable à l&apos;état du calcul à l&apos;époque.</>
              : <>The code that produces these figures is published in open access, under the AGPL-3.0 licence. Anyone can download it and re-run the calculations from the public sources to obtain exactly the same results. When an error is reported, it is fixed in the code and recorded in the project&apos;s public history with its date and source. We never rewrite history: any old screenshot or citation can still be linked to the state of the calculation at the time.</>}
          </p>
          <div style={{ marginTop: 24, display: "flex", gap: 10, flexWrap: "wrap" }}>
            <Button variant="primary" href="/contact">{isFr ? "Signaler une erreur" : "Report an error"}</Button>
            <Button href="https://github.com/AbstractsMachine/france-open-data-pipeline">{isFr ? "Code sur GitHub ↗" : "Code on GitHub ↗"}</Button>
          </div>
        </div>
      </section>

      </main>
      <Footer />
    </div>
  );
}
