/**
 * Category name translations for chart labels.
 *
 * Data JSON files use French category names as keys (node names, link
 * source/target, etc.). These names must stay untouched in the data layer
 * (ECharts Sankey links reference nodes by name). This map is applied
 * **at display time only**.
 */

const FR_TO_EN: Record<string, string> = {
  // ── Budget thématiques (Sankey expense nodes, PerCapita, etc.) ─────────
  'Personnel & Admin': 'Staff & Administration',
  'Action Sociale': 'Social Services',
  'Aménagement & Logement': 'Planning & Housing',
  'Éducation': 'Education',
  'Culture & Sport': 'Culture & Sport',
  'Environnement': 'Environment',
  'Transports': 'Transport',
  'Sécurité': 'Public Safety',
  'Économie': 'Economy',
  'Remboursement dette': 'Debt Repayment',
  'Dette': 'Debt',
  'Autres': 'Other',
  'Autres (D)': 'Other (Exp.)',
  'Autres (R)': 'Other (Rev.)',

  // ── Revenue categories (Sankey revenue nodes) ─────────────────────────
  'Impôts & Taxes': 'Taxes',
  'Services Publics': 'Public Services',
  'Dotations & Subventions': 'State Grants',
  'Emprunts': 'Borrowing',
  'Investissement': 'Investment',
  'Dotations État': 'State Grants',
  'Cessions & Investissement': 'Asset Sales & Investment',
  'Fiscalité': 'Tax Revenue',
  'Fiscalité Directe': 'Direct Taxation',
  'Fiscalité Indirecte': 'Indirect Taxation',
  'Dotations & Participations': 'Grants & Transfers',

  // ── Central nodes ─────────────────────────────────────────────────────
  'Budget Paris': 'Paris Budget',
  'Patrimoine Paris': 'Paris Assets',

  // ── Nature types (NatureDonut) ────────────────────────────────────────
  'Personnel': 'Staff',
  'Transferts sociaux': 'Social Transfers',
  'Contributions obligatoires': 'Mandatory Contributions',
  'Subventions (fonctionnement)': 'Grants (operating)',
  'Subventions (investissement)': 'Grants (capital)',
  'Achats': 'Purchases',
  'Services extérieurs': 'External Services',
  'Autres services': 'Other Services',
  'Immobilisations corporelles': 'Tangible Assets',
  'Immobilisations en cours': 'Assets Under Construction',
  'Études': 'Studies',
  'Charges financières': 'Financial Charges',
  'Reversements péréquation': 'Equalisation Transfers',
  'Dotations arrondissements': 'District Grants',
  'Dotations et participations': 'Grants & Transfers',

  // ── Balance sheet — Actif ─────────────────────────────────────────────
  'Actif circulant': 'Current Assets',
  'Actif immobilisé': 'Fixed Assets',
  'Trésorerie (Actif)': 'Cash (Assets)',
  'Comptes de régularisation (Actif)': 'Accruals (Assets)',
  'Écarts de conversion actif': 'Currency Translation (Assets)',

  // ── Balance sheet — Passif ────────────────────────────────────────────
  'Fonds propres': 'Equity',
  'Dettes financières': 'Financial Debt',
  'Dettes non financières': 'Non-Financial Debt',
  'Provisions pour risques et charges': 'Provisions',
  'Trésorerie (Passif)': 'Cash (Liabilities)',
  'Comptes de régularisation (Passif)': 'Accruals (Liabilities)',
  'Écarts de conversion passif': 'Currency Translation (Liabilities)',
  'Dettes': 'Liabilities',

  // ── Balance sheet drill-down — Actif immobilisé ───────────────────────
  'Constructions': 'Buildings',
  'Terrains': 'Land',
  'Réseaux et installations de voirie': 'Road Networks & Infrastructure',
  'Subventions d\'investissement versées': 'Investment Grants Paid',
  'Immobilisations corporelles en cours': 'Tangible Assets in Progress',
  'Immobilisations mises en concessions ou affermées': 'Concession Assets',
  'Réseaux divers': 'Miscellaneous Networks',
  'Autres immobilisations incorporelles': 'Other Intangible Assets',
  'Immobilisations financières': 'Financial Assets',
  'Installations techniques, agencements et matériel': 'Technical Equipment',
  'Immobilisations incorporelles en cours': 'Intangible Assets in Progress',
  'Droits de retour relatifs aux biens mis à disposition ou affectés': 'Reversion Rights on Allocated Assets',

  // ── Balance sheet drill-down — Actif circulant ────────────────────────
  'Créances correspondant à des opérations pour compte de tiers': 'Third-Party Receivables',
  'Créances sur les autres débiteurs': 'Other Receivables',
  'Créances sur les redevables et comptes rattachés': 'Tax Receivables',
  'Créances sur des entités publiques, des organismes internationaux et la Commission européenne': 'Public Entity Receivables',
  'Charges constatées d\'avance': 'Prepaid Expenses',
  'Créances sur budgets annexes': 'Subsidiary Budget Receivables',

  // ── Balance sheet drill-down — Fonds propres ──────────────────────────
  'Réserves': 'Reserves',
  'Apports non rattachés a un actif déterminé - Dotations': 'Unallocated Endowments',
  'Apports non rattachés a un actif déterminé - Fonds globalisés': 'Pooled Funds',
  'Neutralisations et régularisation': 'Neutralisations & Adjustments',
  'Subventions d\'investissement - Rattachées à un actif non amortissable': 'Investment Grants (Non-Depreciable)',
  'Droits de l\'affectant et du remettant': 'Allocator & Transferor Rights',
  'Subventions d\'investissement - Rattachées à un actif amortissable': 'Investment Grants (Depreciable)',
  'Résultat de l\'exercice': 'Net Income',
  'Report à nouveau': 'Retained Earnings',
  'Droits du concédant et de l\'affermant': 'Concession Holder Rights',

  // ── Balance sheet drill-down — Dettes ─────────────────────────────────
  'Dettes correspondant à des opérations pour compte de tiers': 'Third-Party Payables',
  'Produits constatés d\'avance': 'Deferred Revenue',
  'Dettes fournisseurs et comptes rattachés': 'Trade Payables',
  'Autres dettes non financières': 'Other Non-Financial Debt',
  'Dettes sur budgets annexes': 'Subsidiary Budget Payables',
  'Dettes fiscales et sociales': 'Tax & Social Liabilities',
  'Fonds gérés par la collectivité': 'Managed Funds',
  'Emprunts obligataires': 'Bond Debt',
  'Dettes financières et autres emprunts': 'Financial Debt & Other Loans',
  'Emprunts souscrits auprès des établissements de crédit': 'Bank Loans',
  'Provisions pour risques': 'Risk Provisions',

  // ── Investment thématiques (THEMATIQUE_LABELS) ───────────────────────
  'Culture & Arts': 'Culture & Arts',
  'Sport & Jeunesse': 'Sport & Youth',
  'Social & Solidarité': 'Social & Solidarity',
  'Éducation & Petite enfance': 'Education & Early Childhood',
  'Environnement & Espaces verts': 'Environment & Green Spaces',
  'Économie & Emploi': 'Economy & Employment',
  'Logement & Habitat': 'Housing & Habitat',
  'Urbanisme & Voirie': 'Urban Planning & Roads',
  'Prévention & Sécurité': 'Prevention & Safety',
  'mobilite': 'Mobility',
  'democratie': 'Democracy',

  // ── Investment chapter names (missionTexte) ─────────────────────────
  'Voirie': 'Roads',
  'Affaires Scolaires': 'School Affairs',
  'Jeunesse et Sports': 'Youth & Sports',
  'Affaires Culturelles': 'Cultural Affairs',
  'Famille': 'Family',
  'Décentralisation': 'Decentralisation',
  'Propreté': 'Cleanliness',
  'Action Sanitaire et Sociale': 'Health & Social Services',
  'Aménagement Urbain': 'Urban Development',
  'Transports et Déplacements': 'Transport & Mobility',

  // ── Housing types ───────────────────────────────────────────────────
  'PLAI (très social)': 'PLAI (very social)',
  'PLUS (social)': 'PLUS (social)',
  'PLS (intermédiaire)': 'PLS (intermediate)',

  // ── Marchés categorie_libelle ───────────────────────────────────────
  'Travaux d\'aménagement de voirie': 'Road development works',
  'Travaux d\'aménagement d\'espaces verts': 'Green space development works',
  'Travaux sur le réseau d\'assainissement': 'Sewage network works',
  'Travaux de construction, rénovation équipements publics': 'Construction & renovation of public facilities',
  'Maintenance des installations': 'Facility maintenance',
  'Carburants': 'Fuel',
  'Travaux de génie civil': 'Civil engineering works',
  'Travaux d\'entretien, préservation équipements publics': 'Maintenance of public facilities',
  'Animation culturelle et de loisirs': 'Cultural & leisure activities',
  'Services d\'actions éducatives scolaires et périscolaires': 'School & extracurricular education services',
  'Collecte ordures ménagères et autres déchets': 'Household & other waste collection',
  'Services de centres de vacances et de centres de loisirs': 'Holiday & leisure centre services',

  // ── Subventions thématiques ───────────────────────────────────────────
  'Social - Solidarité': 'Social - Solidarity',
  'Social - Petite enfance': 'Social - Early Childhood',
  'Logement': 'Housing',
  'Culture': 'Culture',
  'Sport': 'Sport',
  'Administration': 'Administration',
  'Santé': 'Health',
  'Non classifié': 'Unclassified',
  'International': 'International',
  'Urbanisme': 'Urban Planning',
  'Autre': 'Other',
  'Social': 'Social',
  'Transport': 'Transport',

  // ── Villes Sankey categories ──────────────────────────────────────────
  'Produits des services': 'Service Revenue',
  'Autres produits': 'Other Revenue',
  'Fonctionnement courant': 'Operating Costs',
  'Transferts & subventions': 'Transfers & Grants',
  'Investissements': 'Investments',

  // ── Technical / special ───────────────────────────────────────────────
  'APA': 'APA',
  'Fonds Européens': 'European Funds',
  'Opérations Patrimoniales': 'Asset Operations',
  'Transferts entre Sections': 'Cross-Section Transfers',
  'Opérations Financières': 'Financial Operations',
  'RSA': 'RSA',

  // ── Sankey legend / hardcoded labels ──────────────────────────────────
  'Recettes': 'Revenue',
  'Dépenses': 'Expenditure',
  'Budget': 'Budget',

  // ── Subventions misc ─────────────────────────────────────────────────
  'Non renseignée': 'Not specified',
  'Autres privés': 'Other Private',
  'Établissements publics': 'Public Institutions',

  // ── Marchés publics natures ─────────────────────────────────────────
  'SERVICES': 'Services',
  'TRAVAUX': 'Works',
  'FOURNITURE': 'Supplies',

  // ── Organisation types (subventions) ──────────────────────────────────
  'Associations': 'Associations',
  'Autres personnes de droit privé': 'Other Private Entities',
  'Autres personnes de droit public': 'Other Public Entities',
  'Communes': 'Municipalities',
  'Département': 'Department',
  'Entreprises': 'Companies',
  'Etablissements de droit public': 'Public Law Establishments',
  'Etablissements publics': 'Public Institutions',
  'Etat': 'State',
  'Personnes physiques': 'Individuals',
  'Régions': 'Regions',
};

/**
 * Translate a French category name to the current locale.
 * Returns the original name if no translation is found (graceful fallback).
 */
export function translateCategory(name: string, locale: string): string {
  if (locale === 'fr') return name;
  return FR_TO_EN[name] ?? name;
}
