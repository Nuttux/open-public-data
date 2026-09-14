/**
 * Visibility of the editorial section — route /analyses (the address stays,
 * for inbound links and indexing), shown to readers as « Explications » /
 * "Explainers". Two switches, from least to most exposed.
 *
 * History: the whole section went offline on 2026-09-13 (twenty articles were
 * too many to vouch for one by one during client prospecting). It reopened
 * with only the notes that explain how to read a public document or how a
 * figure is built. Nothing is deleted from content/blog.
 *
 * A post is public only when ANALYSES_PUBLIC is true AND its frontmatter
 * carries `published: true` (lib/blog.ts). An unpublished post answers 404,
 * never a redirect — so a note must not link to one.
 *
 * No server imports — the nav reads these client-side.
 */

/**
 * The section exists. When true: /analyses and every `published: true` note
 * answer 200; the section is listed in the footer (Paris column), the sitemap
 * and llms.txt; the « À lire » blocks of the Paris pages and the contact page
 * button may point to published notes.
 * When false: all of that disappears and every note answers 404.
 */
export const ANALYSES_PUBLIC = true;

/**
 * The section is put forward on the home page. When true: the three-note
 * teaser at the bottom of the landing, and the link in the top nav (the top
 * nav is the one the home page carries, so it follows this switch everywhere).
 * Kept false on purpose: the notes are reachable, not advertised.
 * Has no effect while ANALYSES_PUBLIC is false.
 */
export const ANALYSES_ON_HOME = false;
