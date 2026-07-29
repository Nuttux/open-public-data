"use client";

import Link from "next/link";

import type { MarcheCategorieFiche } from "@/lib/fusion-data";
import { fill, fmtCompactEur, fmtInt, fmtDec } from "@/lib/fmt";
import { normalizeObjet } from "@/lib/objet-normalizer";
import { isNamedTitulaire } from "@/lib/marches-shape";
import { useT, useLocale } from "@/lib/localeContext";
import { FicheStatHero, FicheBreakdown } from "@/components/fiche";
import { useCity } from "./CityContext";
import FicheKpis from "./FicheKpis";

export default function CategorieMarcheFiche({ fiche }: { fiche: MarcheCategorieFiche }) {
  const t = useT();
  const { locale } = useLocale();
  const { basePath } = useCity();
  const total = fmtCompactEur(fiche.total);

  return (
    <div>
      <FicheStatHero
        value={
          <>
            {total.value}
            <span className="fx-fiche-stat-unit">{total.unit}</span>
          </>
        }
        caption={fill(t("fx.categorie.hero_cap"), { year: fiche.year })}
      />

      <FicheKpis
        items={[
          { label: t("fx.categorie.kpi.share_paris"), value: fmtDec(fiche.shareOfTotalPct, 1), unit: "%" },
          { label: t("fx.categorie.kpi.contrats"), value: fmtInt(fiche.nbContrats) },
          { label: t("fx.categorie.kpi.titulaires"), value: fmtInt(fiche.nbTitulaires) },
        ]}
      />

      <section className="fx-fiche-section">
        <div className="fx-fiche-h">{fill(t("fx.categorie.top_contrats"), { year: fiche.year })}</div>
        <table className="fx-fiche-subv-table">
          <thead>
            <tr>
              <th>{t("fx.categorie.col.objet")}</th>
              <th>{t("fx.categorie.col.titulaire")}</th>
              <th style={{ textAlign: "right" }}>{t("fx.categorie.col.enveloppe")}</th>
            </tr>
          </thead>
          <tbody>
            {fiche.topContrats.map((c) => {
              const { value, unit } = fmtCompactEur(c.montant);
              const preferred =
                locale === "en" && c.objetClairEn ? c.objetClairEn : c.objetClair;
              const objet = preferred || normalizeObjet(c.objet || "");
              return (
                <tr key={c.numero}>
                  <td style={{ maxWidth: 360 }}>
                    {c.numero ? (
                      <Link
                        href={`${basePath}/marches/contrat/${encodeURIComponent(c.numero)}`}
                        scroll={false}

                      >
                        {objet.length > 90 ? objet.slice(0, 90) + "…" : objet}
                      </Link>
                    ) : (
                      <span>{objet}</span>
                    )}
                  </td>
                  <td style={{ fontSize: 12 }}>
                    {c.fournisseurSiret && isNamedTitulaire(c.fournisseur) ? (
                      <Link
                        href={`${basePath}/marches/fournisseur/${encodeURIComponent(c.fournisseurSiret)}`}
                        scroll={false}

                      >
                        {c.fournisseur.slice(0, 40)}
                      </Link>
                    ) : (
                      c.fournisseur.slice(0, 40)
                    )}
                  </td>
                  <td style={{ textAlign: "right", fontFamily: "var(--f-disp)", fontWeight: 700 }}>
                    {value} <span style={{ color: "var(--muted)", fontSize: ".75em" }}>{unit}</span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>

      <section className="fx-fiche-section">
        <div className="fx-fiche-h">{t("fx.categorie.top_titulaires")}</div>
        <FicheBreakdown
          cap={fiche.topTitulaires.length}
          rows={fiche.topTitulaires.map((tit) => ({
            key: tit.siret || tit.name,
            label: tit.name,
            meta: fill(
              tit.nb > 1 ? t("fx.categorie.contrats_count_many") : t("fx.categorie.contrats_count_one"),
              { n: tit.nb },
            ),
            value: tit.amount,
            // Un SIRET ne suffit pas : « Non précisé » et
            // « MARCHE MULTIATTRIBUTAIRE » en portent un et ne désignent
            // personne. Ces lignes gardent leur argent, perdent leur lien.
            href:
              tit.siret && isNamedTitulaire(tit.name)
                ? `${basePath}/marches/fournisseur/${encodeURIComponent(tit.siret)}`
                : undefined,
          }))}
          format={(n) => {
            const { value, unit } = fmtCompactEur(n);
            return `${value} ${unit}`;
          }}
        />
      </section>
    </div>
  );
}
