/**
 * URL slug helpers for SF budget entities — isomorphic (no fs), importable
 * from client components and from the server-only loader alike.
 *
 * Department: code lowercased ("DPH" ⇄ "dph").
 * Character:  code lowercased, underscores → dashes
 *             ("MAND_FRING_BEN" ⇄ "mand-fring-ben"); legacy numeric codes
 *             pass through unchanged.
 * Service:    slugified label, because the source's org-group codes are bare
 *             ordinals ("02") that would make an unreadable URL. The loader
 *             resolves a slug by re-slugifying every group label and also
 *             accepts the raw code, so a code-shaped URL keeps working.
 */

export const deptSlug = (code: string) => code.toLowerCase();
export const deptCodeFromSlug = (slug: string) => slug.toUpperCase();

export const characterSlug = (code: string) => code.toLowerCase().replace(/_/g, "-");
export const characterCodeFromSlug = (slug: string) => slug.toUpperCase().replace(/-/g, "_");

export const serviceSlug = (label: string) =>
  label
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
