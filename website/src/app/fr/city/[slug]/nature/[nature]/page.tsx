import type { Metadata } from "next";
import { notFound } from "next/navigation";
import "@/app/fusion.css";
import { buildLocaleAwareMetadata } from "@/lib/seo";
import Navbar from "@/components/fusion/Navbar";
import Footer from "@/components/fusion/Footer";
import CommuneNatureFiche from "@/components/fusion/CommuneNatureFiche";
import { loadCommuneNature } from "@/lib/commune-fonctions";
import { aNom } from "@/lib/nom-commune";

/**
 * Une forme de dépense dans une commune : « Les salaires à Pantin ». Seulement
 * pour les communes qui ont l'axe fonction — c'est là que la fiche porte le
 * croisement vers les politiques, la seule chose que la page ville ne montre
 * pas. Drawer depuis la page ville, page pleine en accès direct.
 */
export const dynamic = "force-dynamic";

function euroCourt(v: number, en: boolean): string {
  const a = Math.abs(v);
  const f = (x: number, d = 1) => x.toLocaleString(en ? "en-GB" : "fr-FR", { maximumFractionDigits: d });
  if (a >= 1e9) return `${f(v / 1e9)} ${en ? "bn€" : "Md€"}`;
  if (a >= 1e6) return `${f(v / 1e6)} M€`;
  return `${f(v / 1e3, 0)} k€`;
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string; nature: string }> }): Promise<Metadata> {
  const { slug, nature } = await params;
  const r = await loadCommuneNature(slug, nature);
  if (!r) notFound();
  const nom = r.doc.commune.nom;
  const c = r.nature.comparaison;
  const top = r.nature.fonctions[0];
  const titreFr = `${r.nature.libelle} ${aNom(nom)} : ${euroCourt(r.nature.montant, false)} en ${r.doc.annee}`;
  const titreEn = `${r.nature.libelle_en} in ${nom}: ${euroCourt(r.nature.montant, true)} in ${r.doc.annee}`;
  const descFr = [
    top ? `D'abord pour ${top.libelle.toLowerCase()} (${euroCourt(top.montant, false)}).` : "",
    c ? `${nom} y consacre ${c.part.toLocaleString("fr-FR", { maximumFractionDigits: 1 })} % de son fonctionnement, contre ${c.part_mediane.toLocaleString("fr-FR", { maximumFractionDigits: 1 })} % en général dans les communes de ${r.doc.strate?.libelle ?? "sa taille"}.` : "",
    "Dans quelles politiques publiques, et quels comptes, source DGFiP.",
  ].filter(Boolean).join(" ");
  const descEn = [
    top ? `Mostly for ${top.libelle_en.toLowerCase()} (${euroCourt(top.montant, true)}).` : "",
    c ? `${nom} devotes ${c.part.toLocaleString("en-GB", { maximumFractionDigits: 1 })}% of its operations to this, against ${c.part_mediane.toLocaleString("en-GB", { maximumFractionDigits: 1 })}% typically for towns of ${r.doc.strate?.libelle_en ?? "its size"}.` : "",
    "Which public policies it goes to, and which accounts, from DGFiP data.",
  ].filter(Boolean).join(" ");
  return buildLocaleAwareMetadata({ title: titreFr, description: descFr, en: { title: titreEn, description: descEn }, path: `/fr/city/${slug}/nature/${nature}` });
}

export default async function NaturePage({ params }: { params: Promise<{ slug: string; nature: string }> }) {
  const { slug, nature } = await params;
  const r = await loadCommuneNature(slug, nature);
  if (!r) notFound();
  return (
    <div className="theme-fusion">
      <Navbar />
      <main id="main-content" tabIndex={-1}>
        <div className="fx-wrap fx-fonc-page" style={{ paddingTop: 40, paddingBottom: 64 }}>
          <p className="fx-fonc-kicker">{r.doc.commune.nom}</p>
          <h1 className="fx-fonc-titre">{r.nature.libelle}</h1>
          <CommuneNatureFiche doc={r.doc} nature={r.nature} />
        </div>
      </main>
      <Footer />
    </div>
  );
}
