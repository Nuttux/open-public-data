import type { Metadata } from "next";
import { NextDoor } from "@/components/fiche/Doors";
import SectionHero from "@/components/fiche/SectionHero";
import Link from "@/components/LocalizedLink";
import { notFound } from "next/navigation";
import { loadPlace, loadPlaceObras, loadPlacesIndex, type PlaceIndexEntry } from "@/lib/br/recife-places-data";
import RecifeLugarFiche from "@/components/br/RecifeLugarFiche";
import { answerMetadata } from "@/lib/seo/page-answer";
import { lugarAnswer } from "@/lib/br/recife-answers";
import { recifeLocale } from "@/lib/br/recife-locale";
import RelatedLinks, { type RelatedBlock, type RelatedRow } from "@/components/fiche/RelatedLinks";
import { brlMagnitude, fmtBrlCompactNum, titleCasePt, fmtBrlCompact } from "@/lib/br/format";
import PageJsonLd from "@/components/seo/PageJsonLd";


/** Un objet de contrat dans une rangée : coupé au mot, jamais en plein milieu. */
function clipObjeto(s: string, n: number): string {
  return s.length > n ? `${s.slice(0, n).replace(/\s+\S*$/, "")}…` : s;
}

/** « Ver também »: the works contracts on this place and the other places of its neighbourhood. */
function lugarRelated(p: PlaceIndexEntry, slug: string, locale: "pt" | "en"): RelatedBlock {
  const en = locale === "en";
  const rows: RelatedRow[] = [];
  const obras = loadPlaceObras(slug);
  for (const o of (obras?.contratos ?? []).slice().sort((a, b) => (b.valor ?? 0) - (a.valor ?? 0)).slice(0, 5)) {
    rows.push({
      href: `/brasil/recife/contratos/${encodeURIComponent(o.contrato_id)}`,
      label: o.objeto ? clipObjeto(titleCasePt(o.objeto), 90) : `${en ? "Contract" : "Contrato"} ${o.numero}`,
      sub: en ? `Works contract${o.ano ? `, ${o.ano}` : ""}` : `Contrato de obra${o.ano ? `, ${o.ano}` : ""}`,
      amount: o.valor != null ? { v: fmtBrlCompact(o.valor), u: "" } : null,
    });
  }
  if (p.bairro) {
    for (const q of loadPlacesIndex().filter((q) => q.bairro === p.bairro && q.slug !== slug).slice(0, 5)) {
      rows.push({ href: `/brasil/recife/lugares/${q.slug}`, label: titleCasePt(q.nome), sub: `${titleCasePt(q.tipo ?? q.familia)}, ${titleCasePt(q.bairro ?? "")}` });
    }
  }
  rows.push({ href: "/brasil/recife/lugares", label: en ? "Every place in Recife" : "Todos os lugares do Recife", sub: en ? "Health units, schools, culture, sport and squares, on the map" : "Unidades de saúde, escolas, cultura, esporte e praças, no mapa" });
  return { title: en ? "See also" : "Ver também", sub: en ? "The works contracted here, and the other places of the same neighbourhood." : "As obras contratadas aqui, e os outros lugares do mesmo bairro.", rows };
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const p = loadPlace(slug);
  if (!p) return { title: { absolute: "Recife" } };
  const locale = await recifeLocale();
  return answerMetadata(lugarAnswer(p, locale), `/brasil/recife/lugares/${slug}`, locale);
}

export default async function LugarPage({ params }: { params: Promise<{ slug: string }> }) {
  const locale = await recifeLocale();
  const { slug } = await params;
  const p = loadPlace(slug);
  if (!p) notFound();
  const { source, ...place } = p;
  const en = locale === "en";
  const answer = lugarAnswer(p, locale);
  const obras = loadPlaceObras(slug);
  const totalObras = (obras?.contratos ?? []).reduce((acc, o) => acc + (o.valor ?? 0), 0);
  return (
    <main id="main-content" tabIndex={-1}>
      <div className="fx-sec fx-v3">
        <div className="fx-sec-kicker fx-page-kicker fx-page-kicker--links">
          <Link href="/brasil/recife">Recife</Link> › <Link href="/brasil/recife/lugares">{en ? "Places" : "Lugares"}</Link>
        </div>
        <div className="fx-sec-grid" data-layout="subventions">
          <div className="fx-sec-a-hero">
            <SectionHero
              title={titleCasePt(p.nome)}
              value={fmtBrlCompactNum(totalObras)}
              unit={brlMagnitude(totalObras)}
              captionBefore={en ? "in works contracted here" : "em obras contratadas aqui"}
              years={[]}
              year={0}
              basePath={`/brasil/recife/lugares/${slug}`}
              meta={answer.answer}
              shareTitle={answer.title}
            />
            <PageJsonLd title={answer.title} description={answer.answer} path={`/brasil/recife/lugares/${slug}`} locale={locale} creator="Prefeitura do Recife" spatialCoverage="Recife, Pernambuco" />
          </div>
          <div className="fx-sec-a-scene">
            <div className="fx-fiche fx-fiche-shell">
              <RecifeLugarFiche place={place} source={source} obras={obras} headlineInHero />
            </div>
          </div>
          <div className="fx-sec-a-related">
            <RelatedLinks block={lugarRelated(p, slug, locale)} />
          </div>
          <div className="fx-sec-a-next">
            <NextDoor
              href="/brasil/recife/lugares"
              kicker={en ? "Places" : "Lugares"}
              title={en ? "Every place the city builds on" : "Todos os lugares onde a Prefeitura contrata"}
              sub={en ? "Schools, clinics, squares: the works identified, one by one." : "Escolas, unidades de saúde, praças: as obras identificadas, uma a uma."}
            />
          </div>
        </div>
      </div>
    </main>
  );
}
