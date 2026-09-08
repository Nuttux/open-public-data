import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { loadTema } from "@/lib/br/recife-data";
import RecifeTemaFiche from "@/components/br/RecifeTemaFiche";
import { answerMetadata } from "@/lib/seo/page-answer";
import { temaAnswer } from "@/lib/br/recife-answers";
import { recifeLocale } from "@/lib/br/recife-locale";
import PageJsonLd from "@/components/seo/PageJsonLd";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const tm = loadTema(slug);
  if (!tm) return { title: { absolute: "Recife" } };
  const locale = await recifeLocale();
  return answerMetadata(temaAnswer(tm, locale), `/br/city/recife/tema/${slug}`, locale);
}

export default async function TemaPage({ params }: { params: Promise<{ slug: string }> }) {
  const locale = await recifeLocale();
  const { slug } = await params;
  const tm = loadTema(slug);
  if (!tm) notFound();
  const { source, tema_method, ...tema } = tm;
  return (
    <main className="fx-wrap" style={{ paddingBottom: 64 }}>
      <div className="fx-page-header fx-page-header--fiche">
        <Link href="/br/city/recife/quem-recebe" className="fx-page-kicker" style={{ textDecoration: "none" }}>
          ← Recife · Tema
        </Link>
        <h1 className="fx-page-title">{tm.tema}</h1>
        <p className="fx-page-lede fx-answer">{temaAnswer(tm, locale).answer}</p>
        <PageJsonLd title={temaAnswer(tm, locale).title} description={temaAnswer(tm, locale).answer} path={`/br/city/recife/tema/${slug}`} locale={locale} creator="Prefeitura do Recife" spatialCoverage="Recife, Pernambuco" />
      </div>
      <div className="fx-fiche fx-fiche-shell">
        <RecifeTemaFiche tm={tema} temaMethod={tema_method} source={source} />
      </div>
    </main>
  );
}
