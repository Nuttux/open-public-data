"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import Navbar from "@/components/fusion/Navbar";
import Footer from "@/components/fusion/Footer";
import SectionHead from "@/components/fusion/SectionHead";
import Button from "@/components/fusion/Button";
import { useLocale } from "@/lib/localeContext";
import { TIMELINE_AXIS_START, TIMELINE_AXIS_END } from "@/lib/methodology";

type SourceRow = {
  portal: string;
  url: string;
  datasets: string;
  freshness: string;
};

type TraceStep = {
  stage: string;
  label: string;
  value: string;
  detail: string;
};

type ToolMethod = {
  id: string;
  kicker: string;
  number: string;
  title: string;
  route: string;
  source: { name: string; dataset: string; coverage: string; href: string; hrefLabel: string };
  enClair: ReactNode;
  objectif: string;
  pipeline: { label: string; detail: ReactNode }[];
  choix: string[];
  limites: string[];
};

type CoverageRow = {
  label: string;
  volume?: string;
  href?: string;
  status: "ok" | "warn" | "info";
  statusLabel: string;
  segments: { start: number; end: number; text: string; kind?: "frozen" | "partial" }[];
};

const AXIS_START = TIMELINE_AXIS_START;
const AXIS_END = TIMELINE_AXIS_END;
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
    title: "Budget principal — voté & exécuté", route: "/ville/paris/budget",
    source: { name: "Comptes administratifs M57 + budgets primitifs", dataset: "comptes-administratifs-budgets-principaux-a-partir-de-2019-m57-ville-departement", coverage: "2019-2024 (exécuté) · 2019-2026 (voté)", href: "https://opendata.paris.fr/explore/dataset/comptes-administratifs-budgets-principaux-a-partir-de-2019-m57-ville-departement/", hrefLabel: "opendata.paris.fr" },
    enClair: (
      <>
        <p>Chaque année la Ville vote un budget — ce qu'elle compte encaisser et dépenser. En fin d'exercice, elle publie ce qu'elle a vraiment fait : le compte administratif. Les deux documents sont publics, mais rédigés dans un plan comptable (« M57 ») qui parle aux trésoriers plus qu'aux habitants.</p>
        <p>On reprend ces chiffres tels quels — sans les recalculer — et on traduit les intitulés techniques en français courant : « Charges à caractère général » devient « Achats & charges courantes », par exemple. On sépare toujours le <b>voté</b> (l'intention) et l'<b>exécuté</b> (ce qui est vraiment sorti du compte) pour que tu puisses comparer les deux.</p>
        <p><b>Ce que ça ne montre pas :</b> les budgets annexes (eau, assainissement) sont gérés à part et ne sont pas inclus. Le compte définitif d'une année N n'est consolidé que vers juin N+1 — avant ça, les chiffres sont provisoires.</p>
      </>
    ),
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
    title: "Subventions versées aux bénéficiaires", route: "/ville/paris/subventions",
    source: { name: "Subventions versées — annexes CA", dataset: "subventions-versees-annexe-compte-administratif-a-partir-de-2018", coverage: "2018-2024 · ~53 000 lignes", href: "https://opendata.paris.fr/explore/dataset/subventions-versees-annexe-compte-administratif-a-partir-de-2018/", hrefLabel: "opendata.paris.fr" },
    enClair: (
      <>
        <p>La Ville verse chaque année des subventions à des associations, fondations, opérateurs, bailleurs sociaux. Elle est obligée par la loi de publier la liste en annexe de ses comptes : qui reçoit quoi, pour quel montant, et pour faire quoi (l'« objet » de la subvention).</p>
        <p>On récupère cette liste (~53 000 lignes sur 2018-2024), on réconcilie les bénéficiaires qui apparaissent sous plusieurs orthographes, et on va chercher dans le registre des associations et le fichier SIRENE pour savoir à qui on a vraiment affaire. Pour rendre le paysage lisible, on classe chaque ligne par thématique (Social, Logement, Culture, Sport…) via un modèle de langage ; l'objet brut et le SIRET restent visibles pour vérification ligne par ligne.</p>
        <p><b>Ce que ça ne montre pas :</b> on ne géolocalise pas les subventions. Une association peut avoir son siège dans le 9ᵉ et mener ses actions dans le 18ᵉ — l'adresse du siège ne dit rien d'où l'argent atterrit. Les subventions en nature (mise à disposition de locaux, de matériel) sont signalées mais pas chiffrées.</p>
      </>
    ),
    objectif: "Savoir qui reçoit l'argent public en subvention, pour quoi, et dans quelle proportion — du CASVP aux plus petites associations.",
    pipeline: [
      { label: "Sync + jointure", detail: <>Dataset subventions + dataset associations (SIRET, objet)</> },
      { label: "Normalisation", detail: <>Clé <code>beneficiaire_normalise</code> quand le SIRET est absent</> },
      { label: "LLM thématique", detail: <>Gemini 3 Flash / Claude Opus (selon tâche) sur top 500 cumulés → seed cache</> },
      { label: "Type organisme", detail: <>Colonnes <code>ode_*</code> (public / asso / entreprise / PP)</> },
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
    title: "Marchés notifiés (commande publique)", route: "/ville/paris/marches",
    source: { name: "opendata.paris.fr + DECP nationale data.gouv.fr", dataset: "liste-des-marches-de-la-collectivite-parisienne + decp-consolides", coverage: "2013-2026 · 23 053 contrats consolidés", href: "https://opendata.paris.fr/explore/dataset/liste-des-marches-de-la-collectivite-parisienne/", hrefLabel: "opendata.paris.fr" },
    enClair: (
      <>
        <p>Quand la Ville achète quelque chose à une entreprise — construction d'une école, collecte des déchets, fournitures de bureau, maintenance informatique — elle publie un avis de marché : qui a été choisi, pour combien, pour quoi. Ces données s'appellent les DECP (Données Essentielles de la Commande Publique) et sont obligatoires depuis 2016.</p>
        <p>On fusionne <b>deux sources</b> : le dataset publié par la Ville sur opendata.paris.fr et la DECP nationale consolidée par l'État sur data.gouv.fr. Les deux alimentent des pipelines distincts (Coriolis interne Ville vs plateforme AIFE/ATLINE État) et ne se recouvrent qu'à 50-60 % — une source à elle seule en rate ~30 %. On joint par numéro de marché (<code>num_marche[4:] = decp.id</code>) et on ajoute les marchés qui n'existent que dans DECP. La DECP apporte aussi les colonnes qui manquent côté Paris : type CCAG (Travaux/Fournitures…), code CPV (catégorie européenne standardisée), lieu d'exécution, <b>nombre d'offres reçues</b> (c'est ce qui alimente la section « Concurrence »), clauses sociales/environnementales.</p>
        <p>On reclasse les intitulés techniques par grandes catégories (travaux, services, fournitures, énergie…) et on agrège par titulaire pour voir quelles entreprises captent le plus de contrats en cumulé. Enfin, on <b>relie chaque marché à son projet d'investissement</b> quand c'est possible : 4 322 appariements validés via <code>seed_match_projet_marches.csv</code> (hash stable objet+titulaire), pour qu'une école ouverte sur la carte des investissements affiche aussi les entreprises qui l'ont construite.</p>
        <p><b>Deux chiffres, deux sens.</b> Sur la fiche d'un contrat, on affiche parfois <b>deux montants</b> :</p>
        <ul>
          <li><b>Plafond autorisé</b> (source Ville) — le maximum que la Ville peut dépenser sur toute la durée du contrat. Pour un accord-cadre de 4 ans à 2 M€/an, c'est 8 M€. Ce n'est pas ce qui sera réellement dépensé.</li>
          <li><b>Montant notifié</b> (source DECP) — ce que la Ville a déclaré à l'État au moment de la signature. Souvent plus réaliste que le plafond pour les accords-cadres, mais ce n'est pas non plus le cumul des bons de commande effectivement émis (cette donnée n'est pas publique au niveau du contrat individuel).</li>
        </ul>
        <p><b>Ce que ça ne montre pas :</b> 97 % des marchés sont des accords-cadres pluriannuels ; la consommation réelle n'est disponible qu'au niveau agrégé (compte administratif). Les avenants sont mal remontés. Les marchés &lt; 40 k€ HT ne sont pas obligatoirement publiés. Les marchés des satellites (ParisHabitat, Eau de Paris, SEM, CASVP) ne sont pas inclus — ils ont leur propre ligne DECP qu'on n'a pas encore intégrée.</p>
      </>
    ),
    objectif: "Voir qui la Ville paie pour travaux, fournitures et services, quel volume, et quels titulaires concentrent les contrats.",
    pipeline: [
      { label: "Sync Paris", detail: <>opendata.paris.fr → <code>raw.liste_des_marches_de_la_collectivite_parisienne</code></> },
      { label: "Sync DECP", detail: <>data.gouv.fr (fichiers annuels 2019-2026) → <code>raw.decp_marches_paris</code> via <code>fetch_decp_paris.py</code>, filtre SIRET 217500*</> },
      { label: "Staging", detail: <>Normalisation + dédup DECP par <code>id</code> (dernier état gagne)</> },
      { label: "Core", detail: <>LEFT JOIN sur <code>SUBSTR(num_marche, 5) = decp.id</code> + UNION des DECP-exclusifs, dédup multi-titulaires par (objet, montant, date)</> },
      { label: "Concurrence", detail: <>Agrégation du champ <code>offresRecues</code> (DECP) par année → buckets 1 / 2 / 3-5 / 6+ offres, taux de mono-offre</> },
      { label: "Match projets", detail: <><code>match_projet_marches.py</code> + <code>seed_match_projet_marches.csv</code> (4 322 lignes) → table <code>int_projet_marches</code> qui relie un marché à son projet d'investissement AP</> },
      { label: "Marts", detail: <><code>mart_marches_fournisseurs</code> + <code>mart_marches_par_nature</code> + <code>mart_projet_marches</code></> },
      { label: "Enrichissement lisible", detail: <>Traduction <code>codeCPV</code> → famille française, dérivation <code>afficher_deux_montants</code> si écart plafond ↔ notifié &gt; 5 %</> },
    ],
    choix: [
      "Total affiché = plafonds contractuels autorisés (somme des enveloppes maximum), pas des dépenses exécutées.",
      "Dédup DECP multi-titulaires : un accord-cadre à N titulaires = 1 ligne, plafond compté une seule fois.",
      "Deuxième chiffre « montant notifié » affiché uniquement quand l'écart est significatif (> 5 %) — évite d'alourdir la lecture sur les marchés simples.",
      "Section Concurrence masquée tant que la couverture offresRecues est < 20 % ou < 50 marchés (avant 2024, le champ n'est pas historisé) — état vide honnête plutôt qu'une estimation trompeuse.",
      "Année en cours (2026) visible dans les tableaux mais signalée comme partielle — les marchés notifiés en fin d'année n'ont pas encore été remontés.",
      "Les critères de repérage (signaux faibles) sont publiés — signaux, pas accusations.",
    ],
    limites: [
      "97 % des marchés sont des accords-cadres ; 66 % ont montant_min = 0 — consommation réelle parfois bien inférieure au plafond.",
      "Les deux sources ne se recouvrent qu'à ~55 %. On capture le superset, mais les règles de publication divergent (seuils, timing, formats de numéro).",
      "Avenants partiellement remontés — sous-estimation possible.",
      "Champ offresRecues non historisé avant 2024 dans DECP : la section Concurrence ne couvre que les années récentes.",
      "Lieu d'exécution DECP au niveau département (« Paris 75 ») : pas d'arrondissement précis, géocodage fin non encore implémenté.",
      "Satellites (SEM, OPH, CASVP, Eau de Paris) non inclus — leur DECP existe mais reste à rapatrier.",
    ],
  },
  {
    id: "investissements", number: "07", kicker: "Investissements",
    title: "Projets d'investissement (AP)", route: "/ville/paris/investissements",
    source: { name: "Annexes AP du CA + PDF « Investissements Localisés »", dataset: "comptes-administratifs-autorisations-de-programmes-a-partir-de-2018-m57-ville-de + PDF cdn.paris.fr", coverage: "Dataset gelé 2018-2022 · PDF IL 2018-2026", href: "https://opendata.paris.fr/explore/dataset/comptes-administratifs-autorisations-de-programmes-a-partir-de-2018-m57-ville-de/", hrefLabel: "opendata.paris.fr" },
    enClair: (
      <>
        <p>L'investissement, c'est ce que la Ville dépense pour construire, rénover, équiper : une école, une piscine, une crèche, refaire une rue. Contrairement au fonctionnement (salaires, énergie, entretien…), ces dépenses laissent une trace physique dans la ville et s'amortissent sur des années.</p>
        <p>La Ville publie chaque année en annexe de ses comptes la liste des opérations d'investissement localisées — typiquement un PDF de plusieurs centaines de pages avec les montants votés projet par projet. On extrait ces données automatiquement, on les géolocalise quand c'est possible (adresse, arrondissement), et on les rattache à un chapitre budgétaire pour savoir à quelle politique publique chaque projet appartient.</p>
        <p><b>Ce que ça ne montre pas :</b> les chiffres sont des <b>autorisations de programme</b> — l'argent voté pour un projet, pas forcément ce qui a été payé (les paiements peuvent s'étaler sur plusieurs années). Environ 20-30 % des projets n'ont pas de localisation précise car ils sont « transverses » (informatique municipale, matériel partagé, études multi-sites). Et le surcoût éventuel en fin de chantier n'est pas systématiquement republié.</p>
      </>
    ),
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
    title: "Logement social (SRU, opérations, parc)", route: "/ville/paris/logement",
    source: { name: "Inventaire SRU (DDT) + logements sociaux financés + Socle DRIHL", dataset: "logements-sociaux-finances-a-paris + inventaire SRU + Socle demandes et attributions DRIHL", coverage: "2001-2024 (financés) · SRU année en cours · Socle 2024", href: "https://www.paris.fr/logement-social", hrefLabel: "paris.fr" },
    enClair: (
      <>
        <p>Trois questions sont traitées ensemble sur cette page, parce qu'elles se répondent.</p>
        <p><b>Où en est Paris sur la loi SRU ?</b> La loi impose aux grandes villes d'avoir au moins 25 % de logements sociaux dans leur parc. On prend les chiffres officiels de l'inventaire SRU publié par le ministère, arrondissement par arrondissement, pour voir qui atteint la cible et qui en est loin. On ajoute les volumes de logements sociaux financés chaque année par la Ville, pour voir si le rythme de production suit.</p>
        <p><b>Où la tension est-elle la plus forte ?</b> Depuis l'ouverture du <i>Socle de données demandes et attributions</i> de la DRIHL, on peut enfin répondre arrondissement par arrondissement. Pour 2024 : 195 828 demandes actives à Paris en choix 1, 9 098 attributions — soit un ratio de 21,5 ménages qui attendent pour 1 attribution annuelle. Ce ratio varie du simple au double selon l'arrondissement ; on l'affiche brut, sans pondération.</p>
        <p><b>Quel délai d'attente pour obtenir un logement social ?</b> La réponse officielle — 4,2 ans en médiane à Paris en 2024 — cache d'énormes écarts selon la taille du logement demandé, l'arrondissement, la situation du ménage, le niveau de revenus. Le simulateur donne un ordre de grandeur à partir de multiplicateurs calibrés sur les statistiques publiques disponibles. Ce n'est pas une estimation officielle DRIHL : c'est un outil pour se faire une idée, pas une promesse.</p>
        <p><b>Ce que ça ne montre pas :</b> le Socle DRIHL indique les demandes « choix 1 » (territoire prioritaire) et les attributions réalisées, mais pas le profil socio-économique des ménages qui obtiennent un logement — cette donnée n'est pas ouverte. Le parc existant n'est pas géolocalisé à l'adresse (le SRU ne descend pas plus fin que l'arrondissement).</p>
      </>
    ),
    objectif: "Montrer où en est Paris sur l'objectif SRU, où la tension est la plus forte, et combien d'opérations sont financées chaque année.",
    pipeline: [
      { label: "Sync", detail: <>Dataset logements sociaux financés → <code>BigQuery raw</code></> },
      { label: "SRU", detail: <>Taux officiel DDT Paris, 1er janvier</> },
      { label: "Socle DRIHL", detail: <>Demandes choix 1 + attributions 2024 par arrondissement → <code>core_logement_attente_arr</code></> },
      { label: "Core", detail: <><code>core_logements_sociaux</code> par arr. × bailleur × catégorie</> },
      { label: "Mart", detail: <><code>mart_stats_arrondissements</code> → choroplèthe + composant <code>TensionParArrondissement</code></> },
      { label: "Parts bailleurs", detail: <>Indicatives, croisement SDES + rapports annuels</> },
    ],
    choix: [
      "Activité financée (AP), pas livraisons : financement en 2022 ≠ livraison 2025.",
      "Ratio de tension affiché brut (demandes choix 1 / attributions) — aucune pondération par taille de logement ou profil, pour rester traçable ligne à ligne.",
      "Parts de bailleurs indicatives tant qu'un jeu consolidé officiel n'est pas publié.",
    ],
    limites: [
      "Socle DRIHL : la série démarre à 2024, pas d'historique pluri-annuel consolidé pour l'instant.",
      "Pas de géoloc du parc existant : SRU et Socle ne descendent pas à l'adresse.",
      "Profil socio-économique des bénéficiaires effectifs non ouvert (ni par la DRIHL, ni par la Ville).",
    ],
  },
  {
    id: "dette-patrimoine", number: "09", kicker: "Dette & patrimoine",
    title: "Bilan comptable : dette, actif, fonds propres", route: "/ville/paris/dette",
    source: { name: "Bilan comptable M57 + dataset dette-garantie (annexe IV-B) + ROB", dataset: "bilan-comptable + dette-garantie", coverage: "2019-2024 · 9 960 emprunts garantis 2024", href: "https://opendata.paris.fr/explore/dataset/bilan-comptable/", hrefLabel: "opendata.paris.fr" },
    enClair: (
      <>
        <p>Comme une entreprise, une collectivité a un <b>bilan</b> : à gauche ce qu'elle possède (bâtiments, terrains, équipements, liquidités), à droite ce qu'elle doit (dette bancaire et obligataire, provisions pour charges futures). La différence entre les deux, c'est le <b>patrimoine net</b> — ce qui resterait à la Ville si elle soldait toutes ses dettes demain matin.</p>
        <p>On prend le bilan tel qu'il est publié chaque année dans le compte administratif, et on va chercher en complément dans le <i>Rapport d'Orientation Budgétaire</i> des informations qui ne sont pas publiées en open data ligne par ligne : le taux moyen pondéré de la dette, l'échéancier de remboursement, la répartition entre taux fixe et taux variable. Ce sont ces chiffres qui permettent de calculer la fameuse capacité de désendettement (combien d'années faudrait-il pour rembourser la dette si on y consacrait toute l'épargne brute).</p>
        <p><b>Et le hors-bilan, enfin chiffré.</b> La Ville garantit les emprunts des bailleurs sociaux auprès de la CDC : ligne par ligne, ce n'est pas sa dette, mais elle doit payer à leur place en cas de défaut. Le dataset <code>dette-garantie</code> (annexe IV-B du CA) liste les 9 960 emprunts garantis en 2024 — capital restant dû, prêteur, bénéficiaire, indice. On l'agrège dans <code>build_hors_bilan.py</code> et on le présente à côté du bilan, jamais fondu dedans : 12,3 Md€ d'engagements potentiels, distincts des 10,7 Md€ de dette financière directe.</p>
        <p><b>Ce que ça ne montre pas :</b> le patrimoine est évalué à sa <b>valeur comptable historique</b> (coût d'acquisition moins amortissement), pas à la valeur de marché. Certains actifs majeurs — monuments classés, œuvres d'art, terrains anciens — sont structurellement sous-évalués, parfois inscrits à 1 € symbolique. Les bilans consolidés des satellites (SEM, OPH, CASVP) ne sont pas ouverts — on ne peut pas faire de « bilan groupe Ville ».</p>
      </>
    ),
    objectif: "Sortir du seul chiffre de la dette et replacer la Ville dans son bilan complet : ce qu'elle doit, ce qu'elle possède, ses garanties hors-bilan, ses fonds propres.",
    pipeline: [
      { label: "Upload", detail: <><code>upload_bilan_comptable.py</code> → <code>BigQuery raw</code></> },
      { label: "Normalisation", detail: <>Comptes classe 1 à 5 → grandes masses</> },
      { label: "Core", detail: <><code>core_bilan_comptable</code> (actif, FP, dette, provisions)</> },
      { label: "Structure dette", detail: <><code>build_patrimoine_structure.py</code> → <code>patrimoine_structure_YYYY.json</code> (obligataire, bancaire, répartition taux)</> },
      { label: "Hors-bilan", detail: <><code>build_hors_bilan.py</code> sur <code>dette-garantie</code> → <code>hors_bilan_YYYY.json</code> (capital restant dû, top bénéficiaires, top prêteurs, split taux fixe/variable)</> },
      { label: "Mart", detail: <><code>mart_bilan_sankey</code> + ratios (dette/hab, dette/épargne)</> },
    ],
    choix: [
      "Dette = budget principal seul. Hors-bilan (garanties d'emprunt) calculé et affiché à côté, jamais additionné à la dette directe.",
      "Ratios par habitant : population municipale INSEE la plus récente.",
      "Taux moyen pondéré, durée résiduelle, répartition fixe/variable : lus dans le Rapport d'Orientation Budgétaire quand l'information manque du dataset ouvert.",
    ],
    limites: [
      "Structure fine de la dette (emprunt par emprunt, pour la dette directe) non publiée en open data.",
      "Bilans consolidés SEM / OPH / CASVP non ouverts — pas de « bilan groupe Ville ».",
      "Hors-bilan : seul le capital restant dû est publié, pas la probabilité de défaut (jugée faible par les agences de notation mais non chiffrée).",
    ],
  },
];

const GLOSSARY_FR: { term: string; def: string }[] = [
  { term: "M57", def: "Nomenclature comptable standard des collectivités territoriales, obligatoire depuis 2024. Remplace M14 / M52." },
  { term: "CA (compte administratif)", def: "Budget réellement exécuté, voté après la clôture. Publié ~6 mois après." },
  { term: "BP (budget primitif) / voté", def: "Budget prévisionnel adopté avant le début de l'exercice. Peut être modifié en cours d'année." },
  { term: "AP / CP", def: "Autorisation de Programme (enveloppe pluriannuelle) vs Crédit de Paiement (décaissement annuel). Un AP 100 M€ peut se consommer sur 4 ans." },
  { term: "SIRET / SIREN", def: "Numéro d'identification d'une entreprise ou d'un opérateur public. SIREN = 9 chiffres (l'entité), SIRET = 14 chiffres (l'établissement). Utilisé pour faire le lien entre un bénéficiaire et son profil officiel." },
  { term: "RNA", def: "Répertoire National des Associations (numéro W + 9 chiffres). Les associations en ont un à la place du SIRET si elles ne sont pas immatriculées au répertoire SIRENE. Si vous cherchez une asso et ne trouvez rien par SIRET, tentez son nom." },
  { term: "Délibération", def: "Décision prise en séance du Conseil de Paris et inscrite au registre officiel. Chaque subvention, marché ou investissement est adossé à une ou plusieurs délibérations." },
  { term: "Encours (de dette)", def: "Montant total restant dû à un instant donné. Différent de l'annuité (ce qu'on rembourse dans l'année) et du flux (nouveaux emprunts de l'année)." },
  { term: "Provisions pour risques et charges", def: "Sommes mises de côté au bilan pour couvrir des dépenses futures probables mais incertaines (litiges, garanties d'emprunt qui pourraient être appelées…). Apparaissent au passif." },
  { term: "Immobilisations", def: "Actifs durables au bilan : bâtiments, routes, terrains, réseaux, équipements. S'opposent à l'actif circulant (trésorerie, créances court terme). Évaluées au coût historique, pas à la valeur de marché." },
  { term: "Capacité de désendettement", def: "Nombre d'années qu'il faudrait pour rembourser toute la dette si on y consacrait toute l'épargne brute. Comme la durée restante d'un crédit immobilier. Au-delà de 12 ans, la situation est jugée tendue." },
  { term: "SRU", def: "Loi Solidarité et Renouvellement Urbain — quota de logements sociaux. Calculé chaque 1er janvier par la DDT." },
  { term: "DDT / DRIHL", def: "Direction Départementale des Territoires / Direction Régionale et Interdépartementale de l'Hébergement et du Logement. Services de l'État qui contrôlent le respect des quotas SRU et gèrent la politique du logement en Île-de-France." },
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
  { q: "Qu'est-ce que le LLM fait exactement dans votre pipeline ?", a: "L'enrichissement tourne en deux tiers. Tier 2 (gratuit) : appel de l'API SIRENE publique pour vérifier ~5 800 bénéficiaires (forme juridique, activité, adresse) — aucun LLM. Tier 1 (LLM payant, opt-in via --tier1) : Claude Opus ou Gemini 3 Flash pour classer les subventions par thème, géolocaliser les projets d'investissement ambigus, vérifier l'activité des bénéficiaires par grounded search et vulgariser les intitulés techniques de marchés. Un LLM ne calcule jamais un montant. Tout tourne hors dbt et ses résultats sont mis en cache dans des seeds CSV publics, inspectables et reproductibles ; l'objet brut et le SIRET restent affichés pour vérification." },
  { q: "Pourquoi la section Concurrence des marchés ne remonte-t-elle qu'à 2024 ?", a: "Le champ offresRecues (nombre d'offres reçues par marché) n'est historisé dans la DECP qu'à partir de 2024 — avant, il était soit vide soit renseigné de manière anecdotique. Plutôt que d'extrapoler, on masque la section tant que la couverture est < 20 % (ou < 50 marchés sur l'année) et on affiche un état vide honnête." },
  { q: "Comment chiffrez-vous le hors-bilan maintenant ?", a: "La Ville publie depuis 2024 un dataset OpenData dette-garantie (annexe IV-B du CA) qui liste chaque emprunt garanti : capital restant dû, prêteur, bénéficiaire (majoritairement des bailleurs sociaux), indice. On l'agrège dans build_hors_bilan.py et on l'affiche à côté du bilan, jamais fondu dedans : 12,3 Md€ d'engagements potentiels en 2024, distincts des 10,7 Md€ de dette financière directe." },
  { q: "Comment évitez-vous le double comptage entre budget, subventions et marchés ?", a: "Chaque entité est modélisée séparément, jamais UNIONée aux autres. Le budget contient une ligne agrégée de subventions ; notre page « Subventions » détaille cette même ligne côté bénéficiaires. On n'additionne pas les deux. Documenté dans docs/architecture-modelling.md." },
  { q: "Combien la Ville dépense-t-elle vraiment en marchés publics une année donnée ?", a: "Notre page Marchés affiche le total des PLAFONDS de contrats signés cette année-là (ex. 3,22 Mds€ pour 2024). Ce n'est PAS la dépense annuelle réelle : un accord-cadre de 4 ans à 2 M€/an est compté 8 M€ à la signature. La dépense effective en marchés cette année-là se lit uniquement dans le compte administratif agrégé (chapitres 011 charges générales + 20/21/23 immobilisations), pas au niveau du contrat individuel. Les deux chiffres ne sont pas comparables et ne se somment pas." },
  { q: "Pourquoi Budget, Investissements et Marchés donnent-ils des totaux différents ?", a: "Ce sont trois lectures complémentaires, pas trois calculs du même chiffre. BUDGET = toutes les dépenses annuelles (salaires + investissement + subventions + marchés + dettes…). INVESTISSEMENTS = ce qui est voté pour des projets physiques (AP, pluriannuel). MARCHÉS = ce qui est signé avec des entreprises (plafonds contractuels, pluriannuels). Un même euro peut apparaître dans les trois sous des angles différents. On ne les additionne jamais." },
  { q: "Vos totaux sont-ils identiques à ceux du site de la Ville ?", a: "Oui pour les agrégats issus d'un même dataset M57 : notre pipeline ne change pas les montants, il regroupe et renomme. Les écarts viennent des cas décrits plus haut (périmètre, timing, nomenclature)." },
  { q: "Pourquoi certaines années sont-elles absentes ou provisoires ?", a: "Chaque source a sa couverture documentée dans le tableau de couverture plus haut. L'exemple le plus visible : le dataset AP OpenData est gelé depuis 2022, donc pour 2023-2024 on bascule sur les PDF « Investissements Localisés ». On préfère afficher un manque que combler au doigt." },
];

const COVERAGE_FR: CoverageRow[] = [
  { label: "Budget exécuté (CA)", volume: "25 629 lignes", href: "https://opendata.paris.fr/explore/dataset/comptes-administratifs-budgets-principaux-a-partir-de-2019-m57-ville-departement/", status: "ok", statusLabel: "À jour", segments: [{ start: 2018, end: 2024, text: "2018-2024" }] },
  { label: "Budget voté (BP)", volume: "8 598 lignes", href: "https://opendata.paris.fr/explore/dataset/budgets-votes-principaux-a-partir-de-2019-m57-ville-departement/", status: "ok", statusLabel: "À jour", segments: [{ start: 2019, end: 2026, text: "2019-2026" }] },
  { label: "Subventions", volume: "38 839 lignes · gap 2020-2021 (format non-comparable)", href: "https://opendata.paris.fr/explore/dataset/subventions-versees-annexe-compte-administratif-a-partir-de-2018/", status: "info", statusLabel: "Partiel", segments: [{ start: 2018, end: 2019, text: "2018-2019", kind: "partial" }, { start: 2022, end: 2024, text: "2022-2024" }] },
  { label: "Marchés publics", volume: "23 053 contrats (Ville + DECP national)", href: "https://opendata.paris.fr/explore/dataset/liste-des-marches-de-la-collectivite-parisienne/", status: "ok", statusLabel: "À jour", segments: [{ start: 2013, end: 2026, text: "2013-2026 · fusion opendata.paris.fr + DECP nationale" }] },
  { label: "Concurrence (offresRecues DECP)", volume: "champ non historisé avant 2024", href: "https://www.data.gouv.fr/fr/datasets/donnees-essentielles-de-la-commande-publique-fichiers-consolides/", status: "info", statusLabel: "Partiel", segments: [{ start: 2024, end: 2025, text: "2024-2025", kind: "partial" }] },
  { label: "Investissements (dataset AP)", volume: "dataset gelé", href: "https://opendata.paris.fr/explore/dataset/comptes-administratifs-autorisations-de-programmes-a-partir-de-2018-m57-ville-de/", status: "warn", statusLabel: "Gelé", segments: [{ start: 2018, end: 2022, text: "2018-2022 · gelé", kind: "frozen" }] },
  { label: "Investissements (PDF IL)", volume: "~450 projets/an", href: "https://cdn.paris.fr/paris/2025/06/25/ca-2024-annexe-il-UtMj.PDF", status: "info", statusLabel: "Partiel", segments: [{ start: 2018, end: 2024, text: "2018-2024 (CA)", kind: "partial" }, { start: 2025, end: 2026, text: "2025-2026 (BP)", kind: "partial" }] },
  { label: "Match projets ↔ marchés", volume: "4 322 appariements (seed)", href: "https://github.com/Nuttux/open-public-data/blob/main/pipeline/seeds/seed_match_projet_marches.csv", status: "ok", statusLabel: "À jour", segments: [{ start: 2018, end: 2024, text: "2018-2024 · hash stable objet+titulaire" }] },
  { label: "Logements sociaux financés", volume: "4 174 opérations", href: "https://opendata.paris.fr/explore/dataset/logements-sociaux-finances-a-paris/", status: "ok", statusLabel: "À jour", segments: [{ start: 2013, end: 2024, text: "2001-2024 (affiché 2013+)" }] },
  { label: "Tension logement (Socle DRIHL)", volume: "20 arrondissements · 195 828 demandes / 9 098 attributions", href: "https://www.drihl.ile-de-france.developpement-durable.gouv.fr/socle-de-donnees-demandes-et-attributions-de-a1414.html", status: "info", statusLabel: "Partiel", segments: [{ start: 2024, end: 2024, text: "2024 (série démarrée)", kind: "partial" }] },
  { label: "Bilan comptable", volume: "1 bilan/an", href: "https://opendata.paris.fr/explore/dataset/bilan-comptable/", status: "ok", statusLabel: "À jour", segments: [{ start: 2019, end: 2024, text: "2019-2024" }] },
  { label: "Hors-bilan (dette garantie)", volume: "9 960 emprunts · 12,3 Md€ capital restant dû 2024", href: "https://opendata.paris.fr/explore/dataset/dette-garantie/", status: "ok", statusLabel: "À jour", segments: [{ start: 2019, end: 2024, text: "2019-2024" }] },
];

// ── English data ─────────────────────────────────────────────────────────────

const TOOLS_EN: ToolMethod[] = [
  {
    id: "budget", number: "04", kicker: "Budget",
    title: "Main budget — voted & executed", route: "/ville/paris/budget",
    source: { name: "Administrative accounts M57 + draft budgets", dataset: "comptes-administratifs-budgets-principaux-a-partir-de-2019-m57-ville-departement", coverage: "2019-2024 (executed) · 2019-2026 (voted)", href: "https://opendata.paris.fr/explore/dataset/comptes-administratifs-budgets-principaux-a-partir-de-2019-m57-ville-departement/", hrefLabel: "opendata.paris.fr" },
    enClair: (
      <>
        <p>Every year the City votes a budget — what it plans to collect and spend. At year-end, it publishes what actually happened: the administrative account. Both are public, but written in an accounting format (« M57 ») designed for treasurers, not residents.</p>
        <p>We take these figures as-is — without recomputing them — and translate the technical labels into plain English: « General operating charges » becomes « Purchases &amp; current charges », for instance. We always separate the <b>voted</b> budget (intent) from the <b>executed</b> budget (what really left the account) so you can compare the two.</p>
        <p><b>What this doesn't show:</b> annex budgets (water, sanitation) are managed separately and aren't included. A year's final account is only consolidated around June of the following year — before that, figures are provisional.</p>
      </>
    ),
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
    title: "Grants paid to recipients", route: "/ville/paris/subventions",
    source: { name: "Grants paid — CA appendices", dataset: "subventions-versees-annexe-compte-administratif-a-partir-de-2018", coverage: "2018-2024 · ~53,000 lines", href: "https://opendata.paris.fr/explore/dataset/subventions-versees-annexe-compte-administratif-a-partir-de-2018/", hrefLabel: "opendata.paris.fr" },
    enClair: (
      <>
        <p>The City pays grants every year to non-profits, foundations, operators, social landlords. By law it must publish the list as an appendix to its accounts: who receives what, how much, and for what purpose.</p>
        <p>We retrieve that list (~53,000 rows over 2018-2024), reconcile recipients that appear under several spellings, and cross-check with the national non-profit registry and the SIRENE business file to know who we're really dealing with. To make the landscape readable we classify each line by topic (Social, Housing, Culture, Sport…) via a language model ; the raw purpose and SIRET remain visible for line-by-line verification.</p>
        <p><b>What this doesn't show:</b> we do not geolocate grants. A non-profit may have its registered office in the 9th and run its programs in the 18th — the office address tells you nothing about where the money lands. In-kind grants (premises, equipment) are flagged but not valued.</p>
      </>
    ),
    objectif: "Know who receives public money in grants, for what, and in what proportion — from CASVP to the smallest associations.",
    pipeline: [
      { label: "Sync + join", detail: <>Grants dataset + associations dataset (SIRET, purpose)</> },
      { label: "Normalisation", detail: <>Key <code>beneficiaire_normalise</code> when SIRET absent</> },
      { label: "LLM theme", detail: <>Gemini 3 Flash / Claude Opus (per task) on top 500 cumulative → seed cache</> },
      { label: "Org type", detail: <>Columns <code>ode_*</code> (public / non-profit / company / individual)</> },
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
    title: "Awarded contracts (public procurement)", route: "/ville/paris/marches",
    source: { name: "opendata.paris.fr + national DECP on data.gouv.fr", dataset: "liste-des-marches-de-la-collectivite-parisienne + decp-consolides", coverage: "2013-2026 · 23,053 merged contracts", href: "https://opendata.paris.fr/explore/dataset/liste-des-marches-de-la-collectivite-parisienne/", hrefLabel: "opendata.paris.fr" },
    enClair: (
      <>
        <p>When the City buys something from a company — building a school, collecting waste, office supplies, IT maintenance — it publishes a procurement notice: who was selected, for how much, for what. This data is called DECP (Essential Public Procurement Data) and has been mandatory since 2016.</p>
        <p>We merge <b>two sources</b>: the dataset published by the City on opendata.paris.fr and the national DECP consolidated by the State on data.gouv.fr. These feed distinct pipelines (Coriolis internal vs AIFE/ATLINE State) and overlap only 50–60% — either source alone misses ~30%. We join by contract number and add DECP-only contracts. DECP also brings columns missing on the Paris side: CCAG type (Works/Supplies…), CPV code (European standardised category), execution location, <b>number of bids received</b> (feeds the « Competition » panel), social/environmental clauses.</p>
        <p>We reclassify technical labels into broad families (works, services, supplies, energy…) and aggregate by contractor to see which companies capture the most contracts cumulatively. We also <b>link each contract to its investment project</b> where possible: 4,322 validated matches via <code>seed_match_projet_marches.csv</code> (stable hash on object+awardee), so that a school opened on the investments map also shows the companies that built it.</p>
        <p><b>Two numbers, two meanings.</b> On a contract's card we sometimes show <b>two amounts</b>:</p>
        <ul>
          <li><b>Maximum ceiling</b> (Paris source) — the most the City may spend over the whole contract. For a 4-year framework at €2M/year it's €8M. This is not what will actually be spent.</li>
          <li><b>Notified amount</b> (DECP source) — what the City declared to the State upon signature. Often more realistic than the ceiling for framework agreements, but it is not the cumulative sum of purchase orders either (that data is not public at the individual-contract level).</li>
        </ul>
        <p><b>What this doesn't show:</b> 97% are framework agreements; actual consumption is only visible at aggregate level (executed budget). Amendments are poorly tracked. Contracts below €40k HT are not mandatorily published. Contracts from satellites (ParisHabitat, Eau de Paris, SEM, CASVP) are not yet included — they have their own DECP we haven't pulled yet.</p>
      </>
    ),
    objectif: "See who the City pays for works, supplies and services, what volume, and which contractors concentrate the contracts.",
    pipeline: [
      { label: "Sync Paris", detail: <>opendata.paris.fr → <code>raw.liste_des_marches_de_la_collectivite_parisienne</code></> },
      { label: "Sync DECP", detail: <>data.gouv.fr (yearly files 2019-2026) → <code>raw.decp_marches_paris</code> via <code>fetch_decp_paris.py</code>, SIRET 217500* filter</> },
      { label: "Staging", detail: <>Normalisation + dedup on <code>id</code> (latest state wins)</> },
      { label: "Core", detail: <>LEFT JOIN on <code>SUBSTR(num_marche, 5) = decp.id</code> + UNION of DECP-exclusives, dedup multi-awardees by (object, amount, date)</> },
      { label: "Competition", detail: <>Aggregation of DECP <code>offresRecues</code> by year → 1 / 2 / 3-5 / 6+ bids buckets, single-bid rate</> },
      { label: "Project match", detail: <><code>match_projet_marches.py</code> + <code>seed_match_projet_marches.csv</code> (4,322 rows) → <code>int_projet_marches</code> table linking contract ↔ AP project</> },
      { label: "Marts", detail: <><code>mart_marches_fournisseurs</code> + <code>mart_marches_par_nature</code> + <code>mart_projet_marches</code></> },
      { label: "Readable enrichment", detail: <>CPV → French family label, derive <code>afficher_deux_montants</code> when ceiling ↔ notified diverge &gt; 5%</> },
    ],
    choix: [
      "Displayed total = contractual ceilings (sum of maximum envelopes), not executed spending.",
      "DECP multi-awardees deduplication: a framework with N awardees = 1 row, ceiling counted once.",
      "Second « notified amount » only shown when the gap is significant (> 5%) — keeps simple contracts readable.",
      "Competition panel hidden when offresRecues coverage < 20% or < 50 contracts (before 2024 the field isn't historised) — an honest empty state rather than a misleading estimate.",
      "Current year (2026) visible in tables but flagged as partial — late-year notifications haven't reached DECP yet.",
      "Detection criteria (weak signals) are published — signals, not accusations.",
    ],
    limites: [
      "97% are framework agreements; 66% have montant_min = 0 — actual consumption often well below the ceiling.",
      "The two sources overlap at only ~55%. We capture the superset but publication rules diverge (thresholds, timing, number formats).",
      "Amendments partially reported — possible underestimation.",
      "offresRecues field not historised before 2024 in DECP: the Competition panel only covers recent years.",
      "DECP execution location at department level (« Paris 75 »): no precise arrondissement, fine-grained geocoding not yet implemented.",
      "Satellites (SEM, OPH, CASVP, Eau de Paris) not included — their DECP exists but has yet to be pulled.",
    ],
  },
  {
    id: "investissements", number: "07", kicker: "Investments",
    title: "Investment projects (AP)", route: "/ville/paris/investissements",
    source: { name: "CA AP appendices + 'Localised Investments' PDFs", dataset: "comptes-administratifs-autorisations-de-programmes-a-partir-de-2018-m57-ville-de + PDF cdn.paris.fr", coverage: "Dataset frozen 2018-2022 · PDF IL 2018-2026", href: "https://opendata.paris.fr/explore/dataset/comptes-administratifs-autorisations-de-programmes-a-partir-de-2018-m57-ville-de/", hrefLabel: "opendata.paris.fr" },
    enClair: (
      <>
        <p>Investment is what the City spends to build, renovate, equip — a school, a swimming pool, a nursery, repaving a street. Unlike operating spend (salaries, energy, maintenance), these expenses leave a physical trace in the city and are amortised over years.</p>
        <p>Each year the City publishes as an appendix to its accounts the list of localised investment operations — typically a PDF several hundred pages long with voted amounts per project. We extract that data automatically, geolocate it when possible (address, district), and link each project to a budget chapter so you can tell which public policy it belongs to.</p>
        <p><b>What this doesn't show:</b> the figures are <b>programme authorisations</b> — money voted for a project, not necessarily paid (payments can be staggered over several years). Around 20-30% of projects lack a precise location because they are « transverse » (municipal IT, shared equipment, multi-site studies). And any end-of-project cost overrun isn't systematically republished.</p>
      </>
    ),
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
    title: "Social housing (SRU, operations, stock)", route: "/ville/paris/logement",
    source: { name: "SRU inventory (DDT) + funded social housing + DRIHL Socle", dataset: "logements-sociaux-finances-a-paris + SRU inventory + DRIHL applications/allocations Socle", coverage: "2001-2024 (funded) · SRU current year · Socle 2024", href: "https://www.paris.fr/logement-social", hrefLabel: "paris.fr" },
    enClair: (
      <>
        <p>Three questions are treated together on this page, because they answer each other.</p>
        <p><b>Where does Paris stand on the SRU law?</b> The law requires major French cities to have at least 25% social housing in their stock. We use the official SRU inventory published by the ministry, district by district, to see who hits the target and who is far from it. We add the yearly volumes of social housing funded by the City to check whether the production pace keeps up.</p>
        <p><b>Where is pressure highest?</b> Since the DRIHL opened its <i>Socle de données demandes et attributions</i>, we can finally answer district by district. For 2024: 195,828 active Paris applications with Paris as first choice, 9,098 allocations — a ratio of 21.5 households waiting for 1 annual allocation. This ratio varies almost twofold across arrondissements; we display it raw, unweighted.</p>
        <p><b>How long is the wait for social housing?</b> The official answer — 4.2 years median in Paris in 2024 — hides huge gaps by flat size, district, household situation, income bracket. The simulator produces an order of magnitude from multipliers calibrated on available public statistics. It is not an official DRIHL estimate: it's a tool to form intuition, not a promise.</p>
        <p><b>What this doesn't show:</b> the DRIHL Socle reports first-choice applications and allocations made, but not the socio-economic profile of households who receive a flat — that data is not open. The existing stock is not geolocated to address (SRU does not go finer than arrondissement).</p>
      </>
    ),
    objectif: "Show where Paris stands on the SRU target, where pressure is highest, and how many operations are funded each year.",
    pipeline: [
      { label: "Sync", detail: <>Funded social housing dataset → <code>BigQuery raw</code></> },
      { label: "SRU", detail: <>Official DDT Paris rate, 1 January</> },
      { label: "DRIHL Socle", detail: <>First-choice applications + 2024 allocations by arrondissement → <code>core_logement_attente_arr</code></> },
      { label: "Core", detail: <><code>core_logements_sociaux</code> by district × landlord × category</> },
      { label: "Mart", detail: <><code>mart_stats_arrondissements</code> → choropleth + <code>TensionParArrondissement</code> component</> },
      { label: "Landlord shares", detail: <>Indicative, cross-referenced SDES + annual reports</> },
    ],
    choix: [
      "Funded activity (AP), not deliveries: funded in 2022 ≠ delivered in 2025.",
      "Pressure ratio displayed raw (first-choice applications / allocations) — no weighting by flat size or household profile, so it stays traceable row by row.",
      "Landlord shares remain indicative until an official consolidated dataset is published.",
    ],
    limites: [
      "DRIHL Socle: the series starts in 2024, no consolidated multi-year history yet.",
      "No geocoding of existing stock: neither SRU nor the Socle go down to address level.",
      "Socio-economic profile of actual beneficiaries not open (neither by DRIHL nor by the City).",
    ],
  },
  {
    id: "dette-patrimoine", number: "09", kicker: "Debt & assets",
    title: "Balance sheet: debt, assets, equity", route: "/ville/paris/dette",
    source: { name: "M57 accounting balance sheet + dette-garantie dataset (CA appendix IV-B) + BOR", dataset: "bilan-comptable + dette-garantie", coverage: "2019-2024 · 9,960 guaranteed loans in 2024", href: "https://opendata.paris.fr/explore/dataset/bilan-comptable/", hrefLabel: "opendata.paris.fr" },
    enClair: (
      <>
        <p>Like a company, a local authority has a <b>balance sheet</b>: on the left, what it owns (buildings, land, equipment, cash); on the right, what it owes (bank and bond debt, provisions for future charges). The difference between the two is <b>net equity</b> — what would remain to the City if it settled all its debts tomorrow.</p>
        <p>We use the balance sheet as published each year in the administrative account, and we cross-reference the <i>Budget Orientation Report</i> for information that isn't published line by line as open data: the debt's weighted average rate, the repayment schedule, the fixed vs variable split. These figures are what make the much-cited « debt-repayment capacity » computable (how many years would it take to repay the debt if all gross savings went to it).</p>
        <p><b>And the off-balance-sheet, finally quantified.</b> The City guarantees loans taken by social landlords with CDC: line by line, it's not its debt, but it must pay in their place on default. The <code>dette-garantie</code> dataset (CA appendix IV-B) lists the 9,960 guaranteed loans in 2024 — capital outstanding, lender, beneficiary, index. We aggregate it in <code>build_hors_bilan.py</code> and present it next to the balance sheet, never merged in: €12.3bn in potential commitments, distinct from the €10.7bn of direct financial debt.</p>
        <p><b>What this doesn't show:</b> the balance sheet values assets at <b>historical accounting cost</b> (acquisition price minus depreciation), not market value. Some major assets — listed monuments, artworks, old plots — are structurally undervalued, sometimes booked at €1 symbolic. Consolidated accounts of satellites (SEM, OPH, CASVP) are not open — we cannot produce a « City group balance sheet ».</p>
      </>
    ),
    objectif: "Go beyond the single debt figure and place the City within its full balance sheet: what it owes, what it owns, its off-balance-sheet guarantees, its equity.",
    pipeline: [
      { label: "Upload", detail: <><code>upload_bilan_comptable.py</code> → <code>BigQuery raw</code></> },
      { label: "Normalisation", detail: <>Class 1-5 accounts → major aggregates</> },
      { label: "Core", detail: <><code>core_bilan_comptable</code> (assets, equity, debt, provisions)</> },
      { label: "Debt structure", detail: <><code>build_patrimoine_structure.py</code> → <code>patrimoine_structure_YYYY.json</code> (bonds, bank, rate split)</> },
      { label: "Off-balance-sheet", detail: <><code>build_hors_bilan.py</code> on <code>dette-garantie</code> → <code>hors_bilan_YYYY.json</code> (capital outstanding, top beneficiaries, top lenders, fixed/variable split)</> },
      { label: "Mart", detail: <><code>mart_bilan_sankey</code> + ratios (debt/resident, debt/savings)</> },
    ],
    choix: [
      "Debt = main budget only. Off-balance-sheet (loan guarantees) computed and shown alongside, never added to direct debt.",
      "Per-resident ratios: most recent INSEE municipal population.",
      "Weighted average rate, residual duration, fixed/variable split: read from the Budget Orientation Report when the open dataset doesn't include them.",
    ],
    limites: [
      "Fine-grained direct-debt structure (loan by loan) not published as open data.",
      "Consolidated accounts for SEM / OPH / CASVP not open — no « City group balance sheet » possible.",
      "Off-balance-sheet: only capital outstanding is published, not the default probability (rated low by agencies but not quantified).",
    ],
  },
];

const GLOSSARY_EN: { term: string; def: string }[] = [
  { term: "M57", def: "Standard accounting nomenclature for local authorities, mandatory since 2024. Replaces M14/M52." },
  { term: "CA (administrative account)", def: "Actually executed budget, voted after year-end. Published ~6 months later." },
  { term: "BP (draft budget) / voted", def: "Provisional budget adopted before the start of the fiscal year. May be amended during the year." },
  { term: "AP / CP", def: "Programme Authorisation (multi-year envelope) vs Payment Appropriation (annual disbursement). A €100M AP may be consumed over 4 years." },
  { term: "SIRET / SIREN", def: "Official identifier for a business or public operator. SIREN = 9 digits (the entity), SIRET = 14 digits (a specific site). Used to link a recipient to its official profile." },
  { term: "RNA", def: "National Register of Associations (W + 9 digits). Associations have one instead of a SIRET if not registered in SIRENE. If a SIRET search returns nothing for a non-profit, try its name." },
  { term: "Deliberation", def: "Decision taken in a Paris City Council session and entered in the official register. Every grant, contract or investment is backed by one or more deliberations." },
  { term: "Outstanding debt", def: "Total amount still owed at a given point in time. Different from the annuity (what's repaid in the year) and the flow (new borrowing in the year)." },
  { term: "Provisions for risks and charges", def: "Amounts set aside on the balance sheet to cover probable but uncertain future expenses (lawsuits, loan guarantees that may be called…). Appear on the liabilities side." },
  { term: "Fixed assets (Immobilisations)", def: "Long-term balance-sheet assets: buildings, roads, land, networks, equipment. Opposed to current assets (cash, short-term receivables). Valued at historical cost, not market value." },
  { term: "Debt payoff capacity", def: "Number of years it would take to repay all the debt if gross savings were entirely devoted to it. Like the remaining term of a home loan. Above 12 years is considered tight." },
  { term: "SRU", def: "Urban Solidarity and Renewal Act — social housing quota. Calculated each 1 January by the DDT." },
  { term: "DDT / DRIHL", def: "Departmental Directorate of Territories / Regional and Interdepartmental Housing Directorate. State services that check compliance with SRU quotas and run housing policy in Île-de-France." },
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
  { q: "What exactly does the LLM do in your pipeline?", a: "Enrichment runs in two tiers. Tier 2 (free): calls the public SIRENE API to verify ~5,800 recipients (legal form, activity, address) — no LLM. Tier 1 (paid LLM, opt-in via --tier1): Claude Opus or Gemini 3 Flash to classify grants by theme, geolocate ambiguous investment projects, verify recipient activity via grounded search, and vulgarise technical contract labels. An LLM never calculates an amount. Everything runs outside dbt and results are cached in public CSV seeds — inspectable and reproducible; the raw purpose and SIRET remain displayed for verification." },
  { q: "Why does the Competition panel only cover 2024+ on contracts?", a: "The offresRecues field (number of bids received per contract) has only been historised in DECP from 2024 onwards — before, it was either empty or filled anecdotally. Rather than extrapolate, we hide the panel whenever coverage is < 20% (or < 50 contracts for the year) and show an honest empty state." },
  { q: "How do you now quantify the off-balance-sheet?", a: "The City publishes (since 2024) an OpenData dataset dette-garantie (CA appendix IV-B) listing every guaranteed loan: capital outstanding, lender, beneficiary (mostly social landlords), index. We aggregate it in build_hors_bilan.py and display it next to the balance sheet, never merged in: €12.3bn of potential commitments in 2024, distinct from €10.7bn of direct financial debt." },
  { q: "How do you avoid double-counting between budget, grants and contracts?", a: "Each entity is modelled separately, never UNIONed with others. The budget contains an aggregated grants line; our Grants page details that same line from the recipients' side. We don't add them together. Documented in docs/architecture-modelling.md." },
  { q: "Are your totals identical to those on the City's website?", a: "Yes for aggregates from the same M57 dataset: our pipeline doesn't change amounts, it regroups and renames. Differences come from the cases described above (scope, timing, nomenclature)." },
  { q: "Why are some years absent or provisional?", a: "Each source has its coverage documented in the coverage table above. The most visible example: the AP OpenData dataset has been frozen since 2022, so for 2023-2024 we switch to the 'Localised Investments' PDFs. We prefer to show a gap rather than fill it with guesswork." },
];

const COVERAGE_EN: CoverageRow[] = [
  { label: "Executed budget (CA)", volume: "25,629 rows", href: "https://opendata.paris.fr/explore/dataset/comptes-administratifs-budgets-principaux-a-partir-de-2019-m57-ville-departement/", status: "ok", statusLabel: "Up to date", segments: [{ start: 2018, end: 2024, text: "2018-2024" }] },
  { label: "Voted budget (BP)", volume: "8,598 rows", href: "https://opendata.paris.fr/explore/dataset/budgets-votes-principaux-a-partir-de-2019-m57-ville-departement/", status: "ok", statusLabel: "Up to date", segments: [{ start: 2019, end: 2026, text: "2019-2026" }] },
  { label: "Grants", volume: "38,839 rows · 2020-2021 gap (non-comparable format)", href: "https://opendata.paris.fr/explore/dataset/subventions-versees-annexe-compte-administratif-a-partir-de-2018/", status: "info", statusLabel: "Partial", segments: [{ start: 2018, end: 2019, text: "2018-2019", kind: "partial" }, { start: 2022, end: 2024, text: "2022-2024" }] },
  { label: "Public contracts", volume: "23,053 contracts (City + national DECP)", href: "https://opendata.paris.fr/explore/dataset/liste-des-marches-de-la-collectivite-parisienne/", status: "ok", statusLabel: "Up to date", segments: [{ start: 2013, end: 2026, text: "2013-2026 · opendata.paris.fr + national DECP merge" }] },
  { label: "Competition (DECP offresRecues)", volume: "field not historised before 2024", href: "https://www.data.gouv.fr/fr/datasets/donnees-essentielles-de-la-commande-publique-fichiers-consolides/", status: "info", statusLabel: "Partial", segments: [{ start: 2024, end: 2025, text: "2024-2025", kind: "partial" }] },
  { label: "Investments (AP dataset)", volume: "dataset frozen", href: "https://opendata.paris.fr/explore/dataset/comptes-administratifs-autorisations-de-programmes-a-partir-de-2018-m57-ville-de/", status: "warn", statusLabel: "Frozen", segments: [{ start: 2018, end: 2022, text: "2018-2022 · frozen", kind: "frozen" }] },
  { label: "Investments (IL PDFs)", volume: "~450 projects/yr", href: "https://cdn.paris.fr/paris/2025/06/25/ca-2024-annexe-il-UtMj.PDF", status: "info", statusLabel: "Partial", segments: [{ start: 2018, end: 2024, text: "2018-2024 (CA)", kind: "partial" }, { start: 2025, end: 2026, text: "2025-2026 (BP)", kind: "partial" }] },
  { label: "Project ↔ contract match", volume: "4,322 matches (seed)", href: "https://github.com/Nuttux/open-public-data/blob/main/pipeline/seeds/seed_match_projet_marches.csv", status: "ok", statusLabel: "Up to date", segments: [{ start: 2018, end: 2024, text: "2018-2024 · stable hash object+awardee" }] },
  { label: "Funded social housing", volume: "4,174 operations", href: "https://opendata.paris.fr/explore/dataset/logements-sociaux-finances-a-paris/", status: "ok", statusLabel: "Up to date", segments: [{ start: 2013, end: 2024, text: "2001-2024 (shown 2013+)" }] },
  { label: "Housing pressure (DRIHL Socle)", volume: "20 districts · 195,828 applications / 9,098 allocations", href: "https://www.drihl.ile-de-france.developpement-durable.gouv.fr/socle-de-donnees-demandes-et-attributions-de-a1414.html", status: "info", statusLabel: "Partial", segments: [{ start: 2024, end: 2024, text: "2024 (series starting)", kind: "partial" }] },
  { label: "Balance sheet", volume: "1 bs/yr", href: "https://opendata.paris.fr/explore/dataset/bilan-comptable/", status: "ok", statusLabel: "Up to date", segments: [{ start: 2019, end: 2024, text: "2019-2024" }] },
  { label: "Off-balance-sheet (guaranteed debt)", volume: "9,960 loans · €12.3bn outstanding in 2024", href: "https://opendata.paris.fr/explore/dataset/dette-garantie/", status: "ok", statusLabel: "Up to date", segments: [{ start: 2019, end: 2024, text: "2019-2024" }] },
];

// ── Sources (table synthétique) ──────────────────────────────────────────────

const SOURCES_FR: SourceRow[] = [
  { portal: "OpenData Paris", url: "opendata.paris.fr", datasets: "Budget M57, marchés publics, subventions, logements sociaux, AP, bilan comptable, dette-garantie — 8 datasets", freshness: "Quotidien à annuel selon dataset" },
  { portal: "data.gouv.fr — DECP", url: "data.gouv.fr / decp", datasets: "Données Essentielles de la Commande Publique consolidées (filtre SIRET 217500* Paris)", freshness: "Fichiers annuels 2019-2026" },
  { portal: "INSEE — SIRENE", url: "data.gouv.fr / sirene", datasets: "Registre entreprises (SIRET, APE, effectifs, établissements) · enrichissement tier2 gratuit", freshness: "Mensuel" },
  { portal: "Base Adresse Nationale", url: "api-adresse.data.gouv.fr", datasets: "Géocodage des adresses de projets d'investissement", freshness: "Temps réel" },
  { portal: "cdn.paris.fr (PDFs)", url: "cdn.paris.fr", datasets: "Annexes CA 2024 (investissements localisés), Rapport d'Orientation Budgétaire, compte de gestion", freshness: "Annuel (juin N+1)" },
  { portal: "DRIHL Île-de-France", url: "drihl.ile-de-france…gouv.fr", datasets: "Inventaire SRU, parc social au 1er janvier, Socle demandes/attributions logement social", freshness: "Annuel" },
];

const SOURCES_EN: SourceRow[] = [
  { portal: "OpenData Paris", url: "opendata.paris.fr", datasets: "M57 budget, public contracts, grants, social housing, AP, balance sheet, guaranteed debt — 8 datasets", freshness: "Daily to annual depending on dataset" },
  { portal: "data.gouv.fr — DECP", url: "data.gouv.fr / decp", datasets: "Consolidated Essential Public Procurement Data (SIRET 217500* Paris filter)", freshness: "Yearly files 2019-2026" },
  { portal: "INSEE — SIRENE", url: "data.gouv.fr / sirene", datasets: "Business register (SIRET, activity codes, headcount, sites) · free tier2 enrichment", freshness: "Monthly" },
  { portal: "Base Adresse Nationale", url: "api-adresse.data.gouv.fr", datasets: "Address geocoding for investment projects", freshness: "Real time" },
  { portal: "cdn.paris.fr (PDFs)", url: "cdn.paris.fr", datasets: "CA 2024 appendices (localised investments), Budget Orientation Report, management account", freshness: "Annual (June N+1)" },
  { portal: "DRIHL Île-de-France", url: "drihl.ile-de-france…gouv.fr", datasets: "SRU inventory, social housing stock at January 1st, Socle of applications/allocations", freshness: "Annual" },
];

// ── Exemple bout-en-bout (traçabilité d'un chiffre) ──────────────────────────

const TRACE_FR: { claim: string; steps: TraceStep[] } = {
  claim: "« 416 574 267 € versés au CASVP en 2024 » — affiché sur la page Qui-reçoit",
  steps: [
    { stage: "01 · Source", label: "opendata.paris.fr", value: "Dataset subventions-versees-annexe-compte-administratif-a-partir-de-2018", detail: "Une ligne brute du CSV : SIRET 267 500 049, montant 416 574 267 €, exercice 2024." },
    { stage: "02 · Staging", label: "dbt · nettoyage", value: "stg_subventions.sql", detail: "Typage des colonnes, normalisation du SIRET, filtrage des montants nuls." },
    { stage: "03 · Core", label: "dbt · table de vérité", value: "core_subventions (OBT)", detail: "Jointure SIRENE pour récupérer forme juridique = Établissement public. Pas de thématisation LLM nécessaire (top 1 par volume, revue manuelle)." },
    { stage: "04 · Mart", label: "dbt · agrégation", value: "mart_subventions_beneficiaires.sql", detail: "Groupement par SIRET × année. Somme des lignes. Le résultat : 1 ligne CASVP 2024 avec 416 574 267 €." },
    { stage: "05 · Export", label: "Python", value: "beneficiaires_2024.json", detail: "JSON figé servi en statique à Next.js. Aucun calcul côté site." },
    { stage: "06 · Affichage", label: "React", value: "QuiRecoitExplorer.tsx", detail: "Le chiffre est lu tel quel et affiché." },
  ],
};

const TRACE_EN: { claim: string; steps: TraceStep[] } = {
  claim: "'€416,574,267 paid to CASVP in 2024' — displayed on the Qui-reçoit page",
  steps: [
    { stage: "01 · Source", label: "opendata.paris.fr", value: "Dataset subventions-versees-annexe-compte-administratif-a-partir-de-2018", detail: "One raw CSV row: SIRET 267 500 049, amount €416,574,267, fiscal year 2024." },
    { stage: "02 · Staging", label: "dbt · cleaning", value: "stg_subventions.sql", detail: "Column typing, SIRET normalisation, null amounts filtered." },
    { stage: "03 · Core", label: "dbt · source of truth", value: "core_subventions (OBT)", detail: "SIRENE join to retrieve legal form = Public establishment. No LLM theming needed (top 1 by volume, manual review)." },
    { stage: "04 · Mart", label: "dbt · aggregation", value: "mart_subventions_beneficiaires.sql", detail: "Grouped by SIRET × year. Sum of rows. Result: 1 CASVP 2024 row with €416,574,267." },
    { stage: "05 · Export", label: "Python", value: "beneficiaires_2024.json", detail: "Static JSON served to Next.js. No computation on site." },
    { stage: "06 · Display", label: "React", value: "QuiRecoitExplorer.tsx", detail: "The figure is read as-is and displayed." },
  ],
};

// ── Component ────────────────────────────────────────────────────────────────

export default function MethodeClient() {
  const { locale } = useLocale();
  const isFr = locale === "fr";

  const TOOLS = isFr ? TOOLS_FR : TOOLS_EN;
  const GLOSSARY = isFr ? GLOSSARY_FR : GLOSSARY_EN;
  const FAQ = isFr ? FAQ_FR : FAQ_EN;
  const COVERAGE = isFr ? COVERAGE_FR : COVERAGE_EN;
  const SOURCES = isFr ? SOURCES_FR : SOURCES_EN;
  const TRACE = isFr ? TRACE_FR : TRACE_EN;

  const [activeToolId, setActiveToolId] = useState<string>(TOOLS[0]?.id ?? "budget");
  const activeTool = TOOLS.find((t) => t.id === activeToolId) ?? TOOLS[0];

  // Deep-link : /methode?tool=<id>#outils OR /methode#<tool-id> → pré-sélectionne le tab + scroll.
  useEffect(() => {
    const applyFromLocation = () => {
      const params = new URLSearchParams(window.location.search);
      const toolParam = params.get("tool");
      const hashRaw = window.location.hash.replace(/^#/, "");
      const fromHash = TOOLS.some((tl) => tl.id === hashRaw) ? hashRaw : null;
      const pick = (toolParam && TOOLS.some((tl) => tl.id === toolParam)) ? toolParam : fromHash;
      if (pick) {
        setActiveToolId(pick);
        if (fromHash) {
          requestAnimationFrame(() => {
            document.getElementById("outils")?.scrollIntoView({ behavior: "smooth", block: "start" });
          });
        }
      }
    };
    applyFromLocation();
    window.addEventListener("hashchange", applyFromLocation);
    return () => window.removeEventListener("hashchange", applyFromLocation);
  }, [TOOLS]);

  const years: number[] = [];
  for (let y = AXIS_START; y <= AXIS_END; y++) years.push(y);

  return (
    <div className="theme-fusion">
      <Navbar />
      <main id="main-content" tabIndex={-1}>

      <section className="fx-page-header">
        <div className="fx-wrap">
          <div className="fx-page-kicker">{isFr ? "— Méthode" : "— Method"}</div>
          <h1 className="fx-page-title">
            {isFr ? <>Tout est <em>déjà</em> public.</> : <>It&apos;s all <em>already</em> public.</>}
          </h1>
          <p className="fx-page-lede">
            {isFr
              ? <>Tout ce que vous lisez ici, la Ville l&apos;a déjà publié quelque part — un dataset OpenData, une annexe comptable, un PDF du compte de gestion. Notre boulot : relier, renommer en français courant, rendre l&apos;ensemble lisible. Le pipeline est ouvert, chaque chiffre se recalcule depuis la source.</>
              : <>Everything you read here, the City has already published somewhere — an OpenData dataset, an accounting appendix, a PDF from the management account. Our job: connect, rename in plain language, make it all readable. The pipeline is open, every figure can be recalculated from the source.</>}
          </p>

          <div className="fx-meth-stats">
            <div className="fx-meth-stat">
              <span className="n">{isFr ? "Datasets" : "Datasets"}</span>
              <span className="v">12+</span>
              <span className="c">{isFr ? "opendata.paris.fr · DECP data.gouv.fr · INSEE SIRENE · DRIHL Socle · BAN · PDFs officiels" : "opendata.paris.fr · DECP data.gouv.fr · INSEE SIRENE · DRIHL Socle · BAN · official PDFs"}</span>
            </div>
            <div className="fx-meth-stat">
              <span className="n">{isFr ? "Outils" : "Tools"}</span>
              <span className="v">6</span>
              <span className="c">{isFr ? "budget · subv. · marchés · invest. · logement · dette" : "budget · grants · contracts · investments · housing · debt"}</span>
            </div>
            <div className="fx-meth-stat">
              <span className="n">{isFr ? "Lignes traitées" : "Rows processed"}</span>
              <span className="v">~100 k</span>
              <span className="c">{isFr ? "39k subv. + 26k budget CA + 23k marchés + 9k budget voté + 10k hors-bilan + 4k logements" : "39k grants + 26k exec. budget + 23k contracts + 9k voted budget + 10k off-balance-sheet + 4k housing"}</span>
            </div>
            <div className="fx-meth-stat">
              <span className="n">{isFr ? "Historique" : "History"}</span>
              <span className="v">13 {isFr ? "ans" : "yrs"}</span>
              <span className="c">{isFr ? "2013 → 2024 (exécuté) · 2026 (voté)" : "2013 → 2024 (executed) · 2026 (voted)"}</span>
            </div>
          </div>

          <div className="fx-page-actions" style={{ marginTop: 28 }}>
            <Button variant="primary" href="#sources">{isFr ? "Voir les sources" : "See the sources"}</Button>
            <Button href="https://github.com/Nuttux/open-public-data">{isFr ? "Le code sur GitHub ↗" : "Code on GitHub ↗"}</Button>
          </div>
        </div>
      </section>

      <section className="fx-section">
        <div className="fx-wrap">
          <div className="fx-meth-origin">
            <h2>{isFr ? <>Ces chiffres, d&apos;<em>où</em> ils viennent ?</> : <>These figures — <em>where</em> do they come from?</>}</h2>
            <div className="fx-meth-origin-prose">
              {isFr ? (
                <>
                  <p>
                    <b>De la Ville, et seulement de la Ville.</b> Des datasets publiés sur opendata.paris.fr, de l&apos;INSEE, de data.gouv.fr, des PDFs joints aux comptes administratifs. Aucun chiffre n&apos;est reconstruit à partir de sources tierces, aucun n&apos;est estimé à la louche. On lit ce que la Ville écrit, et on essaie de le rendre lisible.
                  </p>
                  <p>
                    Notre travail tient à peu près en un mot : <em>couture</em>. Les données existent, mais en silos — une douzaine de sources, des nomenclatures qui font fuir (chapitres 011, comptes 164×), des PDFs non-structurés, aucune vue qui croise budget, subventions, marchés et investissements. On rassemble tout dans une base unique, on nettoie, on renomme en français courant. Un LLM nous aide à classer les subventions par thème et à retrouver l&apos;adresse des projets (jamais à calculer un montant). Puis on publie.
                  </p>
                  <p>
                    Ce n&apos;est donc <em>pas</em> une enquête, <em>pas</em> un audit critique, <em>pas</em> un scoop. C&apos;est un miroir rangé du bilan public. Si on s&apos;est trompé quelque part, le code est là pour que vous nous repreniez.
                  </p>
                </>
              ) : (
                <>
                  <p>
                    <b>From the City, and only from the City.</b> Datasets published on opendata.paris.fr, INSEE, data.gouv.fr, PDFs attached to administrative accounts. No figure is rebuilt from third-party sources, none is roughly estimated. We read what the City writes, and try to make it readable.
                  </p>
                  <p>
                    Our work boils down to one word: <em>stitching</em>. The data exists, but scattered — a dozen sources, off-putting nomenclatures (chapters 011, accounts 164×), unstructured PDFs, no single view that crosses budget, grants, contracts and investments. We pull everything into a single base, clean it, rename it in plain language. An LLM helps us tag grants by theme and find project addresses (never to compute an amount). Then we publish.
                  </p>
                  <p>
                    So this is <em>not</em> an investigation, <em>not</em> a critical audit, <em>not</em> a scoop. It&apos;s a tidied-up mirror of the public balance sheet. If we got something wrong, the code is there so you can set us straight.
                  </p>
                </>
              )}
            </div>
          </div>

          <SectionHead
            number="00"
            kind={isFr ? "Sommaire" : "Contents"}
            title={isFr ? <>Ce que vous <em>trouverez</em> ici</> : <>What you&apos;ll <em>find</em> here</>}
          />
          <div className="fx-toc">
            <a href="#sources">{isFr ? "01 · Sources" : "01 · Sources"}</a>
            <a href="#couverture">{isFr ? "02 · Couverture" : "02 · Coverage"}</a>
            <a href="#architecture">{isFr ? "03 · Architecture" : "03 · Architecture"}</a>
            <a href="#outils">{isFr ? "04 · Les 6 outils" : "04 · The 6 tools"}</a>
            <a href="#exemple">{isFr ? "05 · Exemple tracé" : "05 · Traced example"}</a>
            <a href="#glossaire">{isFr ? "06 · Glossaire" : "06 · Glossary"}</a>
            <a href="#faq">07 · FAQ</a>
            <a href="#engagements">{isFr ? "08 · Engagements" : "08 · Commitments"}</a>
          </div>
        </div>
      </section>

      <section id="sources" className="fx-section">
        <div className="fx-wrap">
          <SectionHead
            number="01"
            kind={isFr ? "Sources" : "Sources"}
            title={isFr ? <>D&apos;où vient <em>chaque chiffre</em></> : <>Where <em>each figure</em> comes from</>}
            subtitle={isFr ? "Six portails officiels. Aucun autre." : "Six official portals. Nothing else."}
          />
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
          <p className="fx-note" style={{ marginTop: 18 }}>
            {isFr
              ? <><b>Un chiffre = une source.</b> Aucune donnée n&apos;est reconstruite, aucune n&apos;est estimée. Les ratios financiers qualitatifs (taux, maturité de dette) non publiés en open data sont explicitement marqués « indicatifs » dans leurs fiches.</>
              : <><b>One figure = one source.</b> No data is reconstructed or estimated. Qualitative financial ratios (rates, debt maturity) not published as open data are explicitly flagged as "indicative" in their panels.</>}
          </p>
        </div>
      </section>

      <section id="couverture" className="fx-section">
        <div className="fx-wrap">
          <SectionHead
            number="02"
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

      <section id="architecture" className="fx-section">
        <div className="fx-wrap">
          <SectionHead
            number="03"
            kind={isFr ? "Architecture" : "Architecture"}
            title={isFr ? <>De la source au <em>site</em>, en quatre étapes</> : <>From source to <em>site</em>, in four steps</>}
            subtitle={isFr ? "Un seul pipeline pour les six outils, rejoué à chaque nouvelle donnée publiée." : "One pipeline for all six tools, replayed whenever new data is published."}
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
                ? "Les datasets bruts ne disent pas qui est vraiment une association, ni à quelle politique publique une ligne correspond. Alors on va chercher du contexte ailleurs : l'API publique SIRENE pour obtenir la forme juridique, l'activité et le siège d'un bénéficiaire (~5 800 profils vérifiés) ; un modèle de langage pour classer les subventions par thème (Social, Culture, Sport…), résumer l'objet de la subvention en une phrase, et retrouver l'arrondissement des projets dont le libellé est ambigu."
                : "Raw datasets don't tell you what kind of non-profit a recipient is, nor which public policy a line belongs to. So we fetch context elsewhere: the public SIRENE API for legal form, activity and registered office of a recipient (~5,800 verified profiles); a language model to tag grants by theme (Social, Culture, Sport…), summarise a grant's purpose in one sentence, and resolve the district of projects with ambiguous labels."}</p>
            </div>
            <span className="fx-flow-simple-arrow">→</span>
            <div className="fx-flow-simple-step">
              <div className="k">04</div>
              <h3>{isFr ? "On publie" : "We publish"}</h3>
              <p>{isFr
                ? "Le résultat est figé en fichiers JSON, versionnés avec le code. Un fichier par année et par outil. Le site lit ces fichiers directement — pas de base de données live, pas de calcul côté navigateur. Ce que vous voyez est exactement ce qui a été calculé."
                : "The result is frozen as JSON files, versioned with the code. One file per year per tool. The site reads these files directly — no live database, no browser-side computation. What you see is exactly what was computed."}</p>
            </div>
          </div>

          <p className="fx-note" style={{ marginTop: 18 }}>
            {isFr
              ? <><b>Règle absolue sur l&apos;enrichissement</b> : un modèle de langage n&apos;est utilisé que pour du texte — catégoriser, décrire, résumer, retrouver une adresse. <b>Aucun montant ni aucun agrégat financier ne passe jamais par un LLM.</b> Les chiffres sortent d&apos;un calcul SQL déterministe sur les données brutes.</>
              : <><b>Hard rule on enrichment</b>: a language model is only used on text — to categorise, describe, summarise, find an address. <b>No amount, no financial aggregate ever goes through an LLM.</b> Numbers come from deterministic SQL run on raw data.</>}
          </p>

          <details className="fx-flow-tech">
            <summary>{isFr ? "Voir le détail technique (pour les devs)" : "See technical detail (for devs)"}</summary>
            <div className="fx-flow">
              <div className="fx-flow-row">
                <div className="fx-flow-node">
                  <span className="k">01 · {isFr ? "Sources" : "Sources"}</span>
                  <span className="lab">OpenData Paris + INSEE + BAN</span>
                  <span className="sub">{isFr ? "12+ datasets & PDFs officiels" : "12+ official datasets & PDFs"}</span>
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
                  <span className="lab">Gemini 3 Flash + Claude Opus</span>
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
                  ? <>{`Orchestrateur `}<code>pipeline/run_all.sh</code>{` (4 phases sync/dbt/export/enrich, flags `}<code>--skip</code>{`, `}<code>--only</code>{`, `}<code>--tier1</code>{`, `}<code>--dry-run</code>{`). Enrich = tier2 SIRENE gratuit par défaut, tier1 LLM opt-in. Idempotent : caches seeds CSV réutilisés. CI : `}<code>.github/workflows/enrich-pipeline.yml</code>{` relance l'enrichissement quand de nouveaux bénéficiaires arrivent. Règle anti-double-comptage — `}<code>core_budget</code>, <code>core_subventions</code>, <code>core_marches_publics</code>, <code>core_ap_projets</code>{` ne sont jamais UNIONés. Détail dans `}<code>docs/architecture-modelling.md</code>.</>
                  : <>{`Orchestrator `}<code>pipeline/run_all.sh</code>{` (4 phases sync/dbt/export/enrich, flags `}<code>--skip</code>{`, `}<code>--only</code>{`, `}<code>--tier1</code>{`, `}<code>--dry-run</code>{`). Enrich = free tier2 SIRENE by default, tier1 LLM opt-in. Idempotent: cached CSV seeds reused. CI: `}<code>.github/workflows/enrich-pipeline.yml</code>{` reruns enrichment when new recipients arrive. Anti-double-counting rule — `}<code>core_budget</code>, <code>core_subventions</code>, <code>core_marches_publics</code>, <code>core_ap_projets</code>{` are never UNIONed. Detail in `}<code>docs/architecture-modelling.md</code>.</>}
              </div>
            </div>
          </details>
        </div>
      </section>

      <section id="outils" className="fx-section">
        <div className="fx-wrap">
          <SectionHead
            number="04"
            kind={isFr ? "Les 6 outils" : "The 6 tools"}
            title={isFr ? <>Le <em>détail</em> par outil</> : <><em>Detail</em> per tool</>}
            subtitle={isFr ? "Source exacte, pipeline, choix éditoriaux et limites — choisissez un outil." : "Exact source, pipeline, editorial choices and limits — pick a tool."}
          />

          <div className="fx-tool-tabs" role="tablist">
            {TOOLS.map((tool) => (
              <button
                key={tool.id}
                type="button"
                role="tab"
                aria-selected={activeToolId === tool.id}
                className={`fx-tool-tab ${activeToolId === tool.id ? "active" : ""}`}
                onClick={() => setActiveToolId(tool.id)}
              >
                <span className="num">{tool.number}</span>
                <span className="lbl">{tool.kicker}</span>
              </button>
            ))}
          </div>

          {activeTool && (
            <div className="fx-tool-card" role="tabpanel">
              <div className="fx-tool-top">
                <div>
                  <div className="t-num">{activeTool.number} · {activeTool.kicker}</div>
                  <h3 className="t-title">{activeTool.title}</h3>
                </div>
                <Link href={activeTool.route} className="t-link">{activeTool.route} ↗</Link>
              </div>

              <div className="fx-tool-enclair">
                <div className="fx-tool-enclair-head">
                  <span className="fx-tool-enclair-icon" aria-hidden>📖</span>
                  <span className="fx-tool-enclair-label">{isFr ? "En clair" : "In plain language"}</span>
                </div>
                <div className="fx-tool-enclair-body">{activeTool.enClair}</div>
              </div>

              <details className="fx-tool-tech">
                <summary>
                  <span className="fx-tool-tech-icon" aria-hidden>⚙️</span>
                  <span className="fx-tool-tech-label">
                    {isFr ? "Voir le détail technique (source, pipeline, choix, limites)" : "See technical detail (source, pipeline, choices, limits)"}
                  </span>
                </summary>

                <div className="fx-tool-meta">
                  <div>
                    <div className="k">{isFr ? "Source" : "Source"}</div>
                    <div className="v">{activeTool.source.name}</div>
                  </div>
                  <div>
                    <div className="k">Dataset</div>
                    <div className="v"><code>{activeTool.source.dataset}</code></div>
                  </div>
                  <div>
                    <div className="k">{isFr ? "Couverture" : "Coverage"}</div>
                    <div className="v">{activeTool.source.coverage}</div>
                  </div>
                </div>

                <div className="fx-tool-body">
                  <div className="objectif">
                    <span className="k">{isFr ? "Objectif" : "Goal"}</span>
                    <p>{activeTool.objectif}</p>
                  </div>
                  <div>
                    <div className="fx-stepper">
                      <span className="k">Pipeline</span>
                      {activeTool.pipeline.map((step, i) => (
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
                  <details open>
                    <summary>{isFr ? `Choix éditoriaux (${activeTool.choix.length})` : `Editorial choices (${activeTool.choix.length})`}</summary>
                    <ul>{activeTool.choix.map((c, i) => <li key={i}>{c}</li>)}</ul>
                  </details>
                  <details open>
                    <summary>{isFr ? `Cadre & périmètre (${activeTool.limites.length})` : `Scope & framing (${activeTool.limites.length})`}</summary>
                    <ul>{activeTool.limites.map((l, i) => <li key={i}>{l}</li>)}</ul>
                  </details>
                </div>
              </details>
            </div>
          )}
        </div>
      </section>

      <section id="exemple" className="fx-section">
        <div className="fx-wrap">
          <SectionHead
            number="05"
            kind={isFr ? "Exemple tracé" : "Traced example"}
            title={isFr ? <>Un chiffre, <em>bout en bout</em></> : <>One figure, <em>end to end</em></>}
            subtitle={isFr ? "Suivre un montant de la ligne CSV source jusqu'à son affichage sur le site." : "Follow one amount from the source CSV row to its display on the site."}
          />

          <div className="fx-trace-claim">
            <span className="k">{isFr ? "Affirmation" : "Claim"}</span>
            <p>{TRACE.claim}</p>
          </div>

          <div className="fx-trace-summary">
            {isFr
              ? <>Ce chiffre vient d&apos;<b>une seule ligne</b> du CSV publié par la Ville : SIRET 267 500 049, montant 416 574 267 €, exercice 2024. Entre ce CSV et l&apos;affichage sur le site, le pipeline fait trois choses : il type les colonnes et normalise le SIRET ; il confirme via SIRENE que le SIRET correspond bien au CASVP ; il somme les lignes du même SIRET sur l&apos;année. Puis il écrit le résultat en JSON, que le site lit tel quel. <b>Aucune étape n&apos;invente un chiffre</b> — uniquement du nettoyage, une vérification d&apos;identité, une somme.</>
              : <>This figure comes from <b>a single row</b> of the CSV published by the City: SIRET 267 500 049, amount €416,574,267, fiscal year 2024. Between that CSV and the display on the site, the pipeline does three things: it types the columns and normalises the SIRET; it verifies via SIRENE that the SIRET does belong to CASVP; it sums all rows with that same SIRET for the year. Then it writes the result to JSON, which the site reads as-is. <b>No step invents a figure</b> — only cleaning, an identity check, a sum.</>}
          </div>

          <details className="fx-trace-tech">
            <summary>{isFr ? "Voir les 6 étapes techniques (SQL, fichiers, code)" : "See the 6 technical steps (SQL, files, code)"}</summary>
            <ol className="fx-trace-steps">
            {TRACE.steps.map((step, i) => (
              <li key={i}>
                <div className="fx-trace-stage">{step.stage}</div>
                <div className="fx-trace-body">
                  <div className="lbl">{step.label} · <code>{step.value}</code></div>
                  <p>{step.detail}</p>
                </div>
              </li>
            ))}
            </ol>
          </details>

          <div style={{ marginTop: 24, display: "flex", gap: 10, flexWrap: "wrap" }}>
            <Button href="https://github.com/Nuttux/open-public-data/tree/main/pipeline">
              {isFr ? "Voir les modèles dbt ↗" : "See dbt models ↗"}
            </Button>
            <Button href="/data/subventions/beneficiaires_2024.json">
              {isFr ? "Télécharger le JSON final" : "Download final JSON"}
            </Button>
          </div>
        </div>
      </section>

      <section id="glossaire" className="fx-section">
        <div className="fx-wrap">
          <SectionHead
            number="06"
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
            number="07"
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

      <section id="engagements" className="fx-section">
        <div className="fx-wrap">
          <SectionHead
            number="08"
            kind={isFr ? "Engagements" : "Commitments"}
            title={isFr ? <>Nos <em>règles</em>, et quoi faire si on se trompe</> : <>Our <em>rules</em>, and what to do if we get it wrong</>}
          />
          <div className="fx-engagements">
            <div className="fx-engagement">
              <h3>{isFr ? "Pas de contenu sponsorisé, pas de ligne politique" : "No sponsored content, no political line"}</h3>
              <p>{isFr
                ? "Aucun article, chiffre ou visualisation n'est sponsorisé. Les textes évitent les jugements sur les choix politiques et s'en tiennent à la donnée. Les financements que nous recevons sont publiés avec leur montant."
                : "No article, figure or visualisation is sponsored. Texts avoid judgements on political choices and stick to the data. Any funding we receive is published with its amount."}</p>
            </div>
            <div className="fx-engagement">
              <h3>{isFr ? "Code & données ouverts" : "Open code & data"}</h3>
              <p>{isFr
                ? <>Les pipelines (Python + dbt) sont sous licence MIT. Chaque chiffre peut être recalculé depuis un CSV source, et chaque page expose un export CSV/JSON. Code sur <a href="https://github.com/Nuttux/open-public-data" target="_blank" rel="noopener noreferrer">github.com/Nuttux/open-public-data ↗</a>.</>
                : <>Pipelines (Python + dbt) are MIT-licensed. Every figure can be recalculated from a source CSV, and every page exposes a CSV/JSON export. Code at <a href="https://github.com/Nuttux/open-public-data" target="_blank" rel="noopener noreferrer">github.com/Nuttux/open-public-data ↗</a>.</>}</p>
            </div>
            <div className="fx-engagement">
              <h3>{isFr ? "Corrections publiques, jamais de chiffre supprimé" : "Public corrections, no figure ever deleted"}</h3>
              <p>{isFr
                ? <>Erreur signalée = corrigée dans le code et consignée dans le changelog avec la date et l&apos;origine du signalement. On corrige en place et on garde la trace — pour que tout ancien screenshot reste traçable. <a href="https://github.com/Nuttux/open-public-data/commits/main" target="_blank" rel="noopener noreferrer">Voir les commits ↗</a></>
                : <>Error reported = corrected in the code and recorded in the changelog with the date and source of the report. We correct in place and keep a record — so any old screenshot remains traceable. <a href="https://github.com/Nuttux/open-public-data/commits/main" target="_blank" rel="noopener noreferrer">View commits ↗</a></>}</p>
            </div>
          </div>

          <div style={{ marginTop: 32, display: "flex", gap: 10, flexWrap: "wrap" }}>
            <Button variant="primary" href="/contact">{isFr ? "Signaler une erreur" : "Report an error"}</Button>
            <Button href="https://github.com/Nuttux/open-public-data">{isFr ? "Le code sur GitHub ↗" : "Code on GitHub ↗"}</Button>
            <Button href="/">{isFr ? "Retour à l'accueil" : "Back to home"}</Button>
          </div>
        </div>
      </section>

      {/* ─── Méthode des pages France macro & villes ─────────────── */}
      <section id="france-macro" className="fx-section">
        <div className="fx-wrap">
          <SectionHead
            number="09"
            kind={isFr ? "France macro & villes" : "France macro & cities"}
            title={
              isFr ? (
                <>Les <em>5 nouvelles</em> pages France & multi-villes</>
              ) : (
                <>The <em>5 new</em> France & multi-city pages</>
              )
            }
            subtitle={
              isFr
                ? "Source, périmètre, choix, limites pour /apu, /etat, /dette, /fiscalite et les pages /ville/[ville]."
                : "Source, scope, choices, limits for /apu, /etat, /dette, /fiscalite and the /ville/[city] pages."
            }
          />

          <div className="fx-france-method-grid" style={{ marginTop: 32 }}>
            {/* /apu ─────────────────────────────── */}
            <article id="apu-cofog" className="fx-france-method">
              <header>
                <span className="fx-france-method-route">/apu</span>
                <h3>{isFr ? "Dépenses publiques par fonction COFOG" : "Public spending by COFOG function"}</h3>
              </header>
              <dl>
                <dt>{isFr ? "Source" : "Source"}</dt>
                <dd>
                  Eurostat — <code>gov_10a_exp</code> · <a href="https://ec.europa.eu/eurostat/databrowser/view/gov_10a_exp/default/table" target="_blank" rel="noopener noreferrer">databrowser ↗</a>
                </dd>
                <dt>{isFr ? "Périmètre" : "Scope"}</dt>
                <dd>{isFr
                  ? "Sector S13 (administrations publiques consolidées : État + Sécu + collectivités + opérateurs). Unité : % PIB. Pas de retraitement maison."
                  : "Sector S13 (consolidated general government: central + social security + local + operators). Unit: % GDP. No in-house adjustment."}</dd>
                <dt>{isFr ? "Comparateurs" : "Comparators"}</dt>
                <dd>FR · DE · IT · ES · NL · UE27</dd>
                <dt>{isFr ? "Limites" : "Limits"}</dt>
                <dd>{isFr
                  ? "Données annuelles, dernier exercice publié par Eurostat (souvent N-1 ou N-2). 10 fonctions COFOG niveau 1 ; pas de drill-down vers les programmes nationaux."
                  : "Annual data, latest year published by Eurostat (typically N-1 or N-2). 10 level-1 COFOG functions; no drill-down to national programmes."}</dd>
              </dl>
            </article>

            {/* /etat ────────────────────────────── */}
            <article id="etat" className="fx-france-method">
              <header>
                <span className="fx-france-method-route">/etat</span>
                <h3>{isFr ? "Budget Général de l'État (PLF)" : "State General Budget (PLF)"}</h3>
              </header>
              <dl>
                <dt>{isFr ? "Source" : "Source"}</dt>
                <dd>
                  data.economie.gouv.fr — PLF par mission/programme · <a href="https://www.data.gouv.fr/datasets/plf-2025-depenses-2025-selon-destination/" target="_blank" rel="noopener noreferrer">PLF 2025 ↗</a> · <a href="https://www.data.gouv.fr/datasets/plf-2024-depenses-2024-selon-nomenclatures-destination-et-nature/" target="_blank" rel="noopener noreferrer">PLF 2024 ↗</a>
                </dd>
                <dt>{isFr ? "Périmètre" : "Scope"}</dt>
                <dd>{isFr
                  ? "Type budget = BG (Budget Général) uniquement. Comptes spéciaux et budgets annexes exclus. Total ~25 % des dépenses publiques (le reste : Sécu, collectivités, opérateurs)."
                  : "Type budget = BG (General Budget) only. Special accounts and annex budgets excluded. Represents ~25% of total public spending (the rest: social security, local authorities, operators)."}</dd>
                <dt>{isFr ? "Brut vs net" : "Gross vs net"}</dt>
                <dd>{isFr
                  ? "« Net » exclut la mission Remboursements & dégrèvements (~147 Md€) qui regroupe les restitutions d'impôts (CIR, TVA déductible…) — comptablement BG mais conceptuellement réduction de recettes."
                  : "« Net » excludes the Remboursements & dégrèvements mission (~€147B) which covers tax refunds (R&D credit, deductible VAT…) — accounted in BG but conceptually a revenue reduction."}</dd>
                <dt>{isFr ? "YoY" : "YoY"}</dt>
                <dd>{isFr
                  ? "Évolution PLF 2025 vs PLF 2024 affichée par mission. Comparaison à périmètre constant (mission code identique)."
                  : "Evolution PLF 2025 vs PLF 2024 shown per mission. Constant-scope comparison (same mission code)."}</dd>
              </dl>
            </article>

            {/* /dette ───────────────────────────── */}
            <article id="dette" className="fx-france-method">
              <header>
                <span className="fx-france-method-route">/dette</span>
                <h3>{isFr ? "Dette publique trimestrielle (Maastricht)" : "Quarterly government debt (Maastricht)"}</h3>
              </header>
              <dl>
                <dt>{isFr ? "Source" : "Source"}</dt>
                <dd>
                  Eurostat — <code>gov_10q_ggdebt</code> · <a href="https://ec.europa.eu/eurostat/databrowser/view/gov_10q_ggdebt/default/table" target="_blank" rel="noopener noreferrer">databrowser ↗</a>
                </dd>
                <dt>{isFr ? "Indicateur" : "Indicator"}</dt>
                <dd><code>na_item = GD</code> ({isFr ? "dette consolidée brute, définition Maastricht" : "Maastricht consolidated gross debt"})</dd>
                <dt>{isFr ? "Sous-secteurs" : "Sub-sectors"}</dt>
                <dd>S13 (APU) · S1311 (État central) · S1313 (collectivités) · S1314 (Sécu)</dd>
                <dt>{isFr ? "À retenir" : "Key caveat"}</dt>
                <dd>{isFr
                  ? "S13 ≠ S1311 + S1313 + S1314 : la consolidation élimine les détentions croisées entre sous-secteurs. Lire chaque trait pour ce qu'il représente, ne pas les additionner."
                  : "S13 ≠ S1311 + S1313 + S1314: consolidation removes cross-holdings between sub-sectors. Read each line for what it represents, do not sum them."}</dd>
              </dl>
            </article>

            {/* /fiscalite ───────────────────────── */}
            <article id="fiscalite" className="fx-france-method">
              <header>
                <span className="fx-france-method-route">/fiscalite</span>
                <h3>{isFr ? "Prélèvements obligatoires (taxes + cotisations)" : "Compulsory levies (taxes + contributions)"}</h3>
              </header>
              <dl>
                <dt>{isFr ? "Source" : "Source"}</dt>
                <dd>
                  Eurostat — <code>gov_10a_taxag</code> · <a href="https://ec.europa.eu/eurostat/databrowser/view/gov_10a_taxag/default/table" target="_blank" rel="noopener noreferrer">databrowser ↗</a>
                </dd>
                <dt>{isFr ? "Total" : "Total"}</dt>
                <dd><code>D2_D5_D91_D61_M_D612_M_D614_M_D995</code> ({isFr ? "taxes nettes + cotisations sociales nettes" : "net taxes + net social contributions"})</dd>
                <dt>{isFr ? "Décomposition" : "Breakdown"}</dt>
                <dd>{isFr
                  ? "6 catégories mutuellement exclusives : Cotisations · TVA · Autres impôts production · IR (incl. CSG, classée comme impôt par Eurostat) · IS · Autres directs+capital."
                  : "6 mutually-exclusive categories: Contributions · VAT · Other production taxes · Personal income tax (incl. CSG, classified as a tax by Eurostat) · Corporate tax · Other direct + capital."}</dd>
                <dt>{isFr ? "Limites" : "Limits"}</dt>
                <dd>{isFr
                  ? "Ratio rapporté au PIB nominal (pas au revenu disponible). Le total Eurostat (~43-44 % PIB) est légèrement inférieur au « ratio prélèvements obligatoires » DGFiP (~46 %) à cause de méthodos de consolidation différentes."
                  : "Ratio relative to nominal GDP (not disposable income). Eurostat's total (~43-44% GDP) is slightly below DGFiP's « ratio prélèvements obligatoires » (~46%) due to different consolidation methodologies."}</dd>
              </dl>
            </article>

            {/* /ville/[slug] ──────────────────────── */}
            <article id="c-villes" className="fx-france-method">
              <header>
                <span className="fx-france-method-route">/ville/[slug]</span>
                <h3>{isFr ? "Pages communes (10 plus grandes villes)" : "City pages (10 largest cities)"}</h3>
              </header>
              <dl>
                <dt>{isFr ? "Sources" : "Sources"}</dt>
                <dd>
                  OFGL <code>ofgl-base-communes-consolidee</code> ({isFr ? "agrégats financiers M14/M57 harmonisés" : "M14/M57 harmonised financial aggregates"}) ·{" "}
                  <a href="https://data.ofgl.fr/explore/dataset/ofgl-base-communes-consolidee/" target="_blank" rel="noopener noreferrer">OFGL ↗</a>
                  <br />
                  data.gouv DECP consolidée ({isFr ? "marchés publics filtrés par SIREN acheteur" : "public procurement filtered by buyer SIREN"}) ·{" "}
                  <a href="https://www.data.gouv.fr/datasets/donnees-essentielles-de-la-commande-publique-consolidees-format-tabulaire/" target="_blank" rel="noopener noreferrer">DECP ↗</a>
                </dd>
                <dt>{isFr ? "Cutoff M14/M57" : "M14/M57 cutoff"}</dt>
                <dd>{isFr
                  ? "OFGL republie les séries harmonisées sous un libellé unique : pas de hachurage gris à l'écran, la transition 2024 est lissée à la source."
                  : "OFGL republishes harmonised series under a single label: no on-screen hatching, the 2024 transition is smoothed at source."}</dd>
                <dt>{isFr ? "Capacité de désendettement" : "Debt repayment capacity"}</dt>
                <dd>{isFr
                  ? "= Encours de dette / Épargne brute (en années). Seuil légal d'alerte : 12 ans. Tag vert < 8 · jaune 8-12 · rouge > 12."
                  : "= Outstanding debt / Gross savings (in years). Statutory alert threshold: 12 years. Green tag < 8 · yellow 8-12 · red > 12."}</dd>
                <dt>{isFr ? "Marchés DECP — qualité data" : "DECP procurement — data quality"}</dt>
                <dd>{isFr
                  ? "DECP est déclaratif et de qualité variable (certaines villes ne publient quasi rien — Strasbourg = 5 marchés). 3 couches de défense côté pipeline : dedup par uid (Nice publiait 1 ligne par lot), détecteur de valeurs sentinelles type 399 999 996 €, et cap absolu à 200 M€ par marché."
                  : "DECP is self-declared with variable quality (some cities publish almost nothing — Strasbourg = 5 contracts). 3 defense layers in the pipeline: dedup by uid (Nice publishes 1 row per lot), detector for sentinel values like €399 999 996, and 200 M€ cap per single contract."}</dd>
                <dt>{isFr ? "Comparaison aux pairs" : "Peer comparison"}</dt>
                <dd>{isFr
                  ? "Brute en € par habitant. À nuancer : richesse fiscale, statut administratif (Paris = ville-département, Lyon dans la métropole) et transferts d'État varient fortement entre communes."
                  : "Raw € per resident. Caveats: fiscal wealth, administrative status (Paris is city-department, Lyon belongs to the Lyon metropolis) and State transfers vary widely between cities."}</dd>
              </dl>
            </article>
          </div>
        </div>
      </section>

      </main>
      <Footer />
    </div>
  );
}
