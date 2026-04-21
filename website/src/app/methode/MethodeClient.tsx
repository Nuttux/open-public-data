"use client";

import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";
import Navbar from "@/components/fusion/Navbar";
import Footer from "@/components/fusion/Footer";
import SectionHead from "@/components/fusion/SectionHead";
import Button from "@/components/fusion/Button";
import { useLocale } from "@/lib/localeContext";

type ToolMethod = {
  id: string;
  kicker: string;
  number: string;
  title: string;
  route: string;
  source: { name: string; dataset: string; coverage: string; href: string; hrefLabel: string };
  objectif: string;
  pipeline: { label: string; detail: ReactNode }[];
  choix: string[];
  limites: string[];
};

type CoverageRow = {
  label: string;
  status: "ok" | "warn" | "info";
  statusLabel: string;
  segments: { start: number; end: number; text: string; kind?: "frozen" | "partial" }[];
};

const AXIS_START = 2013;
const AXIS_END = 2026;
const AXIS_SPAN = AXIS_END - AXIS_START + 1;

function barStyle(start: number, end: number): CSSProperties {
  const left = ((start - AXIS_START) / AXIS_SPAN) * 100;
  const width = ((end - start + 1) / AXIS_SPAN) * 100;
  return { left: `${left}%`, width: `${width}%` };
}

// ── French data ──────────────────────────────────────────────────────────────

