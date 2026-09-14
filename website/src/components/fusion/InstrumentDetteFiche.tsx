"use client";

import type { BondIssuance, DetteInstrument } from "@/lib/fusion-data";
import { fill } from "@/lib/fmt";
import { useT, useLocale } from "@/lib/localeContext";
import { trLabel } from "@/lib/label-translate";
import { useFmt } from "@/lib/use-fmt";
import { V3Amt, V3Fold, V3Foot, V3Hero, V3Lead, V3Row, V3Section, foldRest } from "@/components/fiche/v3";

type Props = {
  instrument: DetteInstrument;
  year: number;
  bondIssuances?: BondIssuance[];
};

const EMISSIONS_CAP = 6;

/**
 * Fiche instrument de dette v3 (2026-09-13), sur le kit `fiche/v3` comme les
 * autres fiches Paris. Avant : un paragraphe en mono, un bandeau KPI à quatre
 * cellules, un tableau à cinq colonnes et le montant répété dans le titre.
 * Maintenant : la phrase de la source, UN chiffre (l'encours) avec la part,
 * le taux, la durée restante et la part à taux fixe en ligne grise, les
 * emprunts obligataires en rangées repliées à six, l'explication dans un
 * dépliant et les limites en pied.
 */
export default function InstrumentDetteFiche({ instrument, year, bondIssuances }: Props) {
  const t = useT();
  const { fmtInt, fmtDec, fmtBillions, fmtMillions } = useFmt();
  const { locale } = useLocale();

  const hero = instrument.encours >= 1e9
    ? { v: fmtBillions(instrument.encours), u: t("fx.s.md_eur") }
    : { v: fmtMillions(instrument.encours, 0), u: t("fx.s.m_eur") };
  const issuances = instrument.key === "obligataire" && bondIssuances?.length
    ? bondIssuances.slice().sort((a, b) => b.year - a.year)
    : [];
  const folded = foldRest(issuances, EMISSIONS_CAP);
  const description = trLabel(instrument.description, locale);
  const subtitle = trLabel(instrument.subtitle, locale);

  const Row = (b: BondIssuance, i: number) => (
    <V3Row
      key={`${b.year}-${i}`}
      label={b.label}
      subText={[fill(t("fx.fiche.instr.emission_sub"), { year: b.year, rate: fmtDec(b.rate_pct, 2), mat: b.maturity_years }), b.meta].filter(Boolean).join(" · ")}
      amount={<V3Amt v={fmtInt(b.amount_m_eur)} u={t("fx.s.m_eur")} />}
    />
  );

  return (
    <div className="fx-v3">
      {description ? <V3Lead src={subtitle || undefined}>{description}</V3Lead> : subtitle ? <p className="fx-v3-lead-src">{subtitle}</p> : null}

      <V3Hero
        v={hero.v} u={hero.u}
        caption={fill(t("fx.fiche.instr.hero_cap"), { year })}
        meta={fill(t("fx.fiche.instr.meta"), {
          pct: fmtInt(instrument.part * 100),
          taux: fmtDec(instrument.taux_moyen_pct, 1),
          mat: fmtDec(instrument.maturite_moyenne_ans, 1),
          fixe: fmtInt(instrument.part_taux_fixe * 100),
        })}
      />

      {issuances.length > 0 && (
        <V3Section title={t("fx.fiche.instr.h.emissions")} sub={t("fx.fiche.instr.emissions_desc")}>
          {folded.shown.map(Row)}
          {folded.rest.length > 0 && (
            <V3Fold text label={fill(t("fx.fiche.instr.fold_emissions"), { n: folded.rest.length })}>
              {folded.rest.map((b, i) => Row(b, i + EMISSIONS_CAP))}
            </V3Fold>
          )}
          <V3Foot>{fill(t("fx.fiche.instr.emissions_total"), { n: issuances.length, m: fmtInt(issuances.reduce((s, b) => s + b.amount_m_eur, 0)) })}</V3Foot>
        </V3Section>
      )}

      {issuances.length === 0 && instrument.key !== "obligataire" && (
        <V3Section title={t("fx.fiche.instr.h.detail")}>
          <p className="fx-v3-sentence" style={{ color: "var(--muted)" }}>
            {fill(t("fx.fiche.instr.no_detail_desc"), { label: trLabel(instrument.label, locale).toLowerCase() })}
          </p>
        </V3Section>
      )}

      <V3Fold text label={t("fx.fiche.instr.meaning")}>
        <p className="fx-v3-sentence">{fill(t("fx.fiche.instr.meaning_p1"), { pct: fmtInt(instrument.part * 100), taux: fmtDec(instrument.taux_moyen_pct, 1) })}</p>
        <p className="fx-v3-sentence">{fill(t("fx.fiche.instr.meaning_p2"), { mat: fmtDec(instrument.maturite_moyenne_ans, 1) })}</p>
      </V3Fold>

      <V3Foot>
        {t("fx.fiche.instr.limites_desc")}{" "}
        <a href="/methode?tool=dette-patrimoine#outils">{t("fx.fiche.instr.methode_link")}</a>
        {" · "}
        <a href={`/data/patrimoine_structure_${year}.json`} target="_blank" rel="noopener noreferrer">{t("fx.fiche.instr.json")}</a>
      </V3Foot>
    </div>
  );
}
