import type { LieuxCity, LieuxFamily } from "@/app/[lang]/france/paris/lieux/LieuxClient";

/**
 * Recife's places on the Lieux section (2026-09-18) : what differs from
 * Paris, and nothing that needs the file system (the page and the client
 * both import this).
 */

/** The city's five families, on the palette validated for the Paris map
 *  (scripts/validate_palette.js on #fafaf7). Keys are the address, the
 *  Portuguese words of the source map to them in recife-lieux-section. */
export const RECIFE_FAMILIES: LieuxFamily[] = [
  { key: "educacao", color: "#1e45e4", i18n: "fx.lieux.fam.educacao" },
  { key: "pracas", color: "#1baf7a", i18n: "fx.lieux.fam.pracas" },
  { key: "cultura", color: "#c12323", i18n: "fx.lieux.fam.cultura" },
  { key: "esporte", color: "#eda100", i18n: "fx.lieux.fam.esporte" },
  { key: "saude", color: "#4a3aa7", i18n: "fx.lieux.fam.saude" },
];

export const RECIFE_FAMILY_KEY: Record<string, string> = {
  "Educação": "educacao",
  "Praças": "pracas",
  "Cultura": "cultura",
  "Esporte": "esporte",
  "Saúde": "saude",
};

export const RECIFE_LIEUX: LieuxCity = {
  slug: "recife",
  name: "Recife",
  hub: "/brasil/recife",
  section: "/brasil/recife/lugares",
  fiche: "/brasil/recife/lugares",
  seeds: ["Geraldo Magalhães", "Dona Lindu", "Boa Viagem"],
  currency: "BRL",
  // The money is the value of the works contracts whose object names the place : signed, not paid.
  money: "signed",
  area: { kind: "bairro", param: "bairro" },
  familyParam: "familia",
  families: RECIFE_FAMILIES,
  // Recife proper, [[S, W], [N, E]].
  bounds: [[-8.14, -35.02], [-7.93, -34.83]],
  clampToBounds: true,
  sources: [{ label: "dados.recife.pe.gov.br", href: "https://dados.recife.pe.gov.br/dataset?tags=Equipamentos" }],
  json: "/data/br/recife/places.json",
  chrome: "registry",
};
