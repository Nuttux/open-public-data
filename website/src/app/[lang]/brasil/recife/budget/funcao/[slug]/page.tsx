import type { Metadata } from "next";
import { NextDoor } from "@/components/fiche/Doors";
import SectionHero from "@/components/fiche/SectionHero";
import {brlMagnitude, fmtBrlCompactNum, titleCasePt } from "@/lib/br/format";
import Link from "@/components/LocalizedLink";
import { notFound } from "next/navigation";
import { loadFuncao } from "@/lib/br/recife-data";
import RecifeFuncaoFiche from "@/components/br/RecifeFuncaoFiche";
import { answerMetadata } from "@/lib/seo/page-answer";
import { funcaoAnswer } from "@/lib/br/recife-answers";
import { recifeLocale } from "@/lib/br/recife-locale";
import PageJsonLd from "@/components/seo/PageJsonLd";
import RelatedLinks from "@/components/fiche/RelatedLinks";
import { funcaoRelated } from "@/lib/br/recife-related";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const f = loadFuncao(slug);
  if (!f) return { title: { absolute: "Recife" } };
  const locale = await recifeLocale();
  return answerMetadata(funcaoAnswer(f, locale), `/brasil/recife/budget/funcao/${slug}`, locale);
}

export default async function FuncaoPage({
  params, searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ year?: string }>;
}) {
  const locale = await recifeLocale();
  const { slug } = await params;
  const sp = await searchParams;
  const f = loadFuncao(slug, sp.year ? parseInt(sp.year, 10) : undefined);
  if (!f) notFound();
  const en = locale === "en";
  const a = funcaoAnswer(f, locale);
  return (
    <main id="main-content" tabIndex={-1}>
      <div className="fx-sec fx-v3">
        <div className="fx-sec-kicker fx-page-kicker fx-page-kicker--links">
          <Link href="/brasil/recife">Recife</Link> › <Link href="/brasil/recife/budget">{en ? "Budget" : "Orçamento"}</Link>
        </div>
        <div className="fx-sec-grid" data-layout="subventions">
          <div className="fx-sec-a-hero">
            <SectionHero
              title={titleCasePt(f.funcao)}
              value={fmtBrlCompactNum(f.total_pago)}
              unit={brlMagnitude(f.total_pago)}
              captionBefore={en ? "paid by the city in" : "pagos pela Prefeitura em"}
              captionAfter=""
              years={[f.ano]}
              year={f.ano}
              basePath={`/brasil/recife/budget/funcao/${slug}`}
              meta={a.answer}
              shareTitle={a.title}
            />
            <PageJsonLd title={a.title} description={a.answer} path={`/brasil/recife/budget/funcao/${slug}`} locale={locale} creator="Prefeitura do Recife" spatialCoverage="Recife, Pernambuco" />
          </div>
          <div className="fx-sec-a-scene">
            <div className="fx-fiche fx-fiche-shell">
              <RecifeFuncaoFiche f={f} />
            </div>
          </div>
          <div className="fx-sec-a-related">
            <RelatedLinks block={funcaoRelated(f, locale)} />
          </div>
          <div className="fx-sec-a-next">
            <NextDoor
              href="/brasil/recife/budget"
              kicker={en ? "Budget" : "Orçamento"}
              title={en ? "The whole budget of Recife" : "Todo o orçamento do Recife"}
              sub={en ? "Spending and revenue, function by function." : "Despesas e receitas, função por função."}
            />
          </div>
        </div>
      </div>
    </main>
  );
}