const TOOLS_FR: ToolMethod[] = [
  {
    id: "budget", number: "04", kicker: "Budget",
    title: "Budget principal — voté & exécuté", route: "/budget",
    source: { name: "Comptes administratifs M57 + budgets primitifs", dataset: "comptes-administratifs-budgets-principaux-…-m57", coverage: "2019-2024 (exécuté) · 2019-2026 (voté)", href: "https://opendata.paris.fr", hrefLabel: "opendata.paris.fr" },
    objectif: "Rendre lisible en un coup d'œil ce qui entre et ce qui sort du budget de la Ville, sur un exercice, sous forme de Sankey.",
    pipeline: [
      { label: "Sync", detail: <>7 datasets OpenData → <code>BigQuery raw</code></> },
      { label: "Staging", detail: <>Typage, clés, nettoyage</> },
      { label: "Mapping", detail: <>Jointure avec <code>seed_mapping_thematiques</code></> },
      { label: "Core", detail: <><code>core_budget</code> (CA) et <code>core_budget_vote</code> (BP) séparés</> },
      { label: "Mart", detail: <><code>mart_sankey</code> + <code>mart_vote_vs_execute</code></> },
    ],
    choix: [
      "Bascule voté / exécuté explicite : l'exécuté est le chiffre qui compte pour juger, le voté pour comprendre l'intention.",
      "Chapitres renommés en français courant (« 011 Charges à caractère général » → « Achats & charges courantes »). Correspondance technique conservée dans l'export.",
    ],
    limites: [
      "Le voté ne reflète pas les décisions modificatives prises en cours d'année.",
      "Le CA définitif arrive ~6 mois après la clôture — chiffres provisoires avant juin N+1.",
      "Budgets annexes (eau, assainissement) non inclus.",
    ],
  },
  {
    id: "subventions", number: "05", kicker: "Subventions",
    title: "Subventions versées aux bénéficiaires", route: "/qui-recoit",
    source: { name: "Subventions versées — annexes CA", dataset: "subventions-versees-annexe-compte-administratif-…", coverage: "2018-2024 · ~53 000 lignes", href: "https://opendata.paris.fr/explore/dataset/subventions-accordees-et-refusees", hrefLabel: "opendata.paris.fr" },
    objectif: "Savoir qui reçoit l'argent public en subvention, pour quoi, et dans quelle proportion — du CASVP aux plus petites associations.",
    pipeline: [
      { label: "Sync + jointure", detail: <>Dataset subventions + dataset associations (SIRET, objet)</> },
      { label: "Normalisation", detail: <>Clé <code>beneficiaire_normalise</code> quand le SIRET est absent</> },
      { label: "LLM thématique", detail: <>Gemini 2.5 Flash sur top 500 cumulés → seed cache</> },
      { label: "Type organisme", detail: <>Colonnes <code>ode_*</code> (public / asso / entreprise / PP)</> },
      { label: "Revue humaine", detail: <>Contrôle manuel systématique &gt; 1 M€</> },
      { label: "Marts", detail: <><code>mart_subventions_treemap</code> + <code>mart_subventions_beneficiaires</code></> },
    ],
    choix: [
      "Pas de géolocalisation : une subvention va à une organisation, pas à un lieu. L'adresse du siège ne reflète pas où l'action est menée.",
      "On publie la catégorie LLM, mais aussi l'objet brut et le SIRET, pour vérification.",
      "Montants versés (exécutés), pas votés.",
    ],
    limites: [
      "Subventions en nature (locaux, matériel) flaguées mais pas valorisées.",
      "Satellites (SEM, CASVP) non inclus.",
      "Avant 2018 : format différent, non comparable sur historique long.",
    ],
  },
  {
    id: "marches-publics", number: "06", kicker: "Marchés publics",
    title: "Marchés notifiés (commande publique)", route: "/marches-publics",
    source: { name: "Marchés publics de la Ville de Paris", dataset: "marches-publics-de-la-ville-de-paris", coverage: "2013-2024 · ~17 000 contrats", href: "https://opendata.paris.fr", hrefLabel: "opendata.paris.fr" },
    objectif: "Voir qui la Ville paie pour travaux, fournitures et services, quel volume, et quels titulaires concentrent les contrats.",
    pipeline: [
      { label: "Sync", detail: <>Dataset marchés → <code>BigQuery raw</code></> },
      { label: "Staging", detail: <>Filtre montant_max &gt; 0, durée cohérente</> },
      { label: "Core", detail: <><code>core_marches_publics</code> : 1 ligne par contrat</> },
      { label: "Marts", detail: <><code>mart_marches_fournisseurs</code> + <code>mart_marches_par_nature</code></> },
      { label: "Signaux faibles", detail: <>Heuristique : &gt; 10 M€ mono-attributaires, concentration</> },
    ],
    choix: [
      "Totaux affichés = montants maximum contractuels (plafonds pluriannuels), pas des dépenses exécutées.",
      "Les critères de repérage sont publiés — signaux, pas accusations.",
      "Pas de cartographie des titulaires tant que l'adresse du chantier n'est pas une colonne fiable.",
    ],
    limites: [
      "97 % des marchés sont des accords-cadres ; 66 % ont montant_min = 0 — consommation réelle parfois bien inférieure.",
      "Contrat peut être résilié : le montant affiché reste le plafond initial.",
      "Avenants incomplets dans le fichier source — sous-estimation possible.",
      "Satellites (SEM, OPH, CASVP) non inclus.",
    ],
  },
  {
    id: "investissements", number: "07", kicker: "Investissements",
    title: "Projets d'investissement (AP)", route: "/investissements",
    source: { name: "Annexes AP du CA + PDF « Investissements Localisés »", dataset: "comptes-administratifs-autorisations-de-programmes-… + PDF cdn.paris.fr", coverage: "Dataset gelé 2018-2022 · PDF IL 2018-2026", href: "https://opendata.paris.fr", hrefLabel: "opendata.paris.fr" },
    objectif: "Cartographier, quand c'est possible, les projets d'investissement de la Ville avec leur montant et leur statut.",
    pipeline: [
      { label: "Dataset AP", detail: <>2018-2022 via OpenData (~7 000 projets)</> },
      { label: "PDF IL", detail: <>2023-2024 via parsing PDF (~450 / an)</> },
      { label: "Regex arr.", detail: <>Extraction code postal 75001-75020 depuis le libellé</> },
      { label: "Géocodage BAN", detail: <>api-adresse.data.gouv.fr + score de confiance</> },
      { label: "LLM géo", detail: <>Gemini sur top 500 par montant → seed cache</> },
      { label: "Core + Mart", detail: <><code>core_ap_projets</code> → <code>mart_carte_investissements</code></> },
    ],
    choix: [
      "Chiffres = autorisations de programme (AP), pas livraisons.",
      "Projet AP récurrent : montant mis à jour, pas dupliqué.",
      "Part non-géolocalisée affichée par année.",
    ],
    limites: [
      "Dataset OpenData AP gelé depuis 2022 — 2023-2024 repose sur PDF, ~450 projets vs ~2 500 dans le dataset 2018.",
      "Dotations centrales, études pluri-sites sans adresse unique.",
      "Écart AP vs CP documenté mais pas affiché par défaut.",
      "Extraction PDF : taux d'erreur résiduel contrôlé par échantillonnage.",
    ],
  },
  {
    id: "logement-social", number: "08", kicker: "Logement social",
    title: "Logement social (SRU, opérations, parc)", route: "/logement-social",
    source: { name: "Inventaire SRU (DDT) + logements sociaux financés", dataset: "logements-sociaux-finances-a-paris + inventaire SRU", coverage: "2001-2024 (financés) · SRU année en cours", href: "https://www.paris.fr/logement-social", hrefLabel: "paris.fr" },
    objectif: "Montrer où en est Paris sur l'objectif SRU, combien d'opérations sont financées, et quels bailleurs portent le parc.",
    pipeline: [
      { label: "Sync", detail: <>Dataset logements sociaux financés → <code>BigQuery raw</code></> },
      { label: "SRU", detail: <>Taux officiel DDT Paris, 1er janvier</> },
      { label: "Core", detail: <><code>core_logements_sociaux</code> par arr. × bailleur × catégorie</> },
      { label: "Mart", detail: <><code>mart_stats_arrondissements</code> → choroplèthe</> },
      { label: "Parts bailleurs", detail: <>Indicatives, croisement SDES + rapports annuels</> },
    ],
    choix: [
      "Activité financée (AP), pas livraisons : financement en 2022 ≠ livraison 2025.",
      "Parts de bailleurs indicatives tant qu'un jeu consolidé officiel n'est pas publié.",
    ],
    limites: [
      "Pas de heatmap tension (demandes / attributions) — jeu non publié.",
      "Pas de géoloc du parc existant : SRU ne descend pas à l'adresse.",
      "Profil socio-économique des bénéficiaires non ouvert.",
    ],
  },
  {
    id: "dette-patrimoine", number: "09", kicker: "Dette & patrimoine",
    title: "Bilan comptable : dette, actif, fonds propres", route: "/dette-patrimoine",
    source: { name: "Bilan comptable M57 (compte de gestion)", dataset: "compte de gestion au 31/12, publié avec le CA", coverage: "2019-2024", href: "https://opendata.paris.fr", hrefLabel: "opendata.paris.fr" },
    objectif: "Sortir du seul chiffre de la dette et replacer la Ville dans son bilan complet : ce qu'elle doit, ce qu'elle possède, ses fonds propres.",
    pipeline: [
      { label: "Upload", detail: <><code>upload_bilan_comptable.py</code> → <code>BigQuery raw</code></> },
      { label: "Normalisation", detail: <>Comptes classe 1 à 5 → grandes masses</> },
      { label: "Core", detail: <><code>core_bilan_comptable</code> (actif, FP, dette, provisions)</> },
      { label: "Mart", detail: <><code>mart_bilan_sankey</code> + ratios (dette/hab, dette/épargne)</> },
    ],
    choix: [
      "Dette = budget principal seul. Hors-bilan et dette consolidée du groupe Ville mentionnés mais pas totalisés.",
      "Ratios par habitant : population municipale INSEE la plus récente.",
    ],
    limites: [
      "Structure fine de la dette (instrument, maturité, taux) non publiée.",
      "Bilans consolidés SEM / OPH / CASVP non ouverts.",
      "Hors-bilan (garanties d'emprunt) non ouvert.",
    ],
  },
];

