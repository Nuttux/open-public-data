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
  year: number;
  basePath: string;
  /** Override the kicker sentence (default: "subventions versées"). */
  kicker?: string;
  /** Override the Pareto callout noun (default: "bénéficiaires" / "associations"). */
  entityNoun?: string;
  /** Override the Pareto callout "outside of" clause (default: "en dehors du Social"). */
  paretoContrast?: string;
  /** Custom URL builder per theme — défaut: `${basePath}?theme=X`. Utile pour ouvrir
   *  un drawer (ex: /investissements/chapitre/:slug) au lieu d'un filtre query. */
  hrefBuilder?: (theme: string) => string;
};

// Editorial palette — 10 clear, distinct hues, colorblind-conscious.
const THEME_COLOR: Record<string, string> = {
  "Social": "#c12323",
  "Logement": "#546583",
  "Éducation": "#2a3680",
  "Culture": "#a67638",
  "Sport": "#3a8f4a",
  "Environnement": "#6b9c52",
  "Santé": "#b8495d",
  "Transport": "#4a8aa6",
  "Économie": "#8a5a3b",
  "Administration": "#6b6f7a",
  "Sécurité": "#3d4045",
  "International": "#7b6aa3",
  "Autres": "#9099a6",
};

// Fallback palette cycled when a theme name isn't in THEME_COLOR — used for
// marchés public categories (CPV libellés), which have arbitrary labels.
const FALLBACK_PALETTE = [
  "#2a3680", "#a67638", "#c12323", "#3a8f4a", "#546583",
  "#b8495d", "#4a8aa6", "#8a5a3b", "#7b6aa3", "#6b9c52",
  "#3d4045", "#6b6f7a", "#a33016", "#e06b4c", "#9099a6",
];

function colorFor(theme: string, index: number): string {
  return THEME_COLOR[theme] || FALLBACK_PALETTE[index % FALLBACK_PALETTE.length];
}

/** Merge the Social-* variants into a single "Social" bucket so the primary
 *  viz stays readable. Fine-grained splits live in the drill-down list below. */
function consolidate(items: Slice[]): Slice[] {
  const merged = new Map<string, Slice>();
  for (const it of items) {
    const key = it.theme.startsWith("Social") ? "Social" : it.theme;
    const cur = merged.get(key) ?? { theme: key, amount: 0, count: 0 };
    cur.amount += it.amount;
    cur.count += it.count;
    merged.set(key, cur);
  }
  return [...merged.values()].sort((a, b) => b.amount - a.amount);
}

const fmtEur = (n: number) => {
  if (n >= 1e9) return `${(n / 1e9).toFixed(2).replace(".", ",")} Md €`;
  if (n >= 1e6) return `${Math.round(n / 1e6)} M €`;
  if (n >= 1e3) return `${Math.round(n / 1e3).toLocaleString("fr-FR")} k €`;
  return `${n.toLocaleString("fr-FR")} €`;
};

export default function StackedBarTheme({
  items,
  total,
  concentrationTop10Pct,
  year,
  basePath,
  kicker,
  entityNoun = "bénéficiaires",
  paretoContrast,
  hrefBuilder,
}: Props) {
  const buildHref = (theme: string) =>
    hrefBuilder ? hrefBuilder(theme) : `${basePath}?theme=${encodeURIComponent(theme)}`;
  const consolidated = consolidate(items);
  // Some loaders pass only top-N categories: sum(items) can be < total.
  // Include that gap in "Autres" so the bar always fills 100 %.
  const itemsSum = consolidated.reduce((s, c) => s + c.amount, 0);
  const uncoveredSum = Math.max(0, total - itemsSum);
  const VISIBLE_PCT = 3.5;
  const visible = consolidated.filter((c) => (c.amount / total) * 100 >= VISIBLE_PCT);
  const hidden = consolidated.filter((c) => (c.amount / total) * 100 < VISIBLE_PCT);
  const hiddenSum = hidden.reduce((s, c) => s + c.amount, 0);
  const hiddenCount = hidden.reduce((s, c) => s + c.count, 0);
  const othersAmount = hiddenSum + uncoveredSum;
  const barSegments = othersAmount > 0
    ? [...visible, { theme: "Autres", amount: othersAmount, count: hiddenCount }]
    : visible;

  return (
    <div className="fx-stackbar-card">
      <div className="fx-stackbar-kicker">
        {kicker ?? `Sur chaque 100 € de subventions versées en ${year}`}
      </div>

      <div className="fx-stackbar-wrap">
        <div className="fx-stackbar" role="img" aria-label="Répartition des subventions par thématique">
          {barSegments.map((s, idx) => {
            const pct = (s.amount / total) * 100;
            const wide = pct >= 9;
            return (
              <Link
                key={s.theme}
                href={buildHref(s.theme)}
                scroll={false}
                className="fx-stackbar-seg"
                style={{ width: `${pct}%`, background: colorFor(s.theme, idx) }}
                title={`${s.theme} — ${fmtEur(s.amount)} (${pct.toFixed(1).replace(".", ",")} %) · cliquer pour voir le détail`}
                aria-label={`${s.theme} : ${fmtEur(s.amount)}, ${Math.round(pct)} %. Cliquer pour ouvrir la fiche.`}
              >
                {wide && (
                  <span className="fx-stackbar-seg-label">
                    <b>{s.theme}</b>
                    <span>{Math.round(pct)} %</span>
                  </span>
                )}
              </Link>
            );
          })}
        </div>

        <div className="fx-stackbar-scale">
          {[0, 25, 50, 75, 100].map((t) => (
            <span key={t} className="fx-stackbar-tick" style={{ left: `${t}%` }}>
              {t} %
            </span>
          ))}
        </div>
      </div>

      {(() => {
        // Visuel : cap à top-12 et agrège le reste sous "Autres" pour que la
        // légende tienne sur 2-3 lignes. La barre elle-même utilise la liste
        // complète pour rester proportionnée.
        const LEGEND_LIMIT = 12;
        const visibleLegend = consolidated.slice(0, LEGEND_LIMIT);
        const remaining = consolidated.slice(LEGEND_LIMIT);
        const remainingSum = remaining.reduce((s, c) => s + c.amount, 0) + uncoveredSum;
        const remainingCount = remaining.reduce((s, c) => s + c.count, 0);
        const legendItems = remainingSum > 0
          ? [...visibleLegend, { theme: "Autres", amount: remainingSum, count: remainingCount }]
          : visibleLegend;
        return (
          <ul className="fx-stackbar-legend">
            {legendItems.map((s, idx) => {
              const pct = (s.amount / total) * 100;
              return (
                <li key={s.theme}>
                  <Link
                    href={buildHref(s.theme)}
                    scroll={false}
                    className="fx-stackbar-legend-item"
                  >
                    <span className="sw" style={{ background: colorFor(s.theme, idx) }} />
                    <span className="nm">{s.theme}</span>
                    <span className="pc">{pct >= 1 ? `${Math.round(pct)} %` : `< 1 %`}</span>
                    <span className="am">{fmtEur(s.amount)}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        );
      })()}

      <div className="fx-stackbar-pareto">
        <span className="fx-stackbar-pareto-dot" />
        <span>
          À eux seuls, les <b>10 plus gros {entityNoun}</b> captent{" "}
          <b>{Math.round(concentrationTop10Pct)} €</b> sur 100
          {paretoContrast ? ` — ${paretoContrast}` : ""}.
        </span>
      </div>
    </div>
  );
}
