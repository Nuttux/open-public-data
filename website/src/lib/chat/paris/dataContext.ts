import { GENERATED_DATA_INVENTORY as INV } from "./dataContext.generated";

// L'inventaire factuel (années, totaux) est GÉNÉRÉ depuis public/data
// (npm run gen:chat-context). Ici on ne garde que la mise en forme et la
// couche éditoriale (pièges, glossaire) qui relève du jugement humain.

const eur = (v: number) =>
  v.toLocaleString("fr-FR", { maximumFractionDigits: 0 }).replace(/[  ]/g, " ");

function subventionsBlock(): string {
  const s = INV.subventions;
  if (!s) return "";
  const totals = Object.entries(s.totalsByYear)
    .map(([y, t]) => `  - ${y} : ${eur(t.montant_total)} € (${eur(t.nb_subventions)} subventions)`)
    .join("\n");
  return `### SUBVENTIONS — qui reçoit combien
- Granularité : 1 ligne = 1 bénéficiaire agrégé sur l'année.
- Années : ${s.years.join(", ")}.
- Totaux annuels (montants votés) :
${totals}
- Thématiques : ${s.thematiques.join(", ")}.
- Outils : get_subventions_summary (top bénéficiaires), get_subventions_tendances (par thématique), search_beneficiaire (par nom).
- PIÈGE : les plus gros bénéficiaires sont des établissements publics rattachés à la Ville (CASVP, Paris Musées, Paris Habitat…) — des « subventions internes », à distinguer des associations.
- PIÈGE : le nombre annuel de subventions varie fortement (12 093 en 2019, ~3 800 en 2021) sans que les montants varient autant — comparer les montants, pas les volumes. Les données ne documentent PAS la cause de ces écarts de décompte : ne pas l'inventer.
- PIÈGE : une même entité peut apparaître sous plusieurs libellés proches (ex. "CENTRE ACTION SOCIALE VILLE PARIS" et "CENTRE D ACTION SOCIALE DE LA VILLE DE PARIS") — regarder les variantes avant de conclure sur un total ou une année manquante.`;
}

function marchesBlock(): string {
  const m = INV.marches;
  if (!m) return "";
  const totals = Object.entries(m.totalsByYear)
    .map(([y, t]) => `  - ${y} : ${eur(t.enveloppe_max_totale)} € (${eur(t.nb_marches)} marchés)`)
    .join("\n");
  return `### MARCHÉS PUBLICS — contrats notifiés
- Granularité : 1 ligne = 1 marché notifié dans l'année (objet, nature, fournisseur, montants).
- Années : ${Math.min(...m.years)}–${Math.max(...m.years)}.
- Enveloppes max totales par année :
${totals}
- Outils : get_marches_summary (top contrats + catégories), search_marches (mot-clé), get_top_fournisseurs (classement fournisseurs cumulé), get_marches_tendances (évolution).
- Mots-clés éprouvés par sujet (utilise CES ensembles pour la reproductibilité) : propreté/ordures → "collecte" + "déchets" + "nettoiement" ; vélo → "cyclable" (PAS "vélo", trop de bruit) ; piscines → "piscine" ; écoles → "scolaire" + "école".
- PIÈGE CRITIQUE : montant_max = enveloppe contractuelle PLURIANNUELLE (plafond), PAS une dépense annuelle. À préciser à CHAQUE citation de montant de marché.
- PIÈGE : ${Math.max(...m.years) - 1}–${Math.max(...m.years)} = années en cours de publication, probablement incomplètes.
- PAS pour : ce qui a été réellement payé/facturé (non disponible en open data).`;
}

function budgetBlock(): string {
  const b = INV.budget;
  const e = INV.evolution;
  if (!b && !e) return "";
  const types = e?.year_types ?? b?.year_types ?? {};
  const typesLine = Object.entries(types)
    .sort(([a], [b2]) => Number(a) - Number(b2))
    .map(([y, t]) => `${y}=${t === "vote" ? "voté" : "exécuté"}`)
    .join(", ");
  return `### BUDGET — recettes/dépenses
- Années : ${(b?.years ?? e?.years ?? []).join(", ")} (${typesLine}).
- Outils : get_budget_sankey (grands flux recettes→dépenses d'une année), get_budget_nature (dépenses par nature : Personnel, péréquation, transferts sociaux…, ${INV.budget_nature.years.length ? `années ${Math.min(...INV.budget_nature.years)}–${Math.max(...INV.budget_nature.years)}` : "indisponible"} ; avec le param nature, ventile une nature par thématique — ex. les salaires fléchés Éducation), get_evolution_budget (série : recettes, dépenses, épargne brute, emprunts, variation de dette).
- Distinction OBLIGATOIRE : budget voté (BP, prévision) ≠ exécuté (CA, réalisé). Les années "voté" sont des prévisions.
- PIÈGE : les totaux diffèrent selon le périmètre (opérations ventilées vs budget total avec dette et dotations). Toujours reprendre le périmètre indiqué par l'outil.`;
}

