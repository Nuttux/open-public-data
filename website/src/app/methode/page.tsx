import type { Metadata } from "next";
import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";
import "../fusion.css";

import { Navbar, Footer, SectionHead, Button } from "@/components/fusion";
import { buildPageMetadata } from "@/lib/seo";

export const metadata: Metadata = buildPageMetadata({
  title: "Méthode — comment on construit nos chiffres",
  description:
    "Architecture technique, sources, modèles dbt, enrichissements LLM, choix éditoriaux, limites et code ouvert : la méthodologie complète derrière chaque outil de Données Lumières.",
  path: "/methode",
});

type ToolMethod = {
  id: string;
  kicker: string;
  number: string;
  title: string;
  route: string;
  source: {
    name: string;
    dataset: string;
    coverage: string;
    href: string;
    hrefLabel: string;
  };
  objectif: string;
  pipeline: { label: string; detail: ReactNode }[];
  choix: string[];
  limites: string[];
};

const TOOLS: ToolMethod[] = [
  {
    id: "budget",
    number: "04",
    kicker: "Budget",
    title: "Budget principal — voté & exécuté",
    route: "/budget",
    source: {
      name: "Comptes administratifs M57 + budgets primitifs",
      dataset: "comptes-administratifs-budgets-principaux-…-m57",
      coverage: "2019-2024 (exécuté) · 2019-2026 (voté)",
      href: "https://opendata.paris.fr",
      hrefLabel: "opendata.paris.fr",
    },
    objectif:
      "Rendre lisible en un coup d'œil ce qui entre et ce qui sort du budget de la Ville, sur un exercice, sous forme de Sankey.",
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
    id: "subventions",
    number: "05",
    kicker: "Subventions",
    title: "Subventions versées aux bénéficiaires",
    route: "/qui-recoit",
    source: {
      name: "Subventions versées — annexes CA",
      dataset: "subventions-versees-annexe-compte-administratif-…",
      coverage: "2018-2024 · ~53 000 lignes",
      href: "https://opendata.paris.fr/explore/dataset/subventions-accordees-et-refusees",
      hrefLabel: "opendata.paris.fr",
    },
    objectif:
      "Savoir qui reçoit l'argent public en subvention, pour quoi, et dans quelle proportion — du CASVP aux plus petites associations.",
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
    id: "marches-publics",
    number: "06",
    kicker: "Marchés publics",
    title: "Marchés notifiés (commande publique)",
    route: "/marches-publics",
    source: {
      name: "Marchés publics de la Ville de Paris",
      dataset: "marches-publics-de-la-ville-de-paris",
      coverage: "2013-2024 · ~17 000 contrats",
      href: "https://opendata.paris.fr",
      hrefLabel: "opendata.paris.fr",
    },
    objectif:
      "Voir qui la Ville paie pour travaux, fournitures et services, quel volume, et quels titulaires concentrent les contrats.",
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
    id: "investissements",
    number: "07",
    kicker: "Investissements",
    title: "Projets d'investissement (AP)",
    route: "/investissements",
    source: {
      name: "Annexes AP du CA + PDF « Investissements Localisés »",
      dataset: "comptes-administratifs-autorisations-de-programmes-… + PDF cdn.paris.fr",
      coverage: "Dataset gelé 2018-2022 · PDF IL 2018-2026",
      href: "https://opendata.paris.fr",
      hrefLabel: "opendata.paris.fr",
    },
    objectif:
      "Cartographier, quand c'est possible, les projets d'investissement de la Ville avec leur montant et leur statut.",
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
    id: "logement-social",
    number: "08",
    kicker: "Logement social",
    title: "Logement social (SRU, opérations, parc)",
    route: "/logement-social",
    source: {
      name: "Inventaire SRU (DDT) + logements sociaux financés",
      dataset: "logements-sociaux-finances-a-paris + inventaire SRU",
      coverage: "2001-2024 (financés) · SRU année en cours",
      href: "https://www.paris.fr/logement-social",
      hrefLabel: "paris.fr",
    },
    objectif:
      "Montrer où en est Paris sur l'objectif SRU, combien d'opérations sont financées, et quels bailleurs portent le parc.",
    pipeline: [
      { label: "Sync", detail: <>Dataset logements sociaux financés → <code>BigQuery raw</code></> },
      { label: "SRU", detail: <>Taux officiel DDT Paris, 1er janvier</> },
      { label: "Core", detail: <><code>core_logements_sociaux</code> par arr. × bailleur × catégorie</> },
      { label: "Mart", detail: <><code>mart_stats_arrondissements</code> → choroplèthe</> },
      { label: "Parts bailleurs", detail: <>Indicatives, croisement SDES + rapports annuels</>},
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
    id: "dette-patrimoine",
    number: "09",
    kicker: "Dette & patrimoine",
    title: "Bilan comptable : dette, actif, fonds propres",
    route: "/dette-patrimoine",
    source: {
      name: "Bilan comptable M57 (compte de gestion)",
      dataset: "compte de gestion au 31/12, publié avec le CA",
      coverage: "2019-2024",
      href: "https://opendata.paris.fr",
      hrefLabel: "opendata.paris.fr",
    },
    objectif:
      "Sortir du seul chiffre de la dette et replacer la Ville dans son bilan complet : ce qu'elle doit, ce qu'elle possède, ses fonds propres.",
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

const GLOSSARY: { term: string; def: string }[] = [
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

const FAQ: { q: string; a: string }[] = [
  {
    q: "Pourquoi votre chiffre diffère-t-il parfois de celui annoncé par la mairie ?",
    a: "Trois causes : (1) périmètre — on publie le budget principal, la mairie peut communiquer un « groupe Ville » qui inclut les satellites ; (2) timing — notre chiffre vient du dernier dataset ouvert ; (3) retraitement — on renomme et regroupe les chapitres, mais les agrégats sont identiques. Si l'écart persiste, dites-le-nous.",
  },
  {
    q: "Qu'est-ce que le LLM fait exactement dans votre pipeline ?",
    a: "Deux tâches précises : classifier la thématique des bénéficiaires de subventions, et aider à géolocaliser des projets d'investissement. Modèle : Gemini 2.5 Flash. Il ne calcule jamais un montant. Il tourne hors dbt, ses résultats sont mis en cache dans des seeds CSV publics, et on repasse manuellement sur les décisions &gt; 1 M€.",
  },
  {
    q: "Comment évitez-vous le double comptage entre budget, subventions et marchés ?",
    a: "Chaque entité est modélisée séparément, jamais UNIONée aux autres. Le budget contient une ligne agrégée de subventions ; notre page « Subventions » détaille cette même ligne côté bénéficiaires. On n'additionne pas les deux. Documenté dans docs/architecture-modelling.md.",
  },
  {
    q: "Vos totaux sont-ils identiques à ceux du site de la Ville ?",
    a: "Oui pour les agrégats issus d'un même dataset M57 : notre pipeline ne change pas les montants, il regroupe et renomme. Les écarts viennent des cas décrits plus haut (périmètre, timing, nomenclature).",
  },
  {
    q: "Pourquoi certaines années sont-elles absentes ou provisoires ?",
    a: "Chaque source a sa couverture documentée dans le tableau de couverture plus haut. L'exemple le plus visible : le dataset AP OpenData est gelé depuis 2022, donc pour 2023-2024 on bascule sur les PDF « Investissements Localisés ». On préfère afficher un manque que combler au doigt.",
  },
];

// -- Coverage timeline helper -----------------------------------------------
// Axis covers 2013 → 2026 inclusive = 14 years. Each year = 1/14th of the bar.
const AXIS_START = 2013;
const AXIS_END = 2026;
const AXIS_SPAN = AXIS_END - AXIS_START + 1;

function barStyle(start: number, end: number): CSSProperties {
  const left = ((start - AXIS_START) / AXIS_SPAN) * 100;
  const width = ((end - start + 1) / AXIS_SPAN) * 100;
  return { left: `${left}%`, width: `${width}%` };
}

type CoverageRow = {
  label: string;
  status: "ok" | "warn" | "info";
  statusLabel: string;
  segments: { start: number; end: number; text: string; kind?: "frozen" | "partial" }[];
};

const COVERAGE: CoverageRow[] = [
  { label: "Budget exécuté (CA)", status: "ok", statusLabel: "À jour",
    segments: [{ start: 2018, end: 2024, text: "2018-2024" }] },
  { label: "Budget voté (BP)", status: "ok", statusLabel: "À jour",
    segments: [{ start: 2019, end: 2026, text: "2019-2026" }] },
  { label: "Subventions", status: "ok", statusLabel: "À jour",
    segments: [{ start: 2018, end: 2024, text: "2018-2024" }] },
  { label: "Marchés publics", status: "ok", statusLabel: "À jour",
    segments: [{ start: 2013, end: 2024, text: "2013-2024 (~17k)" }] },
  { label: "Investissements (dataset AP)", status: "warn", statusLabel: "Gelé",
    segments: [{ start: 2018, end: 2022, text: "2018-2022 · gelé", kind: "frozen" }] },
  { label: "Investissements (PDF IL)", status: "info", statusLabel: "Partiel",
    segments: [
      { start: 2018, end: 2024, text: "2018-2024 (CA)", kind: "partial" },
      { start: 2025, end: 2026, text: "2025-2026 (BP)", kind: "partial" },
    ] },
  { label: "Logements sociaux financés", status: "ok", statusLabel: "À jour",
    segments: [{ start: 2013, end: 2024, text: "2001-2024 (affiché 2013+)" }] },
  { label: "Bilan comptable", status: "ok", statusLabel: "À jour",
    segments: [{ start: 2019, end: 2024, text: "2019-2024" }] },
];

export default function MethodePage() {
  const years: number[] = [];
  for (let y = AXIS_START; y <= AXIS_END; y++) years.push(y);

  return (
    <div className="theme-fusion">
      <Navbar />

      <section className="fx-page-header">
        <div className="fx-wrap">
          <div className="fx-page-kicker">— Méthode</div>
          <h1 className="fx-page-title">
            Comment on <em>construit</em> ces chiffres.
          </h1>
          <p className="fx-page-lede">
            Une page unique : d&apos;où viennent les données, comment elles sont traitées,
            quels choix éditoriaux ont été faits, et ce que les chiffres <em>ne disent pas</em>.
            Tout le pipeline est open source.
          </p>

          <div className="fx-meth-stats">
            <div className="fx-meth-stat">
              <span className="n">Datasets</span>
              <span className="v">7</span>
              <span className="c">sources OpenData Paris</span>
            </div>
            <div className="fx-meth-stat">
              <span className="n">Outils</span>
              <span className="v">6</span>
              <span className="c">budget · subv. · marchés · invest. · logement · dette</span>
            </div>
            <div className="fx-meth-stat">
              <span className="n">Lignes traitées</span>
              <span className="v">~100 k</span>
              <span className="c">53 k subventions + 24 k budget + 17 k marchés…</span>
            </div>
            <div className="fx-meth-stat">
              <span className="n">Historique</span>
              <span className="v">11 ans</span>
              <span className="c">2013 → 2024 (exécuté) · 2026 (voté)</span>
            </div>
          </div>

          <div className="fx-page-actions" style={{ marginTop: 28 }}>
            <Button variant="primary" href="#architecture">Voir l&apos;architecture</Button>
            <Button href="https://github.com/Nuttux/open-public-data">Le code sur GitHub ↗</Button>
          </div>
        </div>
      </section>

      <section className="fx-section">
        <div className="fx-wrap">
          <SectionHead
            number="00"
            kind="Sommaire"
            title={<>Ce que vous <em>trouverez</em> ici</>}
          />
          <div className="fx-toc">
            <a href="#principes">01 · Principes</a>
            <a href="#architecture">02 · Architecture</a>
            <a href="#couverture">03 · Couverture</a>
            {TOOLS.map((t) => (
              <a key={t.id} href={`#${t.id}`}>{t.number} · {t.kicker}</a>
            ))}
            <a href="#glossaire">10 · Glossaire</a>
            <a href="#faq">11 · FAQ</a>
            <a href="#reproductibilite">12 · Reproductibilité</a>
            <a href="#corrections">13 · Corrections</a>
          </div>
        </div>
      </section>

      <section id="principes" className="fx-section">
        <div className="fx-wrap">
          <SectionHead
            number="01"
            kind="Principes"
            title={<>Quatre <em>règles</em></>}
          />
          <div className="fx-sources fx-sources-4">
            <div>
              <div className="n">01</div>
              <h3>Pas de contenu sponsorisé</h3>
              <p>
                Aucun article, chiffre ou visualisation n&apos;est sponsorisé. Les
                financements reçus sont publiés avec leur montant et ne conditionnent
                pas la ligne éditoriale.
              </p>
            </div>
            <div>
              <div className="n">02</div>
              <h3>Neutralité politique</h3>
              <p>
                On publie des chiffres, pas des opinions. Les textes évitent les
                jugements sur les choix politiques et s&apos;en tiennent à la donnée.
              </p>
            </div>
            <div>
              <div className="n">03</div>
              <h3>Code & données ouverts</h3>
              <p>
                Tous les scripts sont sous licence MIT. Chaque chiffre peut être
                recalculé depuis un CSV source.
              </p>
            </div>
            <div>
              <div className="n">04</div>
              <h3>Corrections publiques</h3>
              <p>
                Erreur signalée = corrigée dans le code et consignée dans le
                changelog avec la date et l&apos;origine du signalement.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section id="architecture" className="fx-section">
        <div className="fx-wrap">
          <SectionHead
            number="02"
            kind="Architecture"
            title={<>Le même pipeline pour <em>chaque outil</em></>}
            subtitle="Ingestion → transformation → enrichissement → export. Une fois pour toutes."
          />

          <div className="fx-flow">
            <div className="fx-flow-row">
              <div className="fx-flow-node">
                <span className="k">01 · Source</span>
                <span className="lab">OpenData Paris</span>
                <span className="sub">7 datasets publics</span>
              </div>
              <span className="fx-flow-arrow">→</span>
              <div className="fx-flow-node">
                <span className="k">02 · Ingest</span>
                <span className="lab">BigQuery raw</span>
                <span className="sub">Python, aucune transformation</span>
              </div>
              <span className="fx-flow-arrow">→</span>
              <div className="fx-flow-node">
                <span className="k">03 · Staging (dbt)</span>
                <span className="lab">Typage & clés</span>
                <span className="sub">Filtrage, normalisation</span>
              </div>
              <span className="fx-flow-arrow">→</span>
              <div className="fx-flow-node">
                <span className="k">04 · Intermediate</span>
                <span className="lab">Jointures + ode_*</span>
                <span className="sub">Enrichissements dbt</span>
              </div>
            </div>

            <div className="fx-flow-row">
              <div className="fx-flow-node alt">
                <span className="k">Hors pipeline</span>
                <span className="lab">Gemini 2.5 Flash</span>
                <span className="sub">Thématique + géoloc top 500 (Pareto) → seeds CSV</span>
              </div>
              <span className="fx-flow-arrow">→</span>
              <div className="fx-flow-node">
                <span className="k">05 · Core (OBT)</span>
                <span className="lab">Une table par entité</span>
                <span className="sub">core_budget, core_subventions…</span>
              </div>
              <span className="fx-flow-arrow">→</span>
              <div className="fx-flow-node">
                <span className="k">06 · Marts</span>
                <span className="lab">Une vue par viz</span>
                <span className="sub">mart_sankey, mart_carte, …</span>
              </div>
              <span className="fx-flow-arrow">→</span>
              <div className="fx-flow-node out">
                <span className="k">07 · Sortie</span>
                <span className="lab">JSON figés</span>
                <span className="sub">Consommés par Next.js, pas d&apos;API live</span>
              </div>
            </div>

            <div className="fx-flow-note">
              Règle anti-double comptage — <code>core_budget</code>, <code>core_subventions</code>,
              <code>core_marches_publics</code>, <code>core_ap_projets</code> ne sont jamais UNIONés.
              Chaque entité vit séparément. Détail dans <code>docs/architecture-modelling.md</code>.
            </div>
          </div>
        </div>
      </section>

      <section id="couverture" className="fx-section">
        <div className="fx-wrap">
          <SectionHead
            number="03"
            kind="Couverture & fraîcheur"
            title={<>Ce qui est <em>à jour</em>, ce qui ne l&apos;est pas</>}
            subtitle="Les données ouvertes par la Ville ne sont pas toutes maintenues au même rythme."
          />

          <div className="fx-timeline">
            <div className="fx-timeline-axis">
              <span className="lbl">Outil</span>
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
            <b>Règle</b> : l&apos;année en cours est toujours provisoire tant que le compte
            administratif définitif n&apos;est pas publié (~juin N+1). Les chiffres d&apos;une
            année non-close reposent sur le voté.
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
                  <div className="k">Source</div>
                  <div className="v">{tool.source.name}</div>
                </div>
                <div>
                  <div className="k">Dataset</div>
                  <div className="v"><code>{tool.source.dataset}</code></div>
                </div>
                <div>
                  <div className="k">Couverture</div>
                  <div className="v">{tool.source.coverage}</div>
                </div>
              </div>

              <div className="fx-tool-body">
                <div className="objectif">
                  <span className="k">Objectif</span>
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
                  <summary>Choix éditoriaux ({tool.choix.length})</summary>
                  <ul>
                    {tool.choix.map((c, i) => <li key={i}>{c}</li>)}
                  </ul>
                </details>
                <details>
                  <summary>Ce que les chiffres ne disent pas ({tool.limites.length})</summary>
                  <ul>
                    {tool.limites.map((l, i) => <li key={i}>{l}</li>)}
                  </ul>
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
            kind="Glossaire"
            title={<>Les mots qu&apos;on <em>utilise</em></>}
            subtitle="Jargon comptable et technique en une phrase."
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
            title={<>Les questions qui <em>reviennent</em></>}
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
            kind="Reproductibilité"
            title={<>Refaire les calculs <em>vous-même</em></>}
          />
          <div className="fx-sources">
            <div>
              <div className="n">01 · Exports</div>
              <h3>Télécharger la donnée nettoyée</h3>
              <p>
                Bouton CSV et JSON en bas de chaque page « Sources & méthode ». Format
                stable, colonnes documentées dans le dépôt.
              </p>
              <Link href="/budget">Exemple&nbsp;: export budget →</Link>
            </div>
            <div>
              <div className="n">02 · Code</div>
              <h3>Rejouer le pipeline</h3>
              <p>
                Les modèles dbt et scripts Python sont dans <code>pipeline/</code>.
                &nbsp;<code>dbt run</code> + <code>export_all.py</code> régénère les JSON.
              </p>
              <a href="https://github.com/Nuttux/open-public-data" target="_blank" rel="noopener noreferrer">
                github.com/Nuttux/open-public-data ↗
              </a>
            </div>
            <div>
              <div className="n">03 · Données brutes</div>
              <h3>Remonter à la source</h3>
              <p>
                Les datasets sources sont listés outil par outil plus haut. Le CSV de la
                Ville fait foi — ne rien nous croire sur parole.
              </p>
              <a href="https://opendata.paris.fr" target="_blank" rel="noopener noreferrer">
                opendata.paris.fr ↗
              </a>
            </div>
          </div>
        </div>
      </section>

      <section id="corrections" className="fx-section">
        <div className="fx-wrap">
          <SectionHead
            number="13"
            kind="Corrections & changelog"
            title={<>Une erreur ? <em>On corrige.</em></>}
            subtitle="Les corrections sont publiques, datées, consignées."
          />
          <div className="fx-sources">
            <div>
              <div className="n">Signaler</div>
              <h3>Corriger un chiffre</h3>
              <p>Par courriel ou ticket GitHub. Précisez la page, le chiffre contesté,
              et si possible la source officielle contradictoire.</p>
              <a href="mailto:contact@franceopendata.org">contact@franceopendata.org ↗</a>
            </div>
            <div>
              <div className="n">Journal</div>
              <h3>Changelog public</h3>
              <p>Historique des corrections — date, ampleur, chiffre avant / après — tenu
              dans le dépôt GitHub.</p>
              <a href="https://github.com/Nuttux/open-public-data/commits/main" target="_blank" rel="noopener noreferrer">
                Voir les commits ↗
              </a>
            </div>
            <div>
              <div className="n">Règle</div>
              <h3>Jamais de chiffre supprimé</h3>
              <p>On corrige en place, et on garde la trace. Un screenshot d&apos;un ancien
              chiffre reste reliable à une entrée du changelog.</p>
              <Link href="/contact">Nous écrire →</Link>
            </div>
          </div>

          <div style={{ marginTop: 32, display: "flex", gap: 10, flexWrap: "wrap" }}>
            <Button variant="primary" href="/contact">Signaler une erreur</Button>
            <Button href="/">Retour à l&apos;accueil</Button>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
}
