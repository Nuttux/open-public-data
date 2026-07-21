"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import SectionHead from "@/components/fusion/SectionHead";
import KPIGrid from "@/components/fusion/KPIGrid";
import Tip from "@/components/fusion/Tip";
import { useT } from "@/lib/localeContext";
import { fmtUsdCompact, fmtShare } from "@/lib/us/format";
import { bucketColor, bucketLabelKey, deptDisplay } from "./bucket";
import type { WgpMeta, WgpNonprofitRow, WgpPayee, WgpYear } from "./wgp-types";

/**
 * Section 02 — the ranked payees, with the two binding view rules:
 *   - the bucket toggle lives IN the section head area and defaults OFF:
 *     fiscal agents + payroll pass-throughs (JPMorgan $1.86B…) render ONLY
 *     when toggled, `person` rows never;
 *   - "Single Payment Payees" (and any is_aggregation_line vendor) renders
 *     as a muted, non-expandable row with an info chip — never a fiche.
 * Rows expand inline (no fiche routes in this block). The nonprofit tab is
 * first-class: FY2018+ floor, community ranking with the healthcare/
 * intergovernmental exclusion note, grant-funded lens.
 */

const fill = (s: string, vars: Record<string, string | number>) => {
  let r = s;
  for (const [k, v] of Object.entries(vars)) r = r.split(`{${k}}`).join(String(v));
  return r;
};

const nfInt = new Intl.NumberFormat("en-US");
const TOP_ROWS = 15;
const NP_ROWS = 12;
/** Below this classified-$ share, the year gets a coverage badge (the
 *  study's "données brutes" honesty rule; pre-2018 years sit at 60-72%
 *  vs 78-81% for FY2018+ after the 2026-07-16 seed extension). */
const COVERAGE_BADGE_BELOW = 0.75;

function BucketChip({ bucket }: { bucket: string | null }) {
  const t = useT();
  const label = bucket ? t(bucketLabelKey(bucket)) : t("us.sf.wgp.row.unclassified");
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        fontFamily: "var(--f-mono)",
        fontSize: 11,
        letterSpacing: ".03em",
        color: bucket ? "var(--ink-2)" : "var(--muted)",
        fontStyle: bucket ? "normal" : "italic",
      }}
    >
      <span
        aria-hidden="true"
        style={{
          display: "inline-block",
          width: 8,
          height: 8,
          background: bucketColor(bucket),
          flexShrink: 0,
        }}
      />
      {label}
    </span>
  );
}

