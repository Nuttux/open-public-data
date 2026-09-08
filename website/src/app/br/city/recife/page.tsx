import { readSiteLocale } from "@/lib/seo";
import type { Metadata } from "next";
import Landing from "@/components/landing/Landing";
import { buildRecifeLandingModel } from "@/lib/br/recife-landing-model";
import type { Locale } from "@/lib/localeContext";

export const metadata: Metadata = {
  title: "Para onde vai o dinheiro público em Recife?",
  description:
    "O orçamento, os pagamentos e os contratos da Prefeitura do Recife — cada número ligado à sua fonte nos dados abertos da cidade.",
};

export default async function RecifeHubPage() {
  const locale: Locale = (await readSiteLocale()) === "en" ? "en" : "pt";
  const model = buildRecifeLandingModel(locale);
  return <Landing model={model} />;
}
