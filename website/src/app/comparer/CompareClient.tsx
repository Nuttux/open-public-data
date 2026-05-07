"use client";
import { useRouter, useSearchParams } from "next/navigation";
import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Navbar from "@/components/fusion/Navbar";
import Footer from "@/components/fusion/Footer";
import SectionHead from "@/components/fusion/SectionHead";
import ChartSource from "@/components/fusion/ChartSource";
import { useT, useLocale } from "@/lib/localeContext";
import type { City } from "@/lib/cities";
import type { CommuneData } from "@/lib/commune-data";

type Unit = "perhab" | "total";

const MAX_SELECTED = 5;
const DEFAULT_SLUGS = ["paris", "marseille", "lyon"];

// Normalised KPI shape used by the table — both rich (OFGL detailed) and
// slim (bulk index) cities are projected into this shape.
type KpiRow = { montant: number; eur_hab: number };
type ColumnEntry = {
  key: string;
  nom: string;
  slug: string;
  insee: string;
  pop: number;
  year: number | null;
  // Map of kpi_key -> KpiRow (some KPIs are missing for slim cities)
  kpis: Record<string, KpiRow | undefined>;
};

const COMPARE_KPIS: Array<{ key: string; group: "budget" | "dette" | "fiscalite"; label: string }> = [
  { key: "depenses_totales", group: "budget", label: "Dépenses totales hors remb." },
  { key: "recettes_totales", group: "budget", label: "Recettes totales hors emprunts" },
  { key: "epargne_brute", group: "budget", label: "Épargne brute" },
  { key: "depenses_investissement", group: "budget", label: "Dépenses d'investissement" },
  { key: "frais_personnel", group: "budget", label: "Frais de personnel" },
  { key: "encours_dette", group: "dette", label: "Encours de dette" },
  { key: "charges_financieres", group: "dette", label: "Charges financières" },
  { key: "impots_locaux", group: "fiscalite", label: "Impôts locaux" },
  { key: "concours_etat", group: "fiscalite", label: "Concours de l'État" },
  { key: "fiscalite_reversee", group: "fiscalite", label: "Fiscalité reversée" },
];

const KPI_LABELS_EN: Record<string, string> = {
  depenses_totales: "Total expenditure",
  recettes_totales: "Total revenue (excl. borrowing)",
  epargne_brute: "Gross savings",
  depenses_investissement: "Capital expenditure",
  frais_personnel: "Personnel costs",
  encours_dette: "Debt outstanding",
  charges_financieres: "Financial charges",
  impots_locaux: "Local taxes",
  concours_etat: "State transfers",
  fiscalite_reversee: "Tax sharing",
};

type SearchHit = {
  insee: string;
  slug: string;
  nom: string;
  dep_name: string;
  pop: number;
};

const fmtInt = (n: number, locale: string) =>
  Math.round(n).toLocaleString(locale === "en" ? "en-GB" : "fr-FR");

const fmtMillions = (eur: number, locale: string) => {
  if (Math.abs(eur) >= 1e9) {
    return (
      (eur / 1e9).toLocaleString(locale === "en" ? "en-GB" : "fr-FR", {
        maximumFractionDigits: 2,
        minimumFractionDigits: 2,
      }) + " Md€"
    );
  }
  return (
    (eur / 1e6).toLocaleString(locale === "en" ? "en-GB" : "fr-FR", {
      maximumFractionDigits: 0,
    }) + " M€"
  );
};

// Project a rich CommuneData into a ColumnEntry
function projectRich(city: City, data: CommuneData): ColumnEntry {
  const ly = data.city.latest_year;
  const kpis: Record<string, KpiRow | undefined> = {};
  for (const { key } of COMPARE_KPIS) {
    const pt = ly ? data.city.series[key]?.find((p) => p.year === ly) : undefined;
    if (pt && pt.eur_hab != null) {
      kpis[key] = { montant: pt.montant, eur_hab: pt.eur_hab };
    }
  }
  return {
    key: city.slug,
    nom: city.nom,
    slug: city.slug,
    insee: city.code_insee,
    pop: city.population,
    year: ly,
    kpis,
  };
}

