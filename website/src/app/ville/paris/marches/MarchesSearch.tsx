"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { normalizeObjet } from "@/lib/objet-normalizer";
import { useT, useLocale } from "@/lib/localeContext";
import { trLabel } from "@/lib/label-translate";
import { useTrack } from "@/lib/analyticsContext";
import { useDebouncedTrack, hashQuery, queryShape } from "@/lib/analytics-helpers";
import { normSearch, expandQuery, matchExpanded } from "@/lib/search-synonyms";

type Item = {
  titulaire: string;
  titulaireSiret?: string;
  numeroMarche?: string;
  objet: string;
  objetClair?: string | null;
  objetClairEn?: string | null;
  montant: number;
  categorie: string;
  nature: string;
  date: string;
  multiAttributaire: boolean;
};

type Props = {
  items: Item[];
  categories: string[];
  natures: string[];
  year: number;
};

// Curated to span themes & scales: voirie (Eiffage, Eurovia), bâtiment
// (Bouygues), énergie (TotalEnergies), mobilier urbain (JCDecaux), espaces
// verts (Idverde), eau (Veolia), conseil (BearingPoint). Candidats
// seulement : `visibleSeeds` ne retient à l'affichage que ceux qui donnent
// ≥1 résultat dans le corpus de l'année affichée — la présence d'un
// fournisseur varie fortement d'un millésime à l'autre.
const SEEDS = [
  "Eiffage",
  "Eurovia",
  "Bouygues",
  "TotalEnergies",
  "JCDecaux",
  "Idverde",
  "Veolia",
  "BearingPoint",
];

const fill = (s: string, vars: Record<string, string | number>) => {
  let r = s;
  for (const [k, v] of Object.entries(vars)) r = r.split(`{${k}}`).join(String(v));
  return r;
};

