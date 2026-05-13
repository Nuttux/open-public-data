/**
 * Editorial asides — chiffres clés sourcés à afficher dans les fiches
 * drill-down (drawer). Ces asides étaient auparavant inlined sur la page
 * Daily Bread (panel `DailyBreadDeepDive`), mais redondants avec le drawer
 * qui couvre déjà la décompo niveau 3. On les déplace donc dans le drawer
 * pour les rendre accessibles via clic et libérer la page principale.
 *
 * Source de vérité : i18n keys `db.deepdive.aside.<group>{1,2,3}.{num,num_em,text,source}`.
 *
 * Mapping `(bucket, level2Key)` → group :
 *   - secu :
 *      - cnam_maladie     → sante
 *      - cnav_retraites   → retraites
 *      - cnaf_famille     → famille
 *      - unedic_chomage   → chomage
 *   - etat (level2 missions PLF) :
 *      - ec               → education
 *      - da               → defense
 *      - eb               → dette
 *   - etat (aggregations éditoriales) :
 *      - autres           → autres_ministeres
 *      - dette            → dette
 *      - defense          → defense
 *      - education_recherche → education
 *   - local (bloc communal level2 — un seul aside éditorial commun
 *      réutilisé pour toutes les fonctions, parce que les chiffres clés
 *      sont génériques au bloc communal) :
 *      - <toute fonction> → local
 *   - local scope dept / region : 1 set d'asides chacun
 *
 * Le composant qui consomme reçoit déjà le `t()` runtime + locale, donc on
 * renvoie juste la liste de keys (le composant fait les `t(key)`).
 *
 * Volontairement simple (lookup map en code) — pas de fichier seed côté
 * pipeline pour l'instant : turnover éditorial faible, et l'éditeur voit
 * directement le mapping en code.
 */

export type AsideKeys = {
  num: string;
  numEm: string;
  text: string;
  source: string;
};

function asideTrio(group: string): AsideKeys[] {
  return [1, 2, 3].map((i) => ({
    num: `db.deepdive.aside.${group}${i}.num`,
    numEm: `db.deepdive.aside.${group}${i}.num_em`,
    text: `db.deepdive.aside.${group}${i}.text`,
    source: `db.deepdive.aside.${group}${i}.source`,
  }));
}

/**
 * Map level2 key → aside group, par bucket.
 */
const LEVEL2_TO_GROUP: Record<string, Record<string, string>> = {
  secu: {
    cnam_maladie: "sante",
    cnav_retraites: "retraites",
    cnaf_famille: "famille",
    unedic_chomage: "chomage",
  },
  etat: {
    ec: "education", // Enseignement scolaire
    da: "defense", // Défense
    eb: "dette", // Engagements financiers de l'État
    ra: "education", // Recherche et enseignement supérieur (réutilise éducation)
  },
};

/**
 * Map aggregation key (bucket etat) → aside group.
 */
const ETAT_AGG_TO_GROUP: Record<string, string> = {
  education_recherche: "education",
  dette: "dette",
  defense: "defense",
  autres: "autres_ministeres",
};

/**
 * Récupère les asides éditoriaux pour une cellule level2. Retourne null
 * si aucun aside n'est mappé pour cette clé (la fiche drawer omet alors
 * la section "Chiffres à retenir").
 */
export function getEditorialAsidesForLevel2(
  bucket: "secu" | "etat" | "local",
  level2Key: string,
): AsideKeys[] | null {
  if (bucket === "local") {
    // Bloc communal : on utilise le set local générique pour toutes les
    // fonctions level2 du bloc communal (compétences génériques de la
    // commune — école, déchets, transport).
    return asideTrio("local");
  }
  const map = LEVEL2_TO_GROUP[bucket];
  if (!map) return null;
  const group = map[level2Key];
  if (!group) return null;
  return asideTrio(group);
}

/**
 * Récupère les asides pour une aggregation État (bucket éditorial qui
 * regroupe plusieurs missions level2).
 */
export function getEditorialAsidesForEtatAggregation(
  aggKey: string,
): AsideKeys[] | null {
  const group = ETAT_AGG_TO_GROUP[aggKey];
  if (!group) return null;
  return asideTrio(group);
}

/**
 * Récupère les asides pour un scope local (departement / region).
 */
export function getEditorialAsidesForLocalScope(
  scope: "dept" | "region",
): AsideKeys[] | null {
  if (scope === "dept") return asideTrio("departement");
  if (scope === "region") return asideTrio("region");
  return null;
}
