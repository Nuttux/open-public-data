import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { loadRecipient } from "@/lib/br/recife-data";
import RecifeRecebedorFiche from "@/components/br/RecifeRecebedorFiche";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ cnpj: string }>;
}): Promise<Metadata> {
  const { cnpj } = await params;
  const rec = loadRecipient(cnpj);
  if (!rec) return { title: { absolute: "Recife" } };
  return { title: { absolute: `${rec.nome} · Recife` }, description: `Pagamentos da Prefeitura do Recife a ${rec.nome}.` };
}

export default async function RecebedorPage({ params }: { params: Promise<{ cnpj: string }> }) {
  const { cnpj } = await params;
  const rec = loadRecipient(cnpj);
  if (!rec) notFound();
  const { source, ...detail } = rec;
  return (
    <main className="fx-wrap" style={{ paddingBottom: 64 }}>
      <div className="fx-page-header fx-page-header--fiche">
        <Link href="/br/city/recife/quem-recebe" className="fx-page-kicker" style={{ textDecoration: "none" }}>
          ← Recife · Quem recebe
        </Link>
        <h1 className="fx-page-title">{rec.nome}</h1>
      </div>
      <div className="fx-fiche fx-fiche-shell">
        <RecifeRecebedorFiche rec={detail} source={source} />
      </div>
    </main>
  );
}
