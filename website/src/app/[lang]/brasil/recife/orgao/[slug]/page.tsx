import type { Metadata } from "next";
import Link from "@/components/LocalizedLink";
import { notFound } from "next/navigation";
import { loadOrgao } from "@/lib/br/recife-data";
import RecifeOrgaoFiche from "@/components/br/RecifeOrgaoFiche";
import { titleCasePt } from "@/lib/br/format";
import { answerMetadata } from "@/lib/seo/page-answer";
import { orgaoAnswer } from "@/lib/br/recife-answers";
import { recifeLocale } from "@/lib/br/recife-locale";
import PageJsonLd from "@/components/seo/PageJsonLd";
import RelatedLinks from "@/components/fiche/RelatedLinks";
import { orgaoRelated } from "@/lib/br/recife-related";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const o = loadOrgao(slug);
  if (!o) return { title: { absolute: "Recife" } };
  const locale = await recifeLocale();
  return answerMetadata(orgaoAnswer(o, locale), `/brasil/recife/orgao/${slug}`, locale);
}

export default async function OrgaoPage({ params }: { params: Promise<{ slug: string }> }) {
  const locale = await recifeLocale();
  const { slug } = await params;
  const o = loadOrgao(slug);
  if (!o) notFound();
  const { source, ...orgao } = o;
  return (
    <main className="fx-wrap" style={{ paddingBottom: 64 }}>
      <div className="fx-page-header fx-page-header--fiche">
        <Link href="/brasil/recife/quem-recebe" className="fx-page-kicker" style={{ textDecoration: "none" }}>
          ← Recife · Órgão
        </Link>
        <h1 className="fx-page-title">{titleCasePt(o.orgao)}</h1>
        <p className="fx-page-lede fx-answer">{orgaoAnswer(o, locale).answer}</p>
        <PageJsonLd title={orgaoAnswer(o, locale).title} description={orgaoAnswer(o, locale).answer} path={`/brasil/recife/orgao/${slug}`} locale={locale} creator="Prefeitura do Recife" spatialCoverage="Recife, Pernambuco" />
      </div>
      <div className="fx-fiche fx-fiche-shell">
        <RecifeOrgaoFiche o={orgao} source={source} />
        <RelatedLinks block={orgaoRelated(o, locale)} />
      </div>
    </main>
  );
}