// Project a slim entry from the API into a ColumnEntry
type SlimEntry = {
  insee: string;
  slug: string;
  nom: string;
  dep_name?: string;
  reg_name?: string;
  pop: number;
  siren?: string;
  kpis: Record<string, { montant: number; eur_hab: number }>;
};
function projectSlim(entry: SlimEntry, year: number | null): ColumnEntry {
  const kpis: Record<string, KpiRow | undefined> = {};
  for (const { key } of COMPARE_KPIS) {
    const k = entry.kpis[key];
    if (k) kpis[key] = { montant: k.montant, eur_hab: k.eur_hab };
  }
  return {
    key: entry.slug,
    nom: entry.nom,
    slug: entry.slug,
    insee: entry.insee,
    pop: entry.pop,
    year,
    kpis,
  };
}

export default function CompareClient({
  topCities,
  topData,
}: {
  topCities: City[];
  topData: CommuneData[];
}) {
  const t = useT();
  const { locale } = useLocale();
  const router = useRouter();
  const searchParams = useSearchParams();

  const topRichBySlug = useMemo(() => {
    const m = new Map<string, { city: City; data: CommuneData }>();
    for (const d of topData) {
      const c = topCities.find((x) => x.slug === d.city.slug);
      if (c) m.set(d.city.slug, { city: c, data: d });
    }
    return m;
  }, [topCities, topData]);

  // Cache of slim entries fetched on demand for non-top cities
  const [slimCache, setSlimCache] = useState<Map<string, SlimEntry>>(new Map());
  const [slimYear, setSlimYear] = useState<number | null>(null);

  // Initial selection from URL
  const initialSelected = useMemo(() => {
    const fromUrl = (searchParams?.get("cities") || "").split(",").filter(Boolean);
    if (fromUrl.length === 0) return DEFAULT_SLUGS;
    return fromUrl.slice(0, MAX_SELECTED);
  }, [searchParams]);

  const [selected, setSelected] = useState<string[]>(initialSelected);
  const [unit, setUnit] = useState<Unit>("perhab");

  const updateSelected = useCallback(
    (next: string[]) => {
      setSelected(next);
      const url = next.length > 0 ? `/comparer?cities=${next.join(",")}` : "/comparer";
      router.replace(url, { scroll: false });
    },
    [router],
  );

  // Resolve a slug to a ColumnEntry — checks rich first, then slim cache,
  // then triggers a fetch for the slim variant if not yet loaded.
  const fetchSlim = useCallback(async (slug: string) => {
    try {
      const res = await fetch(`/api/commune/${encodeURIComponent(slug)}`);
      if (!res.ok) return null;
      const data = await res.json();
      const entry: SlimEntry = data.entry;
      const year: number = data.year;
      setSlimCache((prev) => {
        const m = new Map(prev);
        m.set(slug, entry);
        return m;
      });
      setSlimYear(year);
      return entry;
    } catch {
      return null;
    }
  }, []);

  // Auto-fetch slim entries for any selected slug not in rich registry
  useEffect(() => {
    for (const slug of selected) {
      if (!topRichBySlug.has(slug) && !slimCache.has(slug)) {
        fetchSlim(slug);
      }
    }
  }, [selected, topRichBySlug, slimCache, fetchSlim]);

  // Build columns in selection order
  const columns: ColumnEntry[] = selected
    .map((slug) => {
      const rich = topRichBySlug.get(slug);
      if (rich) return projectRich(rich.city, rich.data);
      const slim = slimCache.get(slug);
      if (slim) return projectSlim(slim, slimYear);
      return null;
    })
    .filter((x): x is ColumnEntry => x !== null);

  const removeColumn = (slug: string) => {
    if (selected.length <= 1) return;
    updateSelected(selected.filter((s) => s !== slug));
  };

  const addColumn = (slug: string) => {
    if (selected.includes(slug)) return;
    if (selected.length >= MAX_SELECTED) return;
    updateSelected([...selected, slug]);
  };

  // ─── Search input + autocomplete ─────────────────────────────────────
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [searching, setSearching] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setHits([]);
      return;
    }
    setSearching(true);
    const ac = new AbortController();
    const id = setTimeout(async () => {
      try {
        const res = await fetch(`/api/search-communes?q=${encodeURIComponent(q)}`, {
          signal: ac.signal,
        });
        const data = await res.json();
        setHits(data.results ?? []);
        setSearching(false);
      } catch {
        // aborted or failed
      }
    }, 180);
    return () => {
      ac.abort();
      clearTimeout(id);
    };
  }, [query]);

  const onPickHit = (hit: SearchHit) => {
    addColumn(hit.slug);
    setQuery("");
    setHits([]);
    inputRef.current?.focus();
  };

  // Per-row min/max coloring
  const rowExtrema = COMPARE_KPIS.map(({ key }) => {
    const vals = columns
      .map((c) => (unit === "perhab" ? c.kpis[key]?.eur_hab : c.kpis[key]?.montant))
      .filter((v): v is number => v != null);
    return {
      key,
      min: vals.length ? Math.min(...vals) : null,
      max: vals.length ? Math.max(...vals) : null,
    };
  });

  const formatVal = (v: number | undefined) => {
    if (v == null) return "—";
    if (unit === "perhab") return `${fmtInt(v, locale)} €`;
    return fmtMillions(v, locale);
  };

  const labelFor = (key: string) => {
    if (locale === "en") return KPI_LABELS_EN[key] ?? key;
    return COMPARE_KPIS.find((k) => k.key === key)?.label ?? key;
  };

  return (
    <div className="theme-fusion">
      <Navbar />
      <main id="main-content" tabIndex={-1}>
        <h1 className="fx-sr-only">{t("compare.hero.title")}</h1>
        {/* Hero ─────────────────────────────────────────────────────── */}
        <section className="fx-wrap" style={{ padding: "60px 0 32px" }}>
          <SectionHead
            number="01"
            kind={t("compare.section.kind")}
            title={t("compare.hero.title")}
            subtitle={t("compare.hero.subtitle").replace("{max}", String(MAX_SELECTED))}
          />
        </section>

        {/* Search picker + selected chips ───────────────────────────── */}
        <section className="fx-wrap" style={{ padding: "0 0 24px" }}>
          <div className="fx-compare-picker">
            <p className="fx-compare-picker-label">
              {t("compare.picker.label")} ({selected.length}/{MAX_SELECTED})
            </p>

            {/* Selected chips with remove button */}
            <div className="fx-compare-chips" style={{ marginBottom: 14 }}>
              {selected.length === 0 && (
                <span style={{ color: "var(--muted)", fontSize: 13.5 }}>
                  {t("compare.picker.none")}
                </span>
              )}
              {selected.map((slug) => {
                const col = columns.find((c) => c.slug === slug);
                const label = col?.nom ?? slug;
                return (
                  <span key={slug} className="fx-compare-chip is-on">
                    <span>{label}</span>
                    <button
                      type="button"
                      className="fx-compare-chip-remove"
                      aria-label={t("compare.picker.remove").replace("{name}", label)}
                      onClick={() => removeColumn(slug)}
                    >
                      ×
                    </button>
                  </span>
                );
              })}
            </div>

            {/* Search input for adding */}
            {selected.length < MAX_SELECTED && (
              <div className="fx-compare-search">
                <input
                  ref={inputRef}
                  type="search"
                  className="fx-compare-search-input"
                  placeholder={t("compare.picker.search_placeholder")}
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  autoComplete="off"
                  spellCheck={false}
                />
                {query.trim().length >= 2 && (
                  <div className="fx-compare-search-hits">
                    {searching && hits.length === 0 ? (
                      <div className="fx-compare-search-empty">{t("compare.picker.searching")}</div>
                    ) : hits.length === 0 ? (
                      <div className="fx-compare-search-empty">{t("compare.picker.no_match")}</div>
                    ) : (
                      hits.map((h) => {
                        const already = selected.includes(h.slug);
                        return (
                          <button
                            key={h.insee}
                            type="button"
                            className={`fx-compare-search-hit ${already ? "is-already" : ""}`}
                            disabled={already}
                            onClick={() => onPickHit(h)}
                          >
                            <span className="fx-compare-search-hit-name">{h.nom}</span>
                            <span className="fx-compare-search-hit-meta">
                              {h.dep_name} · {fmtInt(h.pop, locale)} hab
                              {already && ` · ${t("compare.picker.already_selected")}`}
                            </span>
                          </button>
                        );
                      })
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          <div style={{ marginTop: 18, display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button
              type="button"
              className={`fx-toggle-btn ${unit === "perhab" ? "is-active" : ""}`}
              onClick={() => setUnit("perhab")}
            >
              {t("compare.toggle.perhab")}
            </button>
            <button
              type="button"
              className={`fx-toggle-btn ${unit === "total" ? "is-active" : ""}`}
              onClick={() => setUnit("total")}
            >
              {t("compare.toggle.total")}
            </button>
          </div>
        </section>

        {/* Compare table ────────────────────────────────────────────── */}
        <section className="fx-wrap" style={{ padding: "0 0 80px" }}>
          {columns.length === 0 ? (
            <p style={{ color: "var(--muted)" }}>{t("compare.empty")}</p>
          ) : (
            <figure style={{ margin: "0" }}>
              <div className="fx-compare-table-wrap">
                <table className="fx-compare-table">
                  <thead>
                    <tr>
                      <th className="fx-compare-th-kpi">{t("compare.col.kpi")}</th>
                      {columns.map((col) => (
                        <th key={col.slug} className="fx-compare-th-city">
                          <div className="fx-compare-city-name">{col.nom}</div>
                          <div className="fx-compare-city-meta">
                            {col.year ?? "—"} · {fmtInt(col.pop, locale)} hab
                          </div>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {COMPARE_KPIS.map(({ key, group }, i) => {
                      const ex = rowExtrema[i];
                      const prevGroup = i > 0 ? COMPARE_KPIS[i - 1].group : null;
                      const showHeader = prevGroup !== group;
                      return (
                        <Fragment key={key}>
                          {showHeader && (
                            <tr className="fx-compare-group-row">
                              <td colSpan={columns.length + 1}>
                                {t(`compare.group.${group}`)}
                              </td>
                            </tr>
                          )}
                          <tr>
                            <td className="fx-compare-td-kpi">{labelFor(key)}</td>
                            {columns.map((col) => {
                              const v =
                                unit === "perhab"
                                  ? col.kpis[key]?.eur_hab
                                  : col.kpis[key]?.montant;
                              const isMax = v != null && v === ex.max && ex.max !== ex.min;
                              const isMin = v != null && v === ex.min && ex.max !== ex.min;
                              return (
                                <td
                                  key={col.slug}
                                  className={`fx-compare-td-val tnum ${isMax ? "is-max" : ""} ${isMin ? "is-min" : ""}`}
                                >
                                  {formatVal(v)}
                                </td>
                              );
                            })}
                          </tr>
                        </Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <ChartSource
                source={`OFGL · ${columns[0]?.year ?? ""} · 35 000 communes`}
                dataHref="https://data.ofgl.fr/explore/dataset/ofgl-base-communes-consolidee/"
                methodAnchor="c-villes"
              />

              <p style={{ marginTop: 18, maxWidth: 820, color: "var(--muted)", fontSize: 14 }}>
                {t("compare.notes")} {t("compare.notes_slim_extra")}
              </p>
            </figure>
          )}
        </section>
      </main>
      <Footer />
    </div>
  );
}
