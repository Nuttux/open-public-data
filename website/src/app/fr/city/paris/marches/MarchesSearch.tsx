"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { normalizeObjet } from "@/lib/objet-normalizer";
import { useT, useLocale } from "@/lib/localeContext";
import { trLabel } from "@/lib/label-translate";
import { useTrack } from "@/lib/analyticsContext";
import { useDebouncedTrack, hashQuery, queryShape } from "@/lib/analytics-helpers";
import { normSearch, expandQuery, matchExpanded } from "@/lib/search-synonyms";
import { fill, numLocale } from "@/lib/fmt";
import { useFmtEur } from "@/lib/use-fmt";
import { useLazyMarches } from "@/lib/use-lazy-marches";
import type { ShapedMarche } from "@/lib/marches-shape";

// La liste complète n'arrive plus dans les props serveur (~700 kB de payload
// RSC pour Paris) : elle est lazy-fetchée depuis le fichier public
// /data/<city>/marches-publics/marches_<year>.json via useLazyMarches, avec
// le même shaping que celui que le serveur appliquait (lib/marches-shape).
type Item = ShapedMarche;

type Props = {
  citySlug: string;
  categories: string[];
  natures: string[];
  year: number;
};

// Référence stable pour les useMemo tant que la liste n'est pas chargée.
const EMPTY_ITEMS: Item[] = [];

// Suggestions à trois étages, tous CANDIDATS seulement — `visibleSeeds` ne
// retient que ce qui donne ≥1 résultat dans le corpus de l'année affichée,
// via le même prédicat que la recherche :
//  1. marques curées (reconnaissables, mais leur présence varie fort d'un
//     millésime à l'autre — 3 à 5 sur 8 étaient absentes selon l'année) ;
//  2. thèmes (quasi immortels : « école », « piscine »… reviennent chaque
//     année et s'étendent via le dictionnaire de synonymes, bilingue) ;
//  3. étage adaptatif : plus gros titulaires du corpus affiché, calculés au
//     rendu — ne peut être vide que si la page l'est. Zéro curation pour une
//     nouvelle ville ou un nouveau millésime.
const BRAND_SEEDS = [
  "Eiffage",
  "Eurovia",
  "Bouygues",
  "TotalEnergies",
  "JCDecaux",
  "Idverde",
  "Veolia",
  "BearingPoint",
];

// Termes au singulier : sans groupe de synonymes, un pluriel ne matche pas
// le singulier du corpus. Tous passent par le même prédicat de validation.
const THEME_SEEDS_FR = ["école", "piscine", "propreté", "crèche", "éclairage", "voirie"];
const THEME_SEEDS_EN = ["school", "water", "energy", "waste", "housing", "cycling"];

// Mots outils à garder en minuscules quand on remet en casse un nom de
// titulaire tout-MAJ ("EIFFAGE ROUTE ILE DE FRANCE" → "Eiffage Route Ile de France").
const NAME_STOPWORDS = new Set(["de", "du", "des", "la", "le", "les", "et", "d'", "l'"]);
function titleCaseName(raw: string): string {
  return raw
    .toLowerCase()
    .split(/\s+/)
    .map((w, i) => (i > 0 && NAME_STOPWORDS.has(w) ? w : w.charAt(0).toUpperCase() + w.slice(1)))
    .join(" ");
}

