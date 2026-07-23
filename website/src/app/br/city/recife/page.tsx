import type { Metadata } from "next";
import { cookies } from "next/headers";
import Landing from "@/components/landing/Landing";
import { buildRecifeLandingModel } from "@/lib/br/recife-landing-model";
import type { Locale } from "@/lib/localeContext";

export const metadata: Metadata = {
  title: { absolute: "Recife · Dados Abertos" },
  description:
    "O orçamento, os pagamentos e os contratos da Prefeitura do Recife — cada número ligado à sua fonte nos dados abertos da cidade.",
};

export default async function RecifeHubPage() {
  const store = await cookies();
  const locale: Locale = store.get("br_locale")?.value === "en" ? "en" : "pt";
  const model = buildRecifeLandingModel(locale);
  return <Landing model={model} />;
}
