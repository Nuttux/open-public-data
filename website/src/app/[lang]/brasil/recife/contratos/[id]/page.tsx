import type { Metadata } from "next";
import Link from "@/components/LocalizedLink";
import { notFound } from "next/navigation";
import { loadContrato } from "@/lib/br/recife-data";
import RecifeContratoFiche from "@/components/br/RecifeContratoFiche";
import { answerMetadata } from "@/lib/seo/page-answer";
import { contratoAnswer } from "@/lib/br/recife-answers";
import { recifeLocale } from "@/lib/br/recife-locale";
import PageJsonLd from "@/components/seo/PageJsonLd";
import RelatedLinks from "@/components/fiche/RelatedLinks";
import { contratoRelated } from "@/lib/br/recife-related";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const found = loadContrato(id);
  if (!found) return { title: { absolute: "Recife" } };
  const locale = await recifeLocale();
  return answerMetadata(contratoAnswer(found.contrato, found.source, locale), `/brasil/recife/contratos/${id}`, locale);
}

export default async function ContratoPage({ params }: { params: Promise<{ id: string }> }) {
  const locale = await recifeLocale();
  const { id } = await params;
  const found = loadContrato(id);
  if (!found) notFound();
  return (
    <main className="fx-wrap" style={{ paddingBottom: 64 }}>
      <div className="fx-page-header fx-page-header--fiche">
        <Link href="/brasil/recife/contratos" className="fx-page-kicker" style={{ textDecoration: "none" }}>
          ← Recife · Contratos
        </Link>
        <h1 className="fx-page-title">Contrato {found.contrato.numero ?? "sem número"}</h1>
        <p className="fx-page-lede fx-answer">{contratoAnswer(found.contrato, found.source, locale).answer}</p>
        <PageJsonLd title={contratoAnswer(found.contrato, found.source, locale).title} description={contratoAnswer(found.contrato, found.source, locale).answer} path={`/brasil/recife/contratos/${id}`} locale={locale} creator="Prefeitura do Recife" spatialCoverage="Recife, Pernambuco" />
      </div>
      <div className="fx-fiche fx-fiche-shell">
        <RecifeContratoFiche c={found.contrato} source={found.source} />
        <RelatedLinks block={contratoRelated(found.contrato, locale)} />
      </div>
    </main>
  );
}
