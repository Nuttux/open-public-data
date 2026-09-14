"use client";

import type { MarcheCategorieFiche } from "@/lib/fusion-data";
import { fill } from "@/lib/fmt";
import { cutObjet, rowObjet } from "@/lib/objet-normalizer";
import { isNamedTitulaire } from "@/lib/marches-shape";
import { displayOrgName } from "@/lib/fournisseur-display";
import { useT, useLocale } from "@/lib/localeContext";
import { FicheBreakdown } from "@/components/fiche";
import { V3Fold, V3Foot, V3Hero, V3Row, V3Section, foldRest } from "@/components/fiche/v3";
import AnneesRail, { RAIL_MIN } from "./AnneesRail";
import { useCity } from "./CityContext";
import { useFmt } from "@/lib/use-fmt";

/**
 * Fiche catégorie de marchés v3, reprise le 2026-09-13 : UN chiffre (les
 * plafonds signés dans la catégorie cette année-là, dits comme tels), la
 * forme de la série sur les exercices où la catégorie existe, les plus gros
 * contrats de l'année (un lot partagé = une ligne), les titulaires en barres,
 * chaque bloc titré avec son année, et la part de contrats
 * attribués sur une seule offre quand le nombre d'offres est publié.
 */
export default function CategorieMarcheFiche({ fiche }: { fiche: MarcheCategorieFiche }) {
  const t = useT();
  const { fmtInt, fmtCompactEur } = useFmt();
  const { locale } = useLocale();
  const { basePath } = useCity();
  const total = fmtCompactEur(fiche.total);
  const eurTxt = (n: number) => { const { value, unit } = fmtCompactEur(n); return `${value} ${unit}`; };
  const Amt = ({ n }: { n: number }) => { const f = fmtCompactEur(n); return <span className="fx-v3-amt tnum" style={{ fontSize: 14 }}>{f.value}<span className="u">{f.unit}</span></span>; };
  const offres = fiche.offres && fiche.offres.known >= 5 ? fiche.offres : null;
  // Cinq contrats, puis « Voir plus » : pas de sous-titre qui compte « les 10
  // plus gros sur 90 » avant de n'en montrer que la moitié.
  const contrats = foldRest(fiche.topContrats, 5);

  const ContratRow = (c: MarcheCategorieFiche["topContrats"][number]) => {
    const preferred = locale === "en" && c.objetClairEn ? c.objetClairEn : c.objetClair;
    const { title, detail } = preferred ? { title: cutObjet(preferred, 96), detail: null } : rowObjet(c.objet || "");
    const named = (c.titulaires ?? []).filter((n) => isNamedTitulaire(n)).map((n) => displayOrgName(n));
    const extra = named.length - 2;
    const who = extra > 0
      ? fill(t(extra === 1 ? "fx.categorie.titulaires_more_one" : "fx.categorie.titulaires_more"), { names: named.slice(0, 2).join(", "), n: extra })
      : named.join(", ") || (c.fournisseur === "MARCHE MULTIATTRIBUTAIRE" ? t("fx.sec.mp.multi_holders") : "");
    return (
      <V3Row key={c.numero || title} href={c.numero ? `${basePath}/marches/contrat/${encodeURIComponent(c.numero)}` : null}
        label={title}
        subText={[detail, who].filter(Boolean).join(" · ") || undefined}
        amount={<Amt n={c.montant} />} />
    );
  };

  return (
    <div className="fx-v3">
      <V3Hero
        v={total.value} u={total.unit}
        caption={fill(t("fx.categorie.hero_cap_v3"), { year: fiche.year })}
        meta={fill(t("fx.categorie.meta"), { share: Math.round(fiche.shareOfTotalPct), n: fmtInt(fiche.nbContrats), t: fmtInt(fiche.nbTitulaires) })}
      />

      {(fiche.series?.length ?? 0) >= RAIL_MIN && (
        <V3Section title={t("fx.categorie.h.annees")}>
          <AnneesRail rows={fiche.series ?? []} />
        </V3Section>
      )}

      <V3Section title={fill(t("fx.categorie.h.contrats"), { year: fiche.year })} sub={fiche.nbContrats > fiche.topContrats.length ? fill(t("fx.categorie.h.contrats_top_sub"), { n: fiche.topContrats.length, t: fmtInt(fiche.nbContrats) }) : t("fx.categorie.h.contrats_sub")}>
        {contrats.shown.map(ContratRow)}
        {contrats.rest.length > 0 && <V3Fold text label={t("fx.v3.voir_plus")}>{contrats.rest.map(ContratRow)}</V3Fold>}
      </V3Section>

      <V3Section title={fill(t(fiche.nbTitulaires > fiche.topTitulaires.length ? "fx.categorie.h.titulaires_top" : "fx.categorie.h.titulaires"), { year: fiche.year })} sub={fiche.nbTitulaires > fiche.topTitulaires.length ? fill(t("fx.categorie.h.titulaires_top_sub"), { n: fiche.topTitulaires.length, t: fmtInt(fiche.nbTitulaires) }) : t("fx.categorie.h.titulaires_sub")}>
        <FicheBreakdown
          cap={fiche.topTitulaires.length}
          rows={fiche.topTitulaires.map((tit) => ({
            key: tit.siret || tit.name, label: displayOrgName(tit.name),
            meta: fill(tit.nb > 1 ? t("fx.categorie.contrats_count_many") : t("fx.categorie.contrats_count_one"), { n: tit.nb }),
            value: tit.amount,
            href: tit.siret && isNamedTitulaire(tit.name) ? `${basePath}/marches/fournisseur/${encodeURIComponent(tit.siret)}` : undefined,
          }))}
          format={eurTxt}
        />
      </V3Section>

      {offres && (
        <V3Section title={fill(t("fx.categorie.h.conc"), { year: fiche.year })}>
          <p className="fx-v3-sentence">
            {fill(t(offres.single === 1 ? "fx.categorie.conc_1" : "fx.categorie.conc"), { single: fmtInt(offres.single), known: fmtInt(offres.known) })}
          </p>
        </V3Section>
      )}

      <V3Foot>{t("fx.categorie.note")}</V3Foot>
    </div>
  );
}
