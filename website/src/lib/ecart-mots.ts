/**
 * L'écart de part budgétaire face aux communes de même taille, dit en mots.
 *
 * « +3 pt » est un vocabulaire de statisticien : un lecteur ne sait pas ce
 * qu'est un point de pourcentage ni une médiane. On dit « plus qu'ailleurs »,
 * « un peu moins qu'ailleurs », et on donne les deux parts en clair à côté.
 * Moins d'un demi-point : pareil. Moins de deux points : « un peu ».
 */
export type SensEcart = "egal" | "un_peu_plus" | "plus" | "un_peu_moins" | "moins";

export function sensDe(ecartPt: number): SensEcart {
  if (Math.abs(ecartPt) < 0.5) return "egal";
  if (ecartPt > 0) return ecartPt < 2 ? "un_peu_plus" : "plus";
  return ecartPt > -2 ? "un_peu_moins" : "moins";
}
