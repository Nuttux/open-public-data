"use client";

import type { MarchesOffresFiche } from "@/lib/fusion-data";
import { fill } from "@/lib/fmt";
import { cutObjet, rowObjet } from "@/lib/objet-normalizer";
import { isNamedTitulaire } from "@/lib/marches-shape";
import { displayOrgName } from "@/lib/fournisseur-display";
import { useT, useLocale } from "@/lib/localeContext";
import { V3Fold, V3Foot, V3Hero, V3Row, V3Section, foldRest } from "@/components/fiche/v3";
import { useCity } from "./CityContext";
import { useFmt } from "@/lib/use-fmt";

/**
 * La fiche derrière une barre « par nombre d'offres » de la page Contrats
 * publics : UN chiffre (les contrats de l'année signés avec autant d'offres
 * reçues, en montants maximums), la ligne grise qui dit sur combien de
 * contrats couverts, les plus gros contrats (un lot partagé = une ligne),
 * les autres années où la découpe existe, la source.
 */
export default function OffresFiche({ fiche }: { fiche: MarchesOffresFiche }) {
  const t = useT();
  const { fmtInt, fmtCompactEur } = useFmt();
  const { locale } = useLocale();
  const { basePath } = useCity();
  const total = fmtCompactEur(fiche.total);
  const Amt = ({ n }: { n: number }) => { const f = fmtCompactEur(n); return <span className="fx-v3-amt tnum" style={{ fontSize: 14 }}>{f.value}<span className="u">{f.unit}</span></span>; };
  const contrats = foldRest(fiche.topContrats, 6);
  const ContratRow = (c: MarchesOffresFiche["topContrats"][number]) => {
    const preferred = locale === "en" && c.objetClairEn ? c.objetClairEn : c.objetClair;
    const { title, detail } = preferred ? { title: cutObjet(preferred, 96), detail: null } : rowObjet(c.objet || "");
    const named = (c.titulaires ?? []).filter((n) => isNamedTitulaire(n)).map((n) => displayOrgName(n));
    const extra = named.length - 2;
    const who = extra > 0
      ? fill(t(extra === 1 ? "fx.categorie.titulaires_more_one" : "fx.categorie.titulaires_more"), { names: named.slice(0, 2).join(", "), n: extra })
      : named.join(", ");
    return (
      <V3Row key={c.numero || title} href={c.numero ? `${basePath}/marches/contrat/${encodeURIComponent(c.numero)}` : null}
        label={title} subText={[detail, who || t("fx.sec.mp.holder_unknown")].filter(Boolean).join(" · ")} amount={<Amt n={c.montant} />} />
    );
  };
  const otherYears = fiche.years.filter((y) => y !== fiche.year);
  const latest = fiche.years[fiche.years.length - 1];
  const hrefFor = (y: number) => `${basePath}/marches/offres/${y === latest ? fiche.slug : `${fiche.slug}-${y}`}`;

  return (
    <div className="fx-v3">
      <V3Hero
        v={total.value} u={total.unit}
        caption={fill(t(`fx.offres.cap.${fiche.bucket}`), { year: fiche.year })}
        meta={fill(t("fx.offres.meta"), { n: fmtInt(fiche.count), known: fmtInt(fiche.known), year: fiche.year })}
      />

      <V3Section id="contracts" title={fill(t("fx.offres.h.contrats"), { year: fiche.year })} sub={fiche.count > fiche.topContrats.length ? fill(t("fx.offres.h.contrats_sub"), { n: fiche.topContrats.length, t: fmtInt(fiche.count) }) : undefined}>
        {contrats.shown.map(ContratRow)}
        {contrats.rest.length > 0 && <V3Fold id="more-contracts" text label={t("fx.v3.voir_plus")}>{contrats.rest.map(ContratRow)}</V3Fold>}
      </V3Section>

      {otherYears.length > 0 && (
        <V3Section id="years" title={t("fx.offres.h.years")}>
          {otherYears.map((y) => (
            <V3Row key={y} href={hrefFor(y)} label={fill(t("fx.offres.year_row"), { year: y })} />
          ))}
        </V3Section>
      )}

      <V3Foot>{t("fx.offres.note")}</V3Foot>
    </div>
  );
}
