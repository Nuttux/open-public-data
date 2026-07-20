/**
 * Client-safe mirror of lib/data/read.ts's cityJsonPath: builds the public
 * URL of a data file for a given city. One home for the
 * `citySlug === "paris" ? … : …` fork previously re-implemented per client.
 */
export const cityDataUrl = (citySlug: string, rel: string) =>
  citySlug === "paris" ? `/data/${rel}` : `/data/${citySlug}/${rel}`;
