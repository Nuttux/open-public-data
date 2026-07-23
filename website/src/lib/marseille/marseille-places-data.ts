/**
 * Server-side loaders for Marseille civic/landmark places (v1).
 * Reads public/data/fr/marseille/places.json (identity + geo + photo).
 * Photos are Wikimedia Commons, free-licence only, credit recorded per place
 * (pipeline/scripts/enrich/fetch_marseille_place_photos.py).
 */
import { readDataJson } from "@/lib/data/read";

const NS = "fr/marseille";

export type PlacePhotoCredit = {
  source: string | null;
  file_url: string | null;
  license: string | null;
  license_url: string | null;
  author: string | null;
};

/** Encyclopaedic lead (Wikipedia, CC-BY-SA) — the same "wiki" block a Paris lieu
 *  carries, credited in the fiche + sources. `extract_en` may be empty. */
export type PlaceWiki = {
  extract: string;
  extract_en: string;
  url: string | null;
  url_en: string | null;
};

/** Operator grant — the place IS the beneficiary (Friche, La Criée, MuCEM), with
 *  the per-year détail so the fiche can unfold the annual breakdown like Paris. */
export type PlaceSubvention = {
  beneficiaire: string;
  montant_total: number;
  nb_subventions: number;
  rows: { annee: number; montant: number }[];
  annees: number[];
};

/** A resident — another org whose grant *objet* names the place (e.g. lent the
 *  Alcazar library's auditorium). The objet is the on-fiche proof. */
export type PlaceResident = {
  beneficiaire: string;
  montant_total: number;
  nb: number;
  preuve: string;
};

export type MarseillePlace = {
  slug: string;
  name: string;
  kind_fr: string;
  kind_en: string;
  famille: string;
  arrondissement: number | null;
  lat: number;
  lon: number;
  desc_fr: string;
  desc_en: string;
  wiki: PlaceWiki | null;
  subvention: PlaceSubvention | null;
  residents: PlaceResident[];
  photo: string | null;
  photo_credit: PlacePhotoCredit | null;
};

export type PlacesSource = { name: string | null; source_url: string | null };

type PlacesFile = {
  generated_at: string;
  source: PlacesSource;
  perimeter: string;
  count: number;
  familles: { famille: string; n: number }[];
  places: MarseillePlace[];
};

export function loadPlacesFile(): PlacesFile {
  return readDataJson<PlacesFile>(`${NS}/places.json`);
}

export function loadPlacesIndex(): MarseillePlace[] {
  return loadPlacesFile().places;
}

export function loadPlace(
  slug: string,
): (MarseillePlace & { source: PlacesSource }) | null {
  const f = loadPlacesFile();
  const p = f.places.find((x) => x.slug === slug);
  return p ? { ...p, source: f.source } : null;
}
