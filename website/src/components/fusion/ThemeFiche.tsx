"use client";

import type { ThemeSubventionsFiche } from "@/lib/fusion-data";
import { fill } from "@/lib/fmt";
import { useT } from "@/lib/localeContext";
import { useCity } from "./CityContext";
import { FicheBreakdown } from "@/components/fiche";
import { V3Foot, V3Hero, V3Section } from "@/components/fiche/v3";
import YearBars from "./YearBars";
import AnneesRail, { RAIL_MIN } from "./AnneesRail";
import { assocSlug } from "@/lib/assoc-slug";
import { useFmt } from "@/lib/use-fmt";
import { displayOrgName } from "@/lib/fournisseur-display";


/**
 * Fiche thème de subventions v3 (2026-09-03) — UN chiffre (le versé dans le
 * thème cette année-là) avec part, bénéficiaires et subventions en ligne
 * grise, « Les plus gros bénéficiaires » en barres (chaque ligne ouvre la
 * fiche), « Année par année », une note. Plus de bandeau KPI.
 */
export default function ThemeFiche({ fiche }: { fiche: ThemeSubventionsFiche }) {
  const t = useT();
  const { fmtInt, fmtCompactEur } = useFmt();
  const { basePath } = useCity();
  const total = fmtCompactEur(fiche.total);
  const eurTxt = (n: number) => { const { value, unit } = fmtCompactEur(n); return `${value} ${unit}`; };
  const evo = fiche.evolution.slice().reverse().map((e) => ({ year: e.year, amount: e.amount, count: e.count }));

  return (
    <div className="fx-v3">
      <V3Hero
        v={total.value} u={total.unit}
        caption={fill(t("fx.fiche.theme.hero_cap"), { theme: fiche.theme, year: fiche.year })}
        meta={<>{fill(t("fx.fiche.theme.meta"), { share: Math.round(fiche.shareOfTotalPct), benef: fmtInt(fiche.nbBeneficiaires) })}{fiche.nbSubventions !== fiche.nbBeneficiaires ? fill(t("fx.fiche.theme.meta_subv"), { n: fmtInt(fiche.nbSubventions) }) : ""}</>}
      />

      <V3Section title={fill(t("fx.fiche.theme.h.top"), { year: fiche.year })} sub={fiche.nbBeneficiaires > fiche.topBeneficiaires.length ? fill(t("fx.fiche.theme.h.top_sub_n"), { n: fiche.topBeneficiaires.length, t: fmtInt(fiche.nbBeneficiaires) }) : t("fx.fiche.theme.h.top_sub")}>
        <FicheBreakdown
          cap={fiche.topBeneficiaires.length}
          rows={fiche.topBeneficiaires.map((b) => ({ key: b.name, label: displayOrgName(b.name), meta: b.direction ?? undefined, value: b.amount, href: `${basePath}/subventions/association/${assocSlug(b.name)}` }))}
          format={eurTxt}
        />
      </V3Section>

      {evo.length > 1 && (
        <V3Section title={t("fx.fiche.theme.h.annees")}>
          {evo.length >= RAIL_MIN
            ? <AnneesRail rows={evo} countText={(r) => fill(t("fx.fiche.theme.subv_n"), { n: fmtInt(r.count ?? 0) })} />
            : <YearBars rows={evo} countLabel={(y) => <span className="muted">{fill(t("fx.fiche.theme.subv_n"), { n: fmtInt(y.count ?? 0) })}</span>} />}
        </V3Section>
      )}

      <V3Foot>{t("fx.fiche.theme.note")}</V3Foot>
    </div>
  );
}
