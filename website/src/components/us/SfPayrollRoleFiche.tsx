"use client";

import Link from "next/link";
import Tip from "@/components/fusion/Tip";
import { FicheBreakdown, FicheMore, FicheYearBars } from "@/components/fiche";
import { fmtUsdCompact, fmtShare } from "@/lib/us/format";
import type { SfPayrollRoleData } from "@/lib/us/sf-payroll-entities";

/**
 * Role fiche — one of the source's own job-family codes ("Park & Zoo",
 * "Library", "Agriculture & Horticulture"), the rung below the display family
 * this site groups them into.
 *
 * The family fiche listed these codes as dead text: you could see that Culture,
 * Parks & Libraries is made of five codes and go no further. Each is now an
 * entity, split the other ways the data allows — across departments, across
 * years, and against the sibling codes it shares a family with.
 */

const nfInt = new Intl.NumberFormat("en-US");
const DEPT_SHOWN = 6;
const SIBLING_SHOWN = 6;

export default function SfPayrollRoleFiche({ d }: { d: SfPayrollRoleData }) {
  const deptRows = d.departments.map((dep) => ({
    key: dep.code,
    label: dep.name,
    meta: `${nfInt.format(dep.n_employees)} people${
      dep.overtime_usd > 0 ? ` · ${fmtUsdCompact(dep.overtime_usd)} overtime` : ""
    }`,
    value: dep.total_compensation_usd,
    href: dep.href,
  }));

  const siblingRows = d.siblings.map((sib) => ({
    key: sib.label,
    label: sib.label,
    meta: `${nfInt.format(sib.n_employees)} people`,
    value: sib.total_compensation_usd,
    href: sib.href,
  }));

  const otShare =
    d.latest.total_compensation_usd > 0
      ? d.latest.overtime_usd / d.latest.total_compensation_usd
      : null;

  return (
    <div>
      <div className="fx-fiche-kpis">
        <div className="fx-fiche-kpi">
          <div className="fx-fiche-kpi-label">Total compensation, FY{d.fiscalYear}</div>
          <div className="fx-fiche-kpi-value tnum">
            {fmtUsdCompact(d.latest.total_compensation_usd)}
          </div>
          {d.shareOfFamily != null && (
            <div className="fx-fiche-kpi-note">
              {fmtShare(d.shareOfFamily)} of {d.family}
            </div>
          )}
        </div>
        <div className="fx-fiche-kpi">
          <div className="fx-fiche-kpi-label">People paid</div>
          <div className="fx-fiche-kpi-value tnum">{nfInt.format(d.latest.n_employees)}</div>
          {d.series.length > 1 && (
            <div className="fx-fiche-kpi-note">
              {nfInt.format(d.first.n_employees)} in FY{d.first.fiscal_year}
            </div>
          )}
        </div>
        <div className="fx-fiche-kpi">
          <div className="fx-fiche-kpi-label">Departments</div>
          <div className="fx-fiche-kpi-value tnum">{nfInt.format(d.departments.length)}</div>
        </div>
        <div className="fx-fiche-kpi">
          <div className="fx-fiche-kpi-label">
            <Tip label="Overtime as a share of this code's total compensation — salary, overtime, other pay and benefits.">
              Paid as overtime
            </Tip>
          </div>
          <div className="fx-fiche-kpi-value tnum">
            {otShare != null ? fmtShare(otShare) : "—"}
          </div>
          <div className="fx-fiche-kpi-note">{fmtUsdCompact(d.latest.overtime_usd)}</div>
        </div>
      </div>

      {d.series.length > 1 && (
        <section className="fx-fiche-section">
          <div className="fx-fiche-h">
            Compensation, FY{d.first.fiscal_year}–FY{d.fiscalYear}
          </div>
          <FicheYearBars
            points={d.series.map((p) => ({
              year: p.fiscal_year,
              value: p.total_compensation_usd,
            }))}
            format={(n) => fmtUsdCompact(n)}
          />
          <p className="fx-fiche-sub" style={{ marginTop: 8 }}>
            {fmtUsdCompact(d.first.total_compensation_usd)} in FY{d.first.fiscal_year} →{" "}
            {fmtUsdCompact(d.latest.total_compensation_usd)} in FY{d.fiscalYear}, with{" "}
            {nfInt.format(d.first.n_employees)} → {nfInt.format(d.latest.n_employees)} people.
            Nominal dollars, not inflation-adjusted.
          </p>
        </section>
      )}

      {deptRows.length > 0 && (
        <section className="fx-fiche-section">
          <div className="fx-fiche-h">Which departments employ it — FY{d.fiscalYear}</div>
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

      {siblingRows.length > 0 && (
        <section className="fx-fiche-section">
          <div className="fx-fiche-h">
            The other codes in{" "}
            <Link href={d.familyHref} scroll={false} style={{ color: "inherit" }}>
              {d.family}
            </Link>
          </div>
          <FicheBreakdown rows={siblingRows} format={(n) => fmtUsdCompact(n)} cap={SIBLING_SHOWN} />
          <FicheMore count={siblingRows.length - SIBLING_SHOWN} noun="more codes">
            <FicheBreakdown
              rows={siblingRows.slice(SIBLING_SHOWN)}
              format={(n) => fmtUsdCompact(n)}
              cap={siblingRows.length}
            />
          </FicheMore>
        </section>
      )}

      <section className="fx-fiche-section">
        <div className="fx-fiche-h">Source</div>
        <p style={{ fontSize: 13.5, color: "var(--ink-2)", lineHeight: 1.55, margin: 0 }}>
          {d.label} is one of the job-family codes the Controller&rsquo;s compensation data uses.
          This site groups it under{" "}
          <Link href={d.familyHref} scroll={false} style={{ color: "var(--bleu)" }}>
            {d.family}
          </Link>
          , a citizen-readable family; every figure here is a sum over the source rows carrying this
          code.{" "}
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
