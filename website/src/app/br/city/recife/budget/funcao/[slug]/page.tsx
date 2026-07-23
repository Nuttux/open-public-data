import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { loadFuncao } from "@/lib/br/recife-data";
import RecifeFuncaoFiche from "@/components/br/RecifeFuncaoFiche";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const f = loadFuncao(slug);
  if (!f) return { title: { absolute: "Recife" } };
  return { title: `${f.funcao} — Recife` };
}

export default async function FuncaoPage({
  params, searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ year?: string }>;
}) {
  const { slug } = await params;
  const sp = await searchParams;
  const f = loadFuncao(slug, sp.year ? parseInt(sp.year, 10) : undefined);
  if (!f) notFound();
  return (
    <main className="fx-wrap" style={{ paddingBottom: 64 }}>
      <div className="fx-page-header fx-page-header--fiche">
        <Link href="/br/city/recife/budget" className="fx-page-kicker" style={{ textDecoration: "none" }}>
          ← Recife · Orçamento
        </Link>
        <h1 className="fx-page-title">{f.funcao}</h1>
      </div>
      <div className="fx-fiche fx-fiche-shell">
        <RecifeFuncaoFiche f={f} />
      </div>
    </main>
  );
}
