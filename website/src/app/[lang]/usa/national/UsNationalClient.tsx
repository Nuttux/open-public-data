"use client";

import SectionHead from "@/components/fusion/SectionHead";
import PageIntro, { IntroStat } from "@/components/fusion/PageIntro";
import HeroNumber from "@/components/fusion/HeroNumber";
import KPIGrid from "@/components/fusion/KPIGrid";
import AnimatedNumber from "@/components/fusion/AnimatedNumber";
import BarRow from "@/components/fusion/BarRow";
import BalanceStack from "@/components/fusion/BalanceStack";
import { useT } from "@/lib/localeContext";
import UsDebtChart from "./UsDebtChart";
import {
  fmtUsd,
  fmtUsdCompact,
  fmtUsdBn,
  fmtShare,
  fmtYoy,
  fmtDateLong,
  fmtMonthYear,
} from "@/lib/us/format";
import type { UsDailyBread, UsDebtSlim } from "./us-types";

/**
 * /us/national — EN-only page (ADR-0010 D3). All copy goes through
 * `us.national.*` i18n keys whose EN and FR values are identical English,
 * so the page renders in English whatever the visitor's locale toggle says.
 * Every number on the page comes from the two JSON exports — the only
 * arithmetic performed here is "total minus displayed segments" for the
 * balance-stack remainders.
 */

const fill = (s: string, vars: Record<string, string | number>) => {
  let r = s;
  for (const [k, v] of Object.entries(vars)) r = r.split(`{${k}}`).join(String(v));
  return r;
};

/** Visible per-section source line — same fx-chart-source pattern as the
 *  France pages, but local so the label stays English on every locale. */
function SourceLine({
  label,
  links,
  dataWord,
}: {
  label: string;
  links: Array<{ name: string; href: string }>;
  dataWord: string;
}) {
  return (
    <figcaption className="fx-chart-source">
      <b>{label}:</b>{" "}
      {links.map((l, i) => (
        <span key={l.href}>
          {i > 0 && <span className="sep">·</span>}
          {l.name}{" "}
          <a href={l.href} target="_blank" rel="noopener noreferrer">
            {dataWord} ↗
          </a>
        </span>
      ))}
    </figcaption>
  );
}