const GLOSSARY_FR: { term: string; def: string }[] = [
  { term: "M57", def: "Nomenclature comptable standard des collectivités territoriales, obligatoire depuis 2024. Remplace M14 / M52." },
  { term: "CA (compte administratif)", def: "Budget réellement exécuté, voté après la clôture. Publié ~6 mois après." },
  { term: "BP (budget primitif) / voté", def: "Budget prévisionnel adopté avant le début de l'exercice. Peut être modifié en cours d'année." },
  { term: "AP / CP", def: "Autorisation de Programme (enveloppe pluriannuelle) vs Crédit de Paiement (décaissement annuel). Un AP 100 M€ peut se consommer sur 4 ans." },
  { term: "SRU", def: "Loi Solidarité et Renouvellement Urbain — quota de logements sociaux. Calculé chaque 1er janvier par la DDT." },
  { term: "CASVP", def: "Centre d'Action Sociale de la Ville de Paris. Bénéficiaire n°1 des subventions." },
  { term: "SEM / OPH", def: "Société d'Économie Mixte / Office Public de l'Habitat. Comptes non consolidés dans nos chiffres." },
  { term: "Accord-cadre", def: "Marché public avec plafonds mais pas d'engagement ferme. 97 % des marchés parisiens en sont." },
  { term: "dbt", def: "Outil open source de transformation SQL, enchaîne staging → intermediate → core → marts de manière versionnée." },
  { term: "OBT (One Big Table)", def: "Table large dénormalisée par entité, plutôt qu'un modèle en étoile. Plus simple à exporter." },
  { term: "Staging / Core / Mart", def: "Couches dbt : staging nettoie, core = table large de vérité, mart prépare un JSON consommable." },
  { term: "ode_*", def: "Préfixe pour colonnes enrichies par nous (thématique, type d'organisme…) vs colonnes originales." },
  { term: "Sankey", def: "Diagramme de flux : largeur des flèches ∝ montant transféré entre catégories." },
  { term: "Pareto (top 500)", def: "On applique le LLM aux 500 plus gros montants (~80 % du volume). Moins coûteux, quasi identique sur les agrégats." },
];

const FAQ_FR: { q: string; a: string }[] = [
  { q: "Pourquoi votre chiffre diffère-t-il parfois de celui annoncé par la mairie ?", a: "Trois causes : (1) périmètre — on publie le budget principal, la mairie peut communiquer un « groupe Ville » qui inclut les satellites ; (2) timing — notre chiffre vient du dernier dataset ouvert ; (3) retraitement — on renomme et regroupe les chapitres, mais les agrégats sont identiques. Si l'écart persiste, dites-le-nous." },
  { q: "Qu'est-ce que le LLM fait exactement dans votre pipeline ?", a: "Deux tâches précises : classifier la thématique des bénéficiaires de subventions, et aider à géolocaliser des projets d'investissement. Modèle : Gemini 2.5 Flash. Il ne calcule jamais un montant. Il tourne hors dbt, ses résultats sont mis en cache dans des seeds CSV publics, et on repasse manuellement sur les décisions > 1 M€." },
  { q: "Comment évitez-vous le double comptage entre budget, subventions et marchés ?", a: "Chaque entité est modélisée séparément, jamais UNIONée aux autres. Le budget contient une ligne agrégée de subventions ; notre page « Subventions » détaille cette même ligne côté bénéficiaires. On n'additionne pas les deux. Documenté dans docs/architecture-modelling.md." },
  { q: "Vos totaux sont-ils identiques à ceux du site de la Ville ?", a: "Oui pour les agrégats issus d'un même dataset M57 : notre pipeline ne change pas les montants, il regroupe et renomme. Les écarts viennent des cas décrits plus haut (périmètre, timing, nomenclature)." },
  { q: "Pourquoi certaines années sont-elles absentes ou provisoires ?", a: "Chaque source a sa couverture documentée dans le tableau de couverture plus haut. L'exemple le plus visible : le dataset AP OpenData est gelé depuis 2022, donc pour 2023-2024 on bascule sur les PDF « Investissements Localisés ». On préfère afficher un manque que combler au doigt." },
];

const COVERAGE_FR: CoverageRow[] = [
  { label: "Budget exécuté (CA)", status: "ok", statusLabel: "À jour", segments: [{ start: 2018, end: 2024, text: "2018-2024" }] },
  { label: "Budget voté (BP)", status: "ok", statusLabel: "À jour", segments: [{ start: 2019, end: 2026, text: "2019-2026" }] },
  { label: "Subventions", status: "ok", statusLabel: "À jour", segments: [{ start: 2018, end: 2024, text: "2018-2024" }] },
  { label: "Marchés publics", status: "ok", statusLabel: "À jour", segments: [{ start: 2013, end: 2024, text: "2013-2024 (~17k)" }] },
  { label: "Investissements (dataset AP)", status: "warn", statusLabel: "Gelé", segments: [{ start: 2018, end: 2022, text: "2018-2022 · gelé", kind: "frozen" }] },
  { label: "Investissements (PDF IL)", status: "info", statusLabel: "Partiel", segments: [{ start: 2018, end: 2024, text: "2018-2024 (CA)", kind: "partial" }, { start: 2025, end: 2026, text: "2025-2026 (BP)", kind: "partial" }] },
  { label: "Logements sociaux financés", status: "ok", statusLabel: "À jour", segments: [{ start: 2013, end: 2024, text: "2001-2024 (affiché 2013+)" }] },
  { label: "Bilan comptable", status: "ok", statusLabel: "À jour", segments: [{ start: 2019, end: 2024, text: "2019-2024" }] },
];

// ── English data ─────────────────────────────────────────────────────────────

