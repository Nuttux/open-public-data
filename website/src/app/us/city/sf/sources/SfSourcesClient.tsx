"use client";

import Link from "next/link";
// Direct imports only — no fusion barrel (node:fs leak precedent, ADR-0010 D3).
import PageTOC from "@/components/fusion/PageTOC";
import PageIntro from "@/components/fusion/PageIntro";
import ExportRow from "@/components/fusion/ExportRow";
import Fy2018Note from "@/components/us/Fy2018Note";
import { useT } from "@/lib/localeContext";
import { fmtShare, fmtDateLong } from "@/lib/us/format";
import type { SfExecutionStatus, SfSourceBlock } from "@/lib/us/sf-budget-data";
import type { WgpMeta } from "../who-gets-paid/wgp-types";
import type { SfContractsOverview } from "../contracts/us-sf-contracts-types";
import type { PayrollByYear } from "../payroll/payroll-types";

/**
 * /us/city/sf/sources — EN-only (ADR-0010 D3). The single home for the SF
 * section's sources & methodology: each content page keeps its one-line
 * per-section source caption, but the big "Sources & method" footer blocks
 * live here, one section per dataset. Every string flows through i18n keys
 * (the moved blocks reuse the ORIGINAL footer keys verbatim; only the page
 * chrome uses new `us.sf.sources.*` keys). Every number comes from the same
 * exports the source pages load.
 */

export type SfSourcesPageData = {
  budget: {
    perimeter: string;
    status: SfExecutionStatus;
    fy: number;
    as_of: string | null;
    population: { value: number; year: number; source: string; source_url: string };
    source: SfSourceBlock;
    actualsUrl: string | null;
    generated_at: string;
    source_pipeline: string;
  };
  payees: WgpMeta;
  contracts: {
    source: SfContractsOverview["source"];
    as_of: string | null;
    dq: SfContractsOverview["data_quality"];
    n_unknown_end: number;
  };
  payroll: PayrollByYear;
};

const fill = (s: string, vars: Record<string, string | number>) => {
  let r = s;
  for (const [k, v] of Object.entries(vars)) r = r.split(`{${k}}`).join(String(v));
  return r;
};

const nfInt = new Intl.NumberFormat("en-US");

/** One-line pointer to the single shared FY2018 systems-break block above. */
function Fy2018Ref() {
  const t = useT();
  return (
    <p className="fx-footer-sources-meta" style={{ marginTop: 16 }}>
      <a
        href="#fy2018-note"
        style={{
          fontFamily: "var(--f-mono)",
          fontSize: 11.5,
          color: "var(--bleu)",
          borderBottom: "1px solid var(--bleu)",
          paddingBottom: 1,
          textDecoration: "none",
        }}
      >
        {t("us.sf.sources.fy2018.ref")} ↑
      </a>
    </p>
  );
}

function OpenLink({ href, page }: { href: string; page: string }) {
  const t = useT();
  return (
    <Link
      href={href}
      style={{
        fontFamily: "var(--f-mono)",
        fontSize: 12,
        color: "var(--bleu)",
        borderBottom: "1px solid var(--bleu)",
        paddingBottom: 1,
        textDecoration: "none",
      }}
    >
      {fill(t("us.sf.sources.open"), { page })}
    </Link>
  );
}

