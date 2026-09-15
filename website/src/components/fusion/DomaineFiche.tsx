"use client";

import type { MarchesDomaineFiche } from "@/lib/fusion-data";
import { fill } from "@/lib/fmt";
import { cutObjet, rowObjet } from "@/lib/objet-normalizer";
import { isNamedTitulaire } from "@/lib/marches-shape";
import { displayOrgName } from "@/lib/fournisseur-display";
import { useT, useLocale } from "@/lib/localeContext";
import { V3Fold, V3Foot, V3Hero, V3Row, V3Section, foldRest } from "@/components/fiche/v3";
import AnneesRail, { RAIL_MIN } from "@/components/fusion/AnneesRail";
import { useCity } from "./CityContext";
import { useFmt } from "@/lib/use-fmt";

/**
 * La fiche derrière une barre « par domaine » de la page Contrats publics :
 * UN chiffre (les contrats de l'année dans ce domaine, en montants maximums),
 * sa part de l'année, le domaine année par année sur le même axe quelle que
 * soit la source, les plus gros contrats (un lot partagé = une ligne), les
 * principaux titulaires, la note qui dit ce qu'est un domaine.
 */
export default function DomaineFiche({ fiche }: { fiche: MarchesDomaineFiche }) {
  const t = useT();
  const fmt = useFmt();
  const { fmtCompactEur, fmtDec } = fmt;
  // A visible thousands space in running text (Inter draws the narrow one as nothing).
  const fmtInt = (n: number) => fmt.fmtInt(n).replace(/ /g, " ");
  const { locale } = useLocale();
  const { basePath } = useCity();
  const total = fmtCompactEur(fiche.total);
  const Amt = ({ n }: { n: number }) => { const f = fmtCompactEur(n); return <span className="fx-v3-amt tnum" style={{ fontSize: 14 }}>{f.value}<span className="u">{f.unit}</span></span>; };
  const contrats = foldRest(fiche.topContrats, 6);
  const ContratRow = (c: MarchesDomaineFiche["topContrats"][number]) => {
    const preferred = locale === "en" && c.objetClairEn ? c.objetClairEn : c.objetClair;
    const { title, detail } = preferred ? { title: cutObjet(preferred, 96), detail: null } : rowObjet(c.objet || "");
    const named = (c.titulaires ?? []).filter((n) => isNamedTitulaire(n)).map((n) => displayOrgName(n));
    const extra = named.length - 2;
    const who = extra > 0
      ? fill(t(extra === 1 ? "fx.categorie.titulaires_more_one" : "fx.categorie.titulaires_more"), { names: named.slice(0, 2).join(", "), n: extra })
      : named.join(", ");
    return (
      <V3Row key={c.numero || title} href={c.numero ? `${basePath}/marches/contrat/${encodeURIComponent(c.numero)}` : null}
        label={title} subText={[detail, who || (c.fournisseur === "MARCHE MULTIATTRIBUTAIRE" ? t("fx.sec.mp.multi_holders") : t("fx.sec.mp.holder_unknown"))].filter(Boolean).join(" · ")} amount={<Amt n={c.montant} />} />
    );
  };

  return (
    <div className="fx-v3">
      <V3Hero
        v={total.value} u={total.unit}
        caption={fill(t("fx.domaine.cap"), { year: fiche.year })}
        meta={fill(t("fx.domaine.meta"), { n: fmtInt(fiche.count), t: fmtInt(fiche.nbTitulaires), pct: fmtDec(fiche.shareOfTotalPct, 0) })}
      />

      {fiche.series.length >= RAIL_MIN && (
        <V3Section id="years" title={t("fx.domaine.h.years")} sub={t("fx.domaine.years_sub")}>
          <AnneesRail rows={fiche.series.map((s) => ({ year: s.year, amount: s.amount, count: s.count }))} current={fiche.year} />
        </V3Section>
      )}

      <V3Section id="contracts" title={fill(t("fx.domaine.h.contrats"), { year: fiche.year })} sub={fiche.count > fiche.topContrats.length ? fill(t("fx.domaine.h.contrats_sub"), { n: fiche.topContrats.length, t: fmtInt(fiche.count) }) : undefined}>
        {contrats.shown.map(ContratRow)}
        {contrats.rest.length > 0 && <V3Fold id="more-contracts" text label={t("fx.v3.voir_plus")}>{contrats.rest.map(ContratRow)}</V3Fold>}
      </V3Section>

      {fiche.topTitulaires.length > 0 && (
        <V3Section id="holders" title={fill(t("fx.domaine.h.titulaires"), { year: fiche.year })}>
          {fiche.topTitulaires.map((h) => (
            <V3Row key={h.siret || h.name} href={h.siret ? `${basePath}/marches/fournisseur/${encodeURIComponent(h.siret)}` : null}
              label={displayOrgName(h.name)} subText={fill(t("fx.domaine.titulaire_sub"), { n: fmtInt(h.nb) })} amount={<Amt n={h.amount} />} />
          ))}
        </V3Section>
      )}

      <V3Foot>{t("fx.domaine.note")}</V3Foot>
    </div>
  );
}
