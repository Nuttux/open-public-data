"use client";

import type { ArrondissementGaranties } from "@/lib/fusion-data";
import { cap, fill, fmtBillions, fmtDec, fmtMillions, numLocale } from "@/lib/fmt";
import { slugifyBailleur } from "@/lib/projet-utils";
import { useT, useLocale } from "@/lib/localeContext";
import { useCity } from "./CityContext";
import { FicheBreakdown } from "@/components/fiche";
import { V3Amt, V3Fold, V3Hero, V3Row, V3Section, foldRest } from "@/components/fiche/v3";

type Props = { arr: ArrondissementGaranties; year: number };
const EMPRUNTS_CAP = 5;

/**
 * Garanties d'emprunt d'un arrondissement, v3 (2026-09-03) — la phrase de
 * périmètre, UN chiffre (le capital restant garanti localisé ici), « Principaux
 * bénéficiaires » en barres qui ouvrent la fiche bailleur, « Les emprunts les
 * plus lourds » en rangées repliées à cinq. Plus de bandeau KPI ni de tableaux.
 */
export default function ArrondissementGarantiesFiche({ arr, year }: Props) {
  const t = useT();
  const { locale } = useLocale();
  const { basePath } = useCity();
  const nInt = (n: number) => Number(n).toLocaleString(numLocale(locale));
  const fmtAmount = (v: number) => (v >= 1e9 ? { v: fmtBillions(v), u: t("fx.s.md_eur") } : { v: fmtMillions(v, 0), u: t("fx.s.m_eur") });
  const eurTxt = (v: number) => { const f = fmtAmount(v); return `${f.v} ${f.u}`; };
  const bailleurHref = (name: string) => `${basePath}/dette/bailleur/${encodeURIComponent(slugifyBailleur(name))}`;
  const emprunts = foldRest(arr.emprunts_top, EMPRUNTS_CAP);
  const EmpruntRow = (e: (typeof arr.emprunts_top)[number], i: number) => (
    <V3Row key={i} href={bailleurHref(e.beneficiaire)} label={cap(e.objet)}
      subText={[e.beneficiaire, e.preteur, e.annee_mobilisation ? fill(t("fx.fiche.bail.mobilise"), { an: e.annee_mobilisation }) : null,
        e.taux_actuariel != null ? `${fmtDec(e.taux_actuariel, 2)} % ${e.taux_type === "fixe" ? t("fx.fiche.bg.fixe") : t("fx.fiche.bg.variable")}` : null].filter(Boolean).join(" · ")}
      amount={<V3Amt {...fmtAmount(e.capital_restant)} />} />
  );

  return (
    <div className="fx-v3">
      <p className="fx-v3-lead-src">{t("fx.ag.sub")}</p>

      <V3Hero
        v={fmtAmount(arr.capital_restant).v} u={fmtAmount(arr.capital_restant).u}
        caption={fill(t("fx.fiche.bail.hero_cap"), { year })}
        meta={fill(t("fx.ag.meta"), { n: nInt(arr.count_emprunts), share: fmtDec(arr.share_of_localized * 100, 1) })}
      />

      {arr.top_beneficiaires.length > 0 && (
        <V3Section title={t("fx.ag.h.benef")} sub={t("fx.ag.h.benef_sub")}>
          <FicheBreakdown
            cap={arr.top_beneficiaires.length}
            rows={arr.top_beneficiaires.map((b) => ({ key: b.name, label: b.name, value: b.capital_restant, href: bailleurHref(b.name), meta: `${nInt(b.count_emprunts)} ${t(b.count_emprunts === 1 ? "fx.arr_log.ops_singular_emprunt" : "fx.fiche.bg.emprunts")} · ${fmtDec(b.share_of_arr * 100, 0)} %` }))}
            format={eurTxt}
          />
        </V3Section>
      )}

      {emprunts.shown.length > 0 && (
        <V3Section title={t("fx.ag.h.emprunts")} sub={t("fx.ag.h.emprunts_sub")}>
          {emprunts.shown.map(EmpruntRow)}
          {emprunts.rest.length > 0 && <V3Fold text label={fill(t("fx.ag.fold"), { n: emprunts.rest.length })}>{emprunts.rest.map((e, i) => EmpruntRow(e, i + EMPRUNTS_CAP))}</V3Fold>}
        </V3Section>
      )}
    </div>
  );
}
