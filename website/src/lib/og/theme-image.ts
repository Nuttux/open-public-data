import fs from "node:fs";
import path from "node:path";

/**
 * Theme illustration for share cards.
 *
 * A fiche with no photo of its own — a contract, a paid vendor — borrows one
 * from the theme it is filed under. Every image here is a photo already
 * published in the app (origins in public/img/themes/credits.json), so a
 * shared link shows a real public facility rather than stock.
 *
 * Two rules keep this honest:
 *
 *  1. A theme photo only illustrates a fiche from ITS OWN city. A Paris square
 *     on a Recife contract is not a stylistic slip, it is wrong.
 *  2. A borrowed photo is always captioned with the building it shows and
 *     marked as an illustration — a named hospital beside an unrelated
 *     vendor's name would otherwise imply a link the data does not contain.
 *
 * The image illustrates the THEME, never the spending.
 */

export type City = "paris" | "sf" | "recife";

export type ThemeKey =
  | "bibliotheque" | "parcs" | "sport" | "culture" | "sante" | "pompiers"
  | "transport" | "administration" | "port" | "eau" | "marche" | "urbain"
  | "education";

type ThemePhoto = { file: string; caption: string };

/** Per city, because the same theme needs a local photo in each. */
const PHOTOS: Record<City, Partial<Record<ThemeKey, ThemePhoto>>> = {
  paris: {
    bibliotheque:   { file: "bibliotheque.jpg",   caption: "Médiathèque James Baldwin, Paris" },
    parcs:          { file: "parcs.jpg",          caption: "Parc Montsouris, Paris" },
    sport:          { file: "sport.jpg",          caption: "Piscine Georges-Vallerey, Paris" },
    culture:        { file: "culture.jpg",        caption: "Musée Carnavalet, Paris" },
    administration: { file: "administration.jpg", caption: "Mairie du 20e, Paris" },
    marche:         { file: "marche.jpg",         caption: "Marché Saint-Quentin, Paris" },
    urbain:         { file: "urbain.jpg",         caption: "Place de la République, Paris" },
  },
  sf: {
    pompiers:  { file: "pompiers.jpg",  caption: "Fire Station #18, San Francisco" },
    port:      { file: "port.jpg",      caption: "Fisherman's Wharf, San Francisco" },
    eau:       { file: "eau.jpg",       caption: "Southeast Water Pollution Control Plant" },
    sante:     { file: "sante.jpg",     caption: "Zuckerberg SF General Hospital" },
    transport: { file: "transport.jpg", caption: "Balboa Park Station, San Francisco" },
  },
  recife: {
    education: { file: "br_education.jpg", caption: "Escola Municipal Darcy Ribeiro, Recife" },
    parcs:     { file: "br_parcs.jpg",     caption: "Parque Dona Lindu, Recife" },
    sante:     { file: "br_sante.jpg",     caption: "Unidade de Saúde Bidu Krause, Recife" },
    urbain:    { file: "br_urbain.jpg",    caption: "Praça Gregório Bezerra, Recife" },
    sport:     { file: "br_sport.jpg",     caption: "Geraldão, Recife" },
  },
};

/** Last resort, so no card is ever left without an image. */
const CITY_DEFAULT: Record<City, ThemeKey> = {
  paris: "urbain",
  sf: "port",
  recife: "urbain",
};

/** Ordered: first matching pattern wins, so the specific precedes the broad. */
const PATTERNS: [RegExp, ThemeKey][] = [
  [/\b(librar|bibliot|mediatec)/i, "bibliotheque"],
  [/\b(fire|bombeir|pompier|emerg)/i, "pompiers"],
  [/\b(school|escola|creche|educa|enseign|ensino)/i, "education"],
  [/\b(health|hospital|medical|saúde|saude|sante|santé|clinic)/i, "sante"],
  [/\b(park|rec(reation)?\b|garden|jardin|praça|praca|verde|parque)/i, "parcs"],
  [/\b(sport|esporte|pool|piscin|gym|stadium|estádio|estadio|ginásio|ginasio)/i, "sport"],
  [/\b(museum|arts?|cultur|theat|teatr|music)/i, "culture"],
  [/\b(water|sewer|wastewater|puc|saneament|esgoto|água|agua)/i, "eau"],
  [/\b(port|harbou?r|pier|wharf|marítim|maritim)/i, "port"],
  [/\b(transit|transport|muni|mta|bus|metro|mobilidad|trânsit)/i, "transport"],
  [/\b(market|marché|marche|mercad|feira|abasteciment|aliment)/i, "marche"],
  [/\b(public works|street|road|urban|urbaniz|obras|infraestrutura|limpeza|emlurb|voiri)/i, "urbain"],
  [/\b(administra|controller|treasur|mayor|assessor|finance|gestão|gestao|prefeit|city hall|clerk|human resources)/i, "administration"],
];

/** Maps a department / subject / theme label onto a theme, or null. */
export function themeFor(...labels: (string | null | undefined)[]): ThemeKey | null {
  const hay = labels.filter(Boolean).join(" · ");
  if (!hay) return null;
  for (const [re, key] of PATTERNS) if (re.test(hay)) return key;
  return null;
}

const NOTE: Record<"fr" | "en" | "pt", string> = {
  fr: "photo d'illustration",
  en: "illustrative photo",
  pt: "foto ilustrativa",
};

function read(file: string): string | null {
  try {
    const p = path.join(process.cwd(), "public", "img", "themes", file);
    return `data:image/jpeg;base64,${fs.readFileSync(p).toString("base64")}`;
  } catch {
    return null;
  }
}

/**
 * The illustration for a fiche: its theme's photo, falling back to the city's
 * default so a card is never left without one. Captioned either way, since it
 * is a borrowed photo either way.
 */
export function themeImage(
  key: ThemeKey | null,
  city: City,
  lang: "fr" | "en" | "pt" = "fr",
): { src: string; caption: { text: string; note: string } } | null {
  const shelf = PHOTOS[city] ?? {};
  const photo = (key && shelf[key]) || shelf[CITY_DEFAULT[city]];
  if (!photo) return null;
  const src = read(photo.file);
  if (!src) return null;
  return { src, caption: { text: photo.caption, note: NOTE[lang] } };
}

/** A place's own photo — always preferred, and never needs a caption. */
export function localPhotoDataUri(publicPath: string | null | undefined): string | null {
  if (!publicPath || !publicPath.startsWith("/img/")) return null;
  try {
    const p = path.join(process.cwd(), "public", publicPath.replace(/^\//, ""));
    return `data:image/jpeg;base64,${fs.readFileSync(p).toString("base64")}`;
  } catch {
    return null;
  }
}
