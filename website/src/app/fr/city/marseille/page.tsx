import { redirect } from "next/navigation";

// POC v1 Marseille — pas encore de landing dédiée. Redirige vers /budget
// (page d'entrée principale de la ville). Sans ce fichier, /fr/city/marseille
// tombe sur app/fr/city/[slug]/page.tsx qui rend le client générique (slim)
// avec un cadre éditorial Paris-centré — on évite cette confusion.
//
// Quand la vraie landing Marseille existera, remplacer ce redirect par le
// composant landing dédié.
export default function MarseilleLandingPage() {
  redirect("/fr/city/marseille/budget");
}