export default function SfSourcesClient({ d }: { d: SfSourcesPageData }) {
  const t = useT();
  const b = d.budget;
  const p = d.payees;
  const c = d.contracts;
  const dq = c.dq;
  const pr = d.payroll;

  // Payees source line (rebuilt from the who-gets-paid footer).
  const payeesSourceLinks = (
    <>
      {p.source.name}{" "}
      <a href={p.source.source_url} target="_blank" rel="noopener noreferrer">
        {t("us.sf.wgp.s05.data_link")} ↗
      </a>
    </>
  );

  return (
    <main id="main-content" tabIndex={-1} style={{ overflowX: "clip" }}>
      <PageTOC
        items={[
          { id: "fy2018-note", label: t("us.sf.sources.fy2018.heading") },
          { id: "sec-budget", label: t("us.sf.sources.budget.heading") },
          { id: "sec-payees", label: t("us.sf.sources.payees.heading") },
          { id: "sec-contracts", label: t("us.sf.sources.contracts.heading") },
          { id: "sec-payroll", label: t("us.sf.sources.payroll.heading") },
        ]}
      />

      <PageIntro
        kicker={t("us.sf.sources.kicker")}
        title={
          <>
            {t("us.sf.sources.title.before")}
            <em>{t("us.sf.sources.title.em")}</em>
          </>
        }
        lede={t("us.sf.sources.lede")}
      />

      {/* ── FY2018 systems break (shared once; each dataset section links up here) ── */}
      <section className="fx-footer-sources">
        <div className="fx-wrap">
          <div className="fx-footer-sources-head">
            <span className="fx-footer-sources-label">{t("us.sf.sources.fy2018.heading")}</span>
          </div>
          <Fy2018Note />
        </div>
      </section>

      {/* ── Budget ── */}
      <section className="fx-footer-sources" id="sec-budget">
        <div className="fx-wrap">
          <div
            className="fx-footer-sources-head"
            style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 16, flexWrap: "wrap" }}
          >
            <span className="fx-footer-sources-label">{t("us.sf.sources.budget.heading")}</span>
            <OpenLink href="/us/city/sf/budget" page={t("us.sf.nav.budget")} />
          </div>
          <p className="fx-footer-sources-meta">
            <b>{t("us.sf.budget.s06.perimeter_label")}</b>: {b.perimeter}
          </p>
          <p className="fx-footer-sources-meta">
            <b>{t("us.sf.budget.s06.status_label")}</b>:{" "}
            {fill(t(`us.sf.budget.s06.status.${b.status}`), { fy: b.fy })}
          </p>
          <p className="fx-footer-sources-meta">
            <b>{t("us.sf.budget.s06.two_year_label")}</b>: {t("us.sf.budget.s06.two_year")}
          </p>
          <Fy2018Ref />
          <p className="fx-footer-sources-meta" style={{ marginTop: 16 }}>
            <b>{t("us.sf.budget.s06.enrichment_label")}</b>: {t("us.sf.budget.s06.enrichment")}
          </p>
          <p className="fx-footer-sources-meta">
            <b>{t("us.sf.budget.s06.population_label")}</b>:{" "}
            {fill(t("us.sf.budget.s06.population"), {
              pop: b.population.value.toLocaleString("en-US"),
              year: b.population.year,
            })}{" "}
            <a href={b.population.source_url} target="_blank" rel="noopener noreferrer">
              {b.population.source} ↗
            </a>
          </p>
          <p className="fx-footer-sources-meta">
            <b>{t("us.sf.budget.source_label")}s</b>:{" "}
            <a href={b.source.source_url} target="_blank" rel="noopener noreferrer">
              {b.source.name} ({b.source.dataset_id}) — {b.source.attribution} ↗
            </a>
            {b.actualsUrl && (
              <>
                {" "}
                <span className="sep">·</span>{" "}
                <a href={b.actualsUrl} target="_blank" rel="noopener noreferrer">
                  {t("us.sf.budget.s05.src_actuals")} ↗
                </a>
              </>
            )}
          </p>
          <p
            className="fx-footer-sources-meta"
            style={{ fontFamily: "var(--f-mono)", fontSize: 11 }}
          >
            {fill(t("us.sf.budget.s06.generated"), {
              ts: fmtDateLong(b.generated_at.slice(0, 10)),
              asof: b.as_of ? fmtDateLong(b.as_of.slice(0, 10)) : "—",
            })}{" "}
            <span className="sep">·</span> {b.source_pipeline}
          </p>
        </div>
      </section>

      {/* ── Payees ── */}
      <section className="fx-footer-sources" id="sec-payees">
        <div className="fx-wrap">
          <div
            className="fx-footer-sources-head"
            style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 16, flexWrap: "wrap" }}
          >
            <span className="fx-footer-sources-label">{t("us.sf.sources.payees.heading")}</span>
            <OpenLink href="/us/city/sf/who-gets-paid" page={t("us.sf.nav.who_gets_paid")} />
          </div>
          <p className="fx-footer-sources-meta">
            <b>{t("us.sf.wgp.s05.source_label")}</b>: {payeesSourceLinks}
            {p.as_of && (
              <>
                {" "}
                <span className="sep">·</span>{" "}
                {fill(t("us.sf.wgp.s05.updated"), {
                  date: fmtDateLong(p.as_of.slice(0, 10)),
                })}
              </>
            )}
          </p>
          <p className="fx-footer-sources-meta">
            <b>{t("us.sf.wgp.s05.perimeter_label")}</b>: {p.perimeter}
          </p>
          <p className="fx-footer-sources-meta">
            <b>{t("us.sf.wgp.s05.classification_label")}</b>: {p.classification.coverage}
          </p>
          <p className="fx-footer-sources-meta">
            <b>{t("us.sf.wgp.s05.default_view_label")}</b>: {p.default_view.note}{" "}
            {p.ranking_caveat}
          </p>
          <p className="fx-footer-sources-meta">
            <b>{t("us.sf.wgp.s05.grants_label")}</b>: {p.grant_lens_definition}{" "}
            {p.nonprofit_floor_note}
          </p>
          <p className="fx-footer-sources-meta">
            <b>{t("us.sf.wgp.s05.individuals_label")}</b>: {t("us.sf.wgp.s05.individuals")}
          </p>
          <Fy2018Ref />
          <div style={{ marginTop: 18 }}>
            <ExportRow
              items={[
                { label: "top_payees.json", primary: true, href: "/data/us/sf/top_payees.json" },
                { label: "payees_search.json", href: "/data/us/sf/payees_search.json" },
                { label: p.source.dataset_id, href: p.source.source_url },
              ]}
            />
          </div>
          <p
            className="fx-footer-sources-meta"
            style={{ fontFamily: "var(--f-mono)", fontSize: 11, marginTop: 16 }}
          >
            {fill(t("us.sf.wgp.s05.generated"), {
              ts: fmtDateLong(p.generated_at.slice(0, 10)),
            })}{" "}
            <span className="sep">·</span> {p.source_pipeline}
          </p>
        </div>
      </section>

      {/* ── Contracts ── */}
      <section className="fx-footer-sources" id="sec-contracts">
        <div className="fx-wrap">
          <div
            className="fx-footer-sources-head"
            style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 16, flexWrap: "wrap" }}
          >
            <span className="fx-footer-sources-label">{t("us.sf.sources.contracts.heading")}</span>
            <OpenLink href="/us/city/sf/contracts" page={t("us.sf.nav.contracts")} />
          </div>
          <p className="fx-footer-sources-meta">
            <b>{t("us.sf.contracts.s07.source_label")}</b>: {c.source.name} ·{" "}
            <a href={c.source.source_url} target="_blank" rel="noopener noreferrer">
              {c.source.dataset_id}
            </a>{" "}
            · {c.source.attribution}
            {c.as_of && (
              <>
                {" "}<span className="sep">·</span> <b>{t("us.sf.contracts.s07.asof_label")}</b>:{" "}
                {fmtDateLong(c.as_of)}
              </>
            )}
          </p>
          <Fy2018Ref />
          <div
            style={{
              margin: "14px 0 0",
              fontFamily: "var(--f-ui)",
              fontSize: 13,
              lineHeight: 1.65,
              color: "var(--ink-2)",
            }}
          >
            <b style={{ color: "var(--ink)" }}>{t("us.sf.contracts.s07.methode_label")}</b>
            <ul style={{ margin: "8px 0 0", paddingLeft: 18 }}>
              <li>{fill(t("us.sf.contracts.s07.m1"), {
                nSubOnly: nfInt.format(dq.n_sub_only_contracts_excluded),
                nMulti: nfInt.format(dq.n_multi_prime_row_contracts),
              })}</li>
              <li>{t("us.sf.contracts.s07.m2")}</li>
              <li>{fill(t("us.sf.contracts.s07.m3"), {
                n: nfInt.format(dq.n_paid_exceeds_agreed),
              })}</li>
              <li>{fill(t("us.sf.contracts.s07.m4"), {
                share: fmtShare(dq.voucher_join.matched_dollar_share),
              })}</li>
              <li>{fill(t("us.sf.contracts.s07.m5"), {
                n: nfInt.format(c.n_unknown_end),
                nPlaceholder: nfInt.format(dq.n_placeholder_end_dates),
              })}</li>
            </ul>
          </div>
          <div style={{ marginTop: 18 }}>
            <ExportRow
              items={[
                { label: t("us.sf.contracts.s07.export.overview"), primary: true, href: "/data/us/sf/contracts_overview.json" },
                { label: t("us.sf.contracts.s07.export.active"), href: "/data/us/sf/contracts_active.json" },
                { label: t("us.sf.contracts.s07.export.source"), href: c.source.source_url },
              ]}
            />
          </div>
        </div>
      </section>

      {/* ── Payroll ── */}
      <section className="fx-footer-sources" id="sec-payroll">
        <div className="fx-wrap">
          <div
            className="fx-footer-sources-head"
            style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 16, flexWrap: "wrap" }}
          >
            <span className="fx-footer-sources-label">{t("us.sf.sources.payroll.heading")}</span>
            <OpenLink href="/us/city/sf/payroll" page={t("us.sf.nav.payroll")} />
          </div>
          <p className="fx-footer-sources-meta">
            <b>{t("us.sf.payroll.s06.privacy_label")}</b>: {pr.privacy.rule}{" "}
            {pr.privacy.measured_cost} {pr.privacy.count_only_disclosures}
          </p>
          <p className="fx-footer-sources-meta">
            <b>{t("us.sf.payroll.s06.basis_label")}</b>: {pr.fiscal_year_note}
          </p>
          <p className="fx-footer-sources-meta">
            <b>{t("us.sf.payroll.s06.median_label")}</b>: {pr.median_note}
          </p>
          <p className="fx-footer-sources-meta">
            <b>{t("us.sf.payroll.s06.ot_label")}</b>: {pr.ot_counter_note}
          </p>
          <p className="fx-footer-sources-meta">{t("us.sf.payroll.s06.breaks")}</p>
          <Fy2018Ref />
          <p className="fx-footer-sources-meta">
            <b>{t("us.sf.payroll.s06.population_label")}</b>:{" "}
            {pr.population.note}{" "}
            {pr.population.source_url && (
              <a
                href={pr.population.source_url}
                target="_blank"
                rel="noopener noreferrer"
              >
                {pr.population.source} ↗
              </a>
            )}
          </p>
          <p className="fx-footer-sources-meta">
            <b>{t("us.sf.payroll.source_label")}</b>:{" "}
            <a
              href={pr.source.source_url}
              target="_blank"
              rel="noopener noreferrer"
            >
              {pr.source.name} ({pr.source.dataset_id}) ↗
            </a>{" "}
            — {pr.source.attribution}
          </p>
          <p
            className="fx-footer-sources-meta"
            style={{ fontFamily: "var(--f-mono)", fontSize: 11 }}
          >
            {fill(t("us.sf.payroll.s06.generated"), {
              ts: fmtDateLong(pr.generated_at.slice(0, 10)),
            })}{" "}
            <span className="sep">·</span> {pr.source_pipeline}
          </p>
        </div>
      </section>
    </main>
  );
}
