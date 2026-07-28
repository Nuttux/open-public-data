"use client";

import Link from "next/link";
import Tip from "@/components/fusion/Tip";
import { FicheBreakdown, FicheMore, FicheYearBars } from "@/components/fiche";
import { fmtUsd, fmtUsdCompact, fmtShare } from "@/lib/us/format";
import type { SfPayrollDeptData } from "@/lib/us/sf-payroll-entities";

/**
 * Department fiche, PAYROLL lens — the sibling of SfDeptContractsFiche.
 *
 * It exists for the same reason: clicking a department on the payroll page
 * used to open its BUDGET fiche, a different register answering a different
 * question, with no payroll in sight. A department row inside payroll now
 * answers the payroll question — what it pays, to how many people, how much of
 * that is overtime, and which kinds of work — and offers the budget as one
 * labelled link out.
 *
 * Every figure is a sum over exported rows, already privacy-pooled upstream.
 */

const nfInt = new Intl.NumberFormat("en-US");
const FAMILY_SHOWN = 6;

export default function SfPayrollDeptFiche({ d }: { d: SfPayrollDeptData }) {
  const { latest, first, cityMedianUsd } = d;
  const medianGap =
    cityMedianUsd && cityMedianUsd > 0
      ? latest.median_total_comp_usd / cityMedianUsd - 1
      : null;

  const familyRows = d.families.map((f) => ({
    key: f.display_family,
    label: f.display_family,
    meta: `${nfInt.format(f.n_employees)} people${
      f.overtime_usd > 0 ? ` · ${fmtUsdCompact(f.overtime_usd)} overtime` : ""
    }`,
    value: f.total_compensation_usd,
    href: f.href ?? undefined,
  }));

  return (
    <div>
      <div className="fx-fiche-kpis">
        <div className="fx-fiche-kpi">
          <div className="fx-fiche-kpi-label">
            <Tip label="Salary + overtime + other pay + benefits, for everyone this department paid in the fiscal year.">
              Total compensation, FY{d.fiscalYear}
            </Tip>
          </div>
          <div className="fx-fiche-kpi-value tnum">
            {fmtUsdCompact(latest.total_compensation_usd)}
          </div>
          {d.shareOfCityPayroll != null && (
            <div className="fx-fiche-kpi-note">
              {fmtShare(d.shareOfCityPayroll)} of the city payroll
            </div>
          )}
        </div>
        <div className="fx-fiche-kpi">
          <div className="fx-fiche-kpi-label">People paid</div>
          <div className="fx-fiche-kpi-value tnum">{nfInt.format(latest.n_employees)}</div>
          <div className="fx-fiche-kpi-note">
            {nfInt.format(first.n_employees)} in FY{first.fiscal_year}
          </div>
        </div>
        <div className="fx-fiche-kpi">
          <div className="fx-fiche-kpi-label">
            <Tip label="Half of this department's people cost more than this, half less — benefits included. Part-time and partial-year staff pull a median down.">
              Median per person
            </Tip>
          </div>
          <div className="fx-fiche-kpi-value tnum">
            {fmtUsd(latest.median_total_comp_usd)}
          </div>
          {medianGap != null && (
            <div className="fx-fiche-kpi-note">
              {medianGap >= 0 ? "+" : "−"}
              {Math.abs(medianGap * 100).toFixed(0)}% vs the citywide median
            </div>
          )}
        </div>
        <div className="fx-fiche-kpi">
          <div className="fx-fiche-kpi-label">
            <Tip label="Overtime as a share of this department's total compensation — salary, overtime, other pay and benefits.">
              Paid as overtime
            </Tip>
          </div>
          <div className="fx-fiche-kpi-value tnum">{fmtShare(latest.ot_share_of_comp)}</div>
          <div className="fx-fiche-kpi-note">
            {fmtUsdCompact(latest.overtime_usd)} in FY{d.fiscalYear}
          </div>
        </div>
      </div>

      {d.series.length > 1 && (
        <section className="fx-fiche-section">
          <div className="fx-fiche-h">
            Compensation, FY{first.fiscal_year}–FY{d.fiscalYear}
          </div>
          <FicheYearBars
            points={d.series.map((p) => ({
              year: p.fiscal_year,
              value: p.total_compensation_usd,
            }))}
            format={(n) => fmtUsdCompact(n)}
          />
          <p className="fx-fiche-sub" style={{ marginTop: 8 }}>
            {fmtUsdCompact(first.total_compensation_usd)} in FY{first.fiscal_year} →{" "}
            {fmtUsdCompact(latest.total_compensation_usd)} in FY{d.fiscalYear}, with{" "}
            {nfInt.format(first.n_employees)} → {nfInt.format(latest.n_employees)} people. Nominal
            dollars, not inflation-adjusted.
          </p>
        </section>
      )}

      {familyRows.length > 0 && (
        <section className="fx-fiche-section">
          <div className="fx-fiche-h">What kind of work — FY{d.fiscalYear}</div>
          <FicheBreakdown
            rows={familyRows}
            format={(n) => fmtUsdCompact(n)}
            cap={FAMILY_SHOWN}
          />
          <FicheMore count={familyRows.length - FAMILY_SHOWN} noun="smaller job families">
            <FicheBreakdown
              rows={familyRows.slice(FAMILY_SHOWN)}
              format={(n) => fmtUsdCompact(n)}
              cap={familyRows.length}
            />
          </FicheMore>
        </section>
      )}

      <section className="fx-fiche-section">
        <div className="fx-fiche-h">Elsewhere on this department</div>
        <p style={{ fontSize: 13.5, color: "var(--ink-2)", lineHeight: 1.55, margin: 0 }}>
          Payroll is what the department pays its own people; the budget is everything it is
          appropriated and spends, salaries included. The two answer different questions and do not
          add up.{" "}
          <Link
            href={d.areaHref}
            scroll={false}
            style={{ color: "var(--bleu)", borderBottom: "1px solid var(--bleu)" }}
          >
            {d.organizationGroup} →
          </Link>
          {d.budgetHref && (
            <>
              {" · "}
              <Link
                href={d.budgetHref}
                scroll={false}
                style={{ color: "var(--bleu)", borderBottom: "1px solid var(--bleu)" }}
              >
                Its budget →
              </Link>
            </>
          )}
        </p>
      </section>

      <section className="fx-fiche-section">
        <div className="fx-fiche-h">Source</div>
        <p style={{ fontSize: 13.5, color: "var(--ink-2)", lineHeight: 1.55, margin: 0 }}>
          Every figure is a sum over the Controller&rsquo;s employee-compensation data, grouped on
          the source&rsquo;s own department code{" "}
          <code style={{ fontFamily: "var(--f-mono)", fontSize: 12 }}>{d.code}</code>.{" "}
          <a
            href={d.source.source_url}
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: "var(--bleu)", borderBottom: "1px solid var(--bleu)" }}
          >
            {d.source.name} ↗
          </a>
        </p>
        <p style={{ fontSize: 12, color: "var(--muted)", lineHeight: 1.5, margin: "10px 0 0" }}>
          {d.keyingNote} {d.privacyRule}
        </p>
      </section>
    </div>
  );
}
