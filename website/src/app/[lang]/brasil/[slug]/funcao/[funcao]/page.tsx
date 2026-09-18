import type { Metadata } from "next";
import { NextDoor } from "@/components/fiche/Doors";
import SectionHero from "@/components/fiche/SectionHero";
import {brlMagnitude, fmtBrlCompactNum, titleCasePt } from "@/lib/br/format";
import Link from "@/components/LocalizedLink";
import { notFound } from "next/navigation";
import "@/app/fusion.css";
import { funcaoFromBudget } from "@/lib/br/recife-data";
import { findMunicipio, loadMunicipioBudget } from "@/lib/br/municipios";
import { municipioFuncaoAnswer, municipioFuncaoRelated, municipioPerimeter } from "@/lib/br/municipio-funcao";
import RecifeFuncaoFiche from "@/components/br/RecifeFuncaoFiche";
import RelatedLinks from "@/components/fiche/RelatedLinks";
import PageJsonLd from "@/components/seo/PageJsonLd";
import { sectionAlternates } from "@/lib/seo/page-answer";
import { recifeLocale } from "@/lib/br/recife-locale";

// A função of any município (2026-09-18) : the same fiche as Recife's, read
// from the município's SICONFI file. Opens as a drawer from the budget page ;
// this is the full page, for a search engine or a shared link.

export const dynamic = "force-dynamic";

export async function generateMetadata({ params, searchParams }: { params: Promise<{ slug: string; funcao: string }>; searchParams: Promise<{ year?: string }> }): Promise<Metadata> {
  const { slug, funcao } = await params;
  const sp = await searchParams;
  const m = findMunicipio(slug);
  if (!m) return { title: "Qipu" };
  const d = await loadMunicipioBudget(m.id);
  // The title says the year the page shows (?year=), never another one.
  const f = d ? funcaoFromBudget(d, funcao, sp.year ? parseInt(sp.year, 10) : undefined) : null;
  if (!d || !f) return { title: "Qipu" };
  const locale = await recifeLocale();
  const a = municipioFuncaoAnswer(f, d.municipio, locale);
  return { title: a.title, description: a.answer, ...sectionAlternates(`/brasil/${slug}/funcao/${funcao}`, locale) };
}

export default async function MunicipioFuncaoPage({ params, searchParams }: { params: Promise<{ slug: string; funcao: string }>; searchParams: Promise<{ year?: string }> }) {
  const { slug, funcao } = await params;
  const m = findMunicipio(slug);
  if (!m) notFound();
  const d = await loadMunicipioBudget(m.id);
  if (!d) notFound();
  const sp = await searchParams;
  const f = funcaoFromBudget(d, funcao, sp.year ? parseInt(sp.year, 10) : undefined);
  if (!f) notFound();
  const locale = await recifeLocale();
  const a = municipioFuncaoAnswer(f, d.municipio, locale);
  const en = locale === "en";
  return (
    <main id="main-content" tabIndex={-1}>
      <div className="fx-sec fx-v3">
        <div className="fx-sec-kicker fx-page-kicker fx-page-kicker--links">
          <Link href="/brasil">{en ? "Brazil" : "Brasil"}</Link> › <Link href={`/brasil/${slug}`}>{d.municipio.nome} ({d.municipio.uf})</Link>
        </div>
        <div className="fx-sec-grid" data-layout="subventions">
          <div className="fx-sec-a-hero">
            <SectionHero
              title={titleCasePt(f.funcao)}
              value={fmtBrlCompactNum(f.total_pago)}
              unit={brlMagnitude(f.total_pago)}
              captionBefore={en ? `spent by ${d.municipio.nome} in` : `pagos por ${d.municipio.nome} em`}
              captionAfter=""
              years={[f.ano]}
              year={f.ano}
              basePath={`/brasil/${slug}/funcao/${funcao}`}
              meta={a.answer}
              shareTitle={a.title}
            />
            <PageJsonLd title={a.title} description={a.answer} path={`/brasil/${slug}/funcao/${funcao}`} locale={locale} creator="Tesouro Nacional (SICONFI)" />
          </div>
          <div className="fx-sec-a-scene">
            <div className="fx-fiche fx-fiche-shell">
              <RecifeFuncaoFiche f={f} perimeter={municipioPerimeter[locale]} />
            </div>
          </div>
          <div className="fx-sec-a-related">
            <RelatedLinks block={municipioFuncaoRelated(d, f, locale)} />
          </div>
          <div className="fx-sec-a-next">
            <NextDoor
              href={`/brasil/${slug}`}
              kicker={en ? "Back to the município" : "De volta ao município"}
              title={en ? `The whole budget of ${d.municipio.nome}` : `Todo o orçamento de ${d.municipio.nome}`}
              sub={en ? "Spending and revenue, function by function." : "Despesas e receitas, função por função."}
            />
          </div>
        </div>
      </div>
    </main>
  );
}
