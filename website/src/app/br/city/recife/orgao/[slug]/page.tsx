import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { loadOrgao } from "@/lib/br/recife-data";
import RecifeOrgaoFiche from "@/components/br/RecifeOrgaoFiche";
import { titleCasePt } from "@/lib/br/format";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const o = loadOrgao(slug);
  if (!o) return { title: { absolute: "Recife" } };
  return { title: `${titleCasePt(o.orgao)} — Recife` };
}

export default async function OrgaoPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const o = loadOrgao(slug);
  if (!o) notFound();
  const { source, ...orgao } = o;
  return (
    <main className="fx-wrap" style={{ paddingBottom: 64 }}>
      <div className="fx-page-header fx-page-header--fiche">
        <Link href="/br/city/recife/quem-recebe" className="fx-page-kicker" style={{ textDecoration: "none" }}>
          ← Recife · Órgão
        </Link>
        <h1 className="fx-page-title">{titleCasePt(o.orgao)}</h1>
      </div>
      <div className="fx-fiche fx-fiche-shell">
        <RecifeOrgaoFiche o={orgao} source={source} />
      </div>
    </main>
  );
}