export default function MarchesSearch({ citySlug, categories, natures, year }: Props) {
  const t = useT();
  const { locale } = useLocale();
  const locStr = numLocale(locale);

  // Fetch lazy : à l'approche du viewport (IntersectionObserver) ou à la
  // première interaction (focus/saisie), même patron que QuiRecoitExplorer.
  const {
    containerRef,
    items: loadedItems,
    error: loadError,
    ensureFetch,
  } = useLazyMarches(citySlug, year);
  const items = loadedItems ?? EMPTY_ITEMS;
  const isLoaded = loadedItems !== null;

  const fmtAmount = useFmtEur();

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
  // Attend la liste chargée pour ne pas compter un faux 0 pendant le fetch —
  // isLoaded est dans les deps pour re-tirer quand la donnée arrive.
  useEffect(() => {
    const q = query.trim();
    if (q.length < 2 || !isLoaded) return;
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
    // eslint-disable-next-line react-hooks/exhaustive-deps -- filtered est frais dans la closure ; ne refire que sur query/chargement.
  }, [query, isLoaded]);

  const isQueryActive = query.trim().length >= 2;
  const isFilterActive = Boolean(category) || Boolean(nature) || !hideMulti;
  const hasActiveSelection = isQueryActive || isFilterActive;

  // Un chip mort (0 résultat au clic) est pire que pas de chip : chaque
  // étage est validé via le même prédicat que la recherche, avec les mêmes
  // filtres par défaut (les chips ne s'affichent que quand aucun filtre
  // n'est actif, donc hideMulti vaut sa valeur par défaut).
  const visibleSeeds = useMemo(() => {
    // Corpus pas encore chargé : aucun chip plutôt que des chips non validés
    // (un chip mort au clic est pire que pas de chip).
    if (!isLoaded) return [];
    const alive = (s: string) => {
      const exp = expandQuery(s);
      return items.some((it, idx) => {
        if (hideMulti && it.multiAttributaire) return false;
        return matchExpanded(hayNorms[idx], exp).match;
      });
    };
    const brands = BRAND_SEEDS.filter(alive).slice(0, 3);
    const themes = (locale === "en" ? THEME_SEEDS_EN : THEME_SEEDS_FR).filter(alive).slice(0, 3);

    // Étage adaptatif : plus gros titulaires (en nombre de contrats) du
    // corpus affiché. Ils viennent du corpus, donc matchent par construction
    // (la remise en casse ne change pas la forme normalisée).
    const byName = new Map<string, number>();
    for (const it of items) {
      if (it.multiAttributaire) continue;
      const n = (it.titulaire || "").trim();
      if (!n || n === "Non précisé") continue;
      byName.set(n, (byName.get(n) ?? 0) + 1);
    }
    const takenNorms = brands.map((s) => normSearch(s).trim());
    const computed = [...byName.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([n]) => titleCaseName(n))
      // Écarte les doublons d'une marque déjà affichée ("Eiffage Route Ile
      // de France" quand le chip « Eiffage » est déjà là).
      .filter((n) => {
        const nn = normSearch(n).trim();
        return !takenNorms.some((t) => nn.includes(t) || t.includes(nn));
      })
      .slice(0, Math.max(0, 7 - brands.length - themes.length));

    return [...brands, ...themes, ...computed];
  }, [isLoaded, items, hayNorms, hideMulti, locale]);

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
    <div className="fx-search-wrap" ref={containerRef}>
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
            onFocus={ensureFetch}
            onChange={(e) => {
              ensureFetch();
              setQuery(e.target.value);
            }}
          />
        </div>
        <div className="fx-search-filters">
          <span className="fx-search-filter-label">{t("fx.mp.search.filters")}</span>
          <select
            value={category}
            aria-label={t("fx.mp.search.cat_aria")}
            onChange={(e) => {
              ensureFetch();
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
              ensureFetch();
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
                ensureFetch();
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

      {isLoaded && (
        <div className="fx-search-meta">
          <span>
            {contextLabel} · <b>{new Intl.NumberFormat(locStr).format(filtered.length)} {filtered.length > 1 ? t("fx.mp.search.contract_p") : t("fx.mp.search.contract_s")}</b> {filtered.length > 1 ? t("fx.mp.search.match_p") : t("fx.mp.search.match_s")}
          </span>
          <span>{fill(t("fx.mp.search.sorted"), { year })}</span>
        </div>
      )}

      {/* Liste lazy-fetchée : états chargement/erreur avant la grille — même
        * langage que l'index de recherche de QuiRecoitExplorer. */}
      {!isLoaded && loadError && (
        <div className="fx-search-placeholder">
          <p>{locale === "en" ? `Contract list failed to load: ${loadError}` : `Erreur de chargement des contrats : ${loadError}`}</p>
        </div>
      )}

      {!isLoaded && !loadError && (
        <div className="fx-search-placeholder">
          <p>{locale === "en" ? "Loading contracts…" : "Chargement des contrats…"}</p>
        </div>
      )}

      {isLoaded && displayed.length > 0 ? (
        <div className="fx-results-grid">
          {displayed.map(({ it, via }, i) => {
            const { v, u } = fmtAmount(it.montant);
            const href = it.numeroMarche
              ? `/fr/city/paris/marches/contrat/${encodeURIComponent(it.numeroMarche)}`
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
                  <span className="fx-result-card-type">
                    {t("fx.mp.search.card.marche")} · {trLabel(it.nature, locale)}
                    {it.offres != null && it.offres > 0 && (
                      <span
                        title={t("fx.mfl.col.offres_title")}
                        style={it.offres === 1 ? { color: "var(--ocre)", fontWeight: 600 } : undefined}
                      >
                        {" · "}
                        <span aria-hidden="true" style={{ fontSize: 8 }}>●</span>{" "}
                        {it.offres === 1
                          ? t("fx.fiche.contrat.conc.offre_one")
                          : t("fx.fiche.contrat.conc.offres_n").replace("{n}", String(it.offres))}
                      </span>
                    )}
                  </span>
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
      ) : isLoaded ? (
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
      ) : null}
    </div>
  );
}
