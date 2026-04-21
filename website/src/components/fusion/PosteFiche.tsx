import type { BudgetPosteFiche } from "@/lib/fusion-data";

type Props = { poste: BudgetPosteFiche };

const fmtEur = (n: number) => {
  if (n >= 1e9) return `${(n / 1e9).toFixed(2).replace(".", ",")} Md €`;
  if (n >= 1e6) return `${Math.round(n / 1e6).toLocaleString("fr-FR")} M €`;
  if (n >= 1e3) return `${Math.round(n / 1e3).toLocaleString("fr-FR")} k €`;
  return `${Math.round(n).toLocaleString("fr-FR")} €`;
};

const fmtDec = (n: number, d = 1) => n.toFixed(d).replace(".", ",");

/**
 * Inside-drawer (or full-page) view of a budget poste. Split raw names
 * "N2: N3" into a two-level grouped list — groups sorted by group total,
 * items within each group sorted by amount desc. Lightweight: no
 * expand/collapse, everything visible since the drawer provides the
 * scrollable container.
 */
export default function PosteFiche({ poste }: Props) {
  const kindLabel = poste.kind === "depense" ? "Dépense" : "Recette";
  const maxSub = poste.subPostes[0]?.value || 1;

  // Group by N2 (before ":") — fallback group "—" if no separator.
  const groups = new Map<string, { total: number; items: { n3: string; value: number; rank: number }[] }>();
  const groupOrder: string[] = [];
  poste.subPostes.forEach((it, i) => {
    const idx = it.name.indexOf(":");
    const n2 = idx > 0 ? it.name.slice(0, idx).trim() : "—";
    const n3 = idx > 0 ? it.name.slice(idx + 1).trim() : it.name.trim();
    if (!groups.has(n2)) {
      groupOrder.push(n2);
      groups.set(n2, { total: 0, items: [] });
    }
    const g = groups.get(n2)!;
    g.total += it.value;
    g.items.push({ n3, value: it.value, rank: i + 1 });
  });
  // Sort groups by total desc
  groupOrder.sort((a, b) => (groups.get(b)!.total - groups.get(a)!.total));

  return (
    <div className="fx-poste-fiche">
      <div className="fx-poste-stats">
        <div>
          <div className="k">{kindLabel} · {poste.year}</div>
          <div className="v tnum">{fmtEur(poste.total)}</div>
        </div>
        <div>
          <div className="k">Part du total {poste.kind === "depense" ? "dépenses" : "recettes"}</div>
          <div className="v tnum">{fmtDec(poste.shareOfKindPct, 1)} %</div>
        </div>
        <div>
          <div className="k">Vs {poste.previousYear}</div>
          <div className="v tnum">
            {poste.deltaPct === null
              ? "—"
              : `${poste.deltaPct >= 0 ? "+" : "−"} ${fmtDec(Math.abs(poste.deltaPct), 1)} %`}
          </div>
        </div>
      </div>

      <div className="fx-poste-groups">
        {groupOrder.map((n2) => {
          const g = groups.get(n2)!;
          return (
            <section key={n2} className="fx-poste-group">
              <header>
                <span>{n2}</span>
                <span className="muted tnum">{fmtEur(g.total)}</span>
              </header>
              <ul>
                {g.items.map((it) => (
                  <li key={it.rank}>
                    <span className="n">#{String(it.rank).padStart(2, "0")}</span>
                    <span className="lbl">{it.n3}</span>
                    <span className="bar" aria-hidden="true">
                      <span
                        className="fill"
                        style={{ width: `${Math.max(2, (it.value / maxSub) * 100)}%` }}
                      />
                    </span>
                    <span className="v tnum">{fmtEur(it.value)}</span>
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
        {groupOrder.length === 0 && (
          <p className="fx-note">Pas de sous-postes disponibles pour {poste.year}.</p>
        )}
      </div>
    </div>
  );
}
