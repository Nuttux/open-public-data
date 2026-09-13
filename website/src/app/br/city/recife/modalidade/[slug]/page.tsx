import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { loadModalidade } from "@/lib/br/recife-data";
import RecifeModalidadeFiche from "@/components/br/RecifeModalidadeFiche";
import { titleCasePt } from "@/lib/br/format";
import { answerMetadata } from "@/lib/seo/page-answer";
import { modalidadeAnswer } from "@/lib/br/recife-answers";
import { recifeLocale } from "@/lib/br/recife-locale";
import PageJsonLd from "@/components/seo/PageJsonLd";
import RelatedLinks from "@/components/fiche/RelatedLinks";
import { modalidadeRelated } from "@/lib/br/recife-related";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const m = loadModalidade(slug);
  if (!m) return { title: { absolute: "Recife" } };
  const locale = await recifeLocale();
  return answerMetadata(modalidadeAnswer(m, locale), `/br/city/recife/modalidade/${slug}`, locale);
}

export default async function ModalidadePage({ params }: { params: Promise<{ slug: string }> }) {
  const locale = await recifeLocale();
  const { slug } = await params;
  const m = loadModalidade(slug);
  if (!m) notFound();
  const { source, ...modalidade } = m;
  return (
    <main className="fx-wrap" style={{ paddingBottom: 64 }}>
      <div className="fx-page-header fx-page-header--fiche">
        <Link href="/br/city/recife/contratos" className="fx-page-kicker" style={{ textDecoration: "none" }}>
          ← Recife · Modalidade
        </Link>
        <h1 className="fx-page-title">{titleCasePt(m.modalidade)}</h1>
        <p className="fx-page-lede fx-answer">{modalidadeAnswer(m, locale).answer}</p>
        <PageJsonLd title={modalidadeAnswer(m, locale).title} description={modalidadeAnswer(m, locale).answer} path={`/br/city/recife/modalidade/${slug}`} locale={locale} creator="Prefeitura do Recife" spatialCoverage="Recife, Pernambuco" />
      </div>
      <div className="fx-fiche fx-fiche-shell">
        <RecifeModalidadeFiche m={modalidade} source={source} />
        <RelatedLinks block={modalidadeRelated(m, locale)} />
      </div>
    </main>
  );
}
