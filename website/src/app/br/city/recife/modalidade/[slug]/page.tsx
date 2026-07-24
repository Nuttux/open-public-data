import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { loadModalidade } from "@/lib/br/recife-data";
import RecifeModalidadeFiche from "@/components/br/RecifeModalidadeFiche";
import { titleCasePt } from "@/lib/br/format";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const m = loadModalidade(slug);
  if (!m) return { title: { absolute: "Recife" } };
  return { title: `${titleCasePt(m.modalidade)} — Recife` };
}

export default async function ModalidadePage({ params }: { params: Promise<{ slug: string }> }) {
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
      </div>
      <div className="fx-fiche fx-fiche-shell">
        <RecifeModalidadeFiche m={modalidade} source={source} />
      </div>
    </main>
  );
}