function PayeeRow({
  p,
  fy,
  refMax,
  expanded,
  onToggle,
  payeeSlug,
}: {
  p: WgpPayee;
  fy: number;
  refMax: number;
  expanded: boolean;
  onToggle: () => void;
  payeeSlug: string | null;
}) {
  const t = useT();
  const color = bucketColor(p.bucket);

  if (p.is_aggregation_line) {
    // Muted aggregated line (Single Payment Payees): info chip, no fiche,
    // no expansion — it is not one entity.
    return (
      <div className="fx-top-row" style={{ cursor: "default", opacity: 0.72 }}>
        <span className="r">{String(p.rank).padStart(2, "0")}</span>
        <span className="name" style={{ color: "var(--muted)" }}>
          {p.vendor}
          <span
            style={{
              display: "block",
              fontFamily: "var(--f-mono)",
              fontSize: 10.5,
              letterSpacing: ".03em",
              color: "var(--muted)",
              marginTop: 3,
            }}
          >
            {fill(t("us.sf.wgp.row.agg_note"), { n: nfInt.format(p.n_vouchers) })}
          </span>
        </span>
        <span
          className="bar"
          style={{ position: "relative", height: 8, background: "var(--rule)" }}
        >
          <span
            className="fill"
            style={{
              width: `${(p.vouchers_paid_usd / refMax) * 100}%`,
              background: `repeating-linear-gradient(135deg, ${color}, ${color} 3px, var(--rule) 3px, var(--rule) 6px)`,
            }}
          />
        </span>
        <span className="v tnum">{fmtUsdCompact(p.vouchers_paid_usd)}</span>
        <span className="theme">
          <span
            style={{
              fontFamily: "var(--f-mono)",
              fontSize: 11,
              letterSpacing: ".03em",
              color: "var(--muted)",
              border: "1px solid var(--rule)",
              padding: "2px 7px",
            }}
          >
            {t("us.sf.wgp.row.agg_chip")}
          </span>
        </span>
        <span className="arrow" aria-hidden="true" />
      </div>
    );
  }

  const rowInner = (
    <>
      <span className="r">{String(p.rank).padStart(2, "0")}</span>
      <span className="name">
        {p.vendor}
        <span
          style={{
            display: "block",
            fontFamily: "var(--f-mono)",
            fontSize: 10.5,
            letterSpacing: ".03em",
            color: "var(--muted)",
            marginTop: 3,
          }}
        >
          {deptDisplay(p.top_department)}
          {" · "}
          {p.n_departments > 1
            ? fill(t("us.sf.wgp.row.depts"), { n: p.n_departments })
            : t("us.sf.wgp.row.dept_one")}
        </span>
      </span>
      <span
        className="bar"
        style={{ position: "relative", height: 8, background: "var(--rule)" }}
      >
        <span
          className="fill"
          style={{ width: `${(p.vouchers_paid_usd / refMax) * 100}%`, background: color }}
        />
      </span>
      <span className="v tnum">{fmtUsdCompact(p.vouchers_paid_usd)}</span>
      <span className="theme">
        <BucketChip bucket={p.bucket} />
      </span>
      <span className="arrow" aria-hidden="true">
        {payeeSlug ? "→" : expanded ? "▴" : "▾"}
      </span>
    </>
  );

  // Keyed payee: the row IS the link to its fiche (which supersedes the old
  // inline dropdown). Unkeyed payee (no fiche): keep the inline expand — it is
  // the only place its detail lives, and we never emit a dead link.
  if (payeeSlug) {
    return (
      <Link href={`/us/city/sf/who-gets-paid/payee/${payeeSlug}`} className="fx-top-row">
        {rowInner}
      </Link>
    );
  }

  return (
    <>
      <button
        type="button"
        className="fx-top-row"
        aria-expanded={expanded}
        aria-label={fill(t("us.sf.wgp.s02.aria.row"), { name: p.vendor })}
        onClick={onToggle}
      >
        {rowInner}
      </button>
      {expanded && (
        <div
          style={{
            padding: "16px 22px 18px 78px",
            background: "var(--bg-cool)",
            borderBottom: "1px solid var(--rule)",
            display: "grid",
            gap: 8,
            fontSize: 13.5,
            lineHeight: 1.55,
          }}
        >
          {p.objects_top3.length > 0 && (
            <div>
              <b>{t("us.sf.wgp.exp.objects")}</b>{" "}
              <span style={{ color: "var(--ink-2)" }}>{p.objects_top3.join(" · ")}</span>
            </div>
          )}
          <div
            style={{
              fontFamily: "var(--f-mono)",
              fontSize: 11.5,
              letterSpacing: ".03em",
              color: "var(--muted)",
              display: "flex",
              flexWrap: "wrap",
              gap: "6px 18px",
            }}
          >
            <span>
              {fill(t("us.sf.wgp.exp.share"), {
                share: fmtShare(p.share_of_fy_paid ?? 0),
                fy,
              })}
            </span>
            <span>{fill(t("us.sf.wgp.exp.vouchers"), { n: nfInt.format(p.n_vouchers) })}</span>
            {p.is_non_profit && <span>{t("us.sf.wgp.row.np_chip")}</span>}
          </div>
          {p.bucket_note && (
            <div style={{ fontSize: 12.5, color: "var(--muted-2)" }}>
              <b style={{ color: "var(--ink-2)" }}>{t("us.sf.wgp.exp.bucket_note")}</b>{" "}
              {p.bucket_note}
            </div>
          )}
        </div>
      )}
    </>
  );
}

