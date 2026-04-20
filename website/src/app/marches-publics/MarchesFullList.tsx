"use client";

import { useMemo, useState } from "react";

type Item = {
  titulaire: string;
  objet: string;
  montant: number;
  categorie: string;
  date: string;
};

const fmtEur = (n: number) => {
  if (n >= 1e9) return new Intl.NumberFormat("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n / 1e9) + " Md €";
  if (n >= 1e6) return new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 1 }).format(n / 1e6) + " M €";
  if (n >= 1e3) return new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 }).format(n / 1e3) + " k €";
  return new Intl.NumberFormat("fr-FR").format(n) + " €";
};

const fmtDate = (iso: string) => {
  if (!iso) return "—";
  try {
    return new Intl.DateTimeFormat("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date(iso));
  } catch {
    return iso;
  }
};

const PAGE_SIZE = 50;

export default function MarchesFullList({ items }: { items: Item[] }) {
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("");
  const [shown, setShown] = useState(PAGE_SIZE);

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
          <label>Rechercher</label>
          <input
            type="search"
            placeholder="Titulaire ou objet du marché…"
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setShown(PAGE_SIZE);
            }}
          />
        </div>
        <div className="fx-filter">
          <label>Catégorie</label>
          <select
            value={cat}
            onChange={(e) => {
              setCat(e.target.value);
              setShown(PAGE_SIZE);
            }}
          >
            <option value="">Toutes</option>
            {categories.map((c) => (
              <option key={c} value={c}>
                {c.length > 50 ? c.slice(0, 50) + "…" : c}
              </option>
            ))}
          </select>
        </div>
        <div className="fx-filter-meta">
          {new Intl.NumberFormat("fr-FR").format(filtered.length)} contrat{filtered.length > 1 ? "s" : ""}
        </div>
      </div>

      <table className="fx-table" style={{ marginTop: 20 }}>
        <thead>
          <tr>
            <th>#</th>
            <th>Titulaire</th>
            <th>Objet</th>
            <th>Catégorie</th>
            <th>Date</th>
            <th style={{ textAlign: "right" }}>Enveloppe max</th>
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
                {it.categorie.length > 40 ? it.categorie.slice(0, 40) + "…" : it.categorie}
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
            onClick={() => setShown(shown + PAGE_SIZE)}
          >
            Afficher {Math.min(PAGE_SIZE, filtered.length - shown)} contrats de plus
          </button>
        </div>
      )}

      {filtered.length === 0 && (
        <div className="fx-empty" style={{ marginTop: 20 }}>
          <div className="fx-empty-label">Aucun résultat</div>
          <h3>Aucun contrat ne correspond à ces filtres.</h3>
          <p>Essayez un autre terme ou une catégorie différente.</p>
        </div>
      )}
    </div>
  );
}
