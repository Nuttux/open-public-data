"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useT, useLocale } from "@/lib/localeContext";
import { fill, numLocale } from "@/lib/fmt";
import { trLabel } from "@/lib/label-translate";
import { useTrack } from "@/lib/analyticsContext";

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
  /** Number of top entities highlighted in the Pareto callout (default 10). */
  paretoTopN?: number;
  /** Custom URL builder per theme — défaut: `${basePath}?theme=X`. Utile pour ouvrir
   *  un drawer (ex: /investissements/chapitre/:slug) au lieu d'un filtre query. */
  hrefBuilder?: (theme: string) => string;
  /** Override the money formatter (default: EUR). Additive — pass a currency-
   *  specific formatter for non-euro places (e.g. BRL for Recife). */
  formatAmount?: (n: number) => string;
};

// Editorial palette — 10 clear, distinct hues, colorblind-conscious.
// All colors meet WCAG 2.1 AA (≥4.5:1) against white seg-label text.
export const THEME_COLOR: Record<string, string> = {
  "Social": "#c12323",
  "Logement": "#546583",
  "Éducation": "#2a3680",
  "Culture": "#8c5e2a",
  "Sport": "#2c7339",
  "Environnement": "#4d7a36",
  "Santé": "#b8495d",
  "Transport": "#36657a",
  "Économie": "#8a5a3b",
  "Administration": "#5a5e68",
  "Sécurité": "#3d4045",
  "International": "#7b6aa3",
  "Autres": "#6c7484",
};

// Fallback palette cycled when a theme name isn't in THEME_COLOR — used for
// marchés public categories (CPV libellés), which have arbitrary labels.
const FALLBACK_PALETTE = [
  "#2a3680", "#8c5e2a", "#c12323", "#2c7339", "#546583",
  "#b8495d", "#36657a", "#8a5a3b", "#7b6aa3", "#4d7a36",
  "#3d4045", "#5a5e68", "#a33016", "#b85433", "#6c7484",
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

/**
 * Append the "others" overflow bucket — but if a slice already carries that
 * exact label (e.g. the source data has a real theme literally named "Outros"
 * that's visible in the bar), fold the overflow INTO it instead of adding a
 * second same-keyed segment. Prevents the React duplicate-key crash while
 * keeping the bar summing to 100 %. No-op collision for cities whose data has
 * no theme matching the label, so it appends exactly as before.
 */
function appendOthers(list: Slice[], label: string, amount: number, count: number): Slice[] {
  if (amount <= 0) return list;
  const i = list.findIndex((c) => c.theme === label);
  if (i >= 0) {
    const out = [...list];
    out[i] = { ...out[i], amount: out[i].amount + amount, count: out[i].count + count };
    return out;
  }
  return [...list, { theme: label, amount, count }];
}

export default function StackedBarTheme({
  items,
  total,
  concentrationTop10Pct,
  year,
  basePath,
  kicker,
  entityNoun,
  paretoContrast,
  paretoTopN = 10,
  hrefBuilder,
  formatAmount,
}: Props) {
  const t = useT();
  const { locale } = useLocale();
  const track = useTrack();
  const pathname = usePathname();
  const locStr = numLocale(locale);
  const sep = locale === "en" ? "." : ",";
  const mdLabel = t("fx.s.md_eur");
  const mLabel = t("fx.s.m_eur");
  const fmtEur = (n: number) => {
    if (n >= 1e9) return `${(n / 1e9).toFixed(2).replace(".", sep)} ${mdLabel}`;
    if (n >= 1e6) return `${Math.round(n / 1e6)} ${mLabel}`;
    if (n >= 1e3) return `${Math.round(n / 1e3).toLocaleString(locStr)} k €`;
    return `${n.toLocaleString(locStr)} €`;
  };
  const fmtAmt = formatAmount ?? fmtEur;
  const effEntityNoun = entityNoun ?? t("fx.stacked.entity_default");
  const buildHref = (theme: string) =>
    hrefBuilder ? hrefBuilder(theme) : `${basePath}?theme=${encodeURIComponent(theme)}`;
  const consolidated = consolidate(items);
  // Some loaders pass only top-N categories: sum(items) can be < total.
  // Include that gap in "Autres" so the bar always fills 100 %.
  const itemsSum = consolidated.reduce((s, c) => s + c.amount, 0);
  const uncoveredSum = Math.max(0, total - itemsSum);
  // Stratégie : garde le top 8 (ou tout ce qui est ≥ 2 %, selon le + permissif).
  // Ainsi pour des données denses (many petits chapitres), on montre quand même
  // les 8 plus gros au lieu de tout bundler dans "Autres".
  const MIN_PCT = 2;
  const MAX_SEGMENTS = 8;
  const aboveMin = consolidated.filter((c) => (c.amount / total) * 100 >= MIN_PCT);
  const visible = aboveMin.length >= MAX_SEGMENTS
    ? aboveMin.slice(0, MAX_SEGMENTS)
    : consolidated.slice(0, Math.max(aboveMin.length, MAX_SEGMENTS));
  const visibleSet = new Set(visible.map((c) => c.theme));
  const hidden = consolidated.filter((c) => !visibleSet.has(c.theme));
  const hiddenSum = hidden.reduce((s, c) => s + c.amount, 0);
  const hiddenCount = hidden.reduce((s, c) => s + c.count, 0);
  const othersAmount = hiddenSum + uncoveredSum;
  const othersLabel = t("fx.stacked.others");
  const barSegments = appendOthers(visible, othersLabel, othersAmount, hiddenCount);

  return (
    <div className="fx-stackbar-card">
      <div className="fx-stackbar-kicker">
        {kicker ?? fill(t("fx.stacked.kicker_default"), { year })}
      </div>

      <div className="fx-stackbar-wrap">
        <div className="fx-stackbar" role="group" aria-label={t("fx.stacked.aria")}>
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
                title={fill(t("fx.stacked.seg_detail"), { theme: trLabel(s.theme, locale), amount: fmtAmt(s.amount), pct: pct.toFixed(1).replace(".", sep) })}
                aria-label={fill(t("fx.stacked.seg_aria"), { theme: trLabel(s.theme, locale), amount: fmtAmt(s.amount), pct: Math.round(pct) })}
                onClick={() =>
                  track("chart_element_click", {
                    chart: "stackedbar_seg",
                    page: pathname,
                    theme: s.theme,
                    amount: s.amount,
                    pct: Math.round(pct),
                  })
                }
              >
                {wide && (
                  <span className="fx-stackbar-seg-label">
                    <b>{trLabel(s.theme, locale)}</b>
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
        const legendItems = appendOthers(visibleLegend, othersLabel, remainingSum, remainingCount);
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
                    onClick={() =>
                      track("chart_element_click", {
                        chart: "stackedbar_legend",
                        page: pathname,
                        theme: s.theme,
                        amount: s.amount,
                      })
                    }
                  >
                    <span className="sw" style={{ background: colorFor(s.theme, idx) }} />
                    <span className="nm">{trLabel(s.theme, locale)}</span>
                    <span className="pc">{pct >= 1 ? `${Math.round(pct)} %` : `< 1 %`}</span>
                    <span className="am">{fmtAmt(s.amount)}</span>
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
          {(() => {
            const parts = fill(t("fx.stacked.pareto"), {
              n: paretoTopN,
              noun: effEntityNoun,
              eur: Math.round(concentrationTop10Pct),
              contrast: paretoContrast ? ` — ${paretoContrast}` : "",
            });
            return parts;
          })()}
        </span>
      </div>
    </div>
  );
}
