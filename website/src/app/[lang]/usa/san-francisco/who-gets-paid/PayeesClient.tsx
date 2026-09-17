"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "@/components/LocalizedLink";
import AnneesRail, { RAIL_MIN } from "@/components/fusion/AnneesRail";
import SectionHero from "@/components/fiche/SectionHero";
import ShareButton from "@/components/fiche/ShareButton";
import { Door, NextDoor } from "@/components/fiche/Doors";
import { V3Fold, V3Foot, V3Row, V3Section } from "@/components/fiche/v3";
import { useT } from "@/lib/localeContext";
import { useTrack } from "@/lib/analyticsContext";
import { fill } from "@/lib/fmt";
import { fmtUsdAmt, fmtUsdCompact, fmtShare } from "@/lib/us/format";
import { bucketLabelKey, deptDisplay } from "./bucket";
import type { SearchPayee, SearchPayload, WgpMeta, WgpYear, WgpYearStatus } from "./wgp-types";
import type { SfPaymentBreakdowns } from "@/lib/us/sf-payment-breakdowns";
import type { SfSpendingSection } from "@/lib/us/sf-spending";

/**
 * Who the City pays, on the section grammar (2026-09-18), the same page as
 * Paris's Subventions and Recife's Quem recebe : the number (every settled
 * payment of the fiscal year, its year as a menu, the movement in ochre) with
 * the rail of the years ; the scene (where the money went — by department,
 * by service area, by kind of payee, one total re-cut) ; what the City
 * bought (the purchase categories, each opening its fiche) ; the biggest
 * payees, biggest first, filterable, each opening its fiche, with a search
 * that reaches the long tail on the first keystroke ; Understand ; See also ;
 * the next section ; the source. EN-only (ADR-0010 D3) : `us.sf.wgp3.*`.
 *
 * Two data paths for the payees, deliberately : no text query → the
 * exported top-100 of the year (on the page, ranked, no fetch) ; a text
 * query → the 4 000-row index, fetched once on the first keystroke.
 */

const BASE = "/usa/san-francisco";
const WGP = `${BASE}/who-gets-paid`;
const ROWS = 12;
const ROWS_MAX = 40;
const BUYS = 8;
/** Below this classified-$ share the year gets a coverage badge. */
const COVERAGE_BADGE_BELOW = 0.75;
const KINDS = ["supplier", "nonprofit", "healthcare", "other", "fiscal_agent_debt_service", "payroll_passthrough"];

type Lens = "department" | "org_group" | "kind";
const LENSES: Lens[] = ["department", "org_group", "kind"];

export type SfPayeesDoors = {
  budget: { fy: number; total: number } | null;
  contracts: { n: number; agreed: number } | null;
  payroll: { fy: number; total: number; n: number } | null;
};

export type SfPayeesPageData = {
  fy: number;
  yearData: WgpYear;
  years: WgpYearStatus[];
  /** Every year's total, for the rail. */
  series: { year: number; amount: number }[];
  meta: WgpMeta;
  vendorSlugMap: Record<string, string>;
  /** Suggestion chips, validated server-side against the search index. */
  searchSeeds: string[];
  /** dept code → budget fiche href, server-validated. */
  deptHrefs: Record<string, string>;
  spending: SfSpendingSection | null;
  breakdowns: SfPaymentBreakdowns | null;
  doors: SfPayeesDoors;
};

const int = new Intl.NumberFormat("en-US");
const pct1 = (x: number) => `${Math.abs(x).toLocaleString("en-US", { maximumFractionDigits: 1 })}%`;

function normName(s: string): string {
  return s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, " ").trim();
}
function matches(nameNorm: string, queryNorm: string): boolean {
  if (!queryNorm) return false;
  return queryNorm.split(" ").every((tok) => nameNorm.includes(tok));
}

type IndexedPayee = SearchPayee & { nameNorm: string };
type Row = { key: string; rank: number | null; name: string; amount: number; year: number; bucket: string | null; department: string | null; nDepartments: number | null; slug: string | null; grantUsd?: number | null; isAggregationLine?: boolean };

