"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import SectionHead from "@/components/fusion/SectionHead";

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

type Props = {
  year: number;
  top10: Top10Bene[];
  allBeneficiaires: Bene[];
  themes: string[];
  concentrationTop10Pct: number;
};

const fmtEur = (n: number) => {
  if (n >= 1e9) return { v: new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 2 }).format(n / 1e9), u: "Md €" };
  if (n >= 1e6) return { v: new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 1 }).format(n / 1e6), u: "M €" };
  if (n >= 1e3) return { v: new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 }).format(n / 1e3), u: "k €" };
  return { v: new Intl.NumberFormat("fr-FR").format(n), u: "€" };
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

const SEEDS = ["Croix Rouge", "Secours", "Theatre", "Emmaus", "Fondation", "Paris"];

export default function QuiRecoitExplorer({
  year,
  top10,
  allBeneficiaires,
  themes,
  concentrationTop10Pct,
}: Props) {
  const [query, setQuery] = useState("");
  const [theme, setTheme] = useState("");
  const [minEur, setMinEur] = useState("");
  const [maxEur, setMaxEur] = useState("");
  const searchRef = useRef<HTMLElement | null>(null);
  const searchParams = useSearchParams();

  // Read ?theme=X from URL (set by the stackbar click) and apply it to the
  // filter. Scroll to the search section so the user sees the results of
  // their click.
  useEffect(() => {
    const themeParam = searchParams.get("theme");
    if (themeParam) {
      // Match against the canonical list — the stackbar consolidates
      // "Social - Solidarité" etc. into "Social", so expand it back.
      const matched = themes.includes(themeParam)
        ? themeParam
        : themes.find((t) => t.startsWith(themeParam)) ?? themeParam;
      setTheme(matched);
      setTimeout(() => {
        searchRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 50);
    }
  }, [searchParams, themes]);

  const hasQuery = query.trim().length >= 2 || theme.length > 0 || minEur.length > 0 || maxEur.length > 0;

  const filtered = useMemo(() => {
    if (!hasQuery) return [];
    const q = norm(query);
    const min = minEur ? Number(minEur) : 0;
    const max = maxEur ? Number(maxEur) : Number.POSITIVE_INFINITY;
    return allBeneficiaires.filter((it) => {
      if (theme && it.theme !== theme) return false;
      if (it.amount < min || it.amount > max) return false;
      if (q && !norm(it.name).includes(q)) return false;
      return true;
    });
  }, [allBeneficiaires, query, theme, minEur, maxEur, hasQuery]);

  const reset = () => {
    setQuery("");
    setTheme("");
    setMinEur("");
    setMaxEur("");
  };

  const ficheHref = (name: string) => `/qui-recoit/association/${encodeURIComponent(name)}`;

  const refMax = top10[0]?.amount ?? 1;

  return (
    <>
      {/* === SECTION 02 : TOP 10 BÉNÉFICIAIRES === */}
      <section className="fx-section">
        <div className="fx-wrap">
          <SectionHead
            number="03"
            kind="Top bénéficiaires"
            title={<>Les <em>10 plus grosses</em> subventions.</>}
            subtitle={`Classées par montant pour l'exercice ${year}. Cliquez sur une ligne pour ouvrir la fiche de l'association.`}
          />
          <div className="fx-top-list">
        <div className="fx-top-head">
          <span>Rang · Association</span>
          <span>Montant {year} · Thématique</span>
        </div>
        {top10.map((b) => {
          const { v, u } = fmtEur(b.amount);
          return (
            <Link
              key={b.rank}
              href={ficheHref(b.name)}
              scroll={false}
              className="fx-top-row"
              aria-label={`Ouvrir la fiche de ${b.name}`}
            >
              <span className="r">{String(b.rank).padStart(2, "0")}</span>
              <span className="name">{b.name}</span>
              <span className="bar">
                <span className="fill" style={{ width: `${(b.amount / refMax) * 100}%` }} />
              </span>
              <span className="v tnum">
                {v}
                <span className="u">{u}</span>
              </span>
              <span className="theme">{b.theme ?? "—"}</span>
              <span className="arrow" aria-hidden="true">→</span>
            </Link>
          );
        })}
      </div>
          <p style={{ fontFamily: "var(--f-mono)", fontSize: 11, color: "var(--muted)", letterSpacing: ".04em", marginTop: 20 }}>
            Ces 10 associations totalisent{" "}
            <b style={{ color: "var(--ink)" }}>
              {new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 }).format(top10.reduce((s, t) => s + t.amount, 0) / 1e6)} M €
            </b>
            {" "}— <b style={{ color: "var(--ink)" }}>
              {new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 }).format(concentrationTop10Pct)} %
            </b>{" "}
            des subventions de l&apos;année. Cliquez sur une ligne pour ouvrir la fiche.
          </p>
        </div>
      </section>

      {/* === SECTION 04 : RECHERCHE === */}
      <section className="fx-section" id="recherche" ref={searchRef}>
        <div className="fx-wrap">
          <SectionHead
            number="04"
            kind="Recherche"
            title={<>Cherchez <em>une association</em> précise.</>}
            subtitle="Nom, thématique, fourchette de montant. Tapez les premières lettres — la recherche ignore les accents et les tirets. Cliquez sur une fiche pour voir l'historique complet."
          />
          <div className="fx-search-wrap">
        <div className="fx-search-inner">
          <div className="fx-search-label">Rechercher</div>
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
              placeholder="Nom d'une association, d'un opérateur public…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          <div className="fx-search-filters">
            <span className="fx-search-filter-label">Filtres</span>
            <select value={theme} onChange={(e) => setTheme(e.target.value)}>
              <option value="">Toutes les thématiques</option>
              {themes.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
            <div className="fx-search-range">
              <input
                type="number"
                placeholder="Min €"
                min="0"
                value={minEur}
                onChange={(e) => setMinEur(e.target.value)}
              />
              <span style={{ color: "var(--muted)", fontFamily: "var(--f-mono)", fontSize: 11 }}>→</span>
              <input
                type="number"
                placeholder="Max €"
                min="0"
                value={maxEur}
                onChange={(e) => setMaxEur(e.target.value)}
              />
            </div>
            <button type="button" className="fx-search-clear" onClick={reset}>
              Réinitialiser
            </button>
          </div>
        </div>

        {hasQuery && (
          <div className="fx-search-meta">
            <span>
              {query.trim().length > 0 && (
                <>
                  Résultats pour <b>« {query.trim()} »</b> ·{" "}
                </>
              )}
              <b>
                {filtered.length} association{filtered.length > 1 ? "s" : ""}
              </b>{" "}
              correspond{filtered.length > 1 ? "ent" : ""}
            </span>
            <span>Trié par montant · exercice {year}</span>
          </div>
        )}

        {hasQuery && filtered.length > 0 && (
          <div className="fx-results-grid">
            {filtered.slice(0, 24).map((it, i) => {
              const activeThisYear = it.amount > 0;
              const displayAmount = activeThisYear ? it.amount : it.totalAmount;
              const { v, u } = fmtEur(displayAmount);
              return (
                <Link
                  key={i}
                  href={ficheHref(it.name)}
                  scroll={false}
                  className="fx-result-card"
                >
                  <div className="fx-result-card-top">
                    <span className="fx-result-card-type">
                      {activeThisYear ? "Subvention" : "Historique"}
                    </span>
                    <span>
                      {activeThisYear ? year : `dernière : ${it.lastActiveYear}`}
                    </span>
                  </div>
                  <h3>{it.name}</h3>
                  <div className="fx-result-card-amount tnum">
                    {v}
                    <span className="u">{u}</span>
                  </div>
                  <div className="fx-result-card-meta">
                    <span className="fx-result-card-arr">
                      {activeThisYear
                        ? it.theme ?? "—"
                        : <em style={{ color: "var(--muted)", fontStyle: "normal" }}>cumul {new Intl.NumberFormat("fr-FR").format(it.history.filter(h => h.amount > 0).length)} exercices</em>}
                    </span>
                    <span className="fx-result-card-cta">
                      Fiche <span className="chev">→</span>
                    </span>
                  </div>
                </Link>
              );
            })}
            {filtered.length > 24 && (
              <div className="fx-results-overflow">
                + {filtered.length - 24} autres résultats. Affinez votre recherche pour les voir.
              </div>
            )}
          </div>
        )}

        {hasQuery && filtered.length === 0 && (
          <div className="fx-search-placeholder">
            <p>
              Aucune association ne correspond. Essayez un autre mot-clé ou élargissez la
              fourchette de montant.
            </p>
          </div>
        )}

        {!hasQuery && (
          <div className="fx-search-placeholder">
            <p>
              Tapez au moins <b>deux lettres</b> du nom d&apos;une association, ou utilisez un filtre.
              La recherche ignore les accents et les tirets.
            </p>
            <div className="fx-search-seeds">
              {SEEDS.map((s) => (
                <button key={s} type="button" className="fx-search-seed" onClick={() => setQuery(s)}>
                  « {s} »
                </button>
              ))}
            </div>
          </div>
        )}
          </div>
        </div>
      </section>

    </>
  );
}
