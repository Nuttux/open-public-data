"use client";

import Link from "next/link";
import Navbar from "@/components/fusion/Navbar";
import Footer from "@/components/fusion/Footer";
import ChartSource from "@/components/fusion/ChartSource";
import ContratFiche from "@/components/fusion/ContratFiche";
import { CityProvider } from "@/components/fusion/CityContext";
import { V3Amt, V3Foot, V3Row, V3Section } from "@/components/fiche/v3";
import { useT, useLocale } from "@/lib/localeContext";
import { aNom, deNom } from "@/lib/nom-commune";
import type { ContratFiche as ContratFicheType } from "@/lib/fusion-data";
import type { ContratLocal } from "./load";

type Props = ContratLocal & {
  /** Dans le drawer : le corps seul, le drawer porte déjà le titre et la fermeture. */
  embedded?: boolean;
};

/**
 * La fiche contrat d'une commune : le corps de la fiche contrat de Paris
 * (ContratFiche), nourri par la DECP nationale, puis ce que Paris n'a pas
 * besoin de dire — le rang du marché dans l'année, sa forme (accord-cadre,
 * prix, avenants, sous-traitance), ses lots, et les autres marchés du même
 * titulaire dans la commune.
 */
export default function ContratCommuneClient({ commune, c, autres, coverageNote, sourceUrl, embedded = false }: Props) {
  const t = useT();
  const { locale } = useLocale();
  const en = locale === "en";
  const tag = en ? "en-GB" : "fr-FR";
  const int = new Intl.NumberFormat(tag, { maximumFractionDigits: 0 });
  const fill = (key: string, vars: Record<string, string | number>) => {
    let s = t(key);
    for (const [k, v] of Object.entries(vars)) s = s.split(`{${k}}`).join(String(v));
    return s;
  };
  const split = (eur: number): { v: string; u: string } => {
    const a = Math.abs(eur);
    if (a >= 1e9) return { v: (eur / 1e9).toLocaleString(tag, { maximumFractionDigits: 2 }), u: "Md€" };
    if (a >= 1e6) return { v: (eur / 1e6).toLocaleString(tag, { maximumFractionDigits: a >= 1e8 ? 0 : 1 }), u: "M€" };
    if (a >= 1e3) return { v: int.format(eur / 1e3), u: "k€" };
    return { v: int.format(eur), u: "€" };
  };
  const date = (iso: string | null) => {
    if (!iso) return null;
    try { return new Intl.DateTimeFormat(tag, { day: "numeric", month: "long", year: "numeric" }).format(new Date(iso)); } catch { return iso; }
  };

  const lieu = (() => {
    const l = c.lieu_execution;
    if (!l?.code) return null;
    const ty = (l.type ?? "").toUpperCase();
    // Suit « exécuté à » dans la fiche : un code postal se lit seul ; un code
    // commune INSEE ne dit rien au lecteur, on ne l'affiche pas.
    if (ty.includes("COMMUNE")) return null;
    const key = ty.includes("DEPARTEMENT") ? "fx.cc.lieu_dep" : ty.includes("REGION") || ty.includes("RÉGION") ? "fx.cc.lieu_region" : null;
    return key ? fill(key, { c: l.code }) : l.code;
  })();

  // La fiche de Paris, au format qu'elle attend. Pas de numéro de marché : la
  // DECP n'en publie pas de lisible, et l'identifiant interne n'aide personne.
  const contrat: ContratFicheType = {
    numero: "",
    objet: c.objet,
    nature: c.nature ? c.nature.charAt(0) + c.nature.slice(1).toLowerCase() : "",
    categorie: c.categorie ? c.categorie.replace(/ & /g, en ? " and " : " et ") : "—",
    fournisseur: c.titulaire ?? "—",
    fournisseurSiret: c.siren ?? "",
    multiAttributaire: false,
    montantMin: 0,
    montantMax: c.montant,
    dateNotification: c.date ?? "",
    dureeJours: c.duree_mois ? Math.round(c.duree_mois * 30.44) : 0,
    // Le « périmètre » parisien (budget principal, annexes) n'a pas d'équivalent ici.
    perimetre: "",
    year: c.annee ?? 0,
    decp: {
      ccag: c.ccag,
      cpvFamille: null,
      procedure: c.procedure,
      montantNotifie: c.montant,
      dureeMois: c.duree_mois,
      offresRecues: c.offres_recues,
      lieuExecution: lieu,
      titulairesCount: c.nb_titulaires,
      nbModifications: c.nb_modifications,
      sousTraitanceDeclaree: c.sous_traitance_declaree,
      hasConsiderationSociale: Boolean(c.considerations_sociales),
      hasConsiderationEnvironnementale: Boolean(c.considerations_environnementales),
      afficherDeuxMontants: false,
      sourceOrigin: "decp",
    },
  };

  const forme: { label: string; value: string }[] = [];
  if (c.accord_cadre) forme.push({ label: t("fx.cc.accord_cadre"), value: t("fx.cc.accord_cadre_v") });
  if (c.forme_prix) forme.push({ label: t("fx.cc.forme_prix"), value: c.forme_prix });
  if (c.nb_modifications != null) forme.push({ label: t("fx.cc.avenants"), value: c.nb_modifications > 0 ? int.format(c.nb_modifications) : t("fx.cc.aucun") });
  if (c.sous_traitance_declaree != null) forme.push({ label: t("fx.cc.sous_traitance"), value: t(c.sous_traitance_declaree ? "fx.cc.oui" : "fx.cc.non") });
  if (c.considerations_sociales) forme.push({ label: t("fx.cc.social"), value: c.considerations_sociales });
  if (c.considerations_environnementales) forme.push({ label: t("fx.cc.environnement"), value: c.considerations_environnementales });

  const body = (
    <>
      {c.annee && c.nb_annee > 1 ? (
        <p className="fx-cc-rang">
          {c.rang_annee === 1
            ? fill("fx.cc.rang_1", { nom: commune.nom, year: c.annee, n: int.format(c.nb_annee) })
            : fill("fx.cc.rang_n", { rang: int.format(c.rang_annee), nom: commune.nom, year: c.annee, n: int.format(c.nb_annee) })}
        </p>
      ) : null}

      <CityProvider city={{ slug: commune.slug, basePath: `/fr/city/${commune.slug}` }}>
        <ContratFiche contrat={contrat} fournisseurHref={c.siren ? `/fr/city/${commune.slug}/fournisseur/${c.siren}` : null} />
      </CityProvider>

      {!c.siren ? (
        <V3Foot>{t(c.personne_physique ? "fx.cc.note_personne" : "fx.cc.note_sans_siret")}</V3Foot>
      ) : null}

      {forme.length ? (
        <V3Section title={t("fx.cc.h_forme")}>
          {forme.map((f) => (
            <div key={f.label} className="fx-pv-line"><span>{f.label}</span><span className="fx-cc-val">{f.value}</span></div>
          ))}
        </V3Section>
      ) : null}

      {c.lots.length > 1 ? (
        <V3Section title={fill("fx.cc.h_lots", { n: c.lots.length })}>
          {c.lots.map((l, i) => (
            <V3Row
              key={i}
              label={fill("fx.cc.lot", { i: i + 1 })}
              sub={[date(l.date), l.offres_recues != null ? (l.offres_recues === 1 ? t("fx.cc.offre_1") : fill("fx.cc.offres_n", { n: l.offres_recues })) : null].filter(Boolean).join(" · ")}
              amount={<V3Amt {...split(l.montant)} />}
            />
          ))}
        </V3Section>
      ) : null}

      {autres.length ? (
        <V3Section title={fill("fx.cc.h_autres", { qui: c.titulaire ?? "", nom: commune.nom, a_nom: aNom(commune.nom) })}>
          {autres.map((a) => (
            <V3Row key={a.slug} href={`/fr/city/${commune.slug}/marche/${a.slug}`} label={a.objet} sub={a.annee ? String(a.annee) : undefined} amount={<V3Amt {...split(a.montant)} />} />
          ))}
        </V3Section>
      ) : null}

      <div className="fx-cc-tous">
        <V3Row href={`/fr/city/${commune.slug}#achats`} label={fill("fx.cc.tous", { nom: commune.nom, denom: deNom(commune.nom) })} />
      </div>
      <V3Foot>{coverageNote}</V3Foot>
      <ChartSource source={t("fx.natmar.source")} dataHref={sourceUrl} methodAnchor="c-villes" />
    </>
  );

  if (embedded) return <div className="fx-v3 fx-pv fx-pv-embedded">{body}</div>;

  return (
    <div className="theme-fusion">
      <Navbar />
      <main id="main-content" tabIndex={-1}>
        <div className="fx-wrap fx-v3 fx-pv" style={{ paddingTop: 48, paddingBottom: 48 }}>
          <p className="fx-pv-kicker">
            <Link href={`/fr/city/${commune.slug}#achats`} className="fx-pv-link">{fill("fx.cc.kicker", { nom: commune.nom, denom: deNom(commune.nom) })}</Link>
            {c.annee ? ` · ${c.annee}` : ""}
          </p>
          <h1 className="fx-pv-title fx-cc-title">{c.objet}</h1>
          {body}
        </div>
      </main>
      <Footer />
    </div>
  );
}
