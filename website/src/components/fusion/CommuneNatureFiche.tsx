"use client";

import Link from "next/link";
import { useLocale, useT } from "@/lib/localeContext";
import type { CommuneFonctions, FonctionLigne, NatureFamille } from "@/lib/commune-fonctions";

/**
 * Une forme de dépense dans une commune — les salaires, les achats, les
 * subventions — et surtout DANS QUELLES POLITIQUES elle va. C'est la lecture
 * de la fiche poste de Paris, dans l'autre sens que la fiche fonction ; elle
 * n'existe que pour les communes qui ont l'axe fonction, parce que c'est là
 * qu'elle a quelque chose à dire que la page ville ne montre pas déjà.
 *
 * Même corps en drawer et en page pleine. (« NatureFiche » est la fiche de
 * Paris, d'où le préfixe.)
 */
export default function CommuneNatureFiche({
  doc, nature, embedded = false,
}: {
  doc: CommuneFonctions;
  nature: NatureFamille;
  embedded?: boolean;
}) {
  const t = useT();
  const { locale } = useLocale();
  const en = locale === "en";
  const loc = en ? "en-GB" : "fr-FR";
  const nf = (o?: Intl.NumberFormatOptions) => new Intl.NumberFormat(loc, o);
  const int = nf({ maximumFractionDigits: 0 });
  const dec1 = (v: number) => v.toLocaleString(loc, { maximumFractionDigits: 1 });
  const euro = (v: number): string => {
    const a = Math.abs(v); const s = v < 0 ? "-" : "";
    const dec = nf({ minimumFractionDigits: 1, maximumFractionDigits: 1 });
    if (a >= 1e9) return `${s}${dec.format(a / 1e9)} ${en ? "bn€" : "Md€"}`;
    if (a >= 1e6) return `${s}${dec.format(a / 1e6)} M€`;
    if (a >= 1e3) return `${s}${int.format(Math.round(a / 1e3))} k€`;
    return `${s}${int.format(Math.round(a))} €`;
  };
  const lbl = (x: { libelle: string; libelle_en: string }) => (en ? x.libelle_en : x.libelle);
  const fill = (k: string, v: Record<string, string | number>) =>
    Object.entries(v).reduce((s, [a, b]) => s.replaceAll(`{${a}}`, String(b)), t(k));

  const c = nature.comparaison;
  const nom = doc.commune.nom;
  const total = nature.fonctions.reduce((a, f) => a + f.montant, 0) || 1;

  const Lignes = ({ rows }: { rows: FonctionLigne[] }) => (
    <div className="fx-fonc-lignes">
      {rows.map((r) => (
        <div key={r.code} className={`l${r.autres ? " autres" : ""}`}>
          <span>{lbl(r)}</span>
          <span className="tnum">{euro(r.montant)}</span>
        </div>
      ))}
    </div>
  );

  return (
    <div className="fx-fonc-fiche">
      <p className="fx-fonc-reponse">
        {fill("fx.nat.reponse", { year: doc.annee, nom, n: euro(nature.montant) })}
        {nature.share != null ? ` ${fill("fx.nat.reponse_part", { part: Math.round(nature.share * 100) })}` : ""}
      </p>

      {c && doc.strate ? (
        <section className="fx-fonc-bloc">
          <h3>{t("fx.fonc.h_compare")}</h3>
          <p className="fx-fonc-verdict">
            <b className={c.ecart_pt >= 0 ? "plus" : "moins"}>{c.ecart_pt >= 0 ? "+" : "−"}{dec1(Math.abs(c.ecart_pt))}&nbsp;pt</b>{" "}
            {fill("fx.fonc.verdict_part", { nom, part: dec1(c.part), med: dec1(c.part_mediane), strate: en ? doc.strate.libelle_en : doc.strate.libelle })}
          </p>
          <div className="fx-fonc-regle" aria-hidden="true">
            <span className="mid" />
            <span className={`seg ${c.ecart_pt >= 0 ? "plus" : "moins"}`} style={c.ecart_pt >= 0
              ? { left: "50%", width: `${Math.min(48, Math.abs(c.ecart_pt) * 5)}%` }
              : { right: "50%", width: `${Math.min(48, Math.abs(c.ecart_pt) * 5)}%` }} />
          </div>
          <p className="fx-fonc-chiffres">
            <span>{fill("fx.fonc.rang_part", { rang: c.rang, n: c.n_communes })}</span>
            {c.ecart_pct != null ? <span>{fill("fx.fonc.niveau_fonc", { n: int.format(Math.round(c.eur_hab)), med: int.format(Math.round(c.mediane)), ecart: `${c.ecart_pct >= 0 ? "+" : "−"}${Math.abs(Math.round(c.ecart_pct))} %` })}</span> : null}
          </p>
        </section>
      ) : null}

      {/* Le croisement — la raison d'être de cette fiche. Chaque politique
          mène à sa propre fiche : on lit le budget dans les deux sens. */}
      <section className="fx-fonc-bloc">
        <h3>{t("fx.nat.h_pourquoi")}</h3>
        <div className="fx-fonc-lignes">
          {nature.fonctions.map((f) => {
            const row = (
              <>
                <span><span className="pct tnum">{Math.round((f.montant / total) * 100)}&nbsp;%</span>{lbl(f)}</span>
                <span className="tnum">{euro(f.montant)}</span>
              </>
            );
            return f.slug
              ? <Link key={f.cle} href={`/fr/city/${doc.commune.slug}/fonction/${f.slug}`} className="l lien">{row}</Link>
              : <div key={f.cle} className="l autres">{row}</div>;
          })}
        </div>
      </section>

      <section className="fx-fonc-bloc">
        <h3>{t("fx.nat.h_comptes")}</h3>
        <Lignes rows={nature.comptes} />
      </section>

      {c?.voisins?.length ? (
        <section className="fx-fonc-bloc">
          <h3>{t("fx.fonc.h_voisins")}</h3>
          <div className="fx-fonc-lignes">
            {c.voisins.map((v) => (
              <Link key={v.slug} href={`/fr/city/${v.slug}/nature/${nature.slug}`} className="l lien">
                <span><span className="rg tnum">{v.rang}</span>{v.nom}</span>
                <span className="tnum">{fill("fx.fonc.part_court", { n: dec1(v.part) })}</span>
              </Link>
            ))}
          </div>
        </section>
      ) : null}

      <p className="fx-fonc-source">
        {fill("fx.nat.source", { year: doc.annee })}{" "}
        <a href={doc.source_url} target="_blank" rel="noopener noreferrer">{doc.source}</a>.
        {c ? ` ${t("fx.fonc.methode")}` : ""}
      </p>

      {!embedded ? (
        <p className="fx-fonc-retour"><Link href={`/fr/city/${doc.commune.slug}#depenses`}>{fill("fx.nat.retour", { nom })}</Link></p>
      ) : null}
    </div>
  );
}
