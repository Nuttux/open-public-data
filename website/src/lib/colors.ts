/**
 * =============================================================================
 * DESIGN SYSTEM - Paris Budget Dashboard
 * =============================================================================
 * 
 * Ce fichier définit le langage visuel unifié de l'application.
 * RÈGLE D'OR: Une couleur = Un concept, partout dans l'app.
 * 
 * Structure:
 * 1. PALETTE DE BASE - Couleurs Tailwind utilisées
 * 2. THÉMATIQUES (Fonctions) - Éducation, Culture, Social, etc.
 * 3. NATURES (Types de dépense) - Personnel, Investissement, Subventions, etc.
 * 4. FLUX - Recettes vs Dépenses
 * 5. UTILITAIRES - Fonctions d'accès aux couleurs
 * =============================================================================
 */

// =============================================================================
// 1. PALETTE DE BASE (Tailwind CSS)
// =============================================================================

/** Palette de couleurs principales */
export const PALETTE = {
  // Couleurs vives (pour les données)
  blue: '#3b82f6',       // Tailwind blue-500
  purple: '#a855f7',     // Tailwind purple-500
  pink: '#ec4899',       // Tailwind pink-500
  red: '#ef4444',        // Tailwind red-500
  orange: '#f97316',     // Tailwind orange-500
  amber: '#f59e0b',      // Tailwind amber-500
  yellow: '#eab308',     // Tailwind yellow-500
  lime: '#84cc16',       // Tailwind lime-500
  green: '#22c55e',      // Tailwind green-500
  emerald: '#10b981',    // Tailwind emerald-500
  teal: '#14b8a6',       // Tailwind teal-500
  cyan: '#06b6d4',       // Tailwind cyan-500
  sky: '#0ea5e9',        // Tailwind sky-500
  violet: '#8b5cf6',     // Tailwind violet-500
  
  // Neutres (pour les éléments secondaires)
  slate: '#64748b',      // Tailwind slate-500
  slateLight: '#94a3b8', // Tailwind slate-400
  gray: '#6b7280',       // Tailwind gray-500
} as const;

// =============================================================================
// 2. THÉMATIQUES (Fonctions budgétaires)
// =============================================================================
// Ces couleurs sont utilisées partout où on affiche des thématiques:
// - Sankey (catégories de dépenses)
// - Subventions (treemap, bénéficiaires)
// - Drill-down panels
// - Légendes

export const THEMATIQUE_COLORS: Record<string, string> = {
  // --- Fonctions principales (couleurs distinctes) ---
  'Éducation': PALETTE.blue,              // 🎓 Bleu - Universellement associé à l'éducation
  'Culture & Sport': PALETTE.purple,      // 🎭 Purple - Arts et spectacles
  'Action Sociale': PALETTE.pink,         // 💝 Pink - Care, solidarité
  'Social': PALETTE.pink,                 // Alias
  'Sécurité': PALETTE.red,                // 🚨 Rouge - Urgence, protection
  'Transports': PALETTE.amber,            // 🚇 Amber - Signalisation, mobilité
  'Transport': PALETTE.amber,             // Alias
  'Environnement': PALETTE.green,         // 🌿 Vert - Nature, écologie
  'Aménagement & Logement': PALETTE.cyan, // 🏗️ Cyan - Construction, urbanisme
  'Urbanisme': PALETTE.cyan,              // Alias
  'Logement': PALETTE.cyan,               // Alias
  'Économie': PALETTE.orange,             // 💼 Orange - Business, dynamisme
  'Santé': PALETTE.teal,                  // 🏥 Teal - Médical, bien-être
  'Administration': PALETTE.slate,        // 🏛️ Slate - Institutionnel, neutre
  'Personnel & Admin': PALETTE.slate,     // Alias
  
  // --- Variantes (nuances de la couleur principale) ---
  'Culture': PALETTE.purple,
  'Sport': PALETTE.violet,                // Variante de Culture
  'Social - Solidarité': PALETTE.pink,
  'Social - Petite enfance': '#f472b6',   // Pink lighter
  'Transport - Voirie': '#d97706',        // Amber darker
  'Urbanisme - Logement': '#0891b2',      // Cyan darker
  'International': PALETTE.violet,
  
  // --- Spéciaux ---
  'Dette': PALETTE.yellow,                // 💳 Jaune - Attention (dette)
  'Non classifié': PALETTE.slateLight,
  'Autre': PALETTE.gray,
};

// =============================================================================
// 3. NATURES (Types de dépense comptable)
// =============================================================================
// Ces couleurs sont utilisées dans le donut par nature et les analyses comptables.
// Elles sont DIFFÉRENTES des thématiques car c'est une autre dimension.

export const NATURE_COLORS: Record<string, string> = {
  // --- Dépenses de fonctionnement ---
  'Personnel': PALETTE.blue,              // 👔 Plus grande catégorie - couleur primaire
  'Transferts sociaux': PALETTE.pink,     // 💝 Aides sociales
  'Contributions obligatoires': PALETTE.orange, // 📋 Cotisations, charges
  'Subventions (fonctionnement)': PALETTE.purple, // 🎁 Aides aux associations
  'Subventions (investissement)': PALETTE.violet,
  'Achats': PALETTE.cyan,                 // 🛒 Fournitures
  'Services extérieurs': PALETTE.sky,     // 🔧 Prestations
  'Autres services': PALETTE.teal,
  
  // --- Dépenses d'investissement ---
  'Immobilisations corporelles': PALETTE.green, // 🏗️ Constructions
  'Immobilisations en cours': PALETTE.lime,     // 🚧 Travaux en cours
  'Études': PALETTE.emerald,                    // 📐 Conception
  
  // --- Charges financières ---
  'Charges financières': PALETTE.amber,   // 💰 Intérêts
  'Remboursement dette': PALETTE.yellow,  // 💳 Capital
  
  // --- Dotations et transferts ---
  'Reversements péréquation': PALETTE.slate,
  'Dotations arrondissements': PALETTE.slateLight,
  
  'Autre': PALETTE.gray,
};

