"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import SectionHead from "@/components/fusion/SectionHead";
import { useT } from "@/lib/localeContext";
import { fmtUsdCompact } from "@/lib/us/format";
import { bucketColor, bucketLabelKey, deptDisplay } from "./bucket";
import type { SearchPayee, SearchPayload } from "./wgp-types";

/**
 * Section 04 — search the long tail (Paris QuiRecoitExplorer section 04
 * transposed). The 4,068-vendor index is lazy-fetched on first query.
 *
 * Seed chips are runtime-validated against the EXACT corpus they query,
 * with the SAME predicate as the search (no-dead-suggestions rule): until
 * the index loads every candidate shows; once loaded, only chips matching
 * ≥1 payee survive. The predicate is a local EN normalizer — the French
 * synonym expansion (search-synonyms.ts) deliberately does not apply here.
 *
 * person-bucket rows follow the personnes-physiques doctrine: reachable
 * only by typing their name, labeled "individual payee", never suggested.
 */

const fill = (s: string, vars: Record<string, string | number>) => {
  let r = s;
  for (const [k, v] of Object.entries(vars)) r = r.split(`{${k}}`).join(String(v));
  return r;
};

/** Lowercase, fold diacritics, strip punctuation — the ONE predicate both
 *  the search and the seed-chip validation use. */
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

// Candidates span homelessness / education / utilities / health / transit /
// food security (study §4). Every chip is still runtime-validated above —
// curation here is only the shortlist, survival is decided by the corpus.
const SEED_CANDIDATES = [
  "Tenderloin Housing",
  "Five Keys",
  "Catholic Charities",
  "Kaiser",
  "Siemens",
  "Pacific Gas",
  "Meals on Wheels",
  "Food Bank",
];

const PAGE_SIZE = 24;
const nfInt = new Intl.NumberFormat("en-US");

type IndexedPayee = SearchPayee & { nameNorm: string };

