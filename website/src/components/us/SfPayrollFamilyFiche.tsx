"use client";

import Link from "next/link";
import Tip from "@/components/fusion/Tip";
import { FicheBreakdown, FicheMore, FicheYearBars } from "@/components/fiche";
import { fmtUsd, fmtUsdCompact, fmtShare } from "@/lib/us/format";
import type { SfPayrollFamilyData } from "@/lib/us/sf-payroll-family";

/**
 * Job-family fiche — the payroll facet, on the same spine as the department
 * and service-area fiches: KPI band, what it pays per person, the trajectory,
 * the departments that employ it, the source job codes it groups.
 *
 * Two things it used to be missing:
 *  - a PER-PERSON figure. It could say a family cost $1.1B without ever
 *    saying what one of those jobs pays; the pay band is now the second
 *    block, and it is the same exact percentile data as the page's ladder.
 *  - in-domain links. Its department rows opened BUDGET fiches — a different
 *    register answering a different question. They open payroll fiches now.
 *
 * Every figure is a sum of exported rows already pooled for privacy; nothing
 * is recomputed from individual-level data.
 */

const nfInt = new Intl.NumberFormat("en-US");
const ROLE_SHOWN = 6;
const DEPT_SHOWN = 6;

export default function SfPayrollFamilyFiche({ d }: { d: SfPayrollFamilyData }) {
  const first = d.series[0];
  const medianGap =
    d.pay && d.pay.cityMedianUsd && d.pay.cityMedianUsd > 0
      ? d.pay.p50_usd / d.pay.cityMedianUsd - 1
      : null;

  const deptRows = d.departments.map((dep) => ({
    key: dep.code,
    label: dep.name,
    meta: `${nfInt.format(dep.n_employees)} people${
      dep.overtime_usd > 0 ? ` · ${fmtUsdCompact(dep.overtime_usd)} overtime` : ""
    }`,
    value: dep.total_compensation_usd,
    href: dep.href,
  }));

  const roleRows = d.roles.map((r) => ({
    key: r.label,
    label: r.label,
    meta: `${nfInt.format(r.n_employees)} people`,
    value: r.total_compensation_usd,
    href: r.href ?? undefined,
  }));

  return (
    <div>
      <div className="fx-fiche-kpis">
        <div className="fx-fiche-kpi">
          <div className="fx-fiche-kpi-label">Total compensation, FY{d.fiscalYear}</div>
          <div className="fx-fiche-kpi-value tnum">
            {fmtUsdCompact(d.latest.total_compensation_usd)}
          </div>
          {d.shareOfCityPayroll != null && (
            <div className="fx-fiche-kpi-note">
              {fmtShare(d.shareOfCityPayroll)} of the city payroll
            </div>
          )}
        </div>
        <div className="fx-fiche-kpi">
          <div className="fx-fiche-kpi-label">People paid</div>
          <div className="fx-fiche-kpi-value tnum">{nfInt.format(d.latest.n_employees)}</div>
          <div className="fx-fiche-kpi-note">
            {nfInt.format(first.n_employees)} in FY{first.fiscal_year}
          </div>
        </div>
        {d.pay ? (
          <div className="fx-fiche-kpi">
            <div className="fx-fiche-kpi-label">
              <Tip label="Half the people whose main job is in this family cost more than this, half less — salary, overtime, other pay and benefits, per person per year.">
                Median per person
              </Tip>
            </div>
            <div className="fx-fiche-kpi-value tnum">{fmtUsd(d.pay.p50_usd)}</div>
            {medianGap != null && (
              <div className="fx-fiche-kpi-note">
                {medianGap >= 0 ? "+" : "−"}
                {Math.abs(medianGap * 100).toFixed(0)}% vs the citywide median
              </div>
            )}
          </div>
        ) : (
          <div className="fx-fiche-kpi">
            <div className="fx-fiche-kpi-label">Share of the city payroll</div>
            <div className="fx-fiche-kpi-value tnum">
              {d.shareOfCityPayroll != null ? fmtShare(d.shareOfCityPayroll) : "—"}
            </div>
          </div>
        )}
        <div className="fx-fiche-kpi">
          <div className="fx-fiche-kpi-label">
            <Tip label="Overtime as a share of this family's total compensation — salary, overtime, other pay and benefits.">
              Paid as overtime
            </Tip>
          </div>
          <div className="fx-fiche-kpi-value tnum">{fmtShare(d.latest.ot_share_of_comp)}</div>
          <div className="fx-fiche-kpi-note">
            {fmtUsdCompact(d.latest.overtime_usd)} in FY{d.fiscalYear}
          </div>
        </div>
      </div>

      {d.pay && (
        <section className="fx-fiche-section">
          <div className="fx-fiche-h">What this work pays — FY{d.fiscalYear}</div>
          <div className="fx-payband">
            {(
              [
                ["p25", d.pay.p25_usd, "a quarter earn less"],
                ["median", d.pay.p50_usd, "half earn less"],
                ["p75", d.pay.p75_usd, "three quarters earn less"],
                ["p90", d.pay.p90_usd, "nine in ten earn less"],
              ] as const
            ).map(([label, value, caption]) => (
              <div key={label} className="fx-payband-step">
                <div className="fx-payband-k">{label}</div>
                <div className="fx-payband-v tnum">{fmtUsd(value)}</div>
                <div className="fx-payband-c">{caption}</div>
              </div>
            ))}
          </div>
          <p className="fx-fiche-sub" style={{ marginTop: 10 }}>
            Exact percentiles over the {nfInt.format(d.pay.n_people)} people whose main job that
            year was in this family, total compensation included. A low median means part-time and
            partial-year staff, not a low hourly rate.{" "}
            <Link href="/us/city/sf/payroll#sec-ladder" scroll={false} style={{ color: "var(--bleu)" }}>
              Compare every kind of work →
            </Link>
          </p>
        </section>
      )}

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
            {fmtUsdCompact(d.latest.total_compensation_usd)} in FY{d.fiscalYear}, with{" "}
            {nfInt.format(first.n_employees)} → {nfInt.format(d.latest.n_employees)} people. Nominal
            dollars, not inflation-adjusted.
          </p>
        </section>
      )}

      {deptRows.length > 1 && (
        <section className="fx-fiche-section">
          <div className="fx-fiche-h">Where these people work — FY{d.fiscalYear}</div>
          <FicheBreakdown rows={deptRows} format={(n) => fmtUsdCompact(n)} cap={DEPT_SHOWN} />
          <FicheMore count={deptRows.length - DEPT_SHOWN} noun="smaller departments">
            <FicheBreakdown
              rows={deptRows.slice(DEPT_SHOWN)}
              format={(n) => fmtUsdCompact(n)}
              cap={deptRows.length}
            />
          </FicheMore>
        </section>
      )}

      {d.roles.length > 1 && (
        <section className="fx-fiche-section">
          <div className="fx-fiche-h">
            <Tip label="This site groups the source's own job-family codes into citizen-readable families. These are the codes behind this one — open any of them to see which departments employ it.">
              The job codes behind this family
            </Tip>
          </div>
          <FicheBreakdown rows={roleRows} format={(n) => fmtUsdCompact(n)} cap={ROLE_SHOWN} />
          <FicheMore count={roleRows.length - ROLE_SHOWN} noun="more job codes">
            <FicheBreakdown
              rows={roleRows.slice(ROLE_SHOWN)}
              format={(n) => fmtUsdCompact(n)}
              cap={roleRows.length}
            />
          </FicheMore>
        </section>
      )}

      {(d.departments.length === 1 || d.roles.length === 1) && (
        <p className="fx-note">
          {d.departments.length === 1 && (
            <>
              Every one of these {nfInt.format(d.latest.n_employees)} people works in a single
              department,{" "}
              <Link href={d.departments[0].href} scroll={false} style={{ color: "var(--bleu)" }}>
                {d.departments[0].name}
              </Link>
              .{" "}
            </>
          )}
          {d.roles.length === 1 && (
            <>The family maps to one source job code, {d.roles[0].label}.</>
          )}
        </p>
      )}

      <section className="fx-fiche-section">
        <div className="fx-fiche-h">Source</div>
        <p style={{ fontSize: 13.5, color: "var(--ink-2)", lineHeight: 1.55, margin: 0 }}>
          Compensation for the {d.family.toLowerCase()} family, FY{first?.fiscal_year}–FY
          {d.fiscalYear}, aggregated from the Controller&rsquo;s employee-compensation data.{" "}
          <a
            href={d.source.source_url}
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: "var(--bleu)", borderBottom: "1px solid var(--bleu)" }}
          >
            {d.source.name} ↗
          </a>
        </p>
        {d.privacyRule && (
          <p style={{ fontSize: 12, color: "var(--muted)", lineHeight: 1.5, margin: "10px 0 0" }}>
            {d.privacyRule}
          </p>
        )}
      </section>
    </div>
  );
}
