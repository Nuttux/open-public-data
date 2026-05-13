"use client";

import type { BudgetPosteFiche } from "@/lib/fusion-data";
import { useT, useLocale } from "@/lib/localeContext";

type Props = { poste: BudgetPosteFiche };

function makeFmtEur(locale: "fr" | "en") {
  const locStr = locale === "en" ? "en-GB" : "fr-FR";
  return (n: number) => {
    if (n >= 1e9) return `${new Intl.NumberFormat(locStr, { maximumFractionDigits: 2 }).format(n / 1e9)} Md €`;
    if (n >= 1e6) return `${Math.round(n / 1e6).toLocaleString(locStr)} M €`;
    if (n >= 1e3) return `${Math.round(n / 1e3).toLocaleString(locStr)} k €`;
    return `${Math.round(n).toLocaleString(locStr)} €`;
  };
}

const fmtDec = (n: number, d = 1, locale: "fr" | "en" = "fr") =>
  locale === "en" ? n.toFixed(d) : n.toFixed(d).replace(".", ",");

/**
 * Inside-drawer (or full-page) view of a budget poste. Split raw names
 * "N2: N3" into a two-level grouped list — groups sorted by group total,
 * items within each group sorted by amount desc. Lightweight: no
 * expand/collapse, everything visible since the drawer provides the
 * scrollable container.
 */
export default function PosteFiche({ poste }: Props) {
  const t = useT();
  const { locale } = useLocale();
  const fmtEur = makeFmtEur(locale);
  const fill = (s: string, vars: Record<string, string | number>) => {
    let r = s;
    for (const [k, v] of Object.entries(vars)) r = r.split(`{${k}}`).join(String(v));
    return r;
  };
  const kindLabel = poste.kind === "depense" ? t("fx.poste.kind.depense") : t("fx.poste.kind.recette");
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
          <div className="k">{poste.kind === "depense" ? t("fx.poste.share.depenses") : t("fx.poste.share.recettes")}</div>
          <div className="v tnum">{fmtDec(poste.shareOfKindPct, 1, locale)} %</div>
        </div>
        <div>
          <div className="k">{fill(t("fx.poste.vs_year"), { year: poste.previousYear })}</div>
          <div className="v tnum">
            {poste.deltaPct === null
              ? "—"
              : `${poste.deltaPct >= 0 ? "+" : "−"} ${fmtDec(Math.abs(poste.deltaPct), 1, locale)} %`}
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
          <p className="fx-note">{fill(t("fx.poste.no_subpostes"), { year: poste.year })}</p>
        )}
      </div>
    </div>
  );
}
