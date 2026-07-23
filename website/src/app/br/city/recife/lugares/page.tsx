import type { Metadata } from "next";
import { cookies } from "next/headers";
import { loadPlacesFile } from "@/lib/br/recife-places-data";
import LugaresClient from "./LugaresClient";

export const metadata: Metadata = {
  title: "Recife — Lugares",
  description:
    "As unidades de saúde, escolas, equipamentos culturais e esportivos e praças da Prefeitura do Recife, no mapa — dos dados abertos da cidade.",
};

export default async function LugaresPage() {
  const store = await cookies();
  const locale: "pt" | "en" = store.get("br_locale")?.value === "en" ? "en" : "pt";
  const f = loadPlacesFile();
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
