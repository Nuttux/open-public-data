"use client";

import { useEffect, useMemo, useState } from "react";
import { useT, useLocale } from "@/lib/localeContext";
import { trLabel } from "@/lib/label-translate";
import { useTrack } from "@/lib/analyticsContext";
import { useDebouncedTrack, hashQuery, queryShape } from "@/lib/analytics-helpers";
import { normSearch, expandQuery, matchExpanded } from "@/lib/search-synonyms";

const fill = (s: string, vars: Record<string, string | number>) => {
  let r = s;
  for (const [k, v] of Object.entries(vars)) r = r.split(`{${k}}`).join(String(v));
  return r;
};

type Item = {
  titulaire: string;
  objet: string;
  montant: number;
  categorie: string;
  date: string;
};

const PAGE_SIZE = 50;

export default function MarchesFullList({ items }: { items: Item[] }) {
  const t = useT();
  const { locale } = useLocale();
  const locStr = locale === "en" ? "en-GB" : "fr-FR";

  const fmtEur = (n: number) => {
    if (n >= 1e9) return new Intl.NumberFormat(locStr, { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n / 1e9) + " " + t("fx.s.md_eur");
    if (n >= 1e6) return new Intl.NumberFormat(locStr, { maximumFractionDigits: 1 }).format(n / 1e6) + " " + t("fx.s.m_eur");
    if (n >= 1e3) return new Intl.NumberFormat(locStr, { maximumFractionDigits: 0 }).format(n / 1e3) + " k €";
    return new Intl.NumberFormat(locStr).format(n) + " €";
  };

  const fmtDate = (iso: string) => {
    if (!iso) return "—";
    try {
      return new Intl.DateTimeFormat(locStr, { day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date(iso));
    } catch {
      return iso;
    }
  };

  const [q, setQ] = useState("");
  const [cat, setCat] = useState("");
  const [shown, setShown] = useState(PAGE_SIZE);
  const track = useTrack();
  const trackDebounced = useDebouncedTrack(700);

  const categories = useMemo(() => {
    const s = new Set<string>();
    for (const it of items) s.add(it.categorie);
    return [...s].sort();
  }, [items]);

  // Haystack normalisé une seule fois par jeu de données, pas à chaque frappe.
  const hayNorms = useMemo(
    () => items.map((it) => normSearch(`${it.titulaire} ${it.objet}`)),
    [items]
  );

  const filtered = useMemo(() => {
    const exp = expandQuery(q);
    const out: { it: Item; via: string[] }[] = [];
    items.forEach((it, idx) => {
      if (cat && it.categorie !== cat) return;
      const m = matchExpanded(hayNorms[idx], exp);
      if (!m.match) return;
      out.push({ it, via: m.via });
    });
    return out;
  }, [items, hayNorms, q, cat]);

  // Track search après recalcul de filtered, pour envoyer results_count
  // (les requêtes zéro-résultat guident le dictionnaire de synonymes).
  useEffect(() => {
    const trimmed = q.trim();
    if (trimmed.length < 2) return;
    let cancelled = false;
    (async () => {
      const qHash = await hashQuery(trimmed);
      if (cancelled) return;
      trackDebounced("search_submit", {
        page: "marches-publics",
        source: "full_list",
        q_hash: qHash,
        ...queryShape(trimmed),
        results_count: filtered.length,
      });
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- filtered est frais dans la closure ; ne refire que sur q.
  }, [q]);

  const visible = filtered.slice(0, shown);

  return (
    <div>
      <div className="fx-filters-row">
        <div className="fx-filter">
          <label>{t("fx.mfl.search")}</label>
          <input
            type="search"
            placeholder={t("fx.mfl.search_placeholder")}
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setShown(PAGE_SIZE);
            }}
          />
        </div>
        <div className="fx-filter">
          <label htmlFor="mfl-cat-select">{t("fx.mfl.category")}</label>
          <select
            id="mfl-cat-select"
            value={cat}
            onChange={(e) => {
              setCat(e.target.value);
              setShown(PAGE_SIZE);
              track("filter_change", {
                page: "marches-publics",
                source: "full_list",
                field: "category",
                value: e.target.value || "all",
              });
            }}
          >
            <option value="">{t("fx.mfl.all")}</option>
            {categories.map((c) => {
              const lbl = trLabel(c, locale);
              return (
                <option key={c} value={c}>
                  {lbl.length > 50 ? lbl.slice(0, 50) + "…" : lbl}
                </option>
              );
            })}
          </select>
        </div>
        <div className="fx-filter-meta">
          {fill(t("fx.mfl.contracts"), {
            n: new Intl.NumberFormat(locStr).format(filtered.length),
            s: filtered.length > 1 ? "s" : "",
          })}
        </div>
      </div>

      <table className="fx-table" style={{ marginTop: 20 }}>
        <thead>
          <tr>
            <th>#</th>
            <th>{t("fx.mfl.col.titulaire")}</th>
            <th>{t("fx.mfl.col.objet")}</th>
            <th>{t("fx.mfl.col.categorie")}</th>
            <th>{t("fx.mfl.col.date")}</th>
            <th style={{ textAlign: "right" }}>{t("fx.mfl.col.enveloppe")}</th>
          </tr>
        </thead>
        <tbody>
          {visible.map(({ it, via }, i) => (
            <tr key={i}>
              <td className="rank">{String(i + 1).padStart(3, "0")}</td>
              <td style={{ fontWeight: 500 }}>
                {it.titulaire}
                {via.length > 0 && (
                  <div className="fx-result-card-via" style={{ margin: 0 }}>
                    {t("fx.search.match_via")} {via.join(", ")}
                  </div>
                )}
              </td>
              <td className="muted" style={{ maxWidth: 360 }}>
                {it.objet.length > 120 ? it.objet.slice(0, 120) + "…" : it.objet}
              </td>
              <td className="muted" style={{ maxWidth: 200 }}>
                {(() => { const lbl = trLabel(it.categorie, locale); return lbl.length > 40 ? lbl.slice(0, 40) + "…" : lbl; })()}
              </td>
              <td className="muted">{fmtDate(it.date)}</td>
              <td className="num">{fmtEur(it.montant)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {shown < filtered.length && (
        <div style={{ textAlign: "center", marginTop: 20 }}>
          <button
            type="button"
            className="fx-btn"
            onClick={() => {
              const next = shown + PAGE_SIZE;
              track("load_more", {
                page: "marches-publics",
                source: "full_list",
                visible_before: shown,
                visible_after: next,
                total: filtered.length,
              });
              setShown(next);
            }}
          >
            {fill(t("fx.mfl.show_more"), { n: Math.min(PAGE_SIZE, filtered.length - shown) })}
          </button>
        </div>
      )}

      {filtered.length === 0 && (
        <div className="fx-empty" style={{ marginTop: 20 }}>
          <div className="fx-empty-label">{t("fx.mfl.empty.label")}</div>
          <h3>{t("fx.mfl.empty.title")}</h3>
          <p>{t("fx.mfl.empty.desc")}</p>
        </div>
      )}
    </div>
  );
}
