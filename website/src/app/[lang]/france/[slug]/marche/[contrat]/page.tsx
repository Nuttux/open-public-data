import { permanentRedirectLocalized } from "@/lib/redirect-server";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import "@/app/fusion.css";
import { buildLocaleAwareMetadata } from "@/lib/seo";
import ContratCommuneClient from "./ContratCommuneClient";
import { loadContratLocal } from "./load";
import { contratIndexable } from "@/lib/contrat-indexable";

/**
 * Fiche contrat d'une commune (2026-09-13) : la fiche contrat de Paris, sur la
 * DECP nationale. Depuis la page ville et les listes de marchés, elle s'ouvre
 * en drawer ; en accès direct, c'est cette page pleine.
 */
export const dynamic = "force-dynamic";

const court = (n: number, en: boolean) => {
  const tag = en ? "en-GB" : "fr-FR";
  if (n >= 1e6) { const v = (n / 1e6).toLocaleString(tag, { maximumFractionDigits: 1 }); return en ? `€${v}M` : `${v} M€`; }
  const v = Math.round(n / 1e3).toLocaleString(tag);
  return en ? `€${v}k` : `${v} k€`;
};

const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n).replace(/\s+\S*$/, "")}…` : s);

export async function generateMetadata({ params }: { params: Promise<{ slug: string; contrat: string }> }): Promise<Metadata> {
  const { slug, contrat } = await params;
  const r = await loadContratLocal(slug, contrat);
  if (!r) notFound();
  const { c, commune } = r;
  const qui = c.siren && c.titulaire ? c.titulaire : null;
  const offresFr = c.offres_recues != null ? ` ${c.offres_recues} offre${c.offres_recues > 1 ? "s" : ""} reçue${c.offres_recues > 1 ? "s" : ""}.` : "";
  const offresEn = c.offres_recues != null ? ` ${c.offres_recues} bid${c.offres_recues > 1 ? "s" : ""} received.` : "";
  const meta = await buildLocaleAwareMetadata({
    title: `${clip(c.objet, 70)} : ${court(c.montant, false)}, ${commune.nom}${c.annee ? ` ${c.annee}` : ""}`,
    description: `Marché public notifié par ${commune.nom}${c.date ? ` le ${new Date(c.date).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })}` : ""}${qui ? `, attribué à ${qui}` : ""} : ${court(c.montant, false)}${c.procedure ? `, ${c.procedure.toLowerCase()}` : ""}.${offresFr} Source DECP.`,
    en: {
      title: `${clip(c.objet, 70)}: ${court(c.montant, true)}, ${commune.nom}${c.annee ? ` ${c.annee}` : ""}`,
      description: `Public contract awarded by ${commune.nom}${c.date ? ` on ${new Date(c.date).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}` : ""}${qui ? ` to ${qui}` : ""}: ${court(c.montant, true)}.${offresEn} Source: DECP.`,
    },
    path: `/france/${commune.slug}/marche/${c.slug}`,
  });
  // Lot minuscule ou objet réduit à un code : la page reste pour qui la cherche,
  // sans être proposée aux moteurs. Les liens restent suivis (fournisseur,
  // autres marchés), contrairement au noindex du helper qui coupe tout.
  return contratIndexable(c) ? meta : { ...meta, robots: { index: false, follow: true } };
}

export default async function ContratCommunePage({ params }: { params: Promise<{ slug: string; contrat: string }> }) {
  const { slug, contrat } = await params;
  const r = await loadContratLocal(slug, contrat);
  if (!r) notFound();
  // L'identifiant seul, ou un ancien objet : une seule adresse par contrat.
  if (contrat !== r.c.slug || slug !== r.commune.slug) await permanentRedirectLocalized(`/france/${r.commune.slug}/marche/${r.c.slug}`);
  return <ContratCommuneClient {...r} />;
}
