/**
 * Whether the editorial Analyses are public at all.
 *
 * Off since 2026-09-13: during client prospecting, forty articles were too many
 * to vouch for one by one, and some could read as a political position. The
 * articles stay in content/blog; nothing is deleted. To bring one back:
 *
 *   1. set `published: true` in its frontmatter (after reviewing it);
 *   2. set ANALYSES_PUBLIC to true.
 *
 * A post is public only when both hold (lib/blog.ts). While this is false the
 * whole section disappears: /analyses and every article answer 404, and the
 * nav, footer, landing tail, related-article blocks, contact button, sitemap
 * and llms.txt drop it. No server imports — the nav reads it client-side.
 */
export const ANALYSES_PUBLIC = false;
