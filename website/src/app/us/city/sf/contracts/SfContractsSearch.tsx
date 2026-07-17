"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useT } from "@/lib/localeContext";
import { useTrack } from "@/lib/analyticsContext";
import { useDebouncedTrack, hashQuery, queryShape } from "@/lib/analytics-helpers";
import { normSearch, expandQuery, matchExpanded } from "@/lib/search-synonyms";
import { fmtUsdCompact } from "@/lib/us/format";
import { typeLabel } from "./us-sf-contracts-types";
import type { SfActiveRow } from "./us-sf-contracts-types";

/**
 * Search over the active-contracts register — MarchesSearch port
 * (us-municipal family): same three-tier runtime-validated seed chips, same
 * synonym-expanded predicate, but results render as a TABLE with
 * paid-progress bars (capped at 100%, "exceeds agreed" marked) instead of
 * cards — the paid/agreed ratio is the story here.
 */

const BRAND_SEEDS = [
  "McKesson",
  "Turner",
  "Siemens",
  "HealthRight 360",
  "Alstom",
  "Recology",
  "Hensel Phelps",
];

const THEME_SEEDS = ["housing", "mental health", "pharmacy", "shelter", "food", "security"];

const NAME_STOPWORDS = new Set(["of", "the", "and", "for", "de", "la"]);
function titleCaseName(raw: string): string {
  return raw
    .toLowerCase()
    .split(/\s+/)
    .map((w, i) => (i > 0 && NAME_STOPWORDS.has(w) ? w : w.charAt(0).toUpperCase() + w.slice(1)))
    .join(" ");
}

const fill = (s: string, vars: Record<string, string | number>) => {
  let r = s;
  for (const [k, v] of Object.entries(vars)) r = r.split(`{${k}}`).join(String(v));
  return r;
};

const nfInt = new Intl.NumberFormat("en-US");

