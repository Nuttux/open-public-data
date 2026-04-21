"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { normalizeObjet } from "@/lib/objet-normalizer";
import { useT, useLocale } from "@/lib/localeContext";
import { trLabel } from "@/lib/label-translate";

type Item = {
  titulaire: string;
  titulaireSiret?: string;
  numeroMarche?: string;
  objet: string;
  objetClair?: string | null;
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

const fill = (s: string, vars: Record<string, string | number>) => {
  let r = s;
  for (const [k, v] of Object.entries(vars)) r = r.replace(`{${k}}`, String(v));
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

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items.filter((it) => {
      if (hideMulti && it.multiAttributaire) return false;
      if (category && it.categorie !== category) return false;
      if (nature && it.nature !== nature) return false;
      if (q && !it.objet.toLowerCase().includes(q) && !it.titulaire.toLowerCase().includes(q) && !(it.objetClair || "").toLowerCase().includes(q)) return false;
      return true;
    });
  }, [items, query, category, nature, hideMulti]);

  const isQueryActive = query.trim().length >= 2;
  const isFilterActive = Boolean(category) || Boolean(nature) || !hideMulti;
  const hasActiveSelection = isQueryActive || isFilterActive;

  const displayed = filtered.slice(0, 24);

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
    return <>{fill(t("fx.mp.search.ctx.top"), { year })}</>;
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
          <select value={category} onChange={(e) => setCategory(e.target.value)}>
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
          <select value={nature} onChange={(e) => setNature(e.target.value)}>
            <option value="">{t("fx.mp.search.all_nat")}</option>
            {natures.map((n) => (
              <option key={n} value={n}>
                {trLabel(n, locale)}
              </option>
            ))}
          </select>
          <label style={{ fontFamily: "var(--f-mono)", fontSize: 12, color: "var(--muted)", display: "inline-flex", alignItems: "center", gap: 6 }}>
            <input type="checkbox" checked={hideMulti} onChange={(e) => setHideMulti(e.target.checked)} />
            {t("fx.mp.search.hide_multi")}
          </label>
          {hasActiveSelection && (
            <button type="button" className="fx-search-clear" onClick={reset}>
              {t("fx.mp.search.reset")}
            </button>
          )}
        </div>
      </div>

      <div className="fx-search-meta">
        <span>
          {contextLabel} · <b>{new Intl.NumberFormat(locStr).format(filtered.length)} {filtered.length > 1 ? t("fx.mp.search.contract_p") : t("fx.mp.search.contract_s")}</b> {filtered.length > 1 ? t("fx.mp.search.match_p") : t("fx.mp.search.match_s")}
        </span>
        <span>{fill(t("fx.mp.search.sorted"), { year })}</span>
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
                  <span className="fx-result-card-type">{t("fx.mp.search.card.marche")} · {trLabel(it.nature, locale)}</span>
                  <span>{fmtDate(it.date)}</span>
                </div>
                <h3>{(() => {
                  const clean = it.objetClair || normalizeObjet(it.objet);
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
          <button type="button" className="fx-btn" onClick={reset}>
            {t("fx.mp.search.reset")}
          </button>
        </div>
      )}
    </div>
  );
}
