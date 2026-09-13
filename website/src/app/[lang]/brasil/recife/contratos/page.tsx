import type { Metadata } from "next";
import { loadContratos } from "@/lib/br/recife-data";
import ContratosClient from "./ContratosClient";
import { sectionAlternates } from "@/lib/seo/page-answer";
import { recifeLocale } from "@/lib/br/recife-locale";

const META_PT = { title: "Recife — Contratos", description: "Cada contrato administrativo da Prefeitura do Recife: objeto, fornecedor, valor e vigência, mais o contexto das licitações — dos dados abertos da cidade." };
const META_EN = { title: "Recife — Contracts", description: "Every administrative contract of the City of Recife: object, supplier, value and term, plus the procurement context, from the city's open data." };

// Portuguese on pt.qipu.org, English on www — with the canonical and hreflang
// of the host answering (lib/site-locale.ts).
export async function generateMetadata(): Promise<Metadata> {
  const locale = await recifeLocale();
  return { ...(locale === "en" ? META_EN : META_PT), ...sectionAlternates("/brasil/recife/contratos", locale) };
}

export default function RecifeContratosPage() {
  const data = loadContratos();
  // Ship a top slice for the initial list; the client lazy-fetches the full
  // file for search (contratos.json, ~5 MB) — Paris/SF lazy-search pattern.
  const slim = { ...data, contratos: data.contratos.slice(0, 250) };
  return <ContratosClient d={slim} />;
}
