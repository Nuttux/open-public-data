"use client";

import Link from "next/link";
import Tip from "@/components/fusion/Tip";
import { FicheBreakdown, FicheMore, FicheYearBars } from "@/components/fiche";
import { fmtUsd, fmtUsdCompact, fmtShare } from "@/lib/us/format";
import type { SfPayrollAreaData } from "@/lib/us/sf-payroll-entities";

/**
 * Service-area fiche — the entity behind each segment of the payroll
 * composition bar. It is the level the City itself organises departments at
 * ("Public Protection", "Community Health"), and it is where the page's
 * former wall of department rows now lives: click the slice, get its
 * departments ranked, with their medians and overtime, each opening its own
 * payroll fiche.
 *
 * Every figure is a sum over exported rows. Department-years below the
 * publication threshold are folded into citywide totals upstream and are not
 * listed here — the fold note says so rather than leaving a silent gap.
 */

const nfInt = new Intl.NumberFormat("en-US");
const DEPT_SHOWN = 6;
const FAMILY_SHOWN = 6;

export default function SfPayrollAreaFiche({ d }: { d: SfPayrollAreaData }) {
  const { latest, first } = d;

  const deptRows = d.departments.map((dep) => ({
    key: dep.code,
    label: dep.name,
    meta: `${nfInt.format(dep.n_employees)} people · median ${fmtUsd(
      dep.median_total_comp_usd,
    )} · ${fmtShare(dep.ot_share_of_comp)} overtime`,
    value: dep.total_compensation_usd,
    href: dep.href,
  }));

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
            <Tip label="Salary + overtime + other pay + benefits, for everyone paid by the departments in this service area.">
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
          <div className="fx-fiche-kpi-value tnum">
            {nfInt.format(latest.n_employees_listed)}
          </div>
          <div className="fx-fiche-kpi-note">
            {nfInt.format(first.n_employees_listed)} in FY{first.fiscal_year}
          </div>
        </div>
        <div className="fx-fiche-kpi">
          <div className="fx-fiche-kpi-label">Departments</div>
          <div className="fx-fiche-kpi-value tnum">{nfInt.format(latest.n_departments)}</div>
        </div>
        <div className="fx-fiche-kpi">
          <div className="fx-fiche-kpi-label">
            <Tip label="Overtime as a share of this service area's total compensation.">
              Paid as overtime
            </Tip>
          </div>
          <div className="fx-fiche-kpi-value tnum">
            {latest.total_compensation_usd > 0
              ? fmtShare(latest.overtime_usd / latest.total_compensation_usd)
              : "—"}
          </div>
          <div className="fx-fiche-kpi-note">{fmtUsdCompact(latest.overtime_usd)}</div>
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
            {fmtUsdCompact(latest.total_compensation_usd)} in FY{d.fiscalYear}. Nominal dollars, not
            inflation-adjusted.
          </p>
        </section>
      )}

      {/* One department means the breakdown would just restate the KPI band —
       *  say it in a line and link out instead. */}
      {d.departments.length === 1 ? (
        <p className="fx-note">
          This service area is a single department,{" "}
          <Link
            href={d.departments[0].href}
            scroll={false}
            style={{ color: "var(--bleu)", borderBottom: "1px solid var(--bleu)" }}
          >
            {d.departments[0].name}
          </Link>
          .
        </p>
      ) : (
        deptRows.length > 0 && (
          <section className="fx-fiche-section">
            <div className="fx-fiche-h">Departments in this area — FY{d.fiscalYear}</div>
            <FicheBreakdown rows={deptRows} format={(n) => fmtUsdCompact(n)} cap={DEPT_SHOWN} />
            <FicheMore count={deptRows.length - DEPT_SHOWN} noun="smaller departments">
              <FicheBreakdown
                rows={deptRows.slice(DEPT_SHOWN)}
                format={(n) => fmtUsdCompact(n)}
                cap={deptRows.length}
              />
            </FicheMore>
            <p className="fx-fiche-sub" style={{ marginTop: 10 }}>
              {d.foldNote}
            </p>
          </section>
        )
      )}

      {familyRows.length > 0 && (
        <section className="fx-fiche-section">
          <div className="fx-fiche-h">What kind of work — FY{d.fiscalYear}</div>
          <FicheBreakdown rows={familyRows} format={(n) => fmtUsdCompact(n)} cap={FAMILY_SHOWN} />
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
        <div className="fx-fiche-h">Source</div>
        <p style={{ fontSize: 13.5, color: "var(--ink-2)", lineHeight: 1.55, margin: 0 }}>
          Every figure is a sum over the Controller&rsquo;s employee-compensation data, grouped on
          the source&rsquo;s own organisation group{" "}
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
          {d.privacyRule}
        </p>
      </section>
    </div>
  );
}
