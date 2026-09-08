import { readSiteLocale } from "@/lib/seo";
import type { Metadata } from "next";
import Landing from "@/components/landing/Landing";
import { buildRecifeLandingModel } from "@/lib/br/recife-landing-model";
import type { Locale } from "@/lib/localeContext";
import { sectionAlternates } from "@/lib/seo/page-answer";
import { recifeLocale } from "@/lib/br/recife-locale";

const META_PT = { title: "Para onde vai o dinheiro público em Recife?", description: "O orçamento, os pagamentos e os contratos da Prefeitura do Recife — cada número ligado à sua fonte nos dados abertos da cidade." };
const META_EN = { title: "Where does public money go in Recife?", description: "Recife's budget, payments and contracts, every number linked to its source in the city's open data." };

// Portuguese on pt.qipu.org, English on www — with the canonical and hreflang
// of the host answering (lib/site-locale.ts).
export async function generateMetadata(): Promise<Metadata> {
  const locale = await recifeLocale();
  return { ...(locale === "en" ? META_EN : META_PT), ...sectionAlternates("/br/city/recife", locale) };
}

export default async function RecifeHubPage() {
  const locale: Locale = (await readSiteLocale()) === "en" ? "en" : "pt";
  const model = buildRecifeLandingModel(locale);
  return <Landing model={model} />;
}