function fmtEnd(iso: string | null, t: (k: string) => string): string {
  if (!iso) return t("us.sf.contracts.search.no_end");
  return new Intl.DateTimeFormat("en-US", { month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(iso));
}

function PaidBar({ row, t }: { row: SfActiveRow; t: (k: string) => string }) {
  if (!(row.agreed_usd > 0)) {
    return <span style={{ fontFamily: "var(--f-mono)", fontSize: 11, color: "var(--muted)" }}>—</span>;
  }
  const ratio = row.paid_usd / row.agreed_usd;
  const pct = Math.max(Math.min(ratio * 100, 100), 0);
  return (
    <div
      title={
        row.paid_exceeds_agreed
          ? fill(t("us.sf.contracts.search.bar_exceeds_tip"), { paid: fmtUsdCompact(row.paid_usd) })
          : fill(t("us.sf.contracts.search.bar_tip"), { paid: fmtUsdCompact(row.paid_usd) })
      }
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <div style={{ position: "relative", height: 8, background: "var(--rule)", flex: "1 1 64px", minWidth: 48 }} aria-hidden="true">
          <span
            style={{
              position: "absolute",
              left: 0,
              top: 0,
              height: "100%",
              width: `${pct}%`,
              background: row.paid_exceeds_agreed ? "var(--ocre)" : "var(--ink)",
            }}
          />
        </div>
        <span className="tnum" style={{ fontFamily: "var(--f-mono)", fontSize: 11.5, color: row.paid_exceeds_agreed ? "var(--ocre)" : "var(--ink-2)", whiteSpace: "nowrap" }}>
          {row.paid_exceeds_agreed
            ? t("us.sf.contracts.search.exceeds")
            : `${Math.round(ratio * 100)}%`}
        </span>
      </div>
    </div>
  );
}

export default function SfContractsSearch({ rows }: { rows: SfActiveRow[] }) {
  const t = useT();
  const track = useTrack();
  const trackDebounced = useDebouncedTrack(700);

  const [query, setQuery] = useState("");
  const [dept, setDept] = useState("");
  const [ctype, setCtype] = useState("");
  const [soleOnly, setSoleOnly] = useState(false);

  const departments = useMemo(
    () => [...new Set(rows.map((r) => r.department).filter((d): d is string => Boolean(d)))].sort(),
    [rows],
  );
  const types = useMemo(
    () => [...new Set(rows.map((r) => r.contract_type).filter((c): c is string => Boolean(c)))].sort(),
    [rows],
  );

  // Haystack normalized once per corpus, not per keystroke.
  const hayNorms = useMemo(
    () => rows.map((r) => normSearch(`${r.title} ${r.title_plain || ""} ${r.prime || ""} ${r.department || ""}`)),
    [rows],
  );

  const filtered = useMemo(() => {
    const exp = expandQuery(query);
    const out: { row: SfActiveRow; via: string[] }[] = [];
    rows.forEach((row, idx) => {
      if (dept && row.department !== dept) return;
      if (ctype && row.contract_type !== ctype) return;
      if (soleOnly && !row.sole_source) return;
      const m = matchExpanded(hayNorms[idx], exp);
      if (!m.match) return;
      out.push({ row, via: m.via });
    });
    return out;
  }, [rows, hayNorms, query, dept, ctype, soleOnly]);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) return;
    let cancelled = false;
    (async () => {
      const qHash = await hashQuery(q);
      if (cancelled) return;
      trackDebounced("search_submit", {
        page: "us-sf-contracts",
        q_hash: qHash,
        ...queryShape(q),
        results_count: filtered.length,
      });
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- filtered is fresh in the closure; refire on query only.
  }, [query]);

  const isQueryActive = query.trim().length >= 2;
  const hasActiveSelection = isQueryActive || Boolean(dept) || Boolean(ctype) || soleOnly;

  // No dead chips: every tier is validated at render against THIS corpus
  // with the same predicate as the search (feedback_no_dead_suggestions).
  const visibleSeeds = useMemo(() => {
    const alive = (s: string) => {
      const exp = expandQuery(s);
      return rows.some((_, idx) => matchExpanded(hayNorms[idx], exp).match);
    };
    const brands = BRAND_SEEDS.filter(alive).slice(0, 3);
    const themes = THEME_SEEDS.filter(alive).slice(0, 3);

    const byName = new Map<string, number>();
    for (const r of rows) {
      const n = (r.prime || "").trim();
      if (!n) continue;
      byName.set(n, (byName.get(n) ?? 0) + 1);
    }
    const takenNorms = brands.map((s) => normSearch(s).trim());
    const computed = [...byName.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([n]) => titleCaseName(n))
      .filter((n) => {
        const nn = normSearch(n).trim();
        return !takenNorms.some((b) => nn.includes(b) || b.includes(nn));
      })
      .slice(0, Math.max(0, 7 - brands.length - themes.length));

    return [...brands, ...themes, ...computed];
  }, [rows, hayNorms]);

  const displayCap = 24;
  const displayed = filtered.slice(0, displayCap);

  const reset = () => {
    setQuery("");
    setDept("");
    setCtype("");
    setSoleOnly(false);
  };

  const contextLabel = (() => {
    if (isQueryActive) return <>{t("us.sf.contracts.search.ctx.query")} <b>“{query.trim()}”</b></>;
    if (dept) return <>{t("us.sf.contracts.search.ctx.dept")} <b>{dept}</b></>;
    if (ctype) return <>{t("us.sf.contracts.search.ctx.type")} <b>{typeLabel(ctype)}</b></>;
    if (soleOnly) return <>{t("us.sf.contracts.search.ctx.sole")}</>;
    return <>{fill(t("us.sf.contracts.search.ctx.top"), { n: displayCap })}</>;
  })();

  return (
    <div className="fx-search-wrap">
      <div className="fx-search-inner">
        <div className="fx-search-label">{t("us.sf.contracts.search.label")}</div>
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
            placeholder={t("us.sf.contracts.search.placeholder")}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <div className="fx-search-filters">
          <span className="fx-search-filter-label">{t("us.sf.contracts.search.filters")}</span>
          <select
            value={dept}
            aria-label={t("us.sf.contracts.search.dept_aria")}
            onChange={(e) => {
              setDept(e.target.value);
              track("filter_change", { page: "us-sf-contracts", field: "department", value: e.target.value || "all" });
            }}
          >
            <option value="">{t("us.sf.contracts.search.all_depts")}</option>
            {departments.map((d) => (
              <option key={d} value={d}>
                {d.length > 40 ? d.slice(0, 40) + "…" : d}
              </option>
            ))}
          </select>
          <select
            value={ctype}
            aria-label={t("us.sf.contracts.search.type_aria")}
            onChange={(e) => {
              setCtype(e.target.value);
              track("filter_change", { page: "us-sf-contracts", field: "contract_type", value: e.target.value || "all" });
            }}
          >
            <option value="">{t("us.sf.contracts.search.all_types")}</option>
            {types.map((c) => {
              const lbl = typeLabel(c);
              return (
                <option key={c} value={c}>
                  {lbl.length > 44 ? lbl.slice(0, 44) + "…" : lbl}
                </option>
              );
            })}
          </select>
          <label style={{ fontFamily: "var(--f-mono)", fontSize: 12, color: "var(--muted)", display: "inline-flex", alignItems: "center", gap: 6 }}>
            <input
              type="checkbox"
              checked={soleOnly}
              onChange={(e) => {
                setSoleOnly(e.target.checked);
                track("filter_change", { page: "us-sf-contracts", field: "sole_source_only", value: e.target.checked });
              }}
            />
            {t("us.sf.contracts.search.sole_only")}
          </label>
          {hasActiveSelection && (
            <button
              type="button"
              className="fx-search-clear"
              onClick={() => {
                track("filter_reset", { page: "us-sf-contracts" });
                reset();
              }}
            >
              {t("us.sf.contracts.search.reset")}
            </button>
          )}
        </div>
        {!hasActiveSelection && visibleSeeds.length > 0 && (
          <div className="fx-search-filters">
            <span className="fx-search-filter-label">{t("us.sf.contracts.search.seeds_label")}</span>
            <div className="fx-search-seeds">
              {visibleSeeds.map((s) => (
                <button
                  key={s}
                  type="button"
                  className="fx-search-seed"
                  onClick={() => {
                    track("search_seed_click", { page: "us-sf-contracts", seed: s });
                    setQuery(s);
                  }}
                >
                  “{s}”
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="fx-search-meta">
        <span>
          {contextLabel} · <b>{nfInt.format(filtered.length)}{" "}
          {filtered.length === 1
            ? t("us.sf.contracts.search.contract_s")
            : t("us.sf.contracts.search.contract_p")}</b>{" "}
          {filtered.length === 1
            ? t("us.sf.contracts.search.match_s")
            : t("us.sf.contracts.search.match_p")}
        </span>
        <span>{t("us.sf.contracts.search.sorted")}</span>
      </div>

      {displayed.length > 0 ? (
        <>
          <div style={{ overflowX: "auto" }}>
            <table className="fx-table">
              <thead>
                <tr>
                  <th>{t("us.sf.contracts.search.col.contract")}</th>
                  <th>{t("us.sf.contracts.search.col.dept")}</th>
                  <th style={{ textAlign: "right" }}>{t("us.sf.contracts.search.col.agreed")}</th>
                  <th style={{ minWidth: 130 }}>
                    <span title={t("us.sf.contracts.search.col.paid_tip")} style={{ cursor: "help" }}>
                      {t("us.sf.contracts.search.col.paid")}
                    </span>
                  </th>
                  <th>{t("us.sf.contracts.search.col.ends")}</th>
                </tr>
              </thead>
              <tbody>
                {displayed.map(({ row }, i) => (
                  <tr key={row.contract_no}>
                    <td style={{ fontWeight: 500, maxWidth: 380 }}>
                      <Link
                        href={`/us/city/sf/contracts/contract/${row.contract_no}`}
                        scroll={false}
                        style={{ color: "var(--ink)" }}
                        onClick={() =>
                          track("search_result_click", {
                            page: "us-sf-contracts",
                            entity_id: row.contract_no,
                            rank: i,
                            results_count: filtered.length,
                          })
                        }
                      >
                        {(() => {
                          const label = row.title_plain || row.title;
                          return label.length > 90 ? label.slice(0, 90) + "…" : label;
                        })()}
                      </Link>
                      <div style={{ fontFamily: "var(--f-mono)", fontSize: 10.5, color: "var(--muted)", marginTop: 3 }}>
                        {(row.prime || "—").slice(0, 44)}
                        {row.sole_source && (
                          <span style={{ color: "var(--ocre)", marginLeft: 8 }}>
                            {t("us.sf.contracts.search.badge_sole")}
                          </span>
                        )}
                        {row.lbe_prime && (
                          <span style={{ color: "var(--bleu)", marginLeft: 8 }}>LBE</span>
                        )}
                      </div>
                    </td>
                    <td className="muted" style={{ maxWidth: 150 }}>
                      {(row.department || "—").replace(/^[A-Z]{2,4} /, "")}
                    </td>
                    <td className="num">{fmtUsdCompact(row.agreed_usd)}</td>
                    <td>
                      <PaidBar row={row} t={t} />
                    </td>
                    <td className="muted" style={{ whiteSpace: "nowrap" }}>
                      {fmtEnd(row.end, t)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {filtered.length > displayed.length && (
            <div className="fx-results-overflow" style={{ marginTop: 10 }}>
              {fill(t("us.sf.contracts.search.overflow"), { n: nfInt.format(filtered.length - displayed.length) })}
            </div>
          )}
        </>
      ) : (
        <div className="fx-search-placeholder">
          <p>{t("us.sf.contracts.search.empty")}</p>
          <button
            type="button"
            className="fx-btn"
            onClick={() => {
              track("filter_reset", { page: "us-sf-contracts", source: "empty_state" });
              reset();
            }}
          >
            {t("us.sf.contracts.search.reset")}
          </button>
        </div>
      )}
    </div>
  );
}
