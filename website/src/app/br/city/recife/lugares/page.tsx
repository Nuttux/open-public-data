import { readSiteLocale } from "@/lib/seo";
import type { Metadata } from "next";
import { loadEnrichedPlacesFile } from "@/lib/br/recife-places-data";
import LugaresClient from "./LugaresClient";
import { sectionAlternates } from "@/lib/seo/page-answer";
import { recifeLocale } from "@/lib/br/recife-locale";

const META_PT = { title: "Recife — Lugares", description: "As unidades de saúde, escolas, equipamentos culturais e esportivos e praças da Prefeitura do Recife, no mapa — dos dados abertos da cidade." };
const META_EN = { title: "Recife — Places", description: "Recife's health units, schools, cultural and sports facilities and squares, on the map, from the city's open data." };

// Portuguese on pt.qipu.org, English on www — with the canonical and hreflang
// of the host answering (lib/site-locale.ts).
export async function generateMetadata(): Promise<Metadata> {
  const locale = await recifeLocale();
  return { ...(locale === "en" ? META_EN : META_PT), ...sectionAlternates("/br/city/recife/lugares", locale) };
}

export default async function LugaresPage() {
  const locale: "pt" | "en" = (await readSiteLocale()) === "en" ? "en" : "pt";
  const f = loadEnrichedPlacesFile();
  return (
    <LugaresClient
      places={f.places}
      locale={locale}
      count={f.count}
      familias={f.familias}
      source={f.source}
      perimeter={f.perimeter}
    />
  );
}
