"use client";

import Link from "@/components/LocalizedLink";
import Navbar from "@/components/fusion/Navbar";
import Footer from "@/components/fusion/Footer";
import ChartSource from "@/components/fusion/ChartSource";
import { V3Amt, V3Fold, V3Foot, V3Hero, V3Lead, V3Row, V3Section, foldRest } from "@/components/fiche/v3";
import { useT, useLocale } from "@/lib/localeContext";
import { aNom, deNom } from "@/lib/nom-commune";
import type { FournisseurLocal } from "@/lib/commune-marches";

type Props = {
  commune: { slug: string; nom: string; dep_name: string; pop: number };
  f: FournisseurLocal;
  nationalComplet: boolean;
  coverageNote: string;
  totalCommune: number | null;
  others: { siren: string; nom: string; montant: number; nb: number }[];
  sourceUrl: string;
  /** Dans le drawer : le corps seul, le drawer porte déjà le titre et la fermeture. */
  embedded?: boolean;
};

export default function FournisseurLocalClient({ commune, f, nationalComplet, coverageNote, totalCommune, others, sourceUrl, embedded = false }: Props) {
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
  const euro = (eur: number) => { const { v, u } = split(eur); return `${v} ${u}`; };
  const hero = split(f.montant);
  const share = totalCommune && totalCommune > 0 ? Math.round((f.montant / totalCommune) * 100) : null;
  const { shown, rest } = foldRest(f.marches, 8);
  const cats = Array.from(new Set(f.marches.map((m) => m.categorie).filter(Boolean))) as string[];
  const domaine = cats.length === 1 ? cats[0] : cats.length > 1 ? `${cats[0]}, ${cats[1]}${cats.length > 2 ? "…" : ""}` : null;
  const ligne = (m: FournisseurLocal["marches"][number]) =>
    [m.annee, m.duree_mois ? fill("fx.fl.mois", { n: m.duree_mois }) : null, m.nb_lots > 1 ? fill("fx.pv.lots", { n: m.nb_lots }) : null, m.procedure].filter(Boolean).join(" · ");

  const body = (
    <>
          <V3Lead>
            {fill("fx.fl.lead", { nom: f.nom, commune: commune.nom, nb: int.format(f.nb), y0: f.first_year ?? "", y1: f.last_year ?? "" })}
            {share != null && share >= 1 ? ` ${fill("fx.fl.share", { pct: share })}` : ""}
          </V3Lead>
          <V3Hero v={hero.v} u={hero.u} caption={fill("fx.fl.hero_cap", { commune: commune.nom, y0: f.first_year ?? "" })} meta={t("fx.fl.hero_meta")} />

          <V3Section title={fill("fx.fl.h2", { nom: f.nom, commune: commune.nom, acommune: aNom(commune.nom) })}>
            {shown.map((m, i) => (
              <V3Row key={i} href={m.slug ? `/france/${commune.slug}/marche/${m.slug}` : null} label={m.objet || "—"} sub={ligne(m)} amount={<V3Amt {...split(m.montant)} />} />
            ))}
            {rest.length > 0 && (
              <V3Fold label={fill("fx.fl.voir_reste", { n: rest.length })} text>
                {rest.map((m, i) => (
                  <V3Row key={i} href={m.slug ? `/france/${commune.slug}/marche/${m.slug}` : null} label={m.objet || "—"} sub={ligne(m)} amount={<V3Amt {...split(m.montant)} />} />
                ))}
              </V3Fold>
            )}
            <V3Foot>{coverageNote}</V3Foot>
          </V3Section>

          {f.national && f.national.communes > 1 && (
            <V3Section title={t("fx.fl.ailleurs")}>
              <p className="fx-v3-sentence">
                {fill("fx.fl.ailleurs_lead", { nom: f.nom, n: int.format(f.national.communes), montant: euro(f.national.montant) })}
                {nationalComplet ? "" : ` ${t("fx.fl.ailleurs_partiel")}`}
              </p>
              <V3Foot>{t("fx.fl.ailleurs_note")}</V3Foot>
            </V3Section>
          )}

          {others.length > 0 && (
            <V3Section title={fill("fx.fl.autres", { commune: commune.nom, decommune: deNom(commune.nom) })}>
              {others.map((o) => (
                <V3Row key={o.siren} href={`/france/${commune.slug}/fournisseur/${o.siren}`} label={o.nom} sub={(o.nb === 1 ? t("fx.fl.n_marche1") : fill("fx.fl.n_marches", { n: o.nb }))} amount={<V3Amt {...split(o.montant)} />} />
              ))}
              <V3Row href={`/france/${commune.slug}#achats`} label={fill("fx.fl.retour", { commune: commune.nom })} />
            </V3Section>
          )}

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
            <Link href={`/france/${commune.slug}#achats`} className="fx-pv-link">{fill("fx.fl.kicker", { nom: commune.nom, denom: deNom(commune.nom) })}</Link>
            {domaine ? ` · ${domaine.replace(/ & /g, en ? " and " : " et ")}` : ""}
          </p>
          <h1 className="fx-pv-title">{f.nom}</h1>
          {body}
        </div>
      </main>
      <Footer />
    </div>
  );
}
