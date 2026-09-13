"use client";

import Link from "@/components/LocalizedLink";
import { useEffect, useMemo, useRef, useState } from "react";
import SectionHead from "@/components/fusion/SectionHead";
import PageHook from "@/components/fusion/PageHook";
import ChartSource from "@/components/fusion/ChartSource";
import KPIGrid from "@/components/fusion/KPIGrid";
import Tip from "@/components/fusion/Tip";
import { useT } from "@/lib/localeContext";
import { fmtUsdCompact, fmtShare } from "@/lib/us/format";
import { bucketColor, bucketLabelKey, deptDisplay } from "./bucket";
import type { SearchPayee, SearchPayload, WgpMeta, WgpYear } from "./wgp-types";

/**
 * "Who gets paid" — the ranking AND the search, in one section.
 *
 * They used to be two. The ranking listed the top 15; the search sat beneath
 * it and had to be SEEDED FROM #16 so it would not repeat those 15 rows. That
 * offset was the tell: when two sections must be manually staggered to avoid
 * saying the same thing, they are one section. The contracts page never had
 * the problem because its "biggest" is a lens, leaving its search table free
 * to start at #1 — which is what this now does.
 *
 * Everything the ranking section carried survives, as filters rather than as
 * structure:
 *   · the all/nonprofit tabs      → the `kind` filter
 *   · include fiscal agents       → a checkbox in the same filter row
 *   · the nonprofit KPI band, the grant-funded lens and the note on why
 *     Kaiser and the universities sit outside the community ranking → shown
 *     when `kind = nonprofit` is selected, because they are facts about that
 *     view and meaningless outside it.
 *
 * Two data paths, deliberately:
 *   · no text query → the exported top-100 for the year (already on the
 *     page, ranked, no fetch);
 *   · a text query → the 4,068-row index, lazy-fetched on first keystroke.
 * So the common case ranks from #1 without pulling 2.3MB, and the long tail
 * is one keystroke away.
 */

const fill = (s: string, vars: Record<string, string | number>) => {
  let r = s;
  for (const [k, v] of Object.entries(vars)) r = r.split(`{${k}}`).join(String(v));
  return r;
};

const nfInt = new Intl.NumberFormat("en-US");

/** Rows before the fold. The ranking IS the point of this section, so it
 *  opens deeper than the contracts lookup table (5) does. */
const COLLAPSED = 12;
const EXPANDED = 40;
/** Below this classified-$ share the year gets a coverage badge. */
const COVERAGE_BADGE_BELOW = 0.75;

