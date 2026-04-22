"use client";

import { useMemo, useState } from "react";
import { useT, useLocale } from "@/lib/localeContext";
import { trLabel } from "@/lib/label-translate";
import { useTrack } from "@/lib/analyticsContext";
import { useDebouncedTrack, hashQuery, queryShape } from "@/lib/analytics-helpers";

const fill = (s: string, vars: Record<string, string | number>) => {
  let r = s;
  for (const [k, v] of Object.entries(vars)) r = r.replace(`{${k}}`, String(v));
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

  const filtered = useMemo(() => {
    const qLower = q.trim().toLowerCase();
    return items.filter((it) => {
      if (cat && it.categorie !== cat) return false;
      if (!qLower) return true;
      return (
        it.titulaire.toLowerCase().includes(qLower) ||
        it.objet.toLowerCase().includes(qLower)
      );
    });
  }, [items, q, cat]);

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
            onChange={async (e) => {
              const next = e.target.value;
              setQ(next);
              setShown(PAGE_SIZE);
              if (next.trim().length >= 2) {
                const qHash = await hashQuery(next);
                trackDebounced("search_submit", {
                  page: "marches-publics",
                  source: "full_list",
                  q_hash: qHash,
                  ...queryShape(next),
                });
              }
            }}
          />
        </div>
        <div className="fx-filter">
          <label>{t("fx.mfl.category")}</label>
          <select
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
          {visible.map((it, i) => (
            <tr key={i}>
              <td className="rank">{String(i + 1).padStart(3, "0")}</td>
              <td style={{ fontWeight: 500 }}>{it.titulaire}</td>
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