const TOOLS_EN: ToolMethod[] = [
  {
    id: "budget", number: "04", kicker: "Budget",
    title: "Main budget — voted & executed", route: "/budget",
    source: { name: "Administrative accounts M57 + draft budgets", dataset: "comptes-administratifs-budgets-principaux-…-m57", coverage: "2019-2024 (executed) · 2019-2026 (voted)", href: "https://opendata.paris.fr", hrefLabel: "opendata.paris.fr" },
    objectif: "Make it readable at a glance what flows in and out of the City's budget, for a given fiscal year, as a Sankey diagram.",
    pipeline: [
      { label: "Sync", detail: <>7 OpenData datasets → <code>BigQuery raw</code></> },
      { label: "Staging", detail: <>Typing, keys, cleaning</> },
      { label: "Mapping", detail: <>Join with <code>seed_mapping_thematiques</code></> },
      { label: "Core", detail: <><code>core_budget</code> (CA) and <code>core_budget_vote</code> (BP) separate</> },
      { label: "Mart", detail: <><code>mart_sankey</code> + <code>mart_vote_vs_execute</code></> },
    ],
    choix: [
      "Explicit voted/executed toggle: the executed figure is what counts for assessment, the voted figure shows intent.",
      "Chapters renamed in plain language (e.g. '011 General operating charges' → 'Purchases & current charges'). Technical mapping retained in exports.",
    ],
    limites: [
      "The voted budget does not reflect mid-year amendments.",
      "The final administrative account arrives ~6 months after year-end — figures are provisional before June N+1.",
      "Annex budgets (water, sanitation) not included.",
    ],
  },
  {
    id: "subventions", number: "05", kicker: "Grants",
    title: "Grants paid to recipients", route: "/qui-recoit",
    source: { name: "Grants paid — CA appendices", dataset: "subventions-versees-annexe-compte-administratif-…", coverage: "2018-2024 · ~53,000 lines", href: "https://opendata.paris.fr/explore/dataset/subventions-accordees-et-refusees", hrefLabel: "opendata.paris.fr" },
    objectif: "Know who receives public money in grants, for what, and in what proportion — from CASVP to the smallest associations.",
    pipeline: [
      { label: "Sync + join", detail: <>Grants dataset + associations dataset (SIRET, purpose)</> },
      { label: "Normalisation", detail: <>Key <code>beneficiaire_normalise</code> when SIRET absent</> },
      { label: "LLM theme", detail: <>Gemini 2.5 Flash on top 500 cumulative → seed cache</> },
      { label: "Org type", detail: <>Columns <code>ode_*</code> (public / non-profit / company / individual)</> },
      { label: "Human review", detail: <>Systematic manual check &gt; €1M</> },
      { label: "Marts", detail: <><code>mart_subventions_treemap</code> + <code>mart_subventions_beneficiaires</code></> },
    ],
    choix: [
      "No geolocation: a grant goes to an organisation, not a place. The registered address doesn't reflect where the work is done.",
      "We publish the LLM category, but also the raw purpose and SIRET, for verification.",
      "Executed amounts, not voted.",
    ],
    limites: [
      "In-kind grants (premises, equipment) flagged but not valued.",
      "Satellites (SEM, CASVP) not included.",
      "Before 2018: different format, not comparable for long-term history.",
    ],
  },
  {
    id: "marches-publics", number: "06", kicker: "Public contracts",
    title: "Awarded contracts (public procurement)", route: "/marches-publics",
    source: { name: "Public contracts of the City of Paris", dataset: "marches-publics-de-la-ville-de-paris", coverage: "2013-2024 · ~17,000 contracts", href: "https://opendata.paris.fr", hrefLabel: "opendata.paris.fr" },
    objectif: "See who the City pays for works, supplies and services, what volume, and which contractors concentrate the contracts.",
    pipeline: [
      { label: "Sync", detail: <>Contracts dataset → <code>BigQuery raw</code></> },
      { label: "Staging", detail: <>Filter montant_max &gt; 0, consistent duration</> },
      { label: "Core", detail: <><code>core_marches_publics</code>: 1 row per contract</> },
      { label: "Marts", detail: <><code>mart_marches_fournisseurs</code> + <code>mart_marches_par_nature</code></> },
      { label: "Weak signals", detail: <>Heuristic: &gt; €10M single-award, concentration</> },
    ],
    choix: [
      "Displayed totals = maximum contractual amounts (multi-year ceilings), not executed spending.",
      "Detection criteria are published — signals, not accusations.",
      "No mapping of contractors until the site address is a reliable column.",
    ],
    limites: [
      "97% of contracts are framework agreements; 66% have montant_min = 0 — actual consumption often much lower.",
      "Contract may be terminated: the displayed amount remains the initial ceiling.",
      "Incomplete amendments in source file — possible underestimation.",
      "Satellites (SEM, OPH, CASVP) not included.",
    ],
  },
  {
    id: "investissements", number: "07", kicker: "Investments",
    title: "Investment projects (AP)", route: "/investissements",
    source: { name: "CA AP appendices + 'Localised Investments' PDFs", dataset: "comptes-administratifs-autorisations-de-programmes-… + PDF cdn.paris.fr", coverage: "Dataset frozen 2018-2022 · PDF IL 2018-2026", href: "https://opendata.paris.fr", hrefLabel: "opendata.paris.fr" },
    objectif: "Map, where possible, the City's investment projects with their amounts and status.",
    pipeline: [
      { label: "AP dataset", detail: <>2018-2022 via OpenData (~7,000 projects)</> },
      { label: "IL PDFs", detail: <>2023-2024 via PDF parsing (~450/year)</> },
      { label: "District regex", detail: <>Postcode 75001-75020 extraction from label</> },
      { label: "BAN geocoding", detail: <>api-adresse.data.gouv.fr + confidence score</> },
      { label: "LLM geo", detail: <>Gemini on top 500 by amount → seed cache</> },
      { label: "Core + Mart", detail: <><code>core_ap_projets</code> → <code>mart_carte_investissements</code></> },
    ],
    choix: [
      "Figures = programme authorisations (AP), not deliveries.",
      "Recurring AP project: amount updated, not duplicated.",
      "Non-geocoded share displayed by year.",
    ],
    limites: [
      "OpenData AP dataset frozen since 2022 — 2023-2024 relies on PDFs, ~450 projects vs ~2,500 in the 2018 dataset.",
      "Central allocations, multi-site studies without a single address.",
      "AP vs CP gap documented but not displayed by default.",
      "PDF extraction: residual error rate controlled by sampling.",
    ],
  },
  {
    id: "logement-social", number: "08", kicker: "Social housing",
    title: "Social housing (SRU, operations, stock)", route: "/logement-social",
    source: { name: "SRU inventory (DDT) + funded social housing", dataset: "logements-sociaux-finances-a-paris + SRU inventory", coverage: "2001-2024 (funded) · SRU current year", href: "https://www.paris.fr/logement-social", hrefLabel: "paris.fr" },
    objectif: "Show where Paris stands on the SRU target, how many operations are funded, and which landlords carry the stock.",
    pipeline: [
      { label: "Sync", detail: <>Funded social housing dataset → <code>BigQuery raw</code></> },
      { label: "SRU", detail: <>Official DDT Paris rate, 1 January</> },
      { label: "Core", detail: <><code>core_logements_sociaux</code> by district × landlord × category</> },
      { label: "Mart", detail: <><code>mart_stats_arrondissements</code> → choropleth</> },
      { label: "Landlord shares", detail: <>Indicative, cross-referenced SDES + annual reports</> },
    ],
    choix: [
      "Funded activity (AP), not deliveries: funded in 2022 ≠ delivered in 2025.",
      "Landlord shares remain indicative until an official consolidated dataset is published.",
    ],
    limites: [
      "No pressure heatmap (applications/allocations) — dataset not published.",
      "No geocoding of existing stock: SRU does not go down to address level.",
      "Socio-economic profile of beneficiaries not open.",
    ],
  },
  {
    id: "dette-patrimoine", number: "09", kicker: "Debt & assets",
    title: "Balance sheet: debt, assets, equity", route: "/dette-patrimoine",
    source: { name: "M57 accounting balance sheet (management account)", dataset: "management account at 31/12, published with the CA", coverage: "2019-2024", href: "https://opendata.paris.fr", hrefLabel: "opendata.paris.fr" },
    objectif: "Go beyond the single debt figure and place the City within its full balance sheet: what it owes, what it owns, its equity.",
    pipeline: [
      { label: "Upload", detail: <><code>upload_bilan_comptable.py</code> → <code>BigQuery raw</code></> },
      { label: "Normalisation", detail: <>Class 1-5 accounts → major aggregates</> },
      { label: "Core", detail: <><code>core_bilan_comptable</code> (assets, equity, debt, provisions)</> },
      { label: "Mart", detail: <><code>mart_bilan_sankey</code> + ratios (debt/resident, debt/savings)</> },
    ],
    choix: [
      "Debt = main budget only. Off-balance-sheet and consolidated group debt mentioned but not totalled.",
      "Per-resident ratios: most recent INSEE municipal population.",
    ],
    limites: [
      "Detailed debt structure (instrument, maturity, rate) not published.",
      "Consolidated accounts for SEM / OPH / CASVP not open.",
      "Off-balance-sheet (loan guarantees) not open.",
    ],
  },
];

