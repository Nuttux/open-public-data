import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { loadPlace, loadPlaceObras } from "@/lib/br/recife-places-data";
import RecifeLugarFiche from "@/components/br/RecifeLugarFiche";
import { answerMetadata } from "@/lib/seo/page-answer";
import { lugarAnswer } from "@/lib/br/recife-answers";
import { recifeLocale } from "@/lib/br/recife-locale";

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
      </div>
      <div className="fx-fiche fx-fiche-shell">
        <RecifeLugarFiche place={place} source={source} obras={loadPlaceObras(slug)} />
      </div>
    </main>
  );
}
