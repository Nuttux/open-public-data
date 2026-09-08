import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { loadRecipient } from "@/lib/br/recife-data";
import RecifeRecebedorFiche from "@/components/br/RecifeRecebedorFiche";
import { answerMetadata } from "@/lib/seo/page-answer";
import { recipientAnswer } from "@/lib/br/recife-answers";
import { recifeLocale } from "@/lib/br/recife-locale";
import PageJsonLd from "@/components/seo/PageJsonLd";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ cnpj: string }>;
}): Promise<Metadata> {
  const { cnpj } = await params;
  const rec = loadRecipient(cnpj);
  if (!rec) return { title: { absolute: "Recife" } };
  const locale = await recifeLocale();
  return answerMetadata(recipientAnswer(rec, locale), `/br/city/recife/quem-recebe/${cnpj}`, locale);
}

export default async function RecebedorPage({ params }: { params: Promise<{ cnpj: string }> }) {
  const locale = await recifeLocale();
  const { cnpj } = await params;
  const rec = loadRecipient(cnpj);
  if (!rec) notFound();
  const { source, ...detail } = rec;
  return (
    <main className="fx-wrap" style={{ paddingBottom: 64 }}>
      <div className="fx-page-header fx-page-header--fiche">
        <Link href="/br/city/recife/quem-recebe" className="fx-page-kicker" style={{ textDecoration: "none" }}>
          ← Recife · Quem recebe
        </Link>
        <h1 className="fx-page-title">{rec.nome}</h1>
        <p className="fx-page-lede fx-answer">{recipientAnswer(rec, locale).answer}</p>
        <PageJsonLd title={recipientAnswer(rec, locale).title} description={recipientAnswer(rec, locale).answer} path={`/br/city/recife/quem-recebe/${cnpj}`} locale={locale} creator="Prefeitura do Recife" spatialCoverage="Recife, Pernambuco" />
      </div>
      <div className="fx-fiche fx-fiche-shell">
        <RecifeRecebedorFiche rec={detail} source={source} />
      </div>
    </main>
  );
}