function voteExecuteBlock(): string {
  const v = INV.vote_execute;
  if (!v) return "";
  return `### VOTÉ vs EXÉCUTÉ — la Ville dépense-t-elle ce qu'elle vote ?
- Comparaisons disponibles : ${v.comparison_years.join(", ")} ; prévisionnel : ${v.forecast_years.filter((y) => !(v.comparison_years as readonly number[]).includes(y)).join(", ")}.
- Outil : get_vote_vs_execute (taux d'exécution global, fonctionnement, investissement).
- Périmètre : ${v.note_perimeter ?? "opérations ventilées par fonction uniquement"}`;
}

function investissementsBlock(): string {
  const i = INV.investissements;
  if (!i) return "";
  return `### INVESTISSEMENTS — équipements, travaux
- Années : ${i.years.join(", ")} (CA, exécuté). Par chapitre fonctionnel : ${i.chapitres.join(", ")}.
- Outil : get_investissements.
- Périmètre : ${i.note_perimetre ?? "Budget Principal, investissement réel hors dette"}`;
}

function detteBlock(): string {
  const d = INV.dette;
  const bi = INV.bilan;
  const hb = INV.hors_bilan;
  return `### DETTE, BILAN, GARANTIES
- get_dette_structure (années ${d.years.join(", ")}) : dette financière directe de la Ville, par instrument (obligataire, bancaire…).
- get_bilan (années ${bi.years.join(", ")}) : actif/passif au 31/12, fonds propres, ratio d'endettement.
- get_hors_bilan (années ${hb.years.join(", ")}) : garanties d'emprunt accordées par la Ville (essentiellement bailleurs sociaux : RIVP, Paris Habitat…).
- PIÈGE : garanties (hors-bilan) ≠ dette directe. Une garantie n'est pas un décaissement : la Ville paie seulement si l'emprunteur fait défaut. Ne JAMAIS additionner dette directe et garanties sans le dire.`;
}

function logementBlock(): string {
  const l = INV.logement_social;
  if (!l) return "";
  return `### LOGEMENT SOCIAL — demande et attributions
- Année : ${l.year}. Source : ${l.source ?? "DRIHL"}.
- Outil : get_logement_social (demandes, attributions, délais, par arrondissement).`;
}

function constantsBlock(): string {
  const c = INV.constants;
  if (!c) return "";
  const rows = [
    c.paris_population && `- Population de Paris : ${eur(c.paris_population.value)} ${c.paris_population.unit ?? ""} (${c.paris_population.source ?? "source pipeline"}).`,
  ].filter(Boolean);
  return `### CONSTANTES SOURCÉES (utilisables pour des ratios par habitant)
${rows.join("\n")}`;
}

export const DATA_CONTEXT = `# Données disponibles

Périmètre : Ville + Département de Paris (collectivité unique, nomenclature M57 depuis 2019). Sources : Open Data Paris, comptes administratifs, délibérations, DRIHL — via le pipeline dbt du projet. L'inventaire ci-dessous (années, totaux) est généré automatiquement depuis les exports du pipeline.

${subventionsBlock()}

${marchesBlock()}

${budgetBlock()}

${voteExecuteBlock()}

${investissementsBlock()}

${detteBlock()}

${logementBlock()}

${constantsBlock()}

## Guide : question utilisateur → bon outil
- "associations", "qui reçoit des aides" → search_beneficiaire / get_subventions_summary
- "quels secteurs", "par thématique", "la culture", "le sport" → get_subventions_tendances (subventions) ou get_budget_nature / get_budget_sankey (budget)
- "fournisseurs", "contrats", "appels d'offres", "consultants" → search_marches / get_marches_summary
- "budget total", "recettes", "dépenses", "d'où vient l'argent" → get_budget_sankey, get_evolution_budget
- "salaires", "masse salariale", "personnel" → get_budget_nature
- "dette", "emprunt" → get_dette_structure (direct) ; get_evolution_budget (variation annuelle)
- "garanties", "bailleurs sociaux" (côté finances) → get_hors_bilan
- "logement social", "demandeurs", "attributions" → get_logement_social
- "investissements", "équipements", "travaux" → get_investissements (budget) ou search_marches (contrats)
- "voté vs réel", "dépasse le budget" → get_vote_vs_execute
- "patrimoine", "actif", "que possède Paris" → get_bilan

## Clarifications fréquentes
- "Combien Paris dépense pour X" → budget exécuté (get_budget_nature / get_budget_sankey), PAS la somme subventions+marchés (ce sont des vues partielles qui se recoupent).
- "Argent donné à X" → subventions si association/établissement public, marchés si entreprise prestataire. En cas de doute, chercher dans les deux.
- Années 2025–2026 : budget VOTÉ uniquement (prévision, pas de l'argent déjà dépensé).`;