// =============================================================================
// 4. FLUX (Sens budgétaire)
// =============================================================================
// Couleurs sémantiques pour recettes/dépenses et solde

export const FLUX_COLORS = {
  recettes: PALETTE.emerald,    // 📈 Vert = positif, entrée d'argent
  depenses: PALETTE.purple,     // 📉 Purple = sortie (pas rouge pour éviter "négatif")
  solde: {
    positif: PALETTE.emerald,   // Excédent
    negatif: '#ef4444',         // Déficit (rouge uniquement ici)
  },
  emprunts: PALETTE.amber,      // ⚠️ Financement externe
  dette: PALETTE.yellow,        // ⚠️ Remboursement
} as const;

// =============================================================================
// 5. COULEURS RECETTES (pour compatibilité Sankey)
// =============================================================================

export const REVENUE_COLORS: Record<string, string> = {
  'Impôts & Taxes': PALETTE.emerald,
  'Services Publics': PALETTE.sky,
  'Dotations & Subventions': PALETTE.cyan,
  'Emprunts': PALETTE.amber,
  'Investissement': PALETTE.violet,
  'Autres': PALETTE.slate,
};

// =============================================================================
// 6. COULEURS DÉPENSES (pour compatibilité Sankey)
// =============================================================================
// Utilise les mêmes couleurs que THEMATIQUE_COLORS pour cohérence

export const EXPENSE_COLORS: Record<string, string> = {
  'Action Sociale': THEMATIQUE_COLORS['Action Sociale'],
  'Personnel & Admin': THEMATIQUE_COLORS['Administration'],
  'Éducation': THEMATIQUE_COLORS['Éducation'],
  'Culture & Sport': THEMATIQUE_COLORS['Culture & Sport'],
  'Sécurité': THEMATIQUE_COLORS['Sécurité'],
  'Aménagement & Logement': THEMATIQUE_COLORS['Aménagement & Logement'],
  'Transports': THEMATIQUE_COLORS['Transports'],
  'Environnement': THEMATIQUE_COLORS['Environnement'],
  'Économie': THEMATIQUE_COLORS['Économie'],
  'Dette': THEMATIQUE_COLORS['Dette'],
  'Autres': PALETTE.slate,
};

// =============================================================================
// 7. FONCTIONS UTILITAIRES
// =============================================================================

/**
 * Récupère la couleur d'une thématique
 * @param thematique - Nom de la thématique (ex: "Éducation", "Culture & Sport")
 */
export function getThematiqueColor(thematique: string): string {
  // Essayer le nom exact, puis chercher un match partiel
  if (THEMATIQUE_COLORS[thematique]) {
    return THEMATIQUE_COLORS[thematique];
  }
  
  // Chercher un match partiel (ex: "Social - Solidarité" → "Social")
  for (const key of Object.keys(THEMATIQUE_COLORS)) {
    if (thematique.startsWith(key) || key.startsWith(thematique)) {
      return THEMATIQUE_COLORS[key];
    }
  }
  
  return THEMATIQUE_COLORS['Autre'];
}

/**
 * Récupère la couleur d'une nature de dépense
 * @param nature - Nom de la nature (ex: "Personnel", "Subventions (fonctionnement)")
 */
export function getNatureColor(nature: string): string {
  return NATURE_COLORS[nature] || NATURE_COLORS['Autre'];
}

/**
 * Récupère la couleur d'une catégorie Sankey
 * @param name - Nom de la catégorie
 * @param category - 'revenue' ou 'expense'
 */
export function getCategoryColor(name: string, category: 'revenue' | 'expense'): string {
  if (category === 'revenue') {
    return REVENUE_COLORS[name] || PALETTE.slate;
  }
  return EXPENSE_COLORS[name] || PALETTE.slate;
}

/**
 * Éclaircit une couleur hex pour les états hover
 * @param hex - Couleur hexadécimale (ex: "#3b82f6")
 * @param percent - Pourcentage d'éclaircissement (default: 20)
 */
export function lightenColor(hex: string, percent: number = 20): string {
  const num = parseInt(hex.replace('#', ''), 16);
  const amt = Math.round(2.55 * percent);
  const R = Math.min(255, (num >> 16) + amt);
  const G = Math.min(255, ((num >> 8) & 0x00FF) + amt);
  const B = Math.min(255, (num & 0x0000FF) + amt);
  return `#${(1 << 24 | R << 16 | G << 8 | B).toString(16).slice(1)}`;
}

/**
 * Assombrit une couleur hex
 * @param hex - Couleur hexadécimale
 * @param percent - Pourcentage d'assombrissement (default: 20)
 */
export function darkenColor(hex: string, percent: number = 20): string {
  const num = parseInt(hex.replace('#', ''), 16);
  const amt = Math.round(2.55 * percent);
  const R = Math.max(0, (num >> 16) - amt);
  const G = Math.max(0, ((num >> 8) & 0x00FF) - amt);
  const B = Math.max(0, (num & 0x0000FF) - amt);
  return `#${(1 << 24 | R << 16 | G << 8 | B).toString(16).slice(1)}`;
}
