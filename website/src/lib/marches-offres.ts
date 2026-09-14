/**
 * The « number of bids » cut of the public contracts: four buckets, their
 * address form, and the mapping from a count of bids. Pure, shared by the
 * server loader (fusion-data) and the client scene — never import
 * fusion-data from a client component (it reads the filesystem).
 */
export const OFFRES_BUCKETS = ["1", "2-3", "4-5", "6+"] as const;
export type OffresBucket = (typeof OFFRES_BUCKETS)[number];

/** 6+ is not an address character: 6-plus. */
export function offresBucketSlug(bucket: string): string {
  return bucket === "6+" ? "6-plus" : bucket;
}

export function offresBucketOf(offres: number): OffresBucket {
  return offres === 1 ? "1" : offres <= 3 ? "2-3" : offres <= 5 ? "4-5" : "6+";
}
