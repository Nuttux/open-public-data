"use client";

import type { PatrimoineMasse } from "@/lib/fusion-data";
import { fill } from "@/lib/fmt";
import { useT, useLocale } from "@/lib/localeContext";
import { trLabel } from "@/lib/label-translate";
import { PARIS_POPULATION } from "@/lib/methodology";
import { useFmt } from "@/lib/use-fmt";
import { V3Amt, V3Fold, V3Foot, V3Hero, V3Lead, V3Row, V3Section, foldRest } from "@/components/fiche/v3";

type Props = {
  masse: PatrimoineMasse;
  /** Année du bilan. */
  year?: number;
};

const SUBITEMS_CAP = 6;

/**
 * Fiche masse du bilan v3 (2026-09-13), sur le kit `fiche/v3`. Avant : une
 * ligne en mono, un bandeau KPI à quatre cellules (dont « Sous-postes : 13 »),
 * un tableau à cinq colonnes et le montant répété dans le titre. Maintenant :
 * ce que la masse recouvre en une phrase, UN chiffre (la valeur nette) avec
 * la part et le montant par habitant en ligne grise, les sous-postes en
 * rangées repliées à six, les limites en pied.
 */
export default function MasseFiche({ masse, year }: Props) {
  const t = useT();
  const { fmtInt, fmtDec, fmtBillions, fmtMillions } = useFmt();
  const { locale } = useLocale();

  const amt = (n: number) => (n >= 1e9
    ? { v: fmtBillions(n), u: t("fx.s.md_eur") }
    : n >= 1e6 ? { v: fmtMillions(n, 0), u: t("fx.s.m_eur") } : { v: fmtInt(n), u: "€" });
  const eurTxt = (n: number) => { const a = amt(n); return `${a.v} ${a.u}`; };
  const hero = amt(masse.value);
  const total = masse.subitems.reduce((s, i) => s + i.value, 0);
  const items = foldRest(masse.subitems, SUBITEMS_CAP);
  const lead = trLabel(masse.details, locale) || t("fx.fiche.masse.no_detail");
  const sub = trLabel(masse.sub, locale);

  const Row = (s: PatrimoineMasse["subitems"][number], i: number) => (
    <V3Row
      key={`${s.name}-${i}`}
      label={trLabel(s.name, locale)}
      subText={s.amort > 0
        ? fill(t("fx.fiche.masse.brut_amort"), { brut: eurTxt(s.brut), amort: eurTxt(s.amort) })
        : fill(t("fx.fiche.masse.part_of"), { pct: fmtDec(total > 0 ? (s.value / total) * 100 : 0, 1) })}
      amount={<V3Amt {...amt(s.value)} />}
    />
  );

  return (
    <div className="fx-v3">
      <V3Lead src={sub || undefined}>{lead}</V3Lead>

      <V3Hero
        v={hero.v} u={hero.u}
        caption={fill(t("fx.fiche.masse.hero_cap"), { year: year ?? "" })}
        meta={fill(t(masse.side === "actif" ? "fx.fiche.masse.meta_actif" : "fx.fiche.masse.meta_passif"), {
          share: fmtDec(masse.share * 100, 1),
          hab: fmtInt(masse.value / PARIS_POPULATION),
        })}
      />

      {masse.subitems.length > 0 && (
        <V3Section title={t("fx.fiche.masse.h.contenu")} sub={fill(t("fx.fiche.masse.h.contenu_sub"), { n: masse.subitems.length })}>
          {items.shown.map(Row)}
          {items.rest.length > 0 && (
            <V3Fold text label={fill(t("fx.fiche.masse.fold"), { n: items.rest.length })}>
              {items.rest.map((s, i) => Row(s, i + SUBITEMS_CAP))}
            </V3Fold>
          )}
        </V3Section>
      )}

      <V3Foot>{t("fx.fiche.masse.limites_desc")}</V3Foot>
    </div>
  );
}