export default function UsNationalClient({
  db,
  debt,
}: {
  db: UsDailyBread;
  debt: UsDebtSlim;
}) {
  const t = useT();

  const rec = db.receipts;
  const out = db.outlays;
  const comp = db.completeness;
  const outPositive = out.items.filter((i) => i.current_fytd_usd > 0);
  const outNegative = out.items.filter((i) => i.current_fytd_usd < 0);

  // Balance stack — receipts + borrowing on the left, outlays on the right.
  // Both columns sum to total outlays (MTS identity: outlays = receipts + deficit).
  const topReceipts = rec.items.slice(0, 3);
  const otherReceipts =
    rec.total.current_fytd_usd -
    topReceipts.reduce((s, i) => s + i.current_fytd_usd, 0);
  const deficitFytd = db.budget_balance.current_fytd_usd; // negative = deficit
  const topOutlays = out.items.slice(0, 5);
  const otherOutlaysNet =
    out.total.current_fytd_usd -
    topOutlays.reduce((s, i) => s + i.current_fytd_usd, 0);

  const completenessLine = fill(t("us.national.completeness"), {
    date: fmtDateLong(comp.fytd_through),
    m: comp.months_into_fiscal_year,
    n: comp.fiscal_year_months,
    fy: db.fiscal_year,
  });

  const mtsLinks = [{ name: db.source.name, href: db.source.source_url }];
  const dataWord = t("us.national.data_link");
  const srcLabel = t("us.national.source_label");

  return (
    <div className="theme-fusion">
      <main id="main-content" tabIndex={-1}>
        {/* ── Opener: signature stat band (folds the former "01 Overview") ── */}
        <PageIntro
          kicker={fill(t("us.national.kicker"), { fy: db.fiscal_year })}
          title={
            <>
              {t("us.national.title.before")}
              <em>{t("us.national.title.em")}</em>
              {t("us.national.title.after")}
            </>
          }
          lede={t("us.national.lede")}
          meta={completenessLine}
          stats={
            <>
              <IntroStat
                value={
                  <AnimatedNumber
                    value={out.total.per_resident_fytd_usd}
                    format={(n) => fmtUsd(n)}
                  />
                }
                label={
                  <>
                    {fill(t("us.national.s01.hero.label"), { fy: db.fiscal_year })}
                    {` · ${fmtYoy(out.total.yoy_fytd_pct)}`}
                  </>
                }
              />
              <IntroStat
                value={
                  <AnimatedNumber
                    value={out.total.current_fytd_usd}
                    format={(n) => fmtUsdCompact(n)}
                  />
                }
                label={t("us.national.s01.kpi.outlays")}
              />
              <IntroStat
                value={
                  <AnimatedNumber
                    value={rec.total.current_fytd_usd}
                    format={(n) => fmtUsdCompact(n)}
                  />
                }
                label={t("us.national.s01.kpi.receipts")}
              />
              <IntroStat
                value={
                  <AnimatedNumber
                    value={deficitFytd}
                    format={(n) => fmtUsdCompact(n)}
                  />
                }
                label={t("us.national.s01.kpi.balance")}
              />
            </>
          }
        />

        {/* ── Signature: the debt, 1790 → today ── */}
        <section className="fx-section" id="sec-debt">
          <div className="fx-wrap">
            <SectionHead
              kind={t("us.national.s05.kind")}
              title={
                <>
                  {t("us.national.s05.title.before")}
                  <em>
                    {fill(t("us.national.s05.title.em"), {
                      y0: debt.annual.points[0]?.fiscal_year ?? "",
                    })}
                  </em>
                </>
              }
              subtitle={fill(t("us.national.s05.sub"), {
                y0: debt.annual.points[0]?.fiscal_year ?? "",
              })}
            />
            <KPIGrid
              cols={4}
              items={[
                {
                  label: t("us.national.s05.kpi.total"),
                  value: (
                    <AnimatedNumber
                      value={debt.latest.tot_pub_debt_out_usd}
                      format={(n) => fmtUsdCompact(n)}
                    />
                  ),
                  delta: fill(t("us.national.s05.kpi.asof"), {
                    date: fmtDateLong(debt.latest.record_date),
                  }),
                },
                {
                  label: t("us.national.s05.kpi.pr"),
                  value: (
                    <AnimatedNumber
                      value={debt.latest.per_resident_usd}
                      format={(n) => fmtUsd(n)}
                    />
                  ),
                  delta: fill(t("us.national.s05.kpi.pr_note"), {
                    pop: new Intl.NumberFormat("en-US").format(db.population.value),
                  }),
                },
                {
                  label: t("us.national.s05.kpi.public"),
                  value: fmtUsdCompact(debt.latest.debt_held_public_usd),
                },
                {
                  label: t("us.national.s05.kpi.intra"),
                  value: fmtUsdCompact(debt.latest.intragov_hold_usd),
                },
              ]}
            />
            <div style={{ marginTop: 26 }}>
              <UsDebtChart
                annual={debt.annual.points}
                latest={{
                  record_date: debt.latest.record_date,
                  tot_pub_debt_out_usd: debt.latest.tot_pub_debt_out_usd,
                }}
                annualLabel={t("us.national.s05.series.annual")}
                latestLabel={t("us.national.s05.series.latest")}
                ariaLabel={t("us.national.s05.aria")}
              />
            </div>
            <p className="fx-note">
              {t("us.national.s05.caption")} {debt.notes}
            </p>
            <SourceLine
              label={srcLabel}
              links={[
                { name: debt.annual.source.name, href: debt.annual.source.source_url },
                { name: debt.latest.source.name, href: debt.latest.source.source_url },
              ]}
              dataWord={dataWord}
            />
          </div>
        </section>

        {/* ── 02 · Money in ── */}
        <section className="fx-section" id="sec-receipts">
          <div className="fx-wrap">
            <SectionHead
              kind={t("us.national.s02.kind")}
              title={
                <>
                  {t("us.national.s02.title.before")}
                  <em>{t("us.national.s02.title.em")}</em>
                </>
              }
              subtitle={fill(t("us.national.s02.sub"), {
                n: rec.n_items,
                total: fmtUsdCompact(rec.total.current_fytd_usd),
                pr: fmtUsd(rec.total.per_resident_fytd_usd),
              })}
            />
            <BarRow
              reveal
              header={{
                left: t("us.national.s02.header.left"),
                right: t("us.national.s02.header.right"),
              }}
              items={rec.items.map((it) => ({
                label: it.category,
                value: it.current_fytd_usd,
                display: fmtUsdBn(it.current_fytd_usd),
                sub: fill(t("us.national.sub.receipts"), {
                  pr: fmtUsd(it.per_resident_fytd_usd),
                  share: fmtShare(it.share_of_side_fytd),
                  yoy: fmtYoy(it.yoy_fytd_pct),
                }),
              }))}
            />
            <SourceLine label={srcLabel} links={mtsLinks} dataWord={dataWord} />
          </div>
        </section>

        {/* ── 03 · Money out ── */}
        <section className="fx-section" id="sec-outlays">
          <div className="fx-wrap">
            <SectionHead
              kind={t("us.national.s03.kind")}
              title={
                <>
                  {t("us.national.s03.title.before")}
                  <em>{t("us.national.s03.title.em")}</em>
                </>
              }
              subtitle={fill(t("us.national.s03.sub"), {
                n: out.n_items,
                total: fmtUsdCompact(out.total.current_fytd_usd),
                pr: fmtUsd(out.total.per_resident_fytd_usd),
                neg: outNegative.length,
              })}
            />
            <BarRow
              reveal
              header={{
                left: t("us.national.s03.header.left"),
                right: t("us.national.s03.header.right"),
              }}
              items={outPositive.map((it) => ({
                label: it.category,
                value: it.current_fytd_usd,
                display: fmtUsdBn(it.current_fytd_usd),
                sub: fill(t("us.national.sub.outlays"), {
                  pr: fmtUsd(it.per_resident_fytd_usd),
                  share: fmtShare(it.share_of_side_fytd),
                  yoy: fmtYoy(it.yoy_fytd_pct),
                }),
              }))}
            />

            {/* Negative categories — never mixed into the ranked bars. */}
            <div className="fx-callout" style={{ marginTop: 28 }}>
              <b>{t("us.national.s03.offsets.title")}</b>{" "}
              {t("us.national.s03.offsets.expl")}
              <div style={{ marginTop: 14, display: "grid", gap: 8 }}>
                {outNegative.map((it) => (
                  <div
                    key={it.line_code_nbr}
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      gap: 16,
                      flexWrap: "wrap",
                      borderTop: "1px solid var(--rule)",
                      paddingTop: 8,
                    }}
                  >
                    <span style={{ fontWeight: 600 }}>{it.category}</span>
                    <span className="tnum" style={{ fontFamily: "var(--f-mono)", fontSize: 12.5 }}>
                      {fmtUsdCompact(it.current_fytd_usd)}{" "}
                      <span style={{ color: "var(--muted)" }}>
                        {fill(t("us.national.s03.offsets.sub"), {
                          share: fmtShare(it.share_of_side_fytd),
                          pr: fmtUsd(it.per_resident_fytd_usd),
                        })}
                      </span>
                    </span>
                  </div>
                ))}
              </div>
            </div>
            <SourceLine label={srcLabel} links={mtsLinks} dataWord={dataWord} />
          </div>
        </section>

        {/* ── 04 · The balance ── */}
        <section className="fx-section" id="sec-balance">
          <div className="fx-wrap">
            <SectionHead
              kind={t("us.national.s04.kind")}
              title={
                <>
                  {t("us.national.s04.title.before")}
                  <em>{t("us.national.s04.title.em")}</em>
                </>
              }
              subtitle={fill(t("us.national.s04.sub"), {
                outlays: fmtUsdCompact(out.total.current_fytd_usd),
                receipts: fmtUsdCompact(rec.total.current_fytd_usd),
              })}
            />
            <HeroNumber
              label={t("us.national.s04.hero.label")}
              value={
                <AnimatedNumber value={deficitFytd} format={(n) => fmtUsdCompact(n)} />
              }
              caption={db.budget_balance.sign_convention}
            />
            <div style={{ marginTop: 28 }}>
              <BalanceStack
                actif={{
                  headLeft: t("us.national.s04.left.head"),
                  headRight: fmtUsdCompact(out.total.current_fytd_usd),
                  total: out.total.current_fytd_usd,
                  segments: [
                    // `tiny` under 8 % of the column: the stacked segment is
                    // too short for the two-line label+value layout, so switch
                    // to the one-line row variant (label stays visible).
                    ...topReceipts.map((it) => ({
                      key: it.line_code_nbr,
                      label: it.category,
                      value: it.current_fytd_usd,
                      display: fmtUsdCompact(it.current_fytd_usd),
                      tiny: it.current_fytd_usd / out.total.current_fytd_usd < 0.08,
                    })),
                    {
                      key: "other-receipts",
                      label: fill(t("us.national.s04.seg.other_receipts"), {
                        n: rec.n_items - topReceipts.length,
                      }),
                      value: otherReceipts,
                      display: fmtUsdCompact(otherReceipts),
                      tiny: otherReceipts / out.total.current_fytd_usd < 0.08,
                    },
                    {
                      key: "deficit",
                      label: t("us.national.s04.seg.deficit"),
                      value: Math.abs(deficitFytd),
                      display: fmtUsdCompact(Math.abs(deficitFytd)),
                      filled: false,
                    },
                  ],
                  legend: fill(t("us.national.s04.left.legend"), {
                    receipts: fmtUsdCompact(rec.total.current_fytd_usd),
                    deficit: fmtUsdCompact(Math.abs(deficitFytd)),
                  }),
                }}
                passif={{
                  headLeft: t("us.national.s04.right.head"),
                  headRight: fmtUsdCompact(out.total.current_fytd_usd),
                  total: out.total.current_fytd_usd,
                  segments: [
                    ...topOutlays.map((it) => ({
                      key: it.line_code_nbr,
                      label: it.category,
                      value: it.current_fytd_usd,
                      display: fmtUsdCompact(it.current_fytd_usd),
                      tiny: it.current_fytd_usd / out.total.current_fytd_usd < 0.08,
                    })),
                    {
                      key: "other-outlays",
                      label: fill(t("us.national.s04.seg.other_outlays"), {
                        n: out.n_items - topOutlays.length,
                      }),
                      value: otherOutlaysNet,
                      display: fmtUsdCompact(otherOutlaysNet),
                      tiny: otherOutlaysNet / out.total.current_fytd_usd < 0.08,
                    },
                  ],
                  legend: fill(t("us.national.s04.right.legend"), {
                    n: out.n_items,
                  }),
                }}
              />
            </div>
            <p className="fx-note">
              {fill(
                t(
                  db.budget_balance.current_month_usd < 0
                    ? "us.national.s04.month_note"
                    : "us.national.s04.month_note_surplus",
                ),
                {
                  month: fmtMonthYear(db.as_of),
                  receipts: fmtUsdCompact(rec.total.current_month_usd),
                  outlays: fmtUsdCompact(out.total.current_month_usd),
                  balance: fmtUsdCompact(Math.abs(db.budget_balance.current_month_usd)),
                },
              )}
            </p>
            <SourceLine label={srcLabel} links={mtsLinks} dataWord={dataWord} />
          </div>
        </section>

        {/* ── Sources & method ── */}
        <section className="fx-footer-sources" id="sec-sources">
          <div className="fx-wrap">
            <div className="fx-footer-sources-head">
              <span className="fx-footer-sources-label">
                {t("us.national.s06.label")}
              </span>
            </div>
            <p className="fx-footer-sources-meta">
              <b>{t("us.national.s06.basis")}</b>: {db.accounting_basis}
            </p>
            <p className="fx-footer-sources-meta">
              <b>{t("us.national.s06.cadence")}</b>: {t("us.national.s06.refresh")}
            </p>
            <p className="fx-footer-sources-meta">
              <b>{t("us.national.s06.coverage")}</b>: {comp.note}
            </p>
            <p className="fx-footer-sources-meta">
              <b>{t("us.national.s06.population_label")}</b>:{" "}
              {fill(t("us.national.s06.population"), {
                pop: new Intl.NumberFormat("en-US").format(db.population.value),
                date: fmtDateLong(db.population.as_of),
              })}{" "}
              <a href={db.population.source_url} target="_blank" rel="noopener noreferrer">
                {db.population.source} ↗
              </a>
            </p>
            <p className="fx-footer-sources-meta">
              <b>{srcLabel}s</b>:{" "}
              <a href={db.source.source_url} target="_blank" rel="noopener noreferrer">
                {db.source.name} — {db.source.table} ↗
              </a>{" "}
              <span className="sep">·</span>{" "}
              <a
                href={debt.annual.source.source_url}
                target="_blank"
                rel="noopener noreferrer"
              >
                {debt.annual.source.name} ↗
              </a>{" "}
              <span className="sep">·</span>{" "}
              <a
                href={debt.latest.source.source_url}
                target="_blank"
                rel="noopener noreferrer"
              >
                {debt.latest.source.name} ↗
              </a>
            </p>
            <p
              className="fx-footer-sources-meta"
              style={{ fontFamily: "var(--f-mono)", fontSize: 11 }}
            >
              {fill(t("us.national.s06.generated"), {
                ts: fmtDateLong(db.generated_at.slice(0, 10)),
              })}{" "}
              <span className="sep">·</span> {db.source_pipeline}
            </p>
          </div>
        </section>
      </main>
    </div>
  );
}
