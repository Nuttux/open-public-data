"use client";

import type { BailleurFiche as BailleurFicheType } from "@/lib/fusion-data";
import { cap, fill, fmtBillions, fmtDec, fmtInt, fmtMillions, numLocale } from "@/lib/fmt";
import { useT, useLocale } from "@/lib/localeContext";
import { FicheBreakdown } from "@/components/fiche";
import { V3Amt, V3Fold, V3Foot, V3Hero, V3Lead, V3Row, V3Section, foldRest } from "@/components/fiche/v3";

const EMPRUNTS_CAP = 5;

/**
 * Fiche bailleur v3 (2026-09-03) — sur le kit `fiche/v3`. La fiche la plus
 * dense du site (deux bandeaux KPI, deux tableaux à six colonnes en mono)
 * devient : une phrase, UN chiffre (le capital restant garanti par la Ville)
 * avec taux et durée en ligne grise, « Qui prête » en barres, « Les emprunts
 * les plus lourds » en rangées repliées à cinq, et une note de source.
 */
export default function BailleurFiche({ bailleur }: { bailleur: BailleurFicheType }) {
  const t = useT();
  const { locale } = useLocale();
  const nInt = (n: number) => Number(n).toLocaleString(numLocale(locale));
  const mdLabel = t("fx.s.md_eur");
  const mLabel = t("fx.s.m_eur");
  const fmtAmount = (v: number) => (v >= 1e9 ? { v: fmtBillions(v), u: mdLabel } : { v: fmtMillions(v, 0), u: mLabel });
  const eurTxt = (v: number) => { const f = fmtAmount(v); return `${f.v} ${f.u}`; };
  const g = bailleur.garanties;
  const hasEditorial = Boolean(bailleur.description || bailleur.type || bailleur.share);
  const srcBits = [bailleur.type, bailleur.share != null ? fill(t("fx.fiche.bail.parc"), { share: bailleur.share }) : null].filter(Boolean).join(" · ");

  const opendata = g
    ? `https://opendata.paris.fr/explore/dataset/dette-garantie/table/?refine.annee_de_publication=${g.year}&refine.designation_du_beneficiaire=${encodeURIComponent(g.name_raw)}`
    : null;

  const emprunts = g ? foldRest(g.emprunts_top, EMPRUNTS_CAP) : null;
  const EmpruntRow = (e: NonNullable<typeof g>["emprunts_top"][number], i: number) => {
    const sub = [
      e.preteur,
      e.annee_mobilisation ? fill(t("fx.fiche.bail.mobilise"), { an: e.annee_mobilisation }) : null,
      // La source dit parfois « variable » avec l'index « FIXE » : on suit l'index.
      e.taux_actuariel != null ? (() => {
        const fixe = e.taux_type === "fixe" || (e.taux_index ?? "").toUpperCase() === "FIXE";
        return `${fmtDec(e.taux_actuariel, 2)} % ${fixe ? t("fx.fiche.bg.fixe") : t("fx.fiche.bg.variable")}${!fixe && e.taux_index ? ` (${e.taux_index})` : ""}`;
      })() : null,
      e.duree_residuelle != null ? fill(t("fx.fiche.bail.restants"), { n: fmtDec(e.duree_residuelle, 0) }) : null,
    ].filter(Boolean).join(" · ");
    const prog = e.programme
      ? `${t("fx.fiche.bg.finance")} ${e.programme.adresse}${e.programme.nb_logements ? ` (${fmtInt(e.programme.nb_logements)} ${t("fx.fiche.bg.logts")})` : ""}`
      : null;
    return (
      <V3Row key={i} label={cap(e.objet)} subText={<>{sub}{prog ? <><br />{prog}</> : null}</>} amount={<V3Amt {...fmtAmount(e.capital_restant)} />} />
    );
  };

  return (
    <div className="fx-v3">
      {hasEditorial && bailleur.description ? (
        <V3Lead src={srcBits || undefined}>{cap(bailleur.description)}</V3Lead>
      ) : srcBits ? <p className="fx-v3-lead-src">{srcBits}</p> : null}

      {g && (
        <>
          <V3Hero
            v={fmtAmount(g.capital_restant).v} u={fmtAmount(g.capital_restant).u}
            caption={fill(t("fx.fiche.bail.hero_cap"), { year: g.year })}
            meta={fill(t(g.count_emprunts === 1 ? "fx.fiche.bail.meta1" : "fx.fiche.bail.meta"), { n: nInt(g.count_emprunts), t: fmtDec(g.taux_moyen_pondere_pct, 2), d: fmtDec(g.duree_residuelle_moyenne_ans, 0) })}
          />

          {g.preteurs.length > 0 && (
            <V3Section title={t("fx.fiche.bail.h.qui")} sub={t("fx.fiche.bail.h.qui_sub")}>
              <FicheBreakdown
                rows={g.preteurs.map((p) => ({ key: p.name, label: p.name, value: p.capital_restant, meta: `${nInt(p.count_emprunts)} ${t(p.count_emprunts === 1 ? "fx.arr_log.ops_singular_emprunt" : "fx.fiche.bg.emprunts")} · ${fmtDec(p.share * 100, 0)} %` }))}
                format={eurTxt}
                cap={8}
              />
            </V3Section>
          )}

          {emprunts && emprunts.shown.length > 0 && (
            <V3Section title={t("fx.fiche.bail.h.emprunts")} sub={t("fx.fiche.bail.h.emprunts_sub")}>
              {emprunts.shown.map(EmpruntRow)}
              {emprunts.rest.length > 0 && (
                <V3Fold text label={fill(t("fx.fiche.bail.fold_emprunts"), { n: emprunts.rest.length })}>{emprunts.rest.map((e, i) => EmpruntRow(e, i + EMPRUNTS_CAP))}</V3Fold>
              )}
            </V3Section>
          )}

          <V3Foot>
            {g.financement && g.financement.base_logement > 0 && (
              <>{fill(t("fx.fiche.bg.finance_summary"), { part: fmtInt(g.financement.part_rattachee * 100), n: fmtInt(g.financement.n_programmes) })} </>
            )}
            {fill(t("fx.fiche.bail.foot"), { fixe: fmtInt(g.part_fixe * 100) })}{" "}
            {opendata && <a href={opendata} target="_blank" rel="noopener noreferrer">{t("fx.s.opendata")}</a>}
          </V3Foot>
        </>
      )}

      {!g && hasEditorial && <V3Foot>{t("fx.fiche.bail.avenir")}</V3Foot>}
    </div>
  );
}
