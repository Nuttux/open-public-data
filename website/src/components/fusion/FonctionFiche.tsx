"use client";

import Link from "next/link";
import { useLocale, useT } from "@/lib/localeContext";
import type { CommuneFonctions, FonctionLigne, FonctionPart } from "@/lib/commune-fonctions";

/**
 * Une politique publique dans une commune : ce qu'elle coûte, ce qu'elle paie,
 * et si la commune y met plus ou moins que ses semblables.
 *
 * Le corps est partagé entre le drawer (ouvert depuis la page ville) et la page
 * pleine (accès direct, partage, moteurs) — même donnée, même corps, seule
 * l'enveloppe change. C'est le contrat des fiches du site, celui de Paris et de
 * Recife ; l'accordéon que cette section avait d'abord n'avait ni URL, ni
 * partage, ni indexation.
 */
export default function FonctionFiche({
  doc, fonction, embedded = false,
}: {
  doc: CommuneFonctions;
  fonction: FonctionPart;
  embedded?: boolean;
}) {
  const t = useT();
  const { locale } = useLocale();
  const en = locale === "en";
  const nf = (o?: Intl.NumberFormatOptions) => new Intl.NumberFormat(en ? "en-GB" : "fr-FR", o);
  const int = nf({ maximumFractionDigits: 0 });

  const euro = (v: number): string => {
    const a = Math.abs(v);
    const s = v < 0 ? "-" : "";
    const dec = nf({ minimumFractionDigits: 1, maximumFractionDigits: 1 });
    if (a >= 1e9) return `${s}${dec.format(a / 1e9)} ${en ? "bn€" : "Md€"}`;
    if (a >= 1e6) return `${s}${dec.format(a / 1e6)} M€`;
    if (a >= 1e3) return `${s}${int.format(Math.round(a / 1e3))} k€`;
    return `${s}${int.format(Math.round(a))} €`;
  };
  const lbl = (x: { libelle: string; libelle_en: string }) => (en ? x.libelle_en : x.libelle);
  const fill = (k: string, v: Record<string, string | number>) =>
    Object.entries(v).reduce((s, [a, b]) => s.replaceAll(`{${a}}`, String(b)), t(k));

  const c = fonction.comparaison;
  const nom = doc.commune.nom;

  const Lignes = ({ rows, taille = 14 }: { rows: FonctionLigne[]; taille?: number }) => (
    <div className="fx-fonc-lignes">
      {rows.map((r) => (
        <div key={r.code} className={`l${r.autres ? " autres" : ""}`} style={{ fontSize: taille }}>
          <span>{lbl(r)}</span>
          <span className="tnum">{euro(r.montant)}</span>
        </div>
      ))}
    </div>
  );

  return (
    <div className="fx-fonc-fiche">
      {/* La réponse, en une phrase, avant tout tableau. */}
      <p className="fx-fonc-reponse">
        {fill("fx.fonc.reponse", { nom, n: euro(fonction.montant), year: doc.annee })}
        {c ? ` ${fill("fx.fonc.reponse_hab", { n: int.format(Math.round(c.eur_hab)) })}` : ""}
      </p>

      {c && doc.strate ? (
        <section className="fx-fonc-bloc">
          <h3>{t("fx.fonc.h_compare")}</h3>
          {/* La PRIORITÉ d'abord — la part du budget, qui ne dépend pas de la
              richesse de la commune. Le niveau en euros vient après, en second. */}
          <p className="fx-fonc-verdict">
            <b className={c.ecart_pt >= 0 ? "plus" : "moins"}>
              {c.ecart_pt >= 0 ? "+" : "−"}{Math.abs(c.ecart_pt).toLocaleString(en ? "en-GB" : "fr-FR", { maximumFractionDigits: 1 })}&nbsp;pt
            </b>{" "}
            {fill("fx.fonc.verdict_part", {
              nom, part: c.part.toLocaleString(en ? "en-GB" : "fr-FR", { maximumFractionDigits: 1 }),
              med: c.part_mediane.toLocaleString(en ? "en-GB" : "fr-FR", { maximumFractionDigits: 1 }),
              strate: en ? doc.strate.libelle_en : doc.strate.libelle,
            })}
          </p>
          <div className="fx-fonc-regle" aria-hidden="true">
            <span className="mid" />
            <span
              className={`seg ${c.ecart_pt >= 0 ? "plus" : "moins"}`}
              style={c.ecart_pt >= 0
                ? { left: "50%", width: `${Math.min(48, Math.abs(c.ecart_pt) * 5)}%` }
                : { right: "50%", width: `${Math.min(48, Math.abs(c.ecart_pt) * 5)}%` }}
            />
          </div>
          <p className="fx-fonc-chiffres">
            {c.ecart_pct != null ? (
              <span>{fill("fx.fonc.niveau_fonc", { n: int.format(Math.round(c.eur_hab)), med: int.format(Math.round(c.mediane)), ecart: `${c.ecart_pct >= 0 ? "+" : "−"}${Math.abs(Math.round(c.ecart_pct))}\u00a0%` })}</span>
            ) : null}
          </p>
        </section>
      ) : null}

      {fonction.sous_fonctions?.length ? (
        <section className="fx-fonc-bloc">
          <h3>{t("fx.pv.fonc.pourquoi")}</h3>
          <Lignes rows={fonction.sous_fonctions} />
        </section>
      ) : null}

      <section className="fx-fonc-bloc">
        <h3>{t("fx.pv.fonc.surquoi")}</h3>
        <Lignes rows={fonction.natures} />
      </section>

      {c?.voisins?.length ? (
        <section className="fx-fonc-bloc">
          <h3>{t("fx.fonc.h_voisins")}</h3>
          <div className="fx-fonc-lignes">
            {c.voisins.map((v) => (
              <Link key={v.slug} href={`/fr/city/${v.slug}/fonction/${fonction.slug}`} className="l lien">
                <span>
                  
                  {v.nom}
                </span>
                <span className="tnum">{fill("fx.fonc.part_court", { n: v.part.toLocaleString(en ? "en-GB" : "fr-FR", { maximumFractionDigits: 1 }) })}</span>
              </Link>
            ))}
          </div>
        </section>
      ) : null}

      <p className="fx-fonc-source">
        {fill("fx.fonc.source", { year: doc.annee })}{" "}
        <a href={doc.source_url} target="_blank" rel="noopener noreferrer">{doc.source}</a>.
        {c ? ` ${t("fx.fonc.methode")}` : ""}
      </p>

      {!embedded ? (
        <p className="fx-fonc-retour">
          <Link href={`/fr/city/${doc.commune.slug}#a-quoi-sert`}>{fill("fx.fonc.retour", { nom })}</Link>
        </p>
      ) : null}
    </div>
  );
}