function NonprofitTab({
  fy,
  yearData,
  grantOnly,
  setGrantOnly,
  vendorSlugMap,
}: {
  fy: number;
  yearData: WgpYear;
  grantOnly: boolean;
  setGrantOnly: (v: boolean) => void;
  vendorSlugMap: Record<string, string>;
}) {
  const t = useT();
  const np = yearData.nonprofit;

  if (!np) {
    return (
      <div className="fx-callout" style={{ marginTop: 18 }}>
        {t("us.sf.wgp.np.floor")}
      </div>
    );
  }

  const community = np.top.filter((r) => r.in_community_ranking);
  const excluded = np.top.filter((r) => !r.in_community_ranking).slice(0, 6);
  const rows = (
    grantOnly
      ? [...community]
          .filter((r) => (r.grant_funded_usd ?? 0) > 0)
          .sort((a, b) => (b.grant_funded_usd ?? 0) - (a.grant_funded_usd ?? 0))
      : community
  ).slice(0, NP_ROWS);
  const refMax = rows.length
    ? Math.max(
        ...rows.map((r) => (grantOnly ? r.grant_funded_usd ?? 0 : r.vouchers_paid_usd)),
      )
    : 1;

  return (
    <div style={{ marginTop: 18 }}>
      <KPIGrid
        cols={4}
        items={[
          {
            label: t("us.sf.wgp.np.kpi.total"),
            value: fmtUsdCompact(np.total_usd),
            delta:
              yearData.grants != null
                ? fill(t("us.sf.wgp.np.grant_share"), {
                    amount: fmtUsdCompact(yearData.grants.total_usd),
                  })
                : undefined,
          },
          { label: t("us.sf.wgp.np.kpi.orgs"), value: nfInt.format(np.n_vendors) },
          {
            label: t("us.sf.wgp.np.kpi.share"),
            value: fmtShare(np.share_of_total ?? 0),
          },
          {
            label: t("us.sf.wgp.np.kpi.top_dept"),
            value: (
              <span style={{ fontSize: 20 }}>{deptDisplay(np.top_department.name)}</span>
            ),
            delta:
              np.top_department.usd != null
                ? fmtUsdCompact(np.top_department.usd)
                : undefined,
          },
        ]}
      />
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          alignItems: "center",
          gap: "10px 18px",
          marginTop: 18,
          marginBottom: 4,
        }}
      >
        <label
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
            fontFamily: "var(--f-mono)",
            fontSize: 11.5,
            letterSpacing: ".04em",
            cursor: "pointer",
          }}
        >
          <input
            type="checkbox"
            checked={grantOnly}
            onChange={(e) => setGrantOnly(e.target.checked)}
          />
          {t("us.sf.wgp.np.grant_toggle")}
        </label>
      </div>
      <p className="fx-sec-sub" style={{ marginTop: 6 }}>
        {t("us.sf.wgp.np.ranking_note")}
      </p>
      <div className="fx-top-list wgp-rows" style={{ marginTop: 10 }}>
        <div className="fx-top-head">
          <span>{t("us.sf.wgp.s02.head.left")}</span>
          <span>{fill(t("us.sf.wgp.np.head.right"), { fy })}</span>
        </div>
        {rows.map((r, i) => {
          const value = grantOnly ? r.grant_funded_usd ?? 0 : r.vouchers_paid_usd;
          const slug = vendorSlugMap[r.vendor] ?? null;
          const inner = (
            <>
              <span className="r">{String(i + 1).padStart(2, "0")}</span>
              <span className="name">
                {r.vendor}
                <span
                  style={{
                    display: "block",
                    fontFamily: "var(--f-mono)",
                    fontSize: 10.5,
                    letterSpacing: ".03em",
                    color: "var(--muted)",
                    marginTop: 3,
                  }}
                >
                  {deptDisplay(r.top_department)}
                  {" · "}
                  {r.n_departments > 1
                    ? fill(t("us.sf.wgp.row.depts"), { n: r.n_departments })
                    : t("us.sf.wgp.row.dept_one")}
                </span>
              </span>
              <span
                className="bar"
                style={{ position: "relative", height: 8, background: "var(--rule)" }}
              >
                <span
                  className="fill"
                  style={{
                    width: `${(value / refMax) * 100}%`,
                    background: bucketColor(r.bucket ?? "nonprofit"),
                  }}
                />
              </span>
              <span className="v tnum">{fmtUsdCompact(value)}</span>
              <span className="theme">
                {!grantOnly && (r.grant_funded_usd ?? 0) > 0 ? (
                  <span
                    style={{
                      fontFamily: "var(--f-mono)",
                      fontSize: 11,
                      letterSpacing: ".03em",
                      color: "var(--bleu)",
                    }}
                  >
                    {fill(t("us.sf.wgp.np.grant_row"), {
                      amount: fmtUsdCompact(r.grant_funded_usd ?? 0),
                    })}
                  </span>
                ) : (
                  <BucketChip bucket={r.bucket ?? "nonprofit"} />
                )}
              </span>
              <span className="arrow" aria-hidden="true">
                {slug ? "→" : null}
              </span>
            </>
          );
          // Keyed nonprofit: the row IS the link to its fiche (parity with the
          // "all" tab). Unkeyed (outside the top ~200): plain row, never a dead link.
          return slug ? (
            <Link
              key={r.vendor}
              href={`/us/city/sf/who-gets-paid/payee/${slug}`}
              className="fx-top-row"
            >
              {inner}
            </Link>
          ) : (
            <div key={r.vendor} className="fx-top-row" style={{ cursor: "default" }}>
              {inner}
            </div>
          );
        })}
      </div>
      {excluded.length > 0 && (
        <div className="fx-callout" style={{ marginTop: 22 }}>
          <b>{t("us.sf.wgp.np.also_flagged")}</b>
          <div style={{ marginTop: 12, display: "grid", gap: 7 }}>
            {excluded.map((r: WgpNonprofitRow) => (
              <div
                key={r.vendor}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  flexWrap: "wrap",
                  gap: "4px 16px",
                  borderTop: "1px solid var(--rule)",
                  paddingTop: 7,
                }}
              >
                <span style={{ display: "inline-flex", gap: 10, alignItems: "baseline" }}>
                  <span style={{ fontWeight: 600 }}>{r.vendor}</span>
                  <BucketChip bucket={r.bucket} />
                </span>
                <span className="tnum" style={{ fontFamily: "var(--f-mono)", fontSize: 12.5 }}>
                  {fmtUsdCompact(r.vouchers_paid_usd)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default function TopPayeesSection({
  fy,
  yearData,
  meta,
  vendorSlugMap,
}: {
  fy: number;
  yearData: WgpYear;
  meta: WgpMeta;
  vendorSlugMap: Record<string, string>;
}) {
  const t = useT();
  const [tab, setTab] = useState<"all" | "np">("all");
  const [includePassThrough, setIncludePassThrough] = useState(false);
  const [grantOnly, setGrantOnly] = useState(false);
  const [expandedVendor, setExpandedVendor] = useState<string | null>(null);

  const excludedBuckets = meta.default_view.excluded_buckets;

  const list = useMemo(() => {
    const rows = yearData.payees.filter((p) => {
      if (p.bucket === "person") return false; // never featured
      if (includePassThrough) return true;
      return !excludedBuckets.includes(p.bucket ?? "");
    });
    return rows.slice(0, TOP_ROWS).map((p, i) => ({ ...p, rank: i + 1 }));
  }, [yearData.payees, includePassThrough, excludedBuckets]);

  const refMax = list[0]?.vouchers_paid_usd ?? 1;
  const top10 = list.slice(0, 10);
  const top10Sum = top10.reduce((s, p) => s + p.vouchers_paid_usd, 0);
  const coverage = yearData.bucket_coverage_pct;

  const tabBtn = (key: "all" | "np", label: string) => (
    <button
      type="button"
      onClick={() => {
        setTab(key);
        setExpandedVendor(null);
      }}
      aria-pressed={tab === key}
      style={{
        fontFamily: "var(--f-mono)",
        fontSize: 12,
        letterSpacing: ".05em",
        textTransform: "uppercase",
        padding: "7px 14px",
        border: "1px solid var(--ink)",
        background: tab === key ? "var(--ink)" : "transparent",
        color: tab === key ? "var(--bg)" : "var(--ink)",
        cursor: "pointer",
      }}
    >
      {label}
    </button>
  );

  return (
    <section className="fx-section" id="sec-top-payees">
      {/* Desktop-only: widen the chip column — bucket labels are the
          identity channel here and must not ellipsize (dataviz relief
          rule). Mobile keeps fusion.css's collapsed grid untouched. */}
      <style>{`
        @media (min-width: 861px) {
          .theme-fusion .wgp-rows .fx-top-row {
            grid-template-columns: 38px minmax(185px, 1.5fr) minmax(90px, 1.1fr) minmax(105px, auto) minmax(175px, auto) 24px;
          }
        }
      `}</style>
      <div className="fx-wrap">
        <SectionHead
          kind={t("us.sf.wgp.s02.kind")}
          title={
            <>
              {t("us.sf.wgp.s02.title.before")}
              <em>{t("us.sf.wgp.s02.title.em")}</em>
            </>
          }
          subtitle={fill(t("us.sf.wgp.s02.sub"), { fy })}
        />

        {/* Controls — part of the section head block, visually obvious. */}
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            alignItems: "center",
            gap: "12px 22px",
            margin: "2px 0 6px",
          }}
        >
          <div style={{ display: "inline-flex", gap: 8 }}>
            {tabBtn("all", t("us.sf.wgp.s02.tab.all"))}
            {tabBtn("np", t("us.sf.wgp.s02.tab.np"))}
          </div>
          {tab === "all" && (
            <label
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
                fontFamily: "var(--f-mono)",
                fontSize: 11.5,
                letterSpacing: ".04em",
                cursor: "pointer",
              }}
            >
              <input
                type="checkbox"
                checked={includePassThrough}
                onChange={(e) => {
                  setIncludePassThrough(e.target.checked);
                  setExpandedVendor(null);
                }}
              />
              Include{" "}
              <Tip label={t("us.sf.wgp.s02.toggle.off_note")}>
                fiscal agents &amp; pass-throughs
              </Tip>
            </label>
          )}
        </div>

        {/* Mode + coverage line */}
        <p
          style={{
            fontFamily: "var(--f-mono)",
            fontSize: 11,
            letterSpacing: ".04em",
            color: "var(--muted)",
            margin: "0 0 14px",
            lineHeight: 1.6,
          }}
        >
          {tab === "all" && includePassThrough && (
            <>{t("us.sf.wgp.s02.toggle.on_note")}{" "}</>
          )}
          {coverage != null && (
            <span
              style={
                coverage < COVERAGE_BADGE_BELOW
                  ? {
                      color: "var(--ocre)",
                      border: "1px solid var(--ocre)",
                      padding: "1px 6px",
                    }
                  : undefined
              }
            >
              {fill(t("us.sf.wgp.s02.coverage"), {
                pct: fmtShare(coverage),
                fy,
              })}
              {coverage < COVERAGE_BADGE_BELOW && ` ${t("us.sf.wgp.s02.coverage.low")}`}
            </span>
          )}
        </p>

        {tab === "all" ? (
          <>
            <div className="fx-top-list wgp-rows">
              <div className="fx-top-head">
                <span>{t("us.sf.wgp.s02.head.left")}</span>
                <span>{fill(t("us.sf.wgp.s02.head.right"), { fy })}</span>
              </div>
              {list.map((p) => (
                <PayeeRow
                  key={p.vendor}
                  p={p}
                  fy={fy}
                  refMax={refMax}
                  expanded={expandedVendor === p.vendor}
                  onToggle={() =>
                    setExpandedVendor(expandedVendor === p.vendor ? null : p.vendor)
                  }
                  payeeSlug={vendorSlugMap[p.vendor] ?? null}
                />
              ))}
            </div>
            <p
              style={{
                fontFamily: "var(--f-mono)",
                fontSize: 11,
                color: "var(--muted)",
                letterSpacing: ".04em",
                marginTop: 20,
              }}
            >
              {fill(t("us.sf.wgp.s02.footer.concentration"), {
                amount: fmtUsdCompact(top10Sum),
                pct: fmtShare(top10Sum / yearData.totals.all_usd),
                fy,
              })}
            </p>
          </>
        ) : (
          <NonprofitTab
            fy={fy}
            yearData={yearData}
            grantOnly={grantOnly}
            setGrantOnly={setGrantOnly}
            vendorSlugMap={vendorSlugMap}
          />
        )}

        <figcaption className="fx-chart-source">
          <b>{t("us.sf.wgp.s05.source_label")}:</b> {meta.source.name}{" "}
          <a href={meta.source.source_url} target="_blank" rel="noopener noreferrer">
            {t("us.sf.wgp.s05.data_link")} ↗
          </a>
        </figcaption>
      </div>
    </section>
  );
}
