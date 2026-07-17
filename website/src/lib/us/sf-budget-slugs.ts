/**
 * URL slug helpers for SF budget entities — isomorphic (no fs), importable
 * from client components and from the server-only loader alike.
 *
 * Department: code lowercased ("DPH" ⇄ "dph").
 * Character:  code lowercased, underscores → dashes
 *             ("MAND_FRING_BEN" ⇄ "mand-fring-ben"); legacy numeric codes
 *             pass through unchanged.
 */

export const deptSlug = (code: string) => code.toLowerCase();
export const deptCodeFromSlug = (slug: string) => slug.toUpperCase();

export const characterSlug = (code: string) => code.toLowerCase().replace(/_/g, "-");
export const characterCodeFromSlug = (slug: string) => slug.toUpperCase().replace(/-/g, "_");