export default function PayeesClient({ d }: { d: SfPayeesPageData }) {
  const t = useT();
  const track = useTrack();
  const { fy, yearData, meta } = d;
  const tot = yearData.totals;
  const Amt = ({ n }: { n: number }) => { const f = fmtUsdAmt(n); return <span className="fx-v3-amt tnum" style={{ fontSize: 14 }}>{f.v}<span className="u">{f.u}</span></span>; };
  const statusOf = (y: number) => d.years.find((x) => x.fy === y)?.status ?? "closed";

  /* ── The number : every settled payment of the fiscal year ── */
  const total = fmtUsdAmt(tot.all_usd);
  const prev = d.series.find((s) => s.year === fy - 1);
  const yoy = prev && prev.amount > 0 ? (tot.all_usd / prev.amount - 1) * 100 : null;
  const move = yoy == null ? undefined : Math.abs(yoy) < 0.05 ? fill(t("us.sf.wgp3.move_flat"), { y: fy - 1 }) : fill(t(yoy > 0 ? "us.sf.wgp3.move_up" : "us.sf.wgp3.move_down"), { pct: pct1(yoy), y: fy - 1 });
  const provisional = d.years.filter((y) => y.status !== "closed").map((y) => y.fy);
  const yearLabel = (y: number) => `FY${y} · ${t(`us.sf.wgp3.status.${statusOf(y)}`)}`;
  const shareTitle = fill(t("us.sf.wgp3.share_title"), { total: fmtUsdCompact(tot.all_usd), y: fy, n: int.format(yearData.n_vendors) });
  const relatedTxt = tot.related_share_of_total != null ? fill(t("us.sf.wgp3.meta_related"), { v: fmtUsdCompact(tot.related_govt_units_usd), pct: fmtShare(tot.related_share_of_total) }) : null;

  /* ── The scene : where the money went, one total re-cut three ways ── */
  // Who is paid comes first (2026-09-18) : the department lens is the paying side,
  // a budget view ; the kinds of payee answer the page's question.
  const [lens, setLens] = useState<Lens>("kind");
  const pickLens = (l: Lens) => {
    if (l === lens) return;
    track("filter_change", { page: "who-gets-paid", field: "lens", value: l });
    setLens(l);
  };
  const bk = d.breakdowns;
  const lensRows = (bk?.dimensions[lens] ?? []).filter((r) => r.usd > 0);
  const lensMax = lensRows[0]?.usd ?? 1;
  const lensLabel = (key: string, label: string) => (lens === "kind" ? (key === "unclassified" ? t("us.sf.wgp3.kind_unclassified") : t(bucketLabelKey(key))) : lens === "department" ? deptDisplay(label) : label);
  const unclassified = bk ? (bk.dimensions.kind.find((r) => r.key === "unclassified")?.usd ?? 0) / Math.max(bk.totalUsd, 1) : 0;

  /* ── What the City bought : the purchase categories, each opening its fiche ── */
  const sp = d.spending;
  const buys = sp?.totals.purchase ?? 0;
  const buyRows = (sp?.purchases ?? []).filter((r) => r.paid_usd > 0);
  const buysShown = buyRows.slice(0, BUYS);
  const buysRest = buyRows.length - BUYS >= 2 ? buyRows.slice(BUYS) : [];
  const buysAll = buysRest.length ? buysShown : buyRows;
  const BuyRow = (r: (typeof buyRows)[number]) => (
    <V3Row
      key={r.code}
      href={r.top_payees.length > 0 ? `${WGP}/category/${r.slug}?year=${fy}` : undefined}
      label={r.label}
      subText={[fill(t("us.sf.wgp3.buy_sub"), { n: int.format(r.n_vendors), pct: fmtShare(r.share_of_class) }), r.exemplar ? r.exemplar.vendor : null].filter(Boolean).join(" · ")}
      amount={<Amt n={r.paid_usd} />}
    />
  );

  /* ── The biggest payees : the year's ranking, filters, and the long-tail search ── */
  const [query, setQuery] = useState("");
  const [dept, setDept] = useState("");
  const [kind, setKind] = useState("");
  const [includePassThrough, setIncludePassThrough] = useState(false);
  const [grantOnly, setGrantOnly] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const [index, setIndex] = useState<IndexedPayee[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const excludedBuckets = meta.default_view.excluded_buckets;
  const q = query.trim();
  const hasText = q.length >= 2;
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
      .then((payload: SearchPayload) => { if (!cancelled) setIndex((payload.data || []).map((p) => ({ ...p, nameNorm: normName(p.name) }))); })
      .catch((err: Error) => !cancelled && setError(err.message))
      .finally(() => !cancelled && setLoading(false));
    return () => { cancelled = true; };
  }, [hasText]);
  useEffect(() => { setShowAll(false); }, [query, dept, kind, includePassThrough, grantOnly]);

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
  const rows: Row[] = useMemo(() => {
    // The Controller's own community ranking, which the generic top-100 cannot reproduce.
    if (nonprofitView && np) {
      const base = np.top.filter((r) => r.in_community_ranking);
      const list = grantOnly ? base.filter((r) => (r.grant_funded_usd ?? 0) > 0).sort((a, b) => (b.grant_funded_usd ?? 0) - (a.grant_funded_usd ?? 0)) : base;
      return list
        .filter((r) => !dept || r.top_department === dept)
        .filter((r) => !hasText || matches(normName(r.vendor), normName(q)))
        .map((r, i) => ({ key: r.vendor, rank: i + 1, name: r.vendor, amount: grantOnly ? r.grant_funded_usd ?? 0 : r.vouchers_paid_usd, year: fy, bucket: r.bucket ?? "nonprofit", department: r.top_department, nDepartments: r.n_departments, slug: d.vendorSlugMap[r.vendor] ?? null, grantUsd: r.grant_funded_usd }));
    }
    // The long tail, from the lazy index.
    if (hasText && index) {
      const qn = normName(q);
      return index
        .filter((p) => matches(p.nameNorm, qn) && (!kind || (p.bucket ?? "") === kind) && (!dept || p.topDepartment === dept))
        .sort((a, b) => refAmount(b).amount - refAmount(a).amount)
        .map((p) => { const { year, amount } = refAmount(p); return { key: p.name, rank: null, name: p.name, amount, year, bucket: p.bucket, department: p.topDepartment, nDepartments: p.nDepartments, slug: d.vendorSlugMap[p.name] ?? null, isAggregationLine: p.isAggregationLine }; });
    }
    // The year's ranking, from #1, no fetch.
    return yearData.payees
      .filter((p) => p.bucket !== "person" && (includePassThrough || !excludedBuckets.includes(p.bucket ?? "")) && (!kind || (p.bucket ?? "") === kind) && (!dept || p.top_department === dept))
      .map((p, i) => ({ key: p.vendor, rank: i + 1, name: p.vendor, amount: p.vouchers_paid_usd, year: fy, bucket: p.bucket, department: p.top_department, nDepartments: p.n_departments, slug: d.vendorSlugMap[p.vendor] ?? null, grantUsd: p.grant_funded_usd, isAggregationLine: p.is_aggregation_line }));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- refAmount only reads fy.
  }, [yearData, index, q, dept, kind, includePassThrough, grantOnly, hasText, nonprofitView, np, fy, d.vendorSlugMap, excludedBuckets]);

  // Zero-result searches guide the seeds : counted once typed.
  useEffect(() => {
    if (!hasText || loading) return;
    const id = window.setTimeout(() => track("search_submit", { page: "who-gets-paid", q_len: q.length, results_count: rows.length }), 700);
    return () => window.clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- rows is fresh in the closure ; fire on the query only.
  }, [q, hasText, loading]);

  const shown = rows.slice(0, ROWS);
  const rest = rows.length - ROWS >= 2 ? rows.slice(ROWS, showAll ? ROWS_MAX : ROWS_MAX) : [];
  const shownAll = rest.length ? shown : rows;
  const beyond = Math.max(0, rows.length - ROWS - rest.length);
  const top10 = rows.slice(0, 10).reduce((s, r) => s + r.amount, 0);
  const coverage = yearData.bucket_coverage_pct;
  const filtersOn = Boolean(q || dept || kind || grantOnly);
  const reset = () => { setQuery(""); setDept(""); setKind(""); setGrantOnly(false); };
  const PayeeRow = (r: Row) => (
    <V3Row
      key={r.key}
      href={r.slug ? `${WGP}/payee/${r.slug}` : undefined}
      label={r.name}
      subText={[r.rank != null ? `#${r.rank}` : null, r.bucket ? t(bucketLabelKey(r.bucket)) : t("us.sf.wgp.row.unclassified"), r.isAggregationLine ? t("us.sf.wgp.row.agg_chip") : null, r.department ? deptDisplay(r.department) : null, r.nDepartments != null && r.nDepartments > 1 ? fill(t("us.sf.wgp.row.depts"), { n: r.nDepartments }) : null, r.year !== fy ? `FY${r.year}` : null, !grantOnly && (r.grantUsd ?? 0) > 0 ? fill(t("us.sf.wgp.np.grant_row"), { amount: fmtUsdCompact(r.grantUsd ?? 0) }) : null].filter(Boolean).join(" · ")}
      amount={<Amt n={r.amount} />}
      onClick={hasText ? () => track("search_result_click", { page: "who-gets-paid", entity_name: r.name }) : undefined}
    />
  );
  const rowsTitle = hasText
    ? fill(t("us.sf.wgp3.h.rows_q"), { n: int.format(rows.length), q })
    : nonprofitView
      ? fill(t("us.sf.wgp3.h.rows_np"), { y: fy })
      : fill(t("us.sf.wgp3.h.rows"), { y: fy });

  return (
    <main id="main-content" tabIndex={-1}>
      <div className="fx-sec fx-v3">
        <div className="fx-sec-kicker fx-page-kicker fx-page-kicker--links"><Link href={BASE}>San Francisco</Link> › {t("us.sf.wgp3.kicker")}</div>
        <div className="fx-sec-grid" data-layout="subventions">
          <div className="fx-sec-a-hero">
            <SectionHero
              title={t("us.sf.wgp3.title")}
              value={total.v}
              unit={total.u}
              captionBefore={t("us.sf.wgp3.cap_before")}
              years={d.years.map((y) => y.fy)}
              year={fy}
              yearLabel={yearLabel}
              basePath={WGP}
              meta={[fill(t("us.sf.wgp3.meta_vouchers"), { n: int.format(yearData.n_vouchers), m: int.format(yearData.n_vendors) }), relatedTxt].filter(Boolean).join(" · ")}
              move={move}
              shareTitle={shareTitle}
            />
            {d.series.length >= RAIL_MIN ? (
              <div className="fx-sec-years" data-section="years">
                <div className="fx-page-kicker">{t("fx.sec.years")}</div>
                <AnneesRail rows={d.series} current={fy} provisional={provisional} format={fmtUsdCompact} />
                <p className="fx-v3-note">{t("us.sf.wgp3.years_note")}</p>
              </div>
            ) : null}
          </div>

          <div className="fx-sec-a-scene">
            {bk ? (
              <V3Section id="scene" title={fill(t("us.sf.wgp3.h.scene"), { y: fy })} sub={fill(t("us.sf.wgp3.scene_sub"), { total: fmtUsdCompact(bk.totalUsd) })} hint={lens === "department" ? t("us.sf.wgp3.scene_hint") : lens === "kind" ? t("us.sf.wgp3.scene_hint_kind") : undefined}>
                <div id="wgp-scene" className="fx-bud-cols fx-bud-cols--one">
                  <div className="fx-bud-col">
                    <h3>
                      <span className="fx-sec-switch" role="group" aria-label={t("us.sf.wgp3.g.aria")}>
                        {LENSES.map((l) => (
                          <button key={l} type="button" aria-pressed={lens === l} onClick={() => pickLens(l)}>{t(`us.sf.wgp3.g.${l}`)}</button>
                        ))}
                      </span>
                      <span className="tnum">{fmtUsdCompact(bk.totalUsd)}</span>
                    </h3>
                    {lensRows.map((r) => {
                      const href = lens === "department" ? d.deptHrefs[r.key] ?? null : null;
                      // A kind of payee keeps only those in the list below.
                      const onKind = lens === "kind" && KINDS.includes(r.key) ? () => {
                        track("filter_change", { page: "who-gets-paid", field: "kind", value: r.key, from: "scene" });
                        setKind(r.key);
                        document.querySelector('[data-section="rows"]')?.scrollIntoView({ behavior: "smooth", block: "start" });
                      } : null;
                      const body = (
                        <>
                          <span className="n">
                            {lensLabel(r.key, r.label)}
                            <i className="bar" style={{ width: `${Math.max(2, Math.round((r.usd / lensMax) * 100))}%` }} aria-hidden="true" />
                          </span>
                          <span className="sp" />
                          <Amt n={r.usd} />
                          <span className="p tnum">{Math.round(r.shareOfFy * 100)} %</span>
                          <span className="c" aria-hidden="true">{href || onKind ? "›" : ""}</span>
                        </>
                      );
                      return href ? <Link key={r.key} href={href} scroll={false} className="fx-bud-row">{body}</Link> : onKind ? <button key={r.key} type="button" className="fx-bud-row" onClick={onKind}>{body}</button> : <div key={r.key} className="fx-bud-row fx-bud-row--static">{body}</div>;
                    })}
                  </div>
                </div>
                <p className="fx-v3-note">
                  {lens === "kind"
                    ? fill(t("us.sf.wgp3.scene_note_kind"), { pct: fmtShare(unclassified) })
                    : fill(t("us.sf.wgp3.scene_note_related"), { v: fmtUsdCompact(tot.related_govt_units_usd), pct: tot.related_share_of_total != null ? fmtShare(tot.related_share_of_total) : "—", list: (yearData.related_top_departments ?? []).map((x) => `${deptDisplay(x.department)} ${fmtUsdCompact(x.usd)}`).join(" · ") })}
                </p>
                <ShareButton label={t("fx.sec.share_chart")} done={t("fx.sec.shared")} title={shareTitle} object={`scene_${lens}`} anchor="wgp-scene" />
              </V3Section>
            ) : null}
          </div>

          <div className="fx-sec-a-search">
            {sp && buysAll.length > 0 && buys > 0 ? (
              <V3Section id="buys" title={fill(t("us.sf.wgp3.h.buys"), { y: fy })} sub={fill(t("us.sf.wgp3.buys_sub"), { buys: fmtUsdCompact(buys), total: fmtUsdCompact(sp.totalAll), n: int.format(sp.nPurchaseCategories) })} hint={t("us.sf.wgp3.buys_hint")}>
                {buysAll.map(BuyRow)}
                {buysRest.length > 0 ? <V3Fold id="more-buys" label={fill(t("us.sf.wgp3.buys_more"), { n: int.format(buysRest.length) })}>{buysRest.map(BuyRow)}</V3Fold> : null}
                <p className="fx-v3-note">{sp.classificationNote}</p>
              </V3Section>
            ) : null}

            <V3Section id="rows" title={rowsTitle} sub={hasText ? undefined : t("us.sf.wgp3.rows_sub")} hint={t("fx.v3.rows.aide")}>
              <div className="fx-search-wrap fx-search-wrap--fiche fx-sec-lieux-search">
                <div className="fx-search-inner">
                  <div className="fx-search-input-wrap">
                    <span className="fx-search-icon" aria-hidden="true">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><circle cx="11" cy="11" r="7" /><path d="M20 20l-4-4" /></svg>
                    </span>
                    <input className="fx-search-input" type="search" placeholder={t("us.sf.wgp.s04.placeholder")} value={query} onChange={(e) => setQuery(e.target.value)} aria-label={t("us.sf.wgp3.find_aria")} />
                    {query.length > 0 && (
                      <button type="button" className="fx-search-x" aria-label={t("fx.sec.mp.search_clear")} onClick={() => setQuery("")}>×</button>
                    )}
                  </div>
                  {!filtersOn && d.searchSeeds.length > 0 && (
                    <div className="fx-search-seeds">
                      {d.searchSeeds.slice(0, 5).map((s) => (
                        <button key={s} type="button" className="fx-search-seed" onClick={() => { track("search_seed_click", { page: "who-gets-paid", seed: s }); setQuery(s); }}>{s}</button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
              <div className="fx-sec-lieux-filters fx-sec-wgp-filters">
                <label className="fx-sec-lieux-arr">
                  <span className="fx-page-kicker">{t("us.sf.wgp3.by_kind")}</span>
                  <select value={kind} onChange={(e) => { track("filter_change", { page: "who-gets-paid", field: "kind", value: e.target.value || "all" }); setKind(e.target.value); }}>
                    <option value="">{t("us.sf.wgp3.kind_all")}</option>
                    {KINDS.map((k) => <option key={k} value={k}>{t(bucketLabelKey(k))}</option>)}
                  </select>
                </label>
                <label className="fx-sec-lieux-arr">
                  <span className="fx-page-kicker">{t("us.sf.wgp3.by_dept")}</span>
                  <select value={dept} onChange={(e) => { track("filter_change", { page: "who-gets-paid", field: "department", value: e.target.value || "all" }); setDept(e.target.value); }}>
                    <option value="">{t("us.sf.wgp.s04.all_depts")}</option>
                    {departments.map((x) => <option key={x} value={x}>{deptDisplay(x)}</option>)}
                  </select>
                </label>
                {!nonprofitView ? (
                  <label className="fx-sec-wgp-check">
                    <input type="checkbox" checked={includePassThrough} onChange={(e) => { track("filter_change", { page: "who-gets-paid", field: "pass_through", value: e.target.checked ? "on" : "off" }); setIncludePassThrough(e.target.checked); }} />
                    <span>{t("us.sf.wgp.s02.toggle")}</span>
                  </label>
                ) : (
                  <label className="fx-sec-wgp-check">
                    <input type="checkbox" checked={grantOnly} onChange={(e) => setGrantOnly(e.target.checked)} />
                    <span>{t("us.sf.wgp.np.grant_toggle")}</span>
                  </label>
                )}
              </div>
              {nonprofitView && np ? (
                <p className="fx-v3-note">{fill(t("us.sf.wgp3.np_line"), { total: fmtUsdCompact(np.total_usd), n: int.format(np.n_vendors), pct: fmtShare(np.share_of_total ?? 0), dept: deptDisplay(np.top_department.name), grants: yearData.grants ? fmtUsdCompact(yearData.grants.total_usd) : "—" })} {t("us.sf.wgp.np.ranking_note")}</p>
              ) : null}
              {kind === "nonprofit" && !np ? <p className="fx-v3-note">{t("us.sf.wgp.np.floor")}</p> : null}
              {loading && !index ? <p className="fx-v3-sentence">{t("us.sf.wgp.s04.loading")}</p> : null}
              {error ? <p className="fx-v3-sentence">{fill(t("us.sf.wgp.s04.error"), { err: error })}</p> : null}
              {!loading && !error && shownAll.length === 0 ? <p className="fx-v3-sentence">{t("us.sf.wgp.s04.empty")}</p> : shownAll.map(PayeeRow)}
              {rest.length > 0 ? (
                <V3Fold id="more-rows" label={fill(t("us.sf.wgp3.rows_more"), { n: int.format(rest.length) })}>
                  {rest.map(PayeeRow)}
                  {beyond > 0 ? <p className="fx-v3-note">{fill(t("us.sf.wgp3.rows_beyond"), { n: int.format(beyond) })}</p> : null}
                </V3Fold>
              ) : null}
              {filtersOn ? <p className="fx-v3-note"><button type="button" className="fx-link-btn" onClick={reset}>{t("us.sf.wgp3.rows_all")}</button></p> : null}
              {!hasText && !nonprofitView && rows.length > 0 ? (
                <p className="fx-v3-note">
                  {fill(t("us.sf.wgp.s02.footer.concentration"), { amount: fmtUsdCompact(top10), pct: fmtShare(top10 / tot.all_usd), fy })}
                  {includePassThrough ? ` ${t("us.sf.wgp.s02.toggle.on_note")}` : ""}
                  {coverage != null ? ` ${fill(t("us.sf.wgp.s02.coverage"), { pct: fmtShare(coverage), fy })}${coverage < COVERAGE_BADGE_BELOW ? ` ${t("us.sf.wgp.s02.coverage.low")}` : ""}` : ""}
                </p>
              ) : null}
              {nonprofitView && np && np.top.some((r) => !r.in_community_ranking) ? (
                <V3Fold id="also-flagged" label={t("us.sf.wgp.np.also_flagged")}>
                  {np.top.filter((r) => !r.in_community_ranking).slice(0, 6).map((r) => (
                    <V3Row key={r.vendor} href={d.vendorSlugMap[r.vendor] ? `${WGP}/payee/${d.vendorSlugMap[r.vendor]}` : undefined} label={r.vendor} subText={r.top_department ? deptDisplay(r.top_department) : undefined} amount={<Amt n={r.vouchers_paid_usd} />} />
                  ))}
                </V3Fold>
              ) : null}
            </V3Section>
          </div>

          <div className="fx-sec-a-understand">
            <V3Section id="understand" title={t("fx.sec.understand")}>
              <V3Fold id="what" label={t("us.sf.wgp3.u.what")}><p className="fx-v3-sentence">{meta.perimeter} {meta.ranking_caveat}</p></V3Fold>
              <V3Fold id="hidden" label={t("us.sf.wgp3.u.hidden")}><p className="fx-v3-sentence">{meta.default_view.note}</p></V3Fold>
              {tot.related_govt_units_usd > 0 ? (
                <V3Fold id="related" label={fill(t("us.sf.wgp3.u.related"), { v: fmtUsdCompact(tot.related_govt_units_usd), pct: tot.related_share_of_total != null ? fmtShare(tot.related_share_of_total) : "—" })}>
                  <p className="fx-v3-sentence">{t("us.sf.wgp3.u.related_body")}</p>
                  {(yearData.related_top_departments ?? []).map((x) => (
                    <V3Row key={x.department} label={deptDisplay(x.department)} amount={<Amt n={x.usd} />} />
                  ))}
                </V3Fold>
              ) : null}
              <V3Fold id="kinds" label={t("us.sf.wgp3.u.kinds")}><p className="fx-v3-sentence">{meta.classification.method} {meta.classification.coverage}</p></V3Fold>
              <V3Fold id="people" label={t("us.sf.wgp3.u.people")}><p className="fx-v3-sentence">{t("us.sf.wgp.s04.person_note")}</p></V3Fold>
              <V3Fold id="sources" label={t("us.sf.wgp3.u.source")}>
                <p className="fx-v3-sentence">{t("us.sf.wgp3.u.source_body")}</p>
                <p className="fx-v3-sentence">
                  <a href={meta.source.source_url} target="_blank" rel="noopener noreferrer">{meta.source.name} · DataSF ↗</a>
                  {" · "}
                  <a href="/data/us/sf/top_payees.json" target="_blank" rel="noopener noreferrer">top_payees.json ↗</a>
                  {" · "}
                  <a href="/data/us/sf/payment_breakdowns.json" target="_blank" rel="noopener noreferrer">payment_breakdowns.json ↗</a>
                  {" · "}
                  <Link href={`${BASE}/sources#sec-payees`}>{t("us.sf.bud3.u.method")}</Link>
                </p>
              </V3Fold>
            </V3Section>
          </div>

          <div className="fx-sec-a-related">
            <V3Section id="related-doors" title={t("fx.sec.see_also")}>
              {d.doors.budget ? (
                <Door href={`${BASE}/budget?year=${d.doors.budget.fy}`} hard title={t("us.sf.wgp3.r.budget")} sub={fill(t("us.sf.wgp3.r.budget_sub"), { y: d.doors.budget.fy })} value={fmtUsdAmt(d.doors.budget.total).v} unit={fmtUsdAmt(d.doors.budget.total).u} />
              ) : (
                <Door href={`${BASE}/budget`} hard title={t("us.sf.wgp3.r.budget")} sub={t("us.sf.wgp3.r.budget_sub_noyear")} />
              )}
              {d.doors.payroll ? (
                <Door href={`${BASE}/payroll`} hard title={t("us.sf.bud3.r.payroll")} sub={fill(t("us.sf.bud3.r.payroll_sub"), { n: int.format(d.doors.payroll.n), y: d.doors.payroll.fy })} value={fmtUsdAmt(d.doors.payroll.total).v} unit={fmtUsdAmt(d.doors.payroll.total).u} />
              ) : (
                <Door href={`${BASE}/payroll`} hard title={t("us.sf.bud3.r.payroll")} sub={t("us.sf.bud3.r.payroll_sub_noyear")} />
              )}
            </V3Section>
          </div>

          <div className="fx-sec-a-next">
            <NextDoor
              href={`${BASE}/contracts`}
              kicker={t("fx.sec.next")}
              title={t("us.sf.bud3.r.contracts")}
              sub={d.doors.contracts ? fill(t("us.sf.bud3.r.contracts_sub"), { n: int.format(d.doors.contracts.n) }) : t("us.sf.bud3.r.contracts_sub_noyear")}
              value={d.doors.contracts ? fmtUsdAmt(d.doors.contracts.agreed).v : undefined}
              unit={d.doors.contracts ? fmtUsdAmt(d.doors.contracts.agreed).u : undefined}
            />
          </div>

          <div className="fx-sec-a-foot">
            <V3Foot>{fill(t("us.sf.wgp3.foot"), { src: meta.source.attribution ?? "SF Controller’s Office", name: meta.source.name })}</V3Foot>
          </div>
        </div>
      </div>
    </main>
  );
}
