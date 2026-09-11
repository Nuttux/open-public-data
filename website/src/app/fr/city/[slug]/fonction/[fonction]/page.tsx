import type { Metadata } from "next";
import { notFound } from "next/navigation";
import "@/app/fusion.css";
import { buildLocaleAwareMetadata } from "@/lib/seo";
import Navbar from "@/components/fusion/Navbar";
import Footer from "@/components/fusion/Footer";
import FonctionFiche from "@/components/fusion/FonctionFiche";
import { loadCommuneFonction } from "@/lib/commune-fonctions";
import { aNom } from "@/lib/nom-commune";

/**
 * Une politique publique dans une commune : « Combien Pantin dépense pour les
 * écoles ? ». Depuis la page ville elle s'ouvre en drawer (route interceptée
 * sous @drawer) ; en accès direct, en partage et pour les moteurs, c'est cette
 * page pleine. 27 246 couples commune × politique existent.
 */
export const dynamic = "force-dynamic";

function euroCourt(v: number, en: boolean): string {
  const a = Math.abs(v);
  const f = (x: number, d = 1) => x.toLocaleString(en ? "en-GB" : "fr-FR", { maximumFractionDigits: d });
  if (a >= 1e9) return `${f(v / 1e9)} ${en ? "bn€" : "Md€"}`;
  if (a >= 1e6) return `${f(v / 1e6)} M€`;
  return `${f(v / 1e3, 0)} k€`;
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string; fonction: string }> }): Promise<Metadata> {
  const { slug, fonction } = await params;
  const r = await loadCommuneFonction(slug, fonction);
  if (!r) notFound();
  const nom = r.doc.commune.nom;
  const c = r.fonction.comparaison;
  const strateFr = r.doc.strate?.libelle ?? "sa taille";
  const strateEn = r.doc.strate?.libelle_en ?? "its size";
  const pt = (v: number, en: boolean) => `${v >= 0 ? "+" : "−"}${Math.abs(v).toLocaleString(en ? "en-GB" : "fr-FR", { maximumFractionDigits: 1 })} pt`;
  // Le titre RÉPOND, avec les chiffres de la page — la règle SEO du site. La
  // description dit la PRIORITÉ (part du budget), pas les euros : c'est la
  // lecture qui ne dépend pas de la richesse de la commune.
  const titreFr = `${r.fonction.libelle} ${aNom(nom)} : ${euroCourt(r.fonction.montant, false)} en ${r.doc.annee}`;
  const titreEn = `${r.fonction.libelle_en} in ${nom}: ${euroCourt(r.fonction.montant, true)} in ${r.doc.annee}`;
  const descFr = c
    ? `${nom} y consacre ${c.part.toLocaleString("fr-FR", { maximumFractionDigits: 1 })} % de son budget de fonctionnement, contre ${c.part_mediane.toLocaleString("fr-FR", { maximumFractionDigits: 1 })} % pour la médiane des communes de ${strateFr} (${pt(c.ecart_pt, false)}, rang ${c.rang} sur ${c.n_communes}). Le détail par domaine et par nature de dépense, source DGFiP.`
    : `Le détail par domaine et par nature de dépense, à partir des balances comptables de la DGFiP.`;
  const descEn = c
    ? `${nom} devotes ${c.part.toLocaleString("en-GB", { maximumFractionDigits: 1 })}% of its operating budget to this, against ${c.part_mediane.toLocaleString("en-GB", { maximumFractionDigits: 1 })}% for the median of towns of ${strateEn} (${pt(c.ecart_pt, true)}, ranked ${c.rang} of ${c.n_communes}). Breakdown by area and by type of spending, from DGFiP accounts.`
    : `Breakdown by area and by type of spending, from DGFiP accounting balances.`;
  return buildLocaleAwareMetadata({
    title: titreFr,
    description: descFr,
    en: { title: titreEn, description: descEn },
    path: `/fr/city/${slug}/fonction/${fonction}`,
  });
}

export default async function FonctionPage({ params }: { params: Promise<{ slug: string; fonction: string }> }) {
  const { slug, fonction } = await params;
  const r = await loadCommuneFonction(slug, fonction);
  if (!r) notFound();
  return (
    <div className="theme-fusion">
      <Navbar />
      <main id="main-content" tabIndex={-1}>
        <div className="fx-wrap fx-fonc-page" style={{ paddingTop: 40, paddingBottom: 64 }}>
          <p className="fx-fonc-kicker">{r.doc.commune.nom}</p>
          <h1 className="fx-fonc-titre">{r.fonction.libelle}</h1>
          <FonctionFiche doc={r.doc} fonction={r.fonction} />
        </div>
      </main>
      <Footer />
    </div>
  );
}