export default function PayeesSearch({ fy }: { fy: number }) {
  const t = useT();
  const [query, setQuery] = useState("");
  const [dept, setDept] = useState("");
  const [minUsd, setMinUsd] = useState("");
  const [maxUsd, setMaxUsd] = useState("");
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [index, setIndex] = useState<IndexedPayee[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const hasQuery =
    query.trim().length >= 2 || dept.length > 0 || minUsd.length > 0 || maxUsd.length > 0;

  // Lazy fetch, one attempt per mount (Paris pattern — a failed fetch must
  // not retrigger in a loop).
  const fetchedRef = useRef(false);
  useEffect(() => {
    if (!hasQuery || fetchedRef.current) return;
    fetchedRef.current = true;
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetch("/data/us/sf/payees_search.json")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((payload: SearchPayload) => {
        if (cancelled) return;
        setIndex(
          (payload.data || []).map((p) => ({ ...p, nameNorm: normName(p.name) })),
        );
      })
      .catch((err: Error) => {
        if (cancelled) return;
        setError(err.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [hasQuery]);

  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [query, dept, minUsd, maxUsd]);

  // Runtime seed validation — same predicate as the search itself.
  const visibleSeeds = useMemo(() => {
    if (!index) return SEED_CANDIDATES;
    return SEED_CANDIDATES.filter((s) => {
      const q = normName(s);
      return index.some((p) => p.bucket !== "person" && matches(p.nameNorm, q));
    });
  }, [index]);

  const departments = useMemo(() => {
    if (!index) return [];
    const seen = new Set<string>();
    for (const p of index) if (p.topDepartment) seen.add(p.topDepartment);
    return [...seen].sort((a, b) => deptDisplay(a).localeCompare(deptDisplay(b)));
  }, [index]);

  /** Amount shown/sorted/filtered: viewed FY if active, else last active year. */
  const refAmount = (p: SearchPayee): { year: number; amount: number } => {
    const inYear = p.byYear[String(fy)];
    if (inYear && inYear > 0) return { year: fy, amount: inYear };
    return { year: p.lastActiveYear, amount: p.byYear[String(p.lastActiveYear)] ?? p.totalAmount };
  };

  const filtered = useMemo(() => {
    if (!hasQuery || !index) return [];
    const q = normName(query.trim());
    const min = minUsd ? Number(minUsd) : 0;
    const max = maxUsd ? Number(maxUsd) : Number.POSITIVE_INFINITY;
    return index
      .filter((p) => {
        if (query.trim().length >= 2 && !matches(p.nameNorm, q)) return false;
        if (query.trim().length < 2 && p.bucket === "person") return false; // never surfaced by filters alone
        if (dept && p.topDepartment !== dept) return false;
        const ref = refAmount(p).amount;
        if (ref < min || ref > max) return false;
        return true;
      })
      .sort((a, b) => refAmount(b).amount - refAmount(a).amount);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index, query, dept, minUsd, maxUsd, hasQuery, fy]);

  const reset = () => {
    setQuery("");
    setDept("");
    setMinUsd("");
    setMaxUsd("");
  };

  return (
    <section className="fx-section" id="sec-search">
      <div className="fx-wrap">
        <SectionHead
          kind={t("us.sf.wgp.s04.kind")}
          title={
            <>
              {t("us.sf.wgp.s04.title.before")}
              <em>{t("us.sf.wgp.s04.title.em")}</em>
            </>
          }
          subtitle={fill(t("us.sf.wgp.s04.sub"), {
            count: index ? nfInt.format(index.length) : "4,068",
          })}
        />
        <div className="fx-search-wrap">
          <div className="fx-search-inner">
            <div className="fx-search-label">{t("us.sf.wgp.s04.label")}</div>
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
              <select
                value={dept}
                aria-label={t("us.sf.wgp.s04.dept_aria")}
                disabled={!index}
                onChange={(e) => setDept(e.target.value)}
              >
                <option value="">{t("us.sf.wgp.s04.all_depts")}</option>
                {departments.map((d) => (
                  <option key={d} value={d}>
                    {deptDisplay(d)}
                  </option>
                ))}
              </select>
              <div className="fx-search-range">
                <input
                  type="number"
                  placeholder="Min $"
                  min="0"
                  value={minUsd}
                  onChange={(e) => setMinUsd(e.target.value)}
                />
                <span style={{ color: "var(--muted)", fontFamily: "var(--f-mono)", fontSize: 11 }}>→</span>
                <input
                  type="number"
                  placeholder="Max $"
                  min="0"
                  value={maxUsd}
                  onChange={(e) => setMaxUsd(e.target.value)}
                />
              </div>
              <button type="button" className="fx-search-clear" onClick={reset}>
                {t("us.sf.wgp.s04.reset")}
              </button>
            </div>
          </div>

          {hasQuery && (
            <div className="fx-search-meta">
              <span>
                {query.trim().length > 0 && (
                  <>
                    {t("us.sf.wgp.s04.results_for")} <b>“{query.trim()}”</b> ·{" "}
                  </>
                )}
                <b>
                  {nfInt.format(filtered.length)}{" "}
                  {filtered.length === 1
                    ? t("us.sf.wgp.s04.match_s")
                    : t("us.sf.wgp.s04.match_p")}
                </b>
              </span>
              <span>{fill(t("us.sf.wgp.s04.sorted"), { fy })}</span>
            </div>
          )}

          {hasQuery && loading && !index && (
            <div className="fx-search-placeholder">
              <p>{t("us.sf.wgp.s04.loading")}</p>
            </div>
          )}

          {hasQuery && error && (
            <div className="fx-search-placeholder">
              <p>{fill(t("us.sf.wgp.s04.error"), { err: error })}</p>
            </div>
          )}

          {hasQuery && !loading && !error && filtered.length > 0 && (
            <div className="fx-results-grid">
              {filtered.slice(0, visibleCount).map((p) => {
                const { year, amount } = refAmount(p);
                const isPerson = p.bucket === "person";
                const isRaw = !p.bucket;
                return (
                  <div key={p.name} className="fx-result-card" data-raw={isRaw || undefined}>
                    <div className="fx-result-card-top">
                      <span className="fx-result-card-type">
                        {t("us.sf.wgp.s04.card.kind")}
                      </span>
                      <span>{year}</span>
                    </div>
                    <h3 style={isPerson ? { color: "var(--muted)" } : undefined}>
                      {p.name}
                    </h3>
                    {p.isAggregationLine && (
                      <div className="fx-result-card-via">{t("us.sf.wgp.row.agg_chip")}</div>
                    )}
                    <div className="fx-result-card-amount tnum">
                      {fmtUsdCompact(amount)}
                    </div>
                    <div className="fx-result-card-meta">
                      <span className="fx-result-card-arr">
                        {isRaw ? (
                          <em
                            style={{
                              color: "var(--muted)",
                              fontStyle: "normal",
                              fontFamily: "var(--f-mono)",
                              fontSize: 11,
                              letterSpacing: ".04em",
                            }}
                          >
                            {t("us.sf.wgp.row.unclassified")}
                          </em>
                        ) : (
                          <span
                            style={{
                              display: "inline-flex",
                              alignItems: "center",
                              gap: 6,
                              fontFamily: "var(--f-mono)",
                              fontSize: 11,
                              letterSpacing: ".03em",
                            }}
                          >
                            <span
                              aria-hidden="true"
                              style={{
                                width: 8,
                                height: 8,
                                background: bucketColor(p.bucket),
                                flexShrink: 0,
                              }}
                            />
                            {t(bucketLabelKey(p.bucket!))}
                          </span>
                        )}
                      </span>
                      <span
                        style={{
                          fontFamily: "var(--f-mono)",
                          fontSize: 10.5,
                          letterSpacing: ".03em",
                          color: "var(--muted)",
                        }}
                      >
                        {deptDisplay(p.topDepartment)}
                      </span>
                    </div>
                  </div>
                );
              })}
              {filtered.length > visibleCount && (
                <button
                  type="button"
                  className="fx-results-more"
                  onClick={() => setVisibleCount((n) => n + PAGE_SIZE)}
                >
                  {fill(t("us.sf.wgp.s04.more"), {
                    n: Math.min(PAGE_SIZE, filtered.length - visibleCount),
                    left: filtered.length - visibleCount,
                  })}
                </button>
              )}
            </div>
          )}

          {hasQuery && !loading && !error && index && filtered.length === 0 && (
            <div className="fx-search-placeholder">
              <p>{t("us.sf.wgp.s04.empty")}</p>
            </div>
          )}

          {!hasQuery && (
            <div className="fx-search-placeholder">
              <p>
                {t("us.sf.wgp.s04.hint.pre")}
                <b>{t("us.sf.wgp.s04.hint.two")}</b>
                {t("us.sf.wgp.s04.hint.post")}
              </p>
              <div className="fx-search-seeds">
                {visibleSeeds.map((s) => (
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
        <p
          style={{
            fontFamily: "var(--f-mono)",
            fontSize: 11.5,
            color: "var(--muted)",
            letterSpacing: ".03em",
            marginTop: 14,
            lineHeight: 1.6,
          }}
        >
          {t("us.sf.wgp.s04.person_note")}{" "}
          <a href="/us/city/sf/sources#sec-payees" style={{ color: "var(--bleu)" }}>
            {t("us.sf.wgp.s05.label")} →
          </a>
        </p>
      </div>
    </section>
  );
}
