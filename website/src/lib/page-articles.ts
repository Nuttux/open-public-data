import { getAllPosts, getPostBySlug, type BlogPostMeta } from "./blog";

export type PageKey =
  | "investissements"
  | "logement-social"
  | "qui-recoit"
  | "marches-publics"
  | "budget"
  | "dette-patrimoine";

/**
 * Sélection éditoriale explicite des 3 articles featured par page section.
 * L'ordre dans la liste = ordre d'affichage. Un article peut apparaître sur
 * plusieurs pages (transverse).
 *
 * Quand un nouvel article est ajouté, le mettre ici manuellement plutôt que
 * de s'appuyer sur un tri automatique par tag/date qui évince parfois des
 * piliers historiques.
 */
const PAGE_FEATURED_SLUGS: Record<PageKey, string[]> = {
  budget: [
    "decrypter-finances-paris-budget-bilan",
    "regle-or-communes-article-l-1612-4",
    "paris-peut-elle-faire-faillite",
  ],
  "qui-recoit": [
    // Reconstitution de 2,3 Md€ et 26 000 bénéficiaires absents du portail
    // Open Data — bumpée en 1ʳᵉ position pour mettre en avant cette enquête.
    "beneficiaires-fantomes-2020-2021-portail",
    "top-10-associations-subventionnees-paris",
    "casvp-416-millions-bouclier-social",
  ],
  "marches-publics": [
    "jo-2024-anatomie-pic-livraison",
    "conseil-etudes-ville-paris",
    "14-ans-marches-publics-paris-champions-invisibles",
  ],
  investissements: [
    "jo-2024-anatomie-pic-livraison",
    "19e-arrondissement-par-ses-chiffres",
    "13e-arrondissement-par-ses-chiffres",
  ],
  "dette-patrimoine": [
    "patrimoine-paris-bilan-cout-historique",
    "hors-bilan-12-milliards-garanties-emprunt",
    "emissions-obligataires-paris-4-85-milliards",
  ],
  "logement-social": [
    "geographie-logement-social-paris",
    "paris-habitat-premier-bailleur-social",
    "loi-sru-paris-mecanisme-mutualisation",
  ],
};

/**
 * Tags fallback — utilisés uniquement si l'un des slugs ci-dessus est introuvable
 * (post supprimé, slug renommé). Permet de ne pas casser le rendu de la page.
 */
const PAGE_FALLBACK_TAGS: Record<PageKey, string[]> = {
  investissements: ["investissement", "jo 2024", "arrondissement"],
  "logement-social": ["logement social", "sru", "bailleur"],
  "qui-recoit": ["subvention", "subventions", "associations", "casvp"],
  "marches-publics": ["marchés publics", "conseil", "fournisseurs"],
  budget: ["budget", "finances publiques", "cgct"],
  "dette-patrimoine": ["dette", "patrimoine", "hors-bilan", "bilan", "m57"],
};

const norm = (s: string) =>
  s
    .toLowerCase()
    .trim()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");

export function getPostsForPage(pageKey: PageKey, limit = 3): BlogPostMeta[] {
  const slugs = PAGE_FEATURED_SLUGS[pageKey] ?? [];
  const picked: BlogPostMeta[] = [];

  for (const slug of slugs) {
    const post = getPostBySlug(slug);
    if (post && !post.hidden) {
      const { content: _c, ...meta } = post;
      picked.push(meta);
    }
    if (picked.length >= limit) break;
  }

  // Fallback : si moins de `limit` sélectionnés (slug invalide ou caché),
  // compléter par tag-matching (date desc, sans doublon).
  if (picked.length < limit) {
    const tags = PAGE_FALLBACK_TAGS[pageKey] ?? [];
    const want = new Set(tags.map(norm));
    const used = new Set(picked.map((p) => p.slug));
    const fallback = getAllPosts().filter(
      (p) =>
        !used.has(p.slug) && (p.tags ?? []).some((t) => want.has(norm(t)))
    );
    for (const p of fallback) {
      picked.push(p);
      if (picked.length >= limit) break;
    }
  }

  return picked;
}