const GLOSSARY_EN: { term: string; def: string }[] = [
  { term: "M57", def: "Standard accounting nomenclature for local authorities, mandatory since 2024. Replaces M14/M52." },
  { term: "CA (administrative account)", def: "Actually executed budget, voted after year-end. Published ~6 months later." },
  { term: "BP (draft budget) / voted", def: "Provisional budget adopted before the start of the fiscal year. May be amended during the year." },
  { term: "AP / CP", def: "Programme Authorisation (multi-year envelope) vs Payment Appropriation (annual disbursement). A €100M AP may be consumed over 4 years." },
  { term: "SRU", def: "Urban Solidarity and Renewal Act — social housing quota. Calculated each 1 January by the DDT." },
  { term: "CASVP", def: "Paris City Social Action Centre. The no. 1 grant recipient." },
  { term: "SEM / OPH", def: "Mixed-economy company / Social housing office. Accounts not consolidated in our figures." },
  { term: "Framework agreement", def: "Public contract with ceilings but no firm commitment. 97% of Paris contracts are framework agreements." },
  { term: "dbt", def: "Open-source SQL transformation tool, chains staging → intermediate → core → marts in a versioned way." },
  { term: "OBT (One Big Table)", def: "Wide denormalised table per entity, rather than a star model. Simpler to export." },
  { term: "Staging / Core / Mart", def: "dbt layers: staging cleans, core = wide source-of-truth table, mart prepares a consumable JSON." },
  { term: "ode_*", def: "Prefix for columns enriched by us (theme, organisation type…) vs original columns." },
  { term: "Sankey", def: "Flow diagram: arrow width ∝ amount transferred between categories." },
  { term: "Pareto (top 500)", def: "We apply the LLM to the 500 largest amounts (~80% of volume). Less costly, virtually identical on aggregates." },
];

const FAQ_EN: { q: string; a: string }[] = [
  { q: "Why does your figure sometimes differ from the one announced by the City?", a: "Three reasons: (1) scope — we publish the main budget; the City may communicate a 'City group' that includes subsidiaries; (2) timing — our figure comes from the latest open dataset; (3) reprocessing — we rename and regroup chapters, but aggregates are identical. If the gap persists, let us know." },
  { q: "What exactly does the LLM do in your pipeline?", a: "Two specific tasks: classify the theme of grant recipients, and help geolocate investment projects. Model: Gemini 2.5 Flash. It never calculates an amount. It runs outside dbt, its results are cached in public CSV seeds, and we manually review decisions > €1M." },
  { q: "How do you avoid double-counting between budget, grants and contracts?", a: "Each entity is modelled separately, never UNIONed with others. The budget contains an aggregated grants line; our Grants page details that same line from the recipients' side. We don't add them together. Documented in docs/architecture-modelling.md." },
  { q: "Are your totals identical to those on the City's website?", a: "Yes for aggregates from the same M57 dataset: our pipeline doesn't change amounts, it regroups and renames. Differences come from the cases described above (scope, timing, nomenclature)." },
  { q: "Why are some years absent or provisional?", a: "Each source has its coverage documented in the coverage table above. The most visible example: the AP OpenData dataset has been frozen since 2022, so for 2023-2024 we switch to the 'Localised Investments' PDFs. We prefer to show a gap rather than fill it with guesswork." },
];

const COVERAGE_EN: CoverageRow[] = [
  { label: "Executed budget (CA)", status: "ok", statusLabel: "Up to date", segments: [{ start: 2018, end: 2024, text: "2018-2024" }] },
  { label: "Voted budget (BP)", status: "ok", statusLabel: "Up to date", segments: [{ start: 2019, end: 2026, text: "2019-2026" }] },
  { label: "Grants", status: "ok", statusLabel: "Up to date", segments: [{ start: 2018, end: 2024, text: "2018-2024" }] },
  { label: "Public contracts", status: "ok", statusLabel: "Up to date", segments: [{ start: 2013, end: 2024, text: "2013-2024 (~17k)" }] },
  { label: "Investments (AP dataset)", status: "warn", statusLabel: "Frozen", segments: [{ start: 2018, end: 2022, text: "2018-2022 · frozen", kind: "frozen" }] },
  { label: "Investments (IL PDFs)", status: "info", statusLabel: "Partial", segments: [{ start: 2018, end: 2024, text: "2018-2024 (CA)", kind: "partial" }, { start: 2025, end: 2026, text: "2025-2026 (BP)", kind: "partial" }] },
  { label: "Funded social housing", status: "ok", statusLabel: "Up to date", segments: [{ start: 2013, end: 2024, text: "2001-2024 (shown 2013+)" }] },
  { label: "Balance sheet", status: "ok", statusLabel: "Up to date", segments: [{ start: 2019, end: 2024, text: "2019-2024" }] },
];

// ── Component ────────────────────────────────────────────────────────────────

