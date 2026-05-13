"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import SectionHead from "@/components/fusion/SectionHead";
import { THEME_COLOR } from "@/components/fusion/StackedBarTheme";
import { citySlugFromPathname } from "@/lib/methodology";
import { useT, useLocale } from "@/lib/localeContext";
import { trLabel } from "@/lib/label-translate";
import { useTrack } from "@/lib/analyticsContext";
import { useDebouncedTrack, hashQuery, queryShape } from "@/lib/analytics-helpers";

function themeColor(theme: string | null): string {
  if (!theme) return "#9099a6";
  const key = theme.split(/[-,]/)[0].trim();
  return THEME_COLOR[key] ?? THEME_COLOR[theme] ?? "#9099a6";
}

type Bene = {
  name: string;
  theme: string | null;
  amount: number;
  totalAmount: number;
  lastActiveYear: number;
  nb: number;
  history: { year: number; amount: number }[];
};

type Top10Bene = Bene & { rank: number };

type SearchBene = {
  name: string;
  norm: string;
  siret?: string | null;
  theme: string | null;
  totalAmount: number;
  lastActiveYear: number;
  nb: number;
  byYear: Record<string, number>;
};

type SearchPayload = {
  years: number[];
  count: number;
  data: SearchBene[];
};

type Props = {
  year: number;
  top10: Top10Bene[];
  themes: string[];
  concentrationTop10Pct: number;
};

const UNCLASSIFIED_THEME = "__unclassified__";
const PAGE_SIZE = 48;

const fill = (s: string, vars: Record<string, string | number>) => {
  let r = s;
  for (const [k, v] of Object.entries(vars)) r = r.split(`{${k}}`).join(String(v));
  return r;
};