export default function MarchesSearch({ items, categories, natures, year }: Props) {
  const t = useT();
  const { locale } = useLocale();
  const locStr = locale === "en" ? "en-GB" : "fr-FR";

  const fmtAmount = (n: number) => {
    if (n >= 1e9) return { v: new Intl.NumberFormat(locStr, { maximumFractionDigits: 2 }).format(n / 1e9), u: t("fx.s.md_eur") };
    if (n >= 1e6) return { v: new Intl.NumberFormat(locStr, { maximumFractionDigits: 1 }).format(n / 1e6), u: t("fx.s.m_eur") };
    if (n >= 1e3) return { v: new Intl.NumberFormat(locStr, { maximumFractionDigits: 0 }).format(n / 1e3), u: "k €" };
    return { v: new Intl.NumberFormat(locStr).format(n), u: "€" };
  };

  const fmtDate = (iso: string) => {
    if (!iso) return "—";
    try {
      return new Intl.DateTimeFormat(locStr, { day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date(iso));
    } catch {
      return iso;
    }
  };

  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("");
  const [nature, setNature] = useState("");
  const [hideMulti, setHideMulti] = useState(true);
  const track = useTrack();
  const trackDebounced = useDebouncedTrack(700);

  // Haystack normalisé une seule fois par jeu de données, pas à chaque frappe.
  const hayNorms = useMemo(
    () => items.map((it) => normSearch(`${it.objet} ${it.titulaire} ${it.objetClair || ""} ${it.objetClairEn || ""}`)),
    [items]
  );

  const filtered = useMemo(() => {
    const exp = expandQuery(query);
    const out: { it: Item; via: string[] }[] = [];
    items.forEach((it, idx) => {
      if (hideMulti && it.multiAttributaire) return;
      if (category && it.categorie !== category) return;
      if (nature && it.nature !== nature) return;
      const m = matchExpanded(hayNorms[idx], exp);
      if (!m.match) return;
      out.push({ it, via: m.via });
    });
    return out;
  }, [items, hayNorms, query, category, nature, hideMulti]);

  // Track search après recalcul de filtered, pour envoyer results_count
  // (les requêtes zéro-résultat guident le dictionnaire de synonymes).
  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) return;
    let cancelled = false;
    (async () => {
      const qHash = await hashQuery(q);
      if (cancelled) return;
      trackDebounced("search_submit", {
        page: "marches-publics",
        q_hash: qHash,
        ...queryShape(q),
        results_count: filtered.length,
      });
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- filtered est frais dans la closure ; ne refire que sur query.
  }, [query]);

  const isQueryActive = query.trim().length >= 2;
  const isFilterActive = Boolean(category) || Boolean(nature) || !hideMulti;
  const hasActiveSelection = isQueryActive || isFilterActive;

  // Un chip mort (0 résultat au clic) est pire que pas de chip. La liste
  // curée avait été « vérifiée sur 2024 » : sur les millésimes 2023/2025/2026,
  // 3 à 5 seeds sur 8 ne matchaient plus rien. On ne propose que les seeds
  // qui donnent ≥1 résultat dans le corpus affiché, avec les mêmes filtres
  // par défaut que la recherche (les chips ne s'affichent que quand aucun
  // filtre n'est actif, donc hideMulti vaut sa valeur par défaut).
  const visibleSeeds = useMemo(
    () =>
      SEEDS.filter((s) => {
        const exp = expandQuery(s);
        return items.some((it, idx) => {
          if (hideMulti && it.multiAttributaire) return false;
          return matchExpanded(hayNorms[idx], exp).match;
        });
      }),
    [items, hayNorms, hideMulti]
  );

  const displayCap = hasActiveSelection ? 24 : 3;
  const displayed = filtered.slice(0, displayCap);

  const reset = () => {
    setQuery("");
    setCategory("");
    setNature("");
    setHideMulti(true);
  };

  const contextLabel = (() => {
    if (isQueryActive) return <>{t("fx.mp.search.ctx.query")} <b>« {query.trim()} »</b></>;
    if (category && nature) return <>{t("fx.mp.search.ctx.cat")} <b>{category}</b> · {t("fx.mp.search.ctx.nat")} <b>{nature}</b></>;
    if (category) return <>{t("fx.mp.search.ctx.cat")} <b>{category}</b></>;
    if (nature) return <>{t("fx.mp.search.ctx.nat")} <b>{nature}</b></>;
    return <>{fill(t("fx.mp.search.ctx.top"), { n: displayCap, year })}</>;
  })();

  return (
    <div className="fx-search-wrap">
      <div className="fx-search-inner">
        <div className="fx-search-label">{t("fx.mp.search.label")}</div>
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
            placeholder={t("fx.mp.search.placeholder")}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <div className="fx-search-filters">
          <span className="fx-search-filter-label">{t("fx.mp.search.filters")}</span>
          <select
            value={category}
            aria-label={t("fx.mp.search.cat_aria")}
            onChange={(e) => {
              setCategory(e.target.value);
              track("filter_change", { page: "marches-publics", field: "category", value: e.target.value || "all" });
            }}
          >
            <option value="">{t("fx.mp.search.all_cat")}</option>
            {categories.map((c) => {
              const lbl = trLabel(c, locale);
              return (
                <option key={c} value={c}>
                  {lbl.length > 50 ? lbl.slice(0, 50) + "…" : lbl}
                </option>
              );
            })}
          </select>
          <select
            value={nature}
            aria-label={t("fx.mp.search.nat_aria")}
            onChange={(e) => {
              setNature(e.target.value);
              track("filter_change", { page: "marches-publics", field: "nature", value: e.target.value || "all" });
            }}
          >
            <option value="">{t("fx.mp.search.all_nat")}</option>
            {natures.map((n) => (
              <option key={n} value={n}>
                {trLabel(n, locale)}
              </option>
            ))}
          </select>
          <label style={{ fontFamily: "var(--f-mono)", fontSize: 12, color: "var(--muted)", display: "inline-flex", alignItems: "center", gap: 6 }}>
            <input
              type="checkbox"
              checked={hideMulti}
              onChange={(e) => {
                setHideMulti(e.target.checked);
                track("filter_change", { page: "marches-publics", field: "hide_multi", value: e.target.checked });
              }}
            />
            {t("fx.mp.search.hide_multi")}
          </label>
          {hasActiveSelection && (
            <button
              type="button"
              className="fx-search-clear"
              onClick={() => {
                track("filter_reset", { page: "marches-publics" });
                reset();
              }}
            >
              {t("fx.mp.search.reset")}
            </button>
          )}
        </div>
        {!hasActiveSelection && visibleSeeds.length > 0 && (
          <div className="fx-search-filters">
            <span className="fx-search-filter-label">{t("fx.mp.search.seeds_label")}</span>
            <div className="fx-search-seeds">
              {visibleSeeds.map((s) => (
                <button
                  key={s}
                  type="button"
                  className="fx-search-seed"
                  onClick={() => {
                    track("search_seed_click", { page: "marches-publics", seed: s });
                    setQuery(s);
                  }}
                >
                  « {s} »
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="fx-search-meta">
        <span>
          {contextLabel} · <b>{new Intl.NumberFormat(locStr).format(filtered.length)} {filtered.length > 1 ? t("fx.mp.search.contract_p") : t("fx.mp.search.contract_s")}</b> {filtered.length > 1 ? t("fx.mp.search.match_p") : t("fx.mp.search.match_s")}
        </span>
        <span>{fill(t("fx.mp.search.sorted"), { year })}</span>
      </div>

      {displayed.length > 0 ? (
        <div className="fx-results-grid">
          {displayed.map(({ it, via }, i) => {
            const { v, u } = fmtAmount(it.montant);
            const href = it.numeroMarche
              ? `/ville/paris/marches/contrat/${encodeURIComponent(it.numeroMarche)}`
              : undefined;
            const CardEl: React.ElementType = href ? Link : "div";
            const onCardClick = href
              ? () =>
                  track("search_result_click", {
                    page: "marches-publics",
                    entity_id: it.numeroMarche,
                    rank: i,
                    results_count: filtered.length,
                    nature: it.nature,
                    category: it.categorie,
                    montant: it.montant,
                  })
              : undefined;
            const cardProps = href ? { href, scroll: false, onClick: onCardClick } : {};
            return (
              <CardEl key={i} className="fx-result-card" {...cardProps}>
                <div className="fx-result-card-top">
                  <span className="fx-result-card-type">{t("fx.mp.search.card.marche")} · {trLabel(it.nature, locale)}</span>
                  <span>{fmtDate(it.date)}</span>
                </div>
                <h3>{(() => {
                  const preferred = locale === "en" && it.objetClairEn ? it.objetClairEn : it.objetClair;
                  const clean = preferred || normalizeObjet(it.objet);
                  return clean.length > 90 ? clean.slice(0, 90) + "…" : clean;
                })()}</h3>
                {via.length > 0 && (
                  <div className="fx-result-card-via">
                    {t("fx.search.match_via")} {via.join(", ")}
                  </div>
                )}
                <div className="fx-result-card-amount tnum">
                  {v}
                  <span className="u">{u}</span>
                </div>
                <div className="fx-result-card-meta">
                  <span className="fx-result-card-arr">
                    {(it.titulaire === "MARCHE MULTIATTRIBUTAIRE" ? "Multi-attributaire" : it.titulaire).slice(0, 34)}
                  </span>
                  <span className="fx-result-card-cta">
                    {t("fx.mp.search.card.fiche")} <span className="chev">→</span>
                  </span>
                </div>
              </CardEl>
            );
          })}
          {filtered.length > displayed.length && (
            <div className="fx-results-overflow">
              {fill(t("fx.mp.search.overflow"), { n: filtered.length - displayed.length })}
            </div>
          )}
        </div>
      ) : (
        <div className="fx-search-placeholder">
          <p>{t("fx.mp.search.empty")}</p>
          <button
            type="button"
            className="fx-btn"
            onClick={() => {
              track("filter_reset", { page: "marches-publics", source: "empty_state" });
              reset();
            }}
          >
            {t("fx.mp.search.reset")}
          </button>
        </div>
      )}
    </div>
  );
}