export default function MethodeClient() {
  const { locale } = useLocale();
  const isFr = locale === "fr";

  const TOOLS = isFr ? TOOLS_FR : TOOLS_EN;
  const GLOSSARY = isFr ? GLOSSARY_FR : GLOSSARY_EN;
  const FAQ = isFr ? FAQ_FR : FAQ_EN;
  const COVERAGE = isFr ? COVERAGE_FR : COVERAGE_EN;

  const years: number[] = [];
  for (let y = AXIS_START; y <= AXIS_END; y++) years.push(y);

  return (
    <div className="theme-fusion">
      <Navbar />

      <section className="fx-page-header">
        <div className="fx-wrap">
          <div className="fx-page-kicker">{isFr ? "— Méthode" : "— Method"}</div>
          <h1 className="fx-page-title">
            {isFr ? <>Comment on <em>construit</em> ces chiffres.</> : <>How we <em>build</em> these figures.</>}
          </h1>
          <p className="fx-page-lede">
            {isFr
              ? <>Une page unique : d&apos;où viennent les données, comment elles sont traitées, quels choix éditoriaux ont été faits, et ce que les chiffres <em>ne disent pas</em>. Tout le pipeline est open source.</>
              : <>One page: where the data comes from, how it is processed, what editorial choices were made, and what the figures <em>don&apos;t say</em>. The entire pipeline is open source.</>}
          </p>

          <div className="fx-meth-stats">
            <div className="fx-meth-stat">
              <span className="n">{isFr ? "Datasets" : "Datasets"}</span>
              <span className="v">7</span>
              <span className="c">{isFr ? "sources OpenData Paris" : "OpenData Paris sources"}</span>
            </div>
            <div className="fx-meth-stat">
              <span className="n">{isFr ? "Outils" : "Tools"}</span>
              <span className="v">6</span>
              <span className="c">{isFr ? "budget · subv. · marchés · invest. · logement · dette" : "budget · grants · contracts · investments · housing · debt"}</span>
            </div>
            <div className="fx-meth-stat">
              <span className="n">{isFr ? "Lignes traitées" : "Rows processed"}</span>
              <span className="v">~100 k</span>
              <span className="c">{isFr ? "53 k subventions + 24 k budget + 17 k marchés…" : "53k grants + 24k budget + 17k contracts…"}</span>
            </div>
            <div className="fx-meth-stat">
              <span className="n">{isFr ? "Historique" : "History"}</span>
              <span className="v">11 {isFr ? "ans" : "yrs"}</span>
              <span className="c">{isFr ? "2013 → 2024 (exécuté) · 2026 (voté)" : "2013 → 2024 (executed) · 2026 (voted)"}</span>
            </div>
          </div>

          <div className="fx-page-actions" style={{ marginTop: 28 }}>
            <Button variant="primary" href="#architecture">{isFr ? "Voir l'architecture" : "See the architecture"}</Button>
            <Button href="https://github.com/Nuttux/open-public-data">{isFr ? "Le code sur GitHub ↗" : "Code on GitHub ↗"}</Button>
          </div>
        </div>
      </section>

      <section className="fx-section">
        <div className="fx-wrap">
          <SectionHead
            number="00"
            kind={isFr ? "Sommaire" : "Contents"}
            title={isFr ? <>Ce que vous <em>trouverez</em> ici</> : <>What you&apos;ll <em>find</em> here</>}
          />
          <div className="fx-toc">
            <a href="#principes">{isFr ? "01 · Principes" : "01 · Principles"}</a>
            <a href="#architecture">{isFr ? "02 · Architecture" : "02 · Architecture"}</a>
            <a href="#couverture">{isFr ? "03 · Couverture" : "03 · Coverage"}</a>
            {TOOLS.map((tool) => (
              <a key={tool.id} href={`#${tool.id}`}>{tool.number} · {tool.kicker}</a>
            ))}
            <a href="#glossaire">{isFr ? "10 · Glossaire" : "10 · Glossary"}</a>
            <a href="#faq">11 · FAQ</a>
            <a href="#reproductibilite">{isFr ? "12 · Reproductibilité" : "12 · Reproducibility"}</a>
            <a href="#corrections">{isFr ? "13 · Corrections" : "13 · Corrections"}</a>
          </div>
        </div>
      </section>

      <section id="principes" className="fx-section">
        <div className="fx-wrap">
          <SectionHead
            number="01"
            kind={isFr ? "Principes" : "Principles"}
            title={isFr ? <>Quatre <em>règles</em></> : <>Four <em>rules</em></>}
          />
          <div className="fx-sources fx-sources-4">
            <div>
              <div className="n">01</div>
              <h3>{isFr ? "Pas de contenu sponsorisé" : "No sponsored content"}</h3>
              <p>{isFr ? "Aucun article, chiffre ou visualisation n'est sponsorisé. Les financements reçus sont publiés avec leur montant et ne conditionnent pas la ligne éditoriale." : "No article, figure or visualisation is sponsored. Any funding received is published with its amount and does not condition the editorial line."}</p>
            </div>
            <div>
              <div className="n">02</div>
              <h3>{isFr ? "Neutralité politique" : "Political neutrality"}</h3>
              <p>{isFr ? "On publie des chiffres, pas des opinions. Les textes évitent les jugements sur les choix politiques et s'en tiennent à la donnée." : "We publish figures, not opinions. Texts avoid judgements on political choices and stick to the data."}</p>
            </div>
            <div>
              <div className="n">03</div>
              <h3>{isFr ? "Code & données ouverts" : "Open code & data"}</h3>
              <p>{isFr ? "Tous les scripts sont sous licence MIT. Chaque chiffre peut être recalculé depuis un CSV source." : "All scripts are MIT-licensed. Every figure can be recalculated from a source CSV."}</p>
            </div>
            <div>
              <div className="n">04</div>
              <h3>{isFr ? "Corrections publiques" : "Public corrections"}</h3>
              <p>{isFr ? "Erreur signalée = corrigée dans le code et consignée dans le changelog avec la date et l'origine du signalement." : "Error reported = corrected in the code and recorded in the changelog with the date and source of the report."}</p>
            </div>
          </div>
        </div>
      </section>

      <section id="architecture" className="fx-section">
        <div className="fx-wrap">
          <SectionHead
            number="02"
            kind={isFr ? "Architecture" : "Architecture"}
            title={isFr ? <>Le même pipeline pour <em>chaque outil</em></> : <>The same pipeline for <em>every tool</em></>}
            subtitle={isFr ? "Ingestion → transformation → enrichissement → export. Une fois pour toutes." : "Ingestion → transformation → enrichment → export. Once and for all."}
          />

          <div className="fx-flow">
            <div className="fx-flow-row">
              <div className="fx-flow-node">
                <span className="k">01 · {isFr ? "Source" : "Source"}</span>
                <span className="lab">OpenData Paris</span>
                <span className="sub">{isFr ? "7 datasets publics" : "7 public datasets"}</span>
              </div>
              <span className="fx-flow-arrow">→</span>
              <div className="fx-flow-node">
                <span className="k">02 · {isFr ? "Ingest" : "Ingest"}</span>
                <span className="lab">BigQuery raw</span>
                <span className="sub">{isFr ? "Python, aucune transformation" : "Python, no transformation"}</span>
              </div>
              <span className="fx-flow-arrow">→</span>
              <div className="fx-flow-node">
                <span className="k">03 · Staging (dbt)</span>
                <span className="lab">{isFr ? "Typage & clés" : "Typing & keys"}</span>
                <span className="sub">{isFr ? "Filtrage, normalisation" : "Filtering, normalisation"}</span>
              </div>
              <span className="fx-flow-arrow">→</span>
              <div className="fx-flow-node">
                <span className="k">04 · Intermediate</span>
                <span className="lab">{isFr ? "Jointures + ode_*" : "Joins + ode_*"}</span>
                <span className="sub">{isFr ? "Enrichissements dbt" : "dbt enrichments"}</span>
              </div>
            </div>

            <div className="fx-flow-row">
              <div className="fx-flow-node alt">
                <span className="k">{isFr ? "Hors pipeline" : "Outside pipeline"}</span>
                <span className="lab">Gemini 2.5 Flash</span>
                <span className="sub">{isFr ? "Thématique + géoloc top 500 (Pareto) → seeds CSV" : "Theme + geoloc top 500 (Pareto) → CSV seeds"}</span>
              </div>
              <span className="fx-flow-arrow">→</span>
              <div className="fx-flow-node">
                <span className="k">05 · Core (OBT)</span>
                <span className="lab">{isFr ? "Une table par entité" : "One table per entity"}</span>
                <span className="sub">core_budget, core_subventions…</span>
              </div>
              <span className="fx-flow-arrow">→</span>
              <div className="fx-flow-node">
                <span className="k">06 · Marts</span>
                <span className="lab">{isFr ? "Une vue par viz" : "One view per viz"}</span>
                <span className="sub">mart_sankey, mart_carte, …</span>
              </div>
              <span className="fx-flow-arrow">→</span>
              <div className="fx-flow-node out">
                <span className="k">07 · {isFr ? "Sortie" : "Output"}</span>
                <span className="lab">{isFr ? "JSON figés" : "Static JSON"}</span>
                <span className="sub">{isFr ? "Consommés par Next.js, pas d'API live" : "Consumed by Next.js, no live API"}</span>
              </div>
            </div>

            <div className="fx-flow-note">
              {isFr
                ? <>{`Règle anti-double comptage — `}<code>core_budget</code>, <code>core_subventions</code>, <code>core_marches_publics</code>, <code>core_ap_projets</code>{` ne sont jamais UNIONés. Chaque entité vit séparément. Détail dans `}<code>docs/architecture-modelling.md</code>.</>
                : <>{`Anti-double-counting rule — `}<code>core_budget</code>, <code>core_subventions</code>, <code>core_marches_publics</code>, <code>core_ap_projets</code>{` are never UNIONed. Each entity lives separately. Detail in `}<code>docs/architecture-modelling.md</code>.</>}
            </div>
          </div>
        </div>
      </section>

      <section id="couverture" className="fx-section">
        <div className="fx-wrap">
          <SectionHead
            number="03"
            kind={isFr ? "Couverture & fraîcheur" : "Coverage & freshness"}
            title={isFr ? <>Ce qui est <em>à jour</em>, ce qui ne l&apos;est pas</> : <>What is <em>up to date</em>, what is not</>}
            subtitle={isFr ? "Les données ouvertes par la Ville ne sont pas toutes maintenues au même rythme." : "Not all data opened by the City is maintained at the same pace."}
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
                  <span className="t">{row.label}</span>
                  <span className={`fx-timeline-status ${row.status}`}>{row.statusLabel}</span>
                </div>
                <div className="fx-timeline-bar">
                  {row.segments.map((s, i) => (
                    <span key={i} className={s.kind ?? ""} style={barStyle(s.start, s.end)}>
                      {s.text}
                    </span>
                  ))}
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

      {TOOLS.map((tool) => (
        <section key={tool.id} id={tool.id} className="fx-section">
          <div className="fx-wrap">
            <div className="fx-tool-card">
              <div className="fx-tool-top">
                <div>
                  <div className="t-num">{tool.number} · {tool.kicker}</div>
                  <h3 className="t-title">{tool.title}</h3>
                </div>
                <Link href={tool.route} className="t-link">{tool.route} ↗</Link>
              </div>

              <div className="fx-tool-meta">
                <div>
                  <div className="k">{isFr ? "Source" : "Source"}</div>
                  <div className="v">{tool.source.name}</div>
                </div>
                <div>
                  <div className="k">Dataset</div>
                  <div className="v"><code>{tool.source.dataset}</code></div>
                </div>
                <div>
                  <div className="k">{isFr ? "Couverture" : "Coverage"}</div>
                  <div className="v">{tool.source.coverage}</div>
                </div>
              </div>

              <div className="fx-tool-body">
                <div className="objectif">
                  <span className="k">{isFr ? "Objectif" : "Goal"}</span>
                  <p>{tool.objectif}</p>
                </div>
                <div>
                  <div className="fx-stepper">
                    <span className="k">Pipeline</span>
                    {tool.pipeline.map((step, i) => (
                      <div key={i} className="fx-step">
                        <div className="fx-step-num">{String(i + 1).padStart(2, "0")}</div>
                        <div className="fx-step-text">
                          <b>{step.label}.</b> {step.detail}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div className="fx-tool-collapse">
                <details>
                  <summary>{isFr ? `Choix éditoriaux (${tool.choix.length})` : `Editorial choices (${tool.choix.length})`}</summary>
                  <ul>{tool.choix.map((c, i) => <li key={i}>{c}</li>)}</ul>
                </details>
                <details>
                  <summary>{isFr ? `Ce que les chiffres ne disent pas (${tool.limites.length})` : `What the figures don't say (${tool.limites.length})`}</summary>
                  <ul>{tool.limites.map((l, i) => <li key={i}>{l}</li>)}</ul>
                </details>
              </div>
            </div>
          </div>
        </section>
      ))}

      <section id="glossaire" className="fx-section">
        <div className="fx-wrap">
          <SectionHead
            number="10"
            kind={isFr ? "Glossaire" : "Glossary"}
            title={isFr ? <>Les mots qu&apos;on <em>utilise</em></> : <>The words we <em>use</em></>}
            subtitle={isFr ? "Jargon comptable et technique en une phrase." : "Accounting and technical jargon in one sentence."}
          />
          <dl className="fx-glossary">
            {GLOSSARY.map((g) => (
              <div key={g.term} className="fx-glossary-item">
                <dt>{g.term}</dt>
                <dd>{g.def}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      <section id="faq" className="fx-section">
        <div className="fx-wrap">
          <SectionHead
            number="11"
            kind="FAQ"
            title={isFr ? <>Les questions qui <em>reviennent</em></> : <>Frequently asked <em>questions</em></>}
          />
          <div className="fx-faq">
            {FAQ.map((item, i) => (
              <details key={i} className="fx-faq-item">
                <summary>{item.q}</summary>
                <p>{item.a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      <section id="reproductibilite" className="fx-section">
        <div className="fx-wrap">
          <SectionHead
            number="12"
            kind={isFr ? "Reproductibilité" : "Reproducibility"}
            title={isFr ? <>Refaire les calculs <em>vous-même</em></> : <>Reproduce the calculations <em>yourself</em></>}
          />
          <div className="fx-sources">
            <div>
              <div className="n">{isFr ? "01 · Exports" : "01 · Exports"}</div>
              <h3>{isFr ? "Télécharger la donnée nettoyée" : "Download the cleaned data"}</h3>
              <p>{isFr ? "Bouton CSV et JSON en bas de chaque page « Sources & méthode ». Format stable, colonnes documentées dans le dépôt." : "CSV and JSON button at the bottom of each Sources & method page. Stable format, columns documented in the repo."}</p>
              <Link href="/budget">{isFr ? "Exemple : export budget →" : "Example: budget export →"}</Link>
            </div>
            <div>
              <div className="n">{isFr ? "02 · Code" : "02 · Code"}</div>
              <h3>{isFr ? "Rejouer le pipeline" : "Replay the pipeline"}</h3>
              <p>{isFr ? <>{`Les modèles dbt et scripts Python sont dans `}<code>pipeline/</code>. <code>dbt run</code>{` + `}<code>export_all.py</code>{` régénère les JSON.`}</> : <>{`dbt models and Python scripts are in `}<code>pipeline/</code>. <code>dbt run</code>{` + `}<code>export_all.py</code>{` regenerates the JSON.`}</>}</p>
              <a href="https://github.com/Nuttux/open-public-data" target="_blank" rel="noopener noreferrer">
                github.com/Nuttux/open-public-data ↗
              </a>
            </div>
            <div>
              <div className="n">{isFr ? "03 · Données brutes" : "03 · Raw data"}</div>
              <h3>{isFr ? "Remonter à la source" : "Go back to the source"}</h3>
              <p>{isFr ? "Les datasets sources sont listés outil par outil plus haut. Le CSV de la Ville fait foi — ne rien nous croire sur parole." : "Source datasets are listed tool by tool above. The City's CSV is authoritative — don't take our word for it."}</p>
              <a href="https://opendata.paris.fr" target="_blank" rel="noopener noreferrer">opendata.paris.fr ↗</a>
            </div>
          </div>
        </div>
      </section>

      <section id="corrections" className="fx-section">
        <div className="fx-wrap">
          <SectionHead
            number="13"
            kind={isFr ? "Corrections & changelog" : "Corrections & changelog"}
            title={isFr ? <>Une erreur ? <em>On corrige.</em></> : <>A mistake? <em>We fix it.</em></>}
            subtitle={isFr ? "Les corrections sont publiques, datées, consignées." : "Corrections are public, dated and recorded."}
          />
          <div className="fx-sources">
            <div>
              <div className="n">{isFr ? "Signaler" : "Report"}</div>
              <h3>{isFr ? "Corriger un chiffre" : "Correct a figure"}</h3>
              <p>{isFr ? "Par courriel ou ticket GitHub. Précisez la page, le chiffre contesté, et si possible la source officielle contradictoire." : "By email or GitHub issue. Specify the page, the disputed figure, and if possible the contradicting official source."}</p>
              <a href="mailto:contact@franceopendata.org">contact@franceopendata.org ↗</a>
            </div>
            <div>
              <div className="n">{isFr ? "Journal" : "Log"}</div>
              <h3>{isFr ? "Changelog public" : "Public changelog"}</h3>
              <p>{isFr ? "Historique des corrections — date, ampleur, chiffre avant / après — tenu dans le dépôt GitHub." : "History of corrections — date, scope, before/after figure — maintained in the GitHub repo."}</p>
              <a href="https://github.com/Nuttux/open-public-data/commits/main" target="_blank" rel="noopener noreferrer">
                {isFr ? "Voir les commits ↗" : "View commits ↗"}
              </a>
            </div>
            <div>
              <div className="n">{isFr ? "Règle" : "Rule"}</div>
              <h3>{isFr ? "Jamais de chiffre supprimé" : "No figure ever deleted"}</h3>
              <p>{isFr ? "On corrige en place, et on garde la trace. Un screenshot d'un ancien chiffre reste reliable à une entrée du changelog." : "We correct in place and keep a record. A screenshot of an old figure can be linked to a changelog entry."}</p>
              <Link href="/contact">{isFr ? "Nous écrire →" : "Write to us →"}</Link>
            </div>
          </div>

          <div style={{ marginTop: 32, display: "flex", gap: 10, flexWrap: "wrap" }}>
            <Button variant="primary" href="/contact">{isFr ? "Signaler une erreur" : "Report an error"}</Button>
            <Button href="/">{isFr ? "Retour à l'accueil" : "Back to home"}</Button>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
}
