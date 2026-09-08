import type { Metadata } from "next";
import { loadQuemRecebe } from "@/lib/br/recife-data";
import QuemRecebeClient from "./QuemRecebeClient";
import { sectionAlternates } from "@/lib/seo/page-answer";
import { recifeLocale } from "@/lib/br/recife-locale";

const META_PT = { title: "Recife — Quem recebe", description: "As organizações que recebem dinheiro da Prefeitura do Recife e as subvenções a entidades sem fins lucrativos. Apenas pessoas jurídicas (CNPJ)." };
const META_EN = { title: "Recife — Who gets paid", description: "The organisations that receive money from the City of Recife and the grants to non-profits. Legal entities (CNPJ) only." };

// Portuguese on pt.qipu.org, English on www — with the canonical and hreflang
// of the host answering (lib/site-locale.ts).
export async function generateMetadata(): Promise<Metadata> {
  const locale = await recifeLocale();
  return { ...(locale === "en" ? META_EN : META_PT), ...sectionAlternates("/br/city/recife/quem-recebe", locale) };
}

export default function RecifeQuemRecebePage() {
  const d = loadQuemRecebe();
  return <QuemRecebeClient d={d} />;
}
