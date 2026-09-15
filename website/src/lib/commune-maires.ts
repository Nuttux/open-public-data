import maires from "@/data/communes-maires.json";
import { fill } from "@/lib/fmt";

/**
 * Qui décide (bloc 4) : le maire et la taille du conseil, depuis le
 * Répertoire national des élus. Fichier commité, une entrée par commune.
 * Publié : nom, prénom, date de début de fonction, effectifs — rien d'autre
 * du répertoire (règle vie privée du site).
 *
 * Depuis quand : le répertoire courant ne connaît que la fonction en cours
 * (« depuis mars 2026 » d'un maire en poste depuis 2014). `mandats` porte les
 * années de début de fonction de la même personne, chaînées à travers les
 * versions archivées du répertoire (2020-2025, `source_history`) ;
 * `depuis_premier` la plus ancienne ; `borne` dit que la chaîne atteint la
 * plus ancienne version — la personne était déjà maire avant, on dit « au moins ».
 */
export type Maire = {
  nom: string | null;
  prenom: string | null;
  depuis: string | null;
  depuis_premier: string | null;
  borne: boolean;
  mandats: number[];
  conseillers: number;
  adjoints: number;
};
type Capture = { date: string; url: string };
type File = {
  source: string;
  source_url: string;
  source_history?: { label: string; captures: Capture[] };
  n_communes: number;
  communes: Record<string, Maire>;
};
const F = maires as File;

export function loadMaire(insee: string): Maire | null {
  return F.communes[insee] ?? null;
}
export const MAIRES_SOURCE = { label: F.source, url: F.source_url };

/** Les versions archivées du répertoire (provenance du « depuis 2014 au moins ») : bornes d'années pour la ligne Source. */
export type MaireHistory = { y0: number; y1: number };
const captureYears = (F.source_history?.captures ?? []).map((c) => Number(c.date.slice(0, 4))).filter((y) => Number.isFinite(y));
export const MAIRES_HISTORY: MaireHistory | null = captureYears.length ? { y0: Math.min(...captureYears), y1: Math.max(...captureYears) } : null;

/**
 * Le « depuis » du maire, après son nom :
 *   un seul mandat observé   « · depuis mars 2026 » (vrai d'un maire nouveau)
 *   chaîne bornée            « · depuis 2014 au moins, réélu en 2020 et 2026 »
 *   chaîne non bornée        « · depuis 2020, réélu en 2026 »
 * Les années sont jointes par « , » puis « et ».
 */
export function maireDepuisLabel(m: Maire, t: (key: string) => string, tag: string): string | null {
  const years = Array.from(new Set(m.mandats ?? [])).sort((a, b) => a - b);
  if (years.length < 2) {
    return m.depuis ? fill(t("fx.pv.maire_depuis"), { date: new Date(m.depuis).toLocaleDateString(tag, { month: "long", year: "numeric" }) }) : null;
  }
  const [y0, ...rest] = years;
  const joined = rest.length === 1 ? String(rest[0]) : `${rest.slice(0, -1).join(", ")}${t("fx.pv.maire_et")}${rest[rest.length - 1]}`;
  return fill(t(m.borne ? "fx.pv.maire_depuis_borne" : "fx.pv.maire_depuis_reelu"), { y0, years: joined });
}

/** La mention du répertoire dans la ligne Source, avec ses versions archivées quand le fichier les cite. */
export function maireSourceLabel(hist: MaireHistory | null | undefined, t: (key: string) => string): string {
  return hist ? fill(t("fx.pv.src_rne_hist"), { y0: hist.y0, y1: hist.y1 }) : t("fx.pv.src_rne");
}

/** « KERN » → « Kern », « DE LA FONTAINE-MARTIN » → « de la Fontaine-Martin ». */
export function displayNomElu(nom: string | null): string {
  if (!nom) return "";
  const parts = nom.toLowerCase().split(/(\s+|-)/);
  return parts
    .map((w, i) => (/^(de|du|des|la|le|d'|l')$/.test(w) && i > 0 ? w : w.replace(/^([a-zà-ÿ])/, (c) => c.toUpperCase()).replace(/(['’])([a-zà-ÿ])/g, (m, a, c) => a + c.toUpperCase())))
    .join("");
}
