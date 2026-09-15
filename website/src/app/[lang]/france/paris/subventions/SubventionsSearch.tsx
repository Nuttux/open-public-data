"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { cityDataUrl } from "@/lib/city-paths";
import { useT, useLocale } from "@/lib/localeContext";
import { trLabel } from "@/lib/label-translate";
import { useTrack } from "@/lib/analyticsContext";
import { useDebouncedTrack, hashQuery, queryShape } from "@/lib/analytics-helpers";
import { normSearch, expandQuery, matchExpanded } from "@/lib/search-synonyms";
import { fill } from "@/lib/fmt";
import { useFmtEur } from "@/lib/use-fmt";
import { assocSlug } from "@/lib/assoc-slug";
import { displayOrgName } from "@/lib/fournisseur-display";
import { V3Amt, V3Row } from "@/components/fiche/v3";

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
type SearchPayload = { years: number[]; count: number; data: SearchBene[] };

// Curated to span themes and scales; a chip only shows once the index says it
// matches someone (a dead chip is worse than none).
const SEEDS = ["Paris Habitat", "Paris Musées", "Sorbonne", "Samu Social", "Emmaüs", "Théâtre", "Fondation", "Croix Rouge"];
const CAP = 8;

/**
 * The search band of the Subventions section page, on the fiche grammar: the
 * field and three suggestions, results as fiche rows once something is typed,
 * no filters. The slim index (every recipient, every year) is fetched on the
 * first keystroke, never on load.
 */
export default function SubventionsSearch({ citySlug, year }: { citySlug: string; year: number }) {
  const t = useT();
  const { locale } = useLocale();
  const fmtEur = useFmtEur();
  const track = useTrack();
  const trackDebounced = useDebouncedTrack(700);
  const url = cityDataUrl(citySlug, "subventions/beneficiaires_search.json");
  const numFmt = new Intl.NumberFormat(locale === "en" ? "en-GB" : "fr-FR");

  const [query, setQuery] = useState("");
  const [data, setData] = useState<SearchBene[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fetched = useRef(false);
  const ensureFetch = () => {
    if (fetched.current) return;
    fetched.current = true;
    fetch(url)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((p: SearchPayload) => setData(p.data || []))
      .catch((e: Error) => setError(e.message));
  };
  const active = query.trim().length >= 2;

  const results = useMemo(() => {
    if (!active || !data) return [];
    const exp = expandQuery(query);
    const amountOf = (s: SearchBene) => s.byYear[String(year)] ?? 0;
    const lastOf = (s: SearchBene) => s.byYear[String(s.lastActiveYear)] ?? s.totalAmount;
    return data
      .filter((s) => matchExpanded(s.norm || normSearch(s.name), exp).match)
      .sort((a, b) => (amountOf(b) || lastOf(b)) - (amountOf(a) || lastOf(a)));
  }, [active, data, query, year]);

  // Zero-result queries guide the synonyms dictionary: counted once the index is loaded.
  useEffect(() => {
    const q = query.trim();
    if (q.length < 2 || !data) return;
    let cancelled = false;
    (async () => {
      const h = await hashQuery(q);
      if (cancelled) return;
      trackDebounced("search_submit", { page: "subventions", q_hash: h, ...queryShape(q), results_count: results.length });
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- results is fresh in the closure; fire on query / index only.
  }, [query, data]);

  const seeds = useMemo(() => {
    const live = !data ? SEEDS : SEEDS.filter((s) => { const exp = expandQuery(s); return data.some((it) => matchExpanded(it.norm || normSearch(it.name), exp).match); });
    return live.slice(0, 3);
  }, [data]);

  const shown = results.slice(0, CAP);
  return (
    <div className="fx-search-wrap fx-search-wrap--fiche">
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
            placeholder={t("fx.sec.subv.search_placeholder")}
            value={query}
            onFocus={ensureFetch}
            onChange={(e) => { ensureFetch(); setQuery(e.target.value); }}
          />
          {query.length > 0 && (
            <button type="button" className="fx-search-x" aria-label={t("fx.sec.mp.search_clear")} onClick={() => setQuery("")}>×</button>
          )}
        </div>
        {!active && (
          <div className="fx-search-seeds">
            {seeds.map((s) => (
              <button key={s} type="button" className="fx-search-seed" onClick={() => { track("search_seed_click", { page: "subventions", seed: s }); ensureFetch(); setQuery(s); }}>
                {s}
              </button>
            ))}
          </div>
        )}
      </div>

      {active && error ? <p className="fx-search-line">{locale === "en" ? `The index failed to load: ${error}` : `L’index n’a pas pu être chargé : ${error}`}</p> : null}
      {active && !data && !error ? <p className="fx-search-line">{locale === "en" ? "Loading…" : "Chargement…"}</p> : null}
      {active && data ? (
        <p className="fx-search-line">
          {results.length === 0
            ? fill(t("fx.sec.subv.search_none"), { q: query.trim() })
            : fill(t("fx.sec.subv.search_count"), { n: numFmt.format(results.length), q: query.trim() })}
        </p>
      ) : null}
      {active && data && shown.length > 0 ? (
        <div className="fx-search-rows">
          {shown.map((s) => {
            const current = s.byYear[String(year)] ?? 0;
            const amount = current > 0 ? current : (s.byYear[String(s.lastActiveYear)] ?? s.totalAmount);
            const when = current > 0 ? String(year) : fill(t("fx.sec.subv.search_last"), { year: s.lastActiveYear });
            return (
              <V3Row
                key={s.name}
                href={`/france/${citySlug}/subventions/association/${assocSlug(s.name)}`}
                label={displayOrgName(s.name)}
                subText={[s.theme ? trLabel(s.theme, locale) : null, when].filter(Boolean).join(" · ")}
                amount={<V3Amt {...fmtEur(amount)} />}
                onClick={() => track("search_result_click", { page: "subventions", entity_name: s.name })}
              />
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
