import { getAllPosts, type BlogPostMeta } from "./blog";

export type PageKey =
  | "investissements"
  | "logement-social"
  | "qui-recoit"
  | "marches-publics"
  | "budget"
  | "dette-patrimoine";

const PAGE_TAGS: Record<PageKey, string[]> = {
  investissements: ["investissement", "jo 2024"],
  "logement-social": ["logement social"],
  "qui-recoit": ["subvention", "subventions", "associations"],
  "marches-publics": ["marchés publics", "conseil"],
  budget: ["budget", "finances publiques"],
  "dette-patrimoine": ["dette", "patrimoine", "droit public"],
};

const norm = (s: string) =>
  s
    .toLowerCase()
    .trim()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");

export function getPostsForPage(pageKey: PageKey): BlogPostMeta[] {
  const tags = PAGE_TAGS[pageKey] ?? [];
  if (!tags.length) return [];
  const want = new Set(tags.map(norm));
  return getAllPosts().filter((p) => (p.tags ?? []).some((t) => want.has(norm(t))));
}
