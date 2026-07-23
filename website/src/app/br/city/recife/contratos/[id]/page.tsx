import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { loadContrato } from "@/lib/br/recife-data";
import RecifeContratoFiche from "@/components/br/RecifeContratoFiche";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const found = loadContrato(id);
  if (!found) return { title: { absolute: "Recife" } };
  return { title: `Contrato ${found.contrato.numero} — Recife` };
}

export default async function ContratoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const found = loadContrato(id);
  if (!found) notFound();
  return (
    <main className="fx-wrap" style={{ paddingBottom: 64 }}>
      <div className="fx-page-header fx-page-header--fiche">
        <Link href="/br/city/recife/contratos" className="fx-page-kicker" style={{ textDecoration: "none" }}>
          ← Recife · Contratos
        </Link>
        <h1 className="fx-page-title">Contrato {found.contrato.numero}</h1>
      </div>
      <div className="fx-fiche fx-fiche-shell">
        <RecifeContratoFiche c={found.contrato} source={found.source} />
      </div>
    </main>
  );
}