/** Normalise for search: lowercase, strip diacritics + non-alnum. */
function norm(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// Curated to span themes & scales: bailleur social, arts operator,
// university, emergency ops, humanitarian NGO, theatre, foundation.
// Verified against 2024 data.
const SEEDS = [
  "Paris Habitat",
  "Paris Musées",
  "Sorbonne",
  "Samu Social",
  "Emmaüs",
  "Théâtre",
  "Fondation",
  "Croix Rouge",
];

export default function QuiRecoitExplorer({
  year,
  top10,
  themes,
  concentrationTop10Pct,
}: Props) {
  const t = useT();
  const { locale } = useLocale();
  const locStr = locale === "en" ? "en-GB" : "fr-FR";
  const pathname = usePathname();
  const citySlug = citySlugFromPathname(pathname);
  const cityBasePath = `/ville/${citySlug}/subventions`;
  const searchIndexUrl = citySlug === "paris"
    ? "/data/subventions/beneficiaires_search.json"
    : `/data/${citySlug}/subventions/beneficiaires_search.json`;

  const fmtEur = (n: number) => {
    if (n >= 1e9) return { v: new Intl.NumberFormat(locStr, { maximumFractionDigits: 2 }).format(n / 1e9), u: t("fx.s.md_eur") };
    if (n >= 1e6) return { v: new Intl.NumberFormat(locStr, { maximumFractionDigits: 1 }).format(n / 1e6), u: t("fx.s.m_eur") };
    if (n >= 1e3) return { v: new Intl.NumberFormat(locStr, { maximumFractionDigits: 0 }).format(n / 1e3), u: "k €" };
    return { v: new Intl.NumberFormat(locStr).format(n), u: "€" };
  };

  const [query, setQuery] = useState("");
  const [theme, setTheme] = useState("");
  const [minEur, setMinEur] = useState("");
  const [maxEur, setMaxEur] = useState("");
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [searchData, setSearchData] = useState<SearchBene[] | null>(null);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const searchRef = useRef<HTMLElement | null>(null);
  const searchParams = useSearchParams();
  const track = useTrack();
  const trackDebounced = useDebouncedTrack(700);

  useEffect(() => {
    const themeParam = searchParams.get("theme");
    if (themeParam) {
      const matched = themes.includes(themeParam)
        ? themeParam
        : themes.find((th) => th.startsWith(themeParam)) ?? themeParam;
      setTheme(matched);
      setTimeout(() => {
        searchRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 50);
    }
  }, [searchParams, themes]);

  const hasQuery = query.trim().length >= 2 || theme.length > 0 || minEur.length > 0 || maxEur.length > 0;

  // Lazy-fetch du fichier slim au premier besoin. Ref pour garantir une
  // seule tentative par mount, même en cas d'erreur — sinon risque de
  // boucle infinie quand un fetch raté re-trigger l'effet.
  const searchFetchedRef = useRef(false);
  useEffect(() => {
    if (!hasQuery || searchFetchedRef.current) return;
    searchFetchedRef.current = true;
    let cancelled = false;
    setSearchLoading(true);
    setSearchError(null);
    fetch(searchIndexUrl)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((payload: SearchPayload) => {
        if (cancelled) return;
        setSearchData(payload.data || []);
      })
      .catch((err: Error) => {
        if (cancelled) return;
        setSearchError(err.message);
      })
      .finally(() => {
        if (!cancelled) setSearchLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [hasQuery, searchIndexUrl]);

  // Reset pagination à chaque changement de filtre.
  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [query, theme, minEur, maxEur]);

  const allBeneficiaires: Bene[] = useMemo(() => {
    if (!searchData) return [];
    const yrKey = String(year);
    return searchData.map((s) => ({
      name: s.name,
      theme: s.theme,
      amount: s.byYear[yrKey] ?? 0,
      totalAmount: s.totalAmount,
      lastActiveYear: s.lastActiveYear,
      nb: s.nb,
      // Rebuilt history kept empty — the explorer card doesn't use it directly.
      history: Object.entries(s.byYear).map(([y, a]) => ({ year: Number(y), amount: a })),
    }));
  }, [searchData, year]);

  const filtered = useMemo(() => {
    if (!hasQuery || !searchData) return [];
    const q = norm(query);
    const min = minEur ? Number(minEur) : 0;
    const max = maxEur ? Number(maxEur) : Number.POSITIVE_INFINITY;
    return allBeneficiaires.filter((it) => {
      if (theme === UNCLASSIFIED_THEME) {
        if (it.theme) return false;
      } else if (theme && it.theme !== theme) {
        return false;
      }
      // Compare sur le cumul historique si l'asso n'a rien cette année.
      const ref = it.amount > 0 ? it.amount : it.totalAmount;
      if (ref < min || ref > max) return false;
      if (q && !norm(it.name).includes(q)) return false;
      return true;
    });
  }, [allBeneficiaires, query, theme, minEur, maxEur, hasQuery, searchData]);

  const reset = () => {
    setQuery("");
    setTheme("");
    setMinEur("");
    setMaxEur("");
  };

  const ficheHref = (name: string) => `${cityBasePath}/association/${encodeURIComponent(name)}`;

  const refMax = top10[0]?.amount ?? 1;

  return (
    <>
      {/* === SECTION 03 : TOP 10 === */}
      <section className="fx-section" id="sec-top-benef">
        <div className="fx-wrap">
          <SectionHead
            number="03"
            kind={t("fx.qr.top.kind")}
            title={
              <>
                {t("fx.qr.top.title.before")}
                <em>{t("fx.qr.top.title.em")}</em>
                {t("fx.qr.top.title.after")}
              </>
            }
            subtitle={fill(t("fx.qr.top.sub"), { year })}
          />
          <div className="fx-top-list">
            <div className="fx-top-head">
              <span>{t("fx.qr.top.head.left")}</span>
              <span>{fill(t("fx.qr.top.head.right"), { year })}</span>
            </div>
            {top10.map((b) => {
              const { v, u } = fmtEur(b.amount);
              const color = themeColor(b.theme);
              return (
                <Link
                  key={b.rank}
                  href={ficheHref(b.name)}
                  scroll={false}
                  className="fx-top-row"
                  aria-label={fill(t("fx.qr.top.aria"), { name: b.name })}
                  onClick={() =>
                    track("chart_element_click", {
                      chart: "qr_top10",
                      rank: b.rank,
                      entity_name: b.name,
                      amount: b.amount,
                      theme: b.theme,
                    })
                  }
                >
                  <span className="r">{String(b.rank).padStart(2, "0")}</span>
                  <span className="name">{b.name}</span>
                  <span className="bar" style={{ position: "relative", height: 8, background: "var(--rule)" }}>
                    <span className="fill" style={{ width: `${(b.amount / refMax) * 100}%`, background: color }} />
                  </span>
                  <span className="v tnum">
                    {v}
                    <span className="u">{u}</span>
                  </span>
                  <span className="theme" style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                    <span aria-hidden="true" style={{ display: "inline-block", width: 8, height: 8, background: color, flexShrink: 0 }} />
                    {trLabel(b.theme ?? undefined, locale) || "—"}
                  </span>
                  <span className="arrow" aria-hidden="true">→</span>
                </Link>
              );
            })}
          </div>
          <p style={{ fontFamily: "var(--f-mono)", fontSize: 11, color: "var(--muted)", letterSpacing: ".04em", marginTop: 20 }}>
            {t("fx.qr.top.footer")}{" "}
            <b style={{ color: "var(--ink)" }}>
              {new Intl.NumberFormat(locStr, { maximumFractionDigits: 0 }).format(top10.reduce((s, b) => s + b.amount, 0) / 1e6)} M €
            </b>
            {" "}— <b style={{ color: "var(--ink)" }}>
              {new Intl.NumberFormat(locStr, { maximumFractionDigits: 0 }).format(concentrationTop10Pct)} %
            </b>{" "}
            {t("fx.qr.top.footer_pct")}
          </p>
        </div>
      </section>

      {/* === SECTION 04 : RECHERCHE === */}
      <section className="fx-section" id="recherche" ref={searchRef}>
        <div className="fx-wrap">
          <SectionHead
            number="04"
            kind={t("fx.qr.search.kind")}
            title={
              <>
                {t("fx.qr.search.title.before")}
                <em>{t("fx.qr.search.title.em")}</em>
                {t("fx.qr.search.title.after")}
              </>
            }
            subtitle={t("fx.qr.search.sub")}
          />
          <div className="fx-search-wrap">
            <div className="fx-search-inner">
              <div className="fx-search-label">{t("fx.qr.search.label")}</div>
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
                  placeholder={t("fx.qr.search.placeholder")}
                  value={query}
                  onChange={async (e) => {
                    const next = e.target.value;
                    setQuery(next);
                    if (next.trim().length >= 2) {
                      const qHash = await hashQuery(next);
                      trackDebounced("search_submit", {
                        page: "qui-recoit",
                        q_hash: qHash,
                        ...queryShape(next),
                      });
                    }
                  }}
                />
              </div>
              <div className="fx-search-filters">
                <span className="fx-search-filter-label">{t("fx.qr.search.filters")}</span>
                <select
                  value={theme}
                  aria-label={t("fx.qr.search.theme_aria")}
                  onChange={(e) => {
                    const next = e.target.value;
                    setTheme(next);
                    track("filter_change", { page: "qui-recoit", field: "theme", value: next || "all" });
                  }}
                >
                  <option value="">{t("fx.qr.search.all_themes")}</option>
                  {themes.map((th) => (
                    <option key={th} value={th}>
                      {trLabel(th, locale)}
                    </option>
                  ))}
                  <option value={UNCLASSIFIED_THEME}>
                    {locale === "en" ? "Unclassified (raw data)" : "Non classées (données brutes)"}
                  </option>
                </select>
                <div className="fx-search-range">
                  <input
                    type="number"
                    placeholder="Min €"
                    min="0"
                    value={minEur}
                    onChange={(e) => {
                      setMinEur(e.target.value);
                      trackDebounced("filter_change", { page: "qui-recoit", field: "min_eur", value: e.target.value });
                    }}
                  />
                  <span style={{ color: "var(--muted)", fontFamily: "var(--f-mono)", fontSize: 11 }}>→</span>
                  <input
                    type="number"
                    placeholder="Max €"
                    min="0"
                    value={maxEur}
                    onChange={(e) => {
                      setMaxEur(e.target.value);
                      trackDebounced("filter_change", { page: "qui-recoit", field: "max_eur", value: e.target.value });
                    }}
                  />
                </div>
                <button
                  type="button"
                  className="fx-search-clear"
                  onClick={() => {
                    track("filter_reset", { page: "qui-recoit" });
                    reset();
                  }}
                >
                  {t("fx.qr.search.reset")}
                </button>
              </div>
            </div>

            {hasQuery && (
              <div className="fx-search-meta">
                <span>
                  {query.trim().length > 0 && (
                    <>
                      {t("fx.qr.search.results_for")} <b>« {query.trim()} »</b> ·{" "}
                    </>
                  )}
                  <b>
                    {filtered.length} {filtered.length > 1 ? t("fx.qr.search.assoc_p") : t("fx.qr.search.assoc_s")}
                  </b>{" "}
                  {filtered.length > 1 ? t("fx.qr.search.match_p") : t("fx.qr.search.match_s")}
                </span>
                <span>{fill(t("fx.qr.search.sorted"), { year })}</span>
              </div>
            )}

            {hasQuery && searchLoading && !searchData && (
              <div className="fx-search-placeholder">
                <p>{locale === "en" ? "Loading long-tail index…" : "Chargement de l'index long tail…"}</p>
              </div>
            )}

            {hasQuery && searchError && (
              <div className="fx-search-placeholder">
                <p>{locale === "en" ? `Search index failed: ${searchError}` : `Erreur de chargement : ${searchError}`}</p>
              </div>
            )}

            {hasQuery && !searchLoading && !searchError && filtered.length > 0 && (
              <div className="fx-results-grid">
                {filtered.slice(0, visibleCount).map((it, i) => {
                  const activeThisYear = it.amount > 0;
                  const displayAmount = activeThisYear ? it.amount : it.totalAmount;
                  const { v, u } = fmtEur(displayAmount);
                  const isRaw = !it.theme;
                  return (
                    <Link
                      key={i}
                      href={ficheHref(it.name)}
                      scroll={false}
                      className="fx-result-card"
                      data-raw={isRaw || undefined}
                      onClick={() =>
                        track("search_result_click", {
                          page: "qui-recoit",
                          entity_name: it.name,
                          theme: it.theme,
                          rank: i,
                          results_count: filtered.length,
                        })
                      }
                    >
                      <div className="fx-result-card-top">
                        <span className="fx-result-card-type">
                          {activeThisYear ? t("fx.qr.search.card.grant") : t("fx.qr.search.card.history")}
                        </span>
                        <span>
                          {activeThisYear ? year : fill(t("fx.qr.search.card.last"), { year: it.lastActiveYear })}
                        </span>
                      </div>
                      <h3>{it.name}</h3>
                      <div className="fx-result-card-amount tnum">
                        {v}
                        <span className="u">{u}</span>
                      </div>
                      <div className="fx-result-card-meta">
                        <span className="fx-result-card-arr">
                          {isRaw ? (
                            <em style={{ color: "var(--muted)", fontStyle: "normal", fontFamily: "var(--f-mono)", fontSize: 11, letterSpacing: ".04em" }}>
                              {locale === "en" ? "raw data" : "données brutes"}
                            </em>
                          ) : activeThisYear ? (
                            trLabel(it.theme ?? undefined, locale) || "—"
                          ) : (
                            <em style={{ color: "var(--muted)", fontStyle: "normal" }}>
                              {fill(t("fx.qr.search.card.cumul"), { n: new Intl.NumberFormat(locStr).format(it.history.filter(h => h.amount > 0).length) })}
                            </em>
                          )}
                        </span>
                        <span className="fx-result-card-cta">
                          {t("fx.qr.search.card.fiche")} <span className="chev">→</span>
                        </span>
                      </div>
                    </Link>
                  );
                })}
                {filtered.length > visibleCount && (
                  <button
                    type="button"
                    className="fx-results-more"
                    onClick={() => {
                      track("load_more", {
                        page: "qui-recoit",
                        visible_before: visibleCount,
                        visible_after: visibleCount + PAGE_SIZE,
                        total: filtered.length,
                      });
                      setVisibleCount((n) => n + PAGE_SIZE);
                    }}
                  >
                    {locale === "en"
                      ? `Show ${Math.min(PAGE_SIZE, filtered.length - visibleCount)} more · ${filtered.length - visibleCount} left`
                      : `Voir ${Math.min(PAGE_SIZE, filtered.length - visibleCount)} de plus · ${filtered.length - visibleCount} restantes`}
                  </button>
                )}
              </div>
            )}

            {hasQuery && !searchLoading && !searchError && searchData && filtered.length === 0 && (
              <div className="fx-search-placeholder">
                <p>{t("fx.qr.search.empty")}</p>
              </div>
            )}

            {!hasQuery && (
              <>
                <div className="fx-search-placeholder">
                  <p>
                    {t("fx.qr.search.hint_before")}<b>{t("fx.qr.search.hint_two")}</b> {t("fx.qr.search.hint_after")}
                  </p>
                  <div className="fx-search-seeds">
                    {SEEDS.map((s) => (
                      <button
                        key={s}
                        type="button"
                        className="fx-search-seed"
                        onClick={() => {
                          track("search_seed_click", { page: "qui-recoit", seed: s });
                          setQuery(s);
                        }}
                      >
                        « {s} »
                      </button>
                    ))}
                  </div>
                </div>
                <div className="fx-results-grid">
                  {top10.slice(0, 3).map((it, i) => {
                    const { v, u } = fmtEur(it.amount);
                    return (
                      <Link
                        key={i}
                        href={ficheHref(it.name)}
                        scroll={false}
                        className="fx-result-card"
                        onClick={() =>
                          track("search_result_click", {
                            page: "qui-recoit",
                            entity_name: it.name,
                            theme: it.theme,
                            rank: i,
                            results_count: 3,
                            source: "idle_top",
                          })
                        }
                      >
                        <div className="fx-result-card-top">
                          <span className="fx-result-card-type">{t("fx.qr.search.card.grant")}</span>
                          <span>{year}</span>
                        </div>
                        <h3>{it.name}</h3>
                        <div className="fx-result-card-amount tnum">
                          {v}
                          <span className="u">{u}</span>
                        </div>
                        <div className="fx-result-card-meta">
                          <span className="fx-result-card-arr">
                            {trLabel(it.theme ?? undefined, locale) || "—"}
                          </span>
                          <span className="fx-result-card-cta">
                            {t("fx.qr.search.card.fiche")} <span className="chev">→</span>
                          </span>
                        </div>
                      </Link>
                    );
                  })}
                </div>
              </>
            )}
          </div>
        </div>
      </section>
    </>
  );
}
