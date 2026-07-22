import type { Metadata } from "next";
import { loadContratos, loadLicitacoes } from "@/lib/br/recife-data";
import ContratosClient from "./ContratosClient";

export const metadata: Metadata = {
  title: { absolute: "Recife · Contratos — todos os contratos da Prefeitura" },
  description:
    "Cada contrato administrativo da Prefeitura do Recife: objeto, fornecedor, valor e vigência, mais o contexto das licitações — dos dados abertos da cidade.",
};

export default function RecifeContratosPage() {
  const data = loadContratos();
  const licitacoes = loadLicitacoes();
  // Ship a top slice for the initial list; the client lazy-fetches the full
  // file for search (contratos.json, ~5 MB) — Paris/SF lazy-search pattern.
  const slim = { ...data, contratos: data.contratos.slice(0, 250) };
  return <ContratosClient d={slim} lic={licitacoes} />;
}
