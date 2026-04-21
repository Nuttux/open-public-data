import Link from "next/link";

type Slice = {
  theme: string;
  amount: number;
  count: number;
};

type Props = {
  items: Slice[];
  total: number;
  concentrationTop10Pct: number;
  topTotal: number;
  year: number;
  /** Base path for clicking a theme to filter search (e.g. "/qui-recoit"). */
  basePath: string;
};

// Editorial palette — keep strong, memorable, distinguishable for colorblind.
// Order below matches roughly expected prevalence (Social biggest → Autres).
const THEME_COLOR: Record<string, string> = {
  "Social - Solidarité": "#c12323",
  "Social - Petite enfance": "#e06b4c",
  "Social": "#a33016",
  "Culture": "#a67638",
  "Sport": "#3a8f4a",
  "Éducation": "#2a3680",
  "Environnement": "#5f8c3d",
  "Transport": "#4a5d9a",
  "Économie": "#8a5a3b",
  "Santé": "#b8495d",
  "Logement": "#546583",
  "Administration": "#6b6f7a",
  "Sécurité": "#3d4045",
  "International": "#7b6aa3",
  "Autre": "#9099a6",
  "Autres": "#9099a6",
};

function colorFor(theme: string): string {
  return THEME_COLOR[theme] || "#9099a6";
}

/**
 * Répartit 100 cases entre les thématiques au prorata du montant, en
 * respectant deux contraintes :
 *  - la somme fait exactement 100 cases
 *  - les "restes" (décimales) sont distribués aux plus grosses thématiques
 */
function buildCells(items: Slice[], total: number): { theme: string; cells: number; pct: number }[] {
  if (total <= 0 || items.length === 0) return [];
  const raw = items.map((it) => ({
    theme: it.theme,
    pct: (it.amount / total) * 100,
    cells: Math.floor((it.amount / total) * 100),
  }));
  let assigned = raw.reduce((s, r) => s + r.cells, 0);
  const remainders = raw
    .map((r, i) => ({ i, frac: (items[i].amount / total) * 100 - r.cells }))
    .sort((a, b) => b.frac - a.frac);
  let k = 0;
  while (assigned < 100 && k < remainders.length) {
    raw[remainders[k].i].cells += 1;
    assigned += 1;
    k += 1;
  }
  return raw;
}

export default function WaffleTheme({ items, total, concentrationTop10Pct, topTotal, year, basePath }: Props) {
  const cells = buildCells(items, total);
  const concentrationCells = Math.round((topTotal / total) * 100);

  // Build the 100-cell sequence. Group cells by theme so each block is
  // rendered contiguously — easier to read than a random shuffle.
  const sequence: { theme: string; color: string; idx: number }[] = [];
  for (const row of cells) {
    for (let i = 0; i < row.cells; i++) {
      sequence.push({ theme: row.theme, color: colorFor(row.theme), idx: sequence.length });
    }
  }
  while (sequence.length < 100) {
    sequence.push({ theme: "—", color: "#e4e6ea", idx: sequence.length });
  }

  return (
    <div className="fx-waffle">
      <div className="fx-waffle-grid" role="img" aria-label="100 cases représentant 100 % des subventions par thématique">
        {sequence.slice(0, 100).map((c, i) => {
          const isTop10 = i < concentrationCells;
          return (
            <span
              key={i}
              className="fx-waffle-cell"
              style={{ background: c.color }}
              title={`${c.theme} · ${isTop10 ? "dans les 10 plus gros bénéficiaires" : ""}`}
              aria-hidden="true"
            />
          );
        })}
      </div>

      <div className="fx-waffle-legend">
        <div className="fx-waffle-kicker">
          Sur chaque 100 € de subventions versées en {year}
        </div>
        <ul>
          {cells
            .filter((c) => c.cells >= 1)
            .sort((a, b) => b.cells - a.cells)
            .slice(0, 8)
            .map((c) => (
              <li key={c.theme}>
                <Link
                  href={`${basePath}?theme=${encodeURIComponent(c.theme)}`}
                  className="fx-waffle-item"
                  scroll={false}
                >
                  <span className="fx-waffle-swatch" style={{ background: colorFor(c.theme) }} />
                  <span className="fx-waffle-name">{c.theme}</span>
                  <span className="fx-waffle-amt">
                    <b>{c.cells}</b> €
                  </span>
                </Link>
              </li>
            ))}
        </ul>
        <div className="fx-waffle-pareto">
          <span className="fx-waffle-pareto-dot" />
          <span>
            À eux seuls, les <b>10 plus gros bénéficiaires</b> captent{" "}
            <b>{Math.round(concentrationTop10Pct)} €</b> sur 100.
          </span>
        </div>
      </div>
    </div>
  );
}
