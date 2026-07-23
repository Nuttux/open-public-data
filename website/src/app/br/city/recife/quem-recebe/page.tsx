import type { Metadata } from "next";
import { loadQuemRecebe } from "@/lib/br/recife-data";
import QuemRecebeClient from "./QuemRecebeClient";

export const metadata: Metadata = {
  title: { absolute: "Recife · Quem recebe" },
  description:
    "As organizações que recebem dinheiro da Prefeitura do Recife e as subvenções a entidades sem fins lucrativos. Apenas pessoas jurídicas (CNPJ).",
};

export default function RecifeQuemRecebePage() {
  const d = loadQuemRecebe();
  return <QuemRecebeClient d={d} />;
}