function normName(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function matches(nameNorm: string, queryNorm: string): boolean {
  if (!queryNorm) return false;
  return queryNorm.split(" ").every((tok) => nameNorm.includes(tok));
}

type IndexedPayee = SearchPayee & { nameNorm: string };

/** One row shape, whichever path produced it. */
type Row = {
  key: string;
  rank: number | null;
  name: string;
  amount: number;
  year: number;
  bucket: string | null;
  department: string | null;
  nDepartments: number | null;
  slug: string | null;
  grantUsd?: number | null;
  isAggregationLine?: boolean;
};

export default function PayeesExplorer({
  fy,
  yearData,
  meta,
  vendorSlugMap,
  seeds = [],
}: {
  fy: number;
  yearData: WgpYear;
  meta: WgpMeta;
  vendorSlugMap: Record<string, string>;
  /** Suggestion chips, already validated against the search index server-side
   *  (see buildSearchSeeds in page.tsx). The client cannot validate them: the
   *  index it would check against does not load until someone types. */
  seeds?: string[];
}) {
  const t = useT();
  const [query, setQuery] = useState("");
  const [dept, setDept] = useState("");
  const [kind, setKind] = useState("");
  const [minUsd, setMinUsd] = useState("");
  const [maxUsd, setMaxUsd] = useState("");
  const [includePassThrough, setIncludePassThrough] = useState(false);
  const [grantOnly, setGrantOnly] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const [index, setIndex] = useState<IndexedPayee[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const excludedBuckets = meta.default_view.excluded_buckets;
  const hasText = query.trim().length >= 2;
  const np = yearData.nonprofit;
  const nonprofitView = kind === "nonprofit" && !!np;

  // Lazy index, fetched once, only when someone actually types.
  const fetchedRef = useRef(false);
  useEffect(() => {
    if (!hasText || fetchedRef.current) return;
    fetchedRef.current = true;
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetch("/data/us/sf/payees_search.json")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((payload: SearchPayload) => {
        if (!cancelled) {
          setIndex((payload.data || []).map((p) => ({ ...p, nameNorm: normName(p.name) })));
        }
      })
      .catch((err: Error) => !cancelled && setError(err.message))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [hasText]);

  useEffect(() => {
    setShowAll(false);
  }, [query, dept, kind, minUsd, maxUsd, includePassThrough, grantOnly]);

  const departments = useMemo(() => {
    const seen = new Set<string>();
    for (const p of yearData.payees) if (p.top_department) seen.add(p.top_department);
    for (const p of index ?? []) if (p.topDepartment) seen.add(p.topDepartment);
    return [...seen].sort((a, b) => deptDisplay(a).localeCompare(deptDisplay(b)));
  }, [yearData.payees, index]);

  const refAmount = (p: SearchPayee): { year: number; amount: number } => {
    const inYear = p.byYear[String(fy)];
    if (inYear && inYear > 0) return { year: fy, amount: inYear };
    return { year: p.lastActiveYear, amount: p.byYear[String(p.lastActiveYear)] ?? p.totalAmount };
  };

  const min = minUsd ? Number(minUsd) : 0;
  const max = maxUsd ? Number(maxUsd) : Number.POSITIVE_INFINITY;

  const rows: Row[] = useMemo(() => {
    // ── Nonprofit view: the Controller's own community ranking, which the
    //    generic top-100 cannot reproduce (it carries in_community_ranking
    //    and grant_funded_usd per row).
    if (nonprofitView && np) {
      const base = np.top.filter((r) => r.in_community_ranking);
      const list = grantOnly
        ? base
            .filter((r) => (r.grant_funded_usd ?? 0) > 0)
            .sort((a, b) => (b.grant_funded_usd ?? 0) - (a.grant_funded_usd ?? 0))
        : base;
      return list
        .filter((r) => (!dept || r.top_department === dept))
        .filter((r) => {
          const v = grantOnly ? r.grant_funded_usd ?? 0 : r.vouchers_paid_usd;
          return v >= min && v <= max;
        })
        .filter((r) => !hasText || matches(normName(r.vendor), normName(query.trim())))
        .map((r, i) => ({
          key: r.vendor,
          rank: i + 1,
          name: r.vendor,
          amount: grantOnly ? r.grant_funded_usd ?? 0 : r.vouchers_paid_usd,
          year: fy,
          bucket: r.bucket ?? "nonprofit",
          department: r.top_department,
          nDepartments: r.n_departments,
          slug: vendorSlugMap[r.vendor] ?? null,
          grantUsd: r.grant_funded_usd,
        }));
    }

    // ── Text query: the long tail, from the lazy index.
    if (hasText && index) {
      const q = normName(query.trim());
      return index
        .filter((p) => {
          if (!matches(p.nameNorm, q)) return false;
          if (kind && (p.bucket ?? "") !== kind) return false;
          if (dept && p.topDepartment !== dept) return false;
          const a = refAmount(p).amount;
          return a >= min && a <= max;
        })
        .sort((a, b) => refAmount(b).amount - refAmount(a).amount)
        .map((p) => {
          const { year, amount } = refAmount(p);
          return {
            key: p.name,
            rank: null,
            name: p.name,
            amount,
            year,
            bucket: p.bucket,
            department: p.topDepartment,
            nDepartments: p.nDepartments,
            slug: vendorSlugMap[p.name] ?? null,
            isAggregationLine: p.isAggregationLine,
          };
        });
    }

    // ── Default: the year's ranking, from #1, no fetch.
    return yearData.payees
      .filter((p) => {
        if (p.bucket === "person") return false; // never featured
        if (!includePassThrough && excludedBuckets.includes(p.bucket ?? "")) return false;
        if (kind && (p.bucket ?? "") !== kind) return false;
        if (dept && p.top_department !== dept) return false;
        return p.vouchers_paid_usd >= min && p.vouchers_paid_usd <= max;
      })
      .map((p, i) => ({
        key: p.vendor,
        rank: i + 1,
        name: p.vendor,
        amount: p.vouchers_paid_usd,
        year: fy,
        bucket: p.bucket,
        department: p.top_department,
        nDepartments: p.n_departments,
        slug: vendorSlugMap[p.vendor] ?? null,
        grantUsd: p.grant_funded_usd,
        isAggregationLine: p.is_aggregation_line,
      }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    yearData, index, query, dept, kind, minUsd, maxUsd, includePassThrough, grantOnly,
    hasText, nonprofitView, fy, vendorSlugMap, excludedBuckets,
  ]);

  const displayed = rows.slice(0, showAll ? EXPANDED : COLLAPSED);
  const top10Sum = rows.slice(0, 10).reduce((s, r) => s + r.amount, 0);
  const coverage = yearData.bucket_coverage_pct;
  const filtersOn = Boolean(query || dept || kind || minUsd || maxUsd || grantOnly);

  const reset = () => {
    setQuery(""); setDept(""); setKind(""); setMinUsd(""); setMaxUsd(""); setGrantOnly(false);
  };

  return (
    <section className="fx-section" id="sec-payees">
      <div className="fx-wrap">
        <SectionHead
          title={
            <>
              Who <em>gets paid</em>
            </>
          }
          /* No literal count: the index is not loaded until someone types,
             and inventing a number to fill the sentence is what the
             zero-hardcode rule exists to stop. */
          subtitle={`Every payee of FY${fy}, biggest first. Type to search the full year's names, not just this ranking.`}
        />

        {/* One filter row for the whole section — what used to be tabs, a
            toggle and a separate search box. */}
        <div className="fx-search-wrap">
          <div className="fx-search-inner">
            <div className="fx-search-input-wrap">
              <span className="fx-search-icon" aria-hidden="true">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
                  <circle cx="11" cy="11" r="7" />
                  <path d="M20 20l-4-4" />
                </svg>
              </span>
              <input
                className="fx-search-input"
                type="search"
                placeholder={t("us.sf.wgp.s04.placeholder")}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>
            <div className="fx-search-filters">
              <span className="fx-search-filter-label">{t("us.sf.wgp.s04.filters")}</span>
              <select value={kind} aria-label="Kind of payee" onChange={(e) => setKind(e.target.value)}>
                <option value="">All kinds</option>
                {["supplier", "nonprofit", "healthcare", "other", "fiscal_agent_debt_service", "payroll_passthrough"].map(
                  (k) => (
                    <option key={k} value={k}>
                      {t(bucketLabelKey(k))}
                    </option>
                  ),
                )}
              </select>
              <select value={dept} aria-label={t("us.sf.wgp.s04.dept_aria")} onChange={(e) => setDept(e.target.value)}>
                <option value="">{t("us.sf.wgp.s04.all_depts")}</option>
                {departments.map((d) => (
                  <option key={d} value={d}>
                    {deptDisplay(d)}
                  </option>
                ))}
              </select>
              <div className="fx-search-range">
                <input type="number" placeholder="Min $" min="0" value={minUsd} onChange={(e) => setMinUsd(e.target.value)} />
                <span style={{ color: "var(--muted)", fontFamily: "var(--f-mono)", fontSize: 11 }}>→</span>
                <input type="number" placeholder="Max $" min="0" value={maxUsd} onChange={(e) => setMaxUsd(e.target.value)} />
              </div>
              {!nonprofitView && (
                <label className="fx-search-filter-label" style={{ display: "inline-flex", alignItems: "center", gap: 7, cursor: "pointer" }}>
                  <input type="checkbox" checked={includePassThrough} onChange={(e) => setIncludePassThrough(e.target.checked)} />
                  <Tip label={t("us.sf.wgp.s02.toggle.off_note")}>{t("us.sf.wgp.s02.toggle")}</Tip>
                </label>
              )}
              {filtersOn && (
                <button type="button" className="fx-search-clear" onClick={reset}>
                  {t("us.sf.wgp.s04.reset")}
                </button>
              )}
            </div>
          </div>

          {/* Suggestions, under the filter row and visible whenever nothing is
              active — the contracts-search placement. They used to appear only
              on an empty result set, which meant that once the ranking
              defaulted to twelve rows they never showed at all. */}
          {!filtersOn && seeds.length > 0 && (
            <div className="fx-search-seeds-row">
              <span className="fx-search-filter-label">{t("us.sf.wgp.s04.seeds_label")}</span>
              <div className="fx-search-seeds">
                {seeds.map((s) => (
                  <button
                    key={s}
                    type="button"
                    className="fx-search-seed"
                    onClick={() => setQuery(s)}
                  >
                    “{s}”
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Facts about the nonprofit view — shown with it, because outside it
            they describe nothing on screen. */}
        {nonprofitView && np && (
          <div style={{ marginTop: 18 }}>
            <KPIGrid
              cols={4}
              items={[
                {
                  label: t("us.sf.wgp.np.kpi.total"),
                  value: fmtUsdCompact(np.total_usd),
                  delta: yearData.grants != null
                    ? fill(t("us.sf.wgp.np.grant_share"), { amount: fmtUsdCompact(yearData.grants.total_usd) })
                    : undefined,
                },
                { label: t("us.sf.wgp.np.kpi.orgs"), value: nfInt.format(np.n_vendors) },
                { label: t("us.sf.wgp.np.kpi.share"), value: fmtShare(np.share_of_total ?? 0) },
                {
                  label: t("us.sf.wgp.np.kpi.top_dept"),
                  value: <span style={{ fontSize: 20 }}>{deptDisplay(np.top_department.name)}</span>,
                  delta: np.top_department.usd != null ? fmtUsdCompact(np.top_department.usd) : undefined,
                },
              ]}
            />
            <label
              style={{ display: "inline-flex", alignItems: "center", gap: 8, marginTop: 16, fontFamily: "var(--f-mono)", fontSize: 11.5, letterSpacing: ".04em", cursor: "pointer" }}
            >
              <input type="checkbox" checked={grantOnly} onChange={(e) => setGrantOnly(e.target.checked)} />
              {t("us.sf.wgp.np.grant_toggle")}
            </label>
            <p className="fx-sec-sub" style={{ marginTop: 8 }}>{t("us.sf.wgp.np.ranking_note")}</p>
          </div>
        )}

        {kind === "nonprofit" && !np && (
          <div className="fx-callout" style={{ marginTop: 18 }}>{t("us.sf.wgp.np.floor")}</div>
        )}

        <p className="fx-search-meta" style={{ margin: "18px 0 10px" }}>
          {hasText
            ? `${nfInt.format(rows.length)} ${rows.length === 1 ? "match" : "matches"}, largest first.`
            : `${nfInt.format(rows.length)} payees in this view, largest first.`}
        </p>

        {loading && !index && <div className="fx-search-placeholder"><p>{t("us.sf.wgp.s04.loading")}</p></div>}
        {error && <div className="fx-search-placeholder"><p>{fill(t("us.sf.wgp.s04.error"), { err: error })}</p></div>}

        {displayed.length > 0 && (
          <>
            <table className="fx-table fx-table-cards">
              <thead>
                <tr>
                  <th>{t("us.sf.wgp.s02.head.left")}</th>
                  <th>Department</th>
                  <th style={{ textAlign: "right" }}>{grantOnly ? "Grant-funded" : "Paid"}</th>
                </tr>
              </thead>
              <tbody>
                {displayed.map((r) => (
                  <tr key={r.key}>
                    <td className="c-lead" style={{ fontWeight: 500, maxWidth: 400 }}>
                      {r.slug ? (
                        <Link href={`/usa/san-francisco/who-gets-paid/payee/${r.slug}`} scroll={false} style={{ color: "var(--ink)" }}>
                          {r.name}
                        </Link>
                      ) : (
                        r.name
                      )}
                      <div
                        style={{ fontFamily: "var(--f-mono)", fontSize: 10.5, color: "var(--muted)", marginTop: 3, display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}
                      >
                        {r.rank != null && <span>#{r.rank}</span>}
                        {r.bucket ? (
                          <>
                            <span aria-hidden="true" style={{ width: 8, height: 8, background: bucketColor(r.bucket), flexShrink: 0 }} />
                            {t(bucketLabelKey(r.bucket))}
                          </>
                        ) : (
                          <span>{t("us.sf.wgp.row.unclassified")}</span>
                        )}
                        {r.isAggregationLine && <span>{t("us.sf.wgp.row.agg_chip")}</span>}
                        {!grantOnly && (r.grantUsd ?? 0) > 0 && (
                          <span style={{ color: "var(--bleu)" }}>
                            {fill(t("us.sf.wgp.np.grant_row"), { amount: fmtUsdCompact(r.grantUsd ?? 0) })}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="muted c-wide" style={{ maxWidth: 160 }} data-label="Department">
                      {deptDisplay(r.department)}
                      {r.nDepartments != null && r.nDepartments > 1 && (
                        <span style={{ display: "block", fontFamily: "var(--f-mono)", fontSize: 10.5 }}>
                          {fill(t("us.sf.wgp.row.depts"), { n: r.nDepartments })}
                        </span>
                      )}
                    </td>
                    <td className="num c-fig" data-label={grantOnly ? "Grant-funded" : "Paid"}>
                      {fmtUsdCompact(r.amount)}
                      <span style={{ display: "block", fontFamily: "var(--f-mono)", fontSize: 10.5, color: "var(--muted)" }}>
                        {r.year}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {rows.length > displayed.length && (
              <button type="button" className="fx-results-more" onClick={() => setShowAll(true)}>
                {fill(t("us.sf.wgp.s04.more"), {
                  n: Math.min(EXPANDED - COLLAPSED, rows.length - displayed.length),
                  left: rows.length - displayed.length,
                })}
              </button>
            )}
          </>
        )}

        {!loading && !error && displayed.length === 0 && (
          <div className="fx-search-placeholder">
            <p>{t("us.sf.wgp.s04.empty")}</p>
            <div className="fx-search-seeds">
              {seeds.map((s) => (
                <button key={s} type="button" className="fx-search-seed" onClick={() => setQuery(s)}>
                  “{s}”
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Also-flagged nonprofits: the reason Kaiser and the universities are
            not in the community ranking above. */}
        {nonprofitView && np && np.top.some((r) => !r.in_community_ranking) && (
          <div className="fx-callout" style={{ marginTop: 22 }}>
            <b>{t("us.sf.wgp.np.also_flagged")}</b>
            <div style={{ marginTop: 12, display: "grid", gap: 7 }}>
              {np.top.filter((r) => !r.in_community_ranking).slice(0, 6).map((r) => (
                <div key={r.vendor} style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: "4px 16px", borderTop: "1px solid var(--rule)", paddingTop: 7 }}>
                  <span>{r.vendor}</span>
                  <span className="tnum" style={{ fontFamily: "var(--f-mono)", fontSize: 12.5 }}>
                    {fmtUsdCompact(r.vouchers_paid_usd)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        <p style={{ fontFamily: "var(--f-mono)", fontSize: 11, letterSpacing: ".04em", color: "var(--muted)", margin: "14px 0 0", lineHeight: 1.7 }}>
          {!hasText && !nonprofitView && (
            <>
              {fill(t("us.sf.wgp.s02.footer.concentration"), {
                amount: fmtUsdCompact(top10Sum),
                pct: fmtShare(top10Sum / yearData.totals.all_usd),
                fy,
              })}{" "}
            </>
          )}
          {includePassThrough && <>{t("us.sf.wgp.s02.toggle.on_note")} </>}
          {coverage != null && (
            <span style={coverage < COVERAGE_BADGE_BELOW ? { color: "var(--ocre)", border: "1px solid var(--ocre)", padding: "1px 6px" } : undefined}>
              {fill(t("us.sf.wgp.s02.coverage"), { pct: fmtShare(coverage), fy })}
              {coverage < COVERAGE_BADGE_BELOW && ` ${t("us.sf.wgp.s02.coverage.low")}`}
            </span>
          )}
          <br />
          {t("us.sf.wgp.s04.person_note")}{" "}
          <Link href="/usa/san-francisco/sources#sec-payees" style={{ color: "var(--bleu)" }}>
            {t("us.sf.wgp.s05.label")} →
          </Link>
        </p>

        <PageHook
          variant="card"
          cite={fill(t("us.sf.wgp.hook.cite"), { fy })}
          shareText={fill(t("us.sf.wgp.hook.share"), {
            total: fmtUsdCompact(yearData.totals.all_usd),
            fy,
            n: nfInt.format(yearData.n_vendors),
            pct: fmtShare(top10Sum / yearData.totals.all_usd),
            related: fmtUsdCompact(yearData.totals.related_govt_units_usd),
          })}
        >
          <span
            dangerouslySetInnerHTML={{
              __html: fill(t("us.sf.wgp.hook.body"), {
                total: fmtUsdCompact(yearData.totals.all_usd),
                fy,
                n: nfInt.format(yearData.n_vendors),
                pct: fmtShare(top10Sum / yearData.totals.all_usd),
                related: fmtUsdCompact(yearData.totals.related_govt_units_usd),
                relatedShare:
                  yearData.totals.related_share_of_total != null
                    ? fmtShare(yearData.totals.related_share_of_total)
                    : "—",
              }),
            }}
          />
        </PageHook>

        <ChartSource
          source={meta.source.name}
          dataHref={meta.source.source_url}
          methodHref="/usa/san-francisco/sources#sec-payees"
        />
      </div>
    </section>
  );
}
