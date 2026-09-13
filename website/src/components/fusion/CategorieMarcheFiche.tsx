"use client";

import type { MarcheCategorieFiche } from "@/lib/fusion-data";
import { fill } from "@/lib/fmt";
import { normalizeObjet } from "@/lib/objet-normalizer";
import { isNamedTitulaire } from "@/lib/marches-shape";
import { useT, useLocale } from "@/lib/localeContext";
import { FicheBreakdown } from "@/components/fiche";
import { V3Foot, V3Hero, V3Row, V3Section } from "@/components/fiche/v3";
import { useCity } from "./CityContext";
import { useFmt } from "@/lib/use-fmt";

/**
 * Fiche catégorie de marchés v3 (2026-09-03) — UN chiffre (les plafonds
 * signés dans la catégorie cette année-là, dits comme tels), « Les plus gros
 * contrats » en rangées qui ouvrent le contrat, « Les titulaires » en barres
 * qui ouvrent la fiche fournisseur. Plus de bandeau KPI ni de tableau.
 */
export default function CategorieMarcheFiche({ fiche }: { fiche: MarcheCategorieFiche }) {
  const t = useT();
  const { fmtInt, fmtCompactEur } = useFmt();
  const { locale } = useLocale();
  const { basePath } = useCity();
  const total = fmtCompactEur(fiche.total);
  const eurTxt = (n: number) => { const { value, unit } = fmtCompactEur(n); return `${value} ${unit}`; };
  const Amt = ({ n }: { n: number }) => { const f = fmtCompactEur(n); return <span className="fx-v3-amt tnum" style={{ fontSize: 14 }}>{f.value}<span className="u">{f.unit}</span></span>; };

  return (
    <div className="fx-v3">
      <V3Hero
        v={total.value} u={total.unit}
        caption={fill(t("fx.categorie.hero_cap_v3"), { year: fiche.year })}
        meta={fill(t("fx.categorie.meta"), { share: Math.round(fiche.shareOfTotalPct), n: fmtInt(fiche.nbContrats), t: fmtInt(fiche.nbTitulaires) })}
      />

      <V3Section title={fill(t("fx.categorie.h.contrats"), { year: fiche.year })} sub={fiche.nbContrats > fiche.topContrats.length ? fill(t("fx.categorie.h.contrats_top_sub"), { n: fiche.topContrats.length, t: fmtInt(fiche.nbContrats) }) : t("fx.categorie.h.contrats_sub")}>
        {fiche.topContrats.map((c) => {
          const preferred = locale === "en" && c.objetClairEn ? c.objetClairEn : c.objetClair;
          const objet = preferred || normalizeObjet(c.objet || "");
          return (
            <V3Row key={c.numero || objet} href={c.numero ? `${basePath}/marches/contrat/${encodeURIComponent(c.numero)}` : null}
              label={objet.length > 110 ? objet.slice(0, 110) + "…" : objet}
              sub={isNamedTitulaire(c.fournisseur) ? c.fournisseur : undefined}
              amount={<Amt n={c.montant} />} />
          );
        })}
      </V3Section>

      <V3Section title={t(fiche.nbTitulaires > fiche.topTitulaires.length ? "fx.categorie.h.titulaires_top" : "fx.categorie.h.titulaires")} sub={fiche.nbTitulaires > fiche.topTitulaires.length ? fill(t("fx.categorie.h.titulaires_top_sub"), { n: fiche.topTitulaires.length, t: fmtInt(fiche.nbTitulaires) }) : t("fx.categorie.h.titulaires_sub")}>
        <FicheBreakdown
          cap={fiche.topTitulaires.length}
          rows={fiche.topTitulaires.map((tit) => ({
            key: tit.siret || tit.name, label: tit.name,
            meta: fill(tit.nb > 1 ? t("fx.categorie.contrats_count_many") : t("fx.categorie.contrats_count_one"), { n: tit.nb }),
            value: tit.amount,
            href: tit.siret && isNamedTitulaire(tit.name) ? `${basePath}/marches/fournisseur/${encodeURIComponent(tit.siret)}` : undefined,
          }))}
          format={eurTxt}
        />
      </V3Section>

      <V3Foot>{t("fx.fiche.fourn.note_plafond")}</V3Foot>
    </div>
  );
}
