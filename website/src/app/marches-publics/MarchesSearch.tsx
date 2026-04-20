"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { normalizeObjet } from "@/lib/objet-normalizer";

type Item = {
  titulaire: string;
  titulaireSiret?: string;
  numeroMarche?: string;
  objet: string;
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

const fmtAmount = (n: number) => {
  if (n >= 1e9) return { v: new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 2 }).format(n / 1e9), u: "Md €" };
  if (n >= 1e6) return { v: new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 1 }).format(n / 1e6), u: "M €" };
  if (n >= 1e3) return { v: new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 }).format(n / 1e3), u: "k €" };
  return { v: new Intl.NumberFormat("fr-FR").format(n), u: "€" };
};

const fmtDate = (iso: string) => {
  if (!iso) return "—";
  try {
    return new Intl.DateTimeFormat("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date(iso));
  } catch {
    return iso;
  }
};

/**
 * Recherche marchés : pattern search-first avec filtres. Si aucune recherche
 * active, affiche par défaut les 12 plus gros contrats (ou les 12 plus gros
 * de la catégorie sélectionnée). Volumineux côté data — pagination simple.
 */
export default function MarchesSearch({ items, categories, natures, year }: Props) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("");
  const [nature, setNature] = useState("");
  const [hideMulti, setHideMulti] = useState(true);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items.filter((it) => {
      if (hideMulti && it.multiAttributaire) return false;
      if (category && it.categorie !== category) return false;
      if (nature && it.nature !== nature) return false;
      if (q && !it.objet.toLowerCase().includes(q) && !it.titulaire.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [items, query, category, nature, hideMulti]);

  const isQueryActive = query.trim().length >= 2;
  const isFilterActive = Boolean(category) || Boolean(nature) || !hideMulti;
  const hasActiveSelection = isQueryActive || isFilterActive;

  // Default view: top 12 of whatever filter is active (or all)
  const displayed = filtered.slice(0, 24);

  const reset = () => {
    setQuery("");
    setCategory("");
    setNature("");
    setHideMulti(true);
  };

  const contextLabel = (() => {
    if (isQueryActive) return <>Résultats pour <b>« {query.trim()} »</b></>;
    if (category && nature) return <>Catégorie <b>{category}</b> · Nature <b>{nature}</b></>;
    if (category) return <>Catégorie <b>{category}</b></>;
    if (nature) return <>Nature <b>{nature}</b></>;
    return <>Top 24 des contrats {year}</>;
  })();

  return (
    <div className="fx-search-wrap">
      <div className="fx-search-inner">
        <div className="fx-search-label">Rechercher un contrat ou une entreprise</div>
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
            placeholder="Nom d'un fournisseur, objet du marché, SIREN…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <div className="fx-search-filters">
          <span className="fx-search-filter-label">Filtres</span>
          <select value={category} onChange={(e) => setCategory(e.target.value)}>
            <option value="">Toutes catégories</option>
            {categories.map((c) => (
              <option key={c} value={c}>
                {c.length > 50 ? c.slice(0, 50) + "…" : c}
              </option>
            ))}
          </select>
          <select value={nature} onChange={(e) => setNature(e.target.value)}>
            <option value="">Toutes natures</option>
            {natures.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
          <label style={{ fontFamily: "var(--f-mono)", fontSize: 12, color: "var(--muted)", display: "inline-flex", alignItems: "center", gap: 6 }}>
            <input type="checkbox" checked={hideMulti} onChange={(e) => setHideMulti(e.target.checked)} />
            Masquer multiattributaires
          </label>
          {hasActiveSelection && (
            <button type="button" className="fx-search-clear" onClick={reset}>
              Réinitialiser
            </button>
          )}
        </div>
      </div>

      <div className="fx-search-meta">
        <span>
          {contextLabel} · <b>{new Intl.NumberFormat("fr-FR").format(filtered.length)} contrat{filtered.length > 1 ? "s" : ""}</b> correspond{filtered.length > 1 ? "ent" : ""}
        </span>
        <span>Trié par enveloppe max · exercice {year}</span>
      </div>

      {displayed.length > 0 ? (
        <div className="fx-results-grid">
          {displayed.map((it, i) => {
            const { v, u } = fmtAmount(it.montant);
            const href = it.numeroMarche
              ? `/marches-publics/contrat/${encodeURIComponent(it.numeroMarche)}`
              : undefined;
            const CardEl: React.ElementType = href ? Link : "div";
            const cardProps = href ? { href, scroll: false } : {};
            return (
              <CardEl key={i} className="fx-result-card" {...cardProps}>
                <div className="fx-result-card-top">
                  <span className="fx-result-card-type">Marché · {it.nature}</span>
                  <span>{fmtDate(it.date)}</span>
                </div>
                <h3>{(() => {
                  const clean = normalizeObjet(it.objet);
                  return clean.length > 90 ? clean.slice(0, 90) + "…" : clean;
                })()}</h3>
                <div className="fx-result-card-amount tnum">
                  {v}
                  <span className="u">{u}</span>
                </div>
                <div className="fx-result-card-meta">
                  <span className="fx-result-card-arr">
                    {(it.titulaire === "MARCHE MULTIATTRIBUTAIRE" ? "Multi-attributaire" : it.titulaire).slice(0, 34)}
                  </span>
                  <span className="fx-result-card-cta">
                    Fiche <span className="chev">→</span>
                  </span>
                </div>
              </CardEl>
            );
          })}
          {filtered.length > displayed.length && (
            <div className="fx-results-overflow">
              + {filtered.length - displayed.length} autres contrats. Affinez la recherche pour filtrer.
            </div>
          )}
        </div>
      ) : (
        <div className="fx-search-placeholder">
          <p>Aucun contrat ne correspond à cette recherche.</p>
          <button type="button" className="fx-btn" onClick={reset}>
            Réinitialiser
          </button>
        </div>
      )}
    </div>
  );
}
