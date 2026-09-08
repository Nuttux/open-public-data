import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { loadPlace, loadPlaceObras, loadPlacesIndex, type PlaceIndexEntry } from "@/lib/br/recife-places-data";
import RecifeLugarFiche from "@/components/br/RecifeLugarFiche";
import { answerMetadata } from "@/lib/seo/page-answer";
import { lugarAnswer } from "@/lib/br/recife-answers";
import { recifeLocale } from "@/lib/br/recife-locale";
import RelatedLinks, { type RelatedBlock, type RelatedRow } from "@/components/fiche/RelatedLinks";
import { fmtBrlCompact } from "@/lib/br/format";
import PageJsonLd from "@/components/seo/PageJsonLd";

/** « Veja também »: the works contracts on this place and the other places of its neighbourhood. */
function lugarRelated(p: PlaceIndexEntry, slug: string, locale: "pt" | "en"): RelatedBlock {
  const en = locale === "en";
  const rows: RelatedRow[] = [];
  const obras = loadPlaceObras(slug);
  for (const o of (obras?.contratos ?? []).slice().sort((a, b) => (b.valor ?? 0) - (a.valor ?? 0)).slice(0, 5)) {
    rows.push({
      href: `/br/city/recife/contratos/${encodeURIComponent(o.contrato_id)}`,
      label: o.objeto ? (o.objeto.length > 90 ? `${o.objeto.slice(0, 90)}…` : o.objeto) : `${en ? "Contract" : "Contrato"} ${o.numero}`,
      sub: en ? `Works contract${o.ano ? `, ${o.ano}` : ""}` : `Contrato de obra${o.ano ? `, ${o.ano}` : ""}`,
      amount: o.valor != null ? { v: fmtBrlCompact(o.valor), u: "" } : null,
    });
  }
  if (p.bairro) {
    for (const q of loadPlacesIndex().filter((q) => q.bairro === p.bairro && q.slug !== slug).slice(0, 5)) {
      rows.push({ href: `/br/city/recife/lugares/${q.slug}`, label: q.nome, sub: en ? `${q.tipo ?? q.familia}, ${q.bairro}` : `${q.tipo ?? q.familia}, ${q.bairro}` });
    }
  }
  rows.push({ href: "/br/city/recife/lugares", label: en ? "Every place in Recife" : "Todos os lugares do Recife", sub: en ? "Health units, schools, culture, sport and squares, on the map" : "Unidades de saúde, escolas, cultura, esporte e praças, no mapa" });
  return { title: en ? "See also" : "Veja também", sub: en ? "The works contracted here, and the other places of the same neighbourhood." : "As obras contratadas aqui, e os outros lugares do mesmo bairro.", rows };
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const p = loadPlace(slug);
  if (!p) return { title: { absolute: "Recife" } };
  const locale = await recifeLocale();
  return answerMetadata(lugarAnswer(p, locale), `/br/city/recife/lugares/${slug}`, locale);
}

export default async function LugarPage({ params }: { params: Promise<{ slug: string }> }) {
  const locale = await recifeLocale();
  const { slug } = await params;
  const p = loadPlace(slug);
  if (!p) notFound();
  const { source, ...place } = p;
  return (
    <main className="fx-wrap" style={{ paddingBottom: 64 }}>
      <div className="fx-page-header fx-page-header--fiche">
        <Link href="/br/city/recife/lugares" className="fx-page-kicker" style={{ textDecoration: "none" }}>
          ← Recife · Lugares
        </Link>
        <h1 className="fx-page-title">{p.nome}</h1>
        <p className="fx-page-lede fx-answer">{lugarAnswer(p, locale).answer}</p>
        <PageJsonLd title={lugarAnswer(p, locale).title} description={lugarAnswer(p, locale).answer} path={`/br/city/recife/lugares/${slug}`} locale={locale} creator="Prefeitura do Recife" spatialCoverage="Recife, Pernambuco" />
      </div>
      <div className="fx-fiche fx-fiche-shell">
        <RecifeLugarFiche place={place} source={source} obras={loadPlaceObras(slug)} />
        <RelatedLinks block={lugarRelated(p, slug, locale)} />
      </div>
    </main>
  );
}
