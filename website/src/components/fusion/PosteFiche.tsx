"use client";

import type { BudgetPosteFiche, BudgetPosteSubPoste } from "@/lib/fusion-data";
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
 * Forme courte affichée dans le tag de chaque row. Les keys sont les labels
 * `ode_categorie_flux` produits par `core_budget.sql` — alignés avec le mapping
 * SQL pour éviter une dépendance fragile. Les libellés non listés sont
 * passés tels quels.
 */
const FLOW_SHORT_FR: Record<string, string> = {
  "Personnel": "Personnel",
  "Subventions (fonctionnement)": "Subvention",
  "Subventions (investissement)": "Subv. invest.",
  "Transferts sociaux": "Transferts",
  "Contributions obligatoires": "Contributions",
  "Achats": "Achats",
  "Services extérieurs": "Services",
  "Autres services": "Services",
  "Charges financières": "Charges fin.",
  "Remboursement dette": "Dette",
  "Reversements péréquation": "Péréquation",
  "Dotations arrondissements": "Dotations arrt",
  "Immobilisations corporelles": "Investissement",
  "Immobilisations en cours": "Investissement",
  "Études": "Études",
  "Impôts et taxes": "Impôts",
  "Dotations et participations": "Dotations",
  "Autres produits gestion": "Autres produits",
  "Produits services": "Produits",
  "Autre": "Autre",
};

const FLOW_SHORT_EN: Record<string, string> = {
  "Personnel": "Staff",
  "Subventions (fonctionnement)": "Grant",
  "Subventions (investissement)": "Capital grant",
  "Transferts sociaux": "Transfers",
  "Contributions obligatoires": "Contributions",
  "Achats": "Purchases",
  "Services extérieurs": "Services",
  "Autres services": "Services",
  "Charges financières": "Fin. costs",
  "Remboursement dette": "Debt",
  "Reversements péréquation": "Equalisation",
  "Dotations arrondissements": "District grants",
  "Immobilisations corporelles": "Capex",
  "Immobilisations en cours": "Capex",
  "Études": "Studies",
  "Impôts et taxes": "Taxes",
  "Dotations et participations": "State grants",
  "Autres produits gestion": "Other income",
  "Produits services": "Service income",
  "Autre": "Other",
};

function shortFlow(flow: string | undefined, locale: "fr" | "en"): string | null {
  if (!flow) return null;
  const map = locale === "en" ? FLOW_SHORT_EN : FLOW_SHORT_FR;
  return map[flow] || flow;
}

type GroupedRow = {
  /** Libellé de la nature comptable, nettoyé du préfixe redondant "Thématique: ". */
  name: string;
  value: number;
  /** `ode_categorie_flux` brut depuis le pipeline (traduit + raccourci au render). */
  flow?: string;
  rank: number;
};

type Group = {
  key: string;
  total: number;
  items: GroupedRow[];
  /** Confiance la plus basse rencontrée parmi les items du groupe.
   *  "ca"=exécuté, "high"=imputé stable, "medium"=imputé fallback récent, "unknown"=pas imputable. */
  confidence: "ca" | "high" | "medium" | "unknown";
};

/**
 * Regroupe les sub-postes par dim primaire :
 *  - Dépenses : par `fonction` (Musées, Piscines, Théâtre…) — la vraie
 *    sous-thématique fonctionnelle. Tag par row = `flow_category` (Personnel,
 *    Subvention, Investissement…).
 *  - Recettes : pas de fonction côté pipeline, on retombe sur le split
 *    historique sur ":" pour conserver le rendu actuel.
 *
 * Fallback : si aucun sub-poste n'a `fonction` (JSON pré-2026-05), on retombe
 * aussi sur le split ":" pour rétro-compat.
 */
function groupSubPostes(poste: BudgetPosteFiche): { groups: Group[]; mode: "fonction" | "split" } {
  const isExpenseWithFonction =
    poste.kind === "depense" && poste.subPostes.some((s) => s.fonction);
  const mode: "fonction" | "split" = isExpenseWithFonction ? "fonction" : "split";

  const map = new Map<string, Group>();
  const order: string[] = [];

  poste.subPostes.forEach((it: BudgetPosteSubPoste, i) => {
    let key: string;
    let rowName: string;

    if (mode === "fonction") {
      key = it.fonction || "Autre";
      // Strip leading "Thématique: " (redondant avec le header du drawer)
      const prefix = `${poste.label}: `;
      rowName = it.name.startsWith(prefix) ? it.name.slice(prefix.length) : it.name;
    } else {
      const idx = it.name.indexOf(":");
      key = idx > 0 ? it.name.slice(0, idx).trim() : "—";
      rowName = idx > 0 ? it.name.slice(idx + 1).trim() : it.name.trim();
    }

    let g = map.get(key);
    if (!g) {
      g = { key, total: 0, items: [], confidence: "ca" };
      map.set(key, g);
      order.push(key);
    }
    g.total += it.value;
    g.items.push({
      name: rowName,
      value: it.value,
      flow: mode === "fonction" ? it.flow_category : undefined,
      rank: i + 1,
    });
    // Propagate worst confidence to group level (ca < high < medium < unknown)
    const order_conf = { ca: 0, high: 1, medium: 2, unknown: 3 } as const;
    const itc = it.fonction_confidence ?? "ca";
    if (order_conf[itc] > order_conf[g.confidence]) {
      g.confidence = itc;
    }
  });

  const groups = order
    .map((k) => map.get(k)!)
    .sort((a, b) => b.total - a.total);
  // items within each group sorted by value desc
  groups.forEach((g) => g.items.sort((x, y) => y.value - x.value));

  return { groups, mode };
}

/**
 * Inside-drawer (or full-page) view of a budget poste. Sections =
 * sous-thématique fonctionnelle (Musées, Piscines, Théâtre…) ; rows = nature
 * comptable avec un tag à droite indiquant la catégorie de flux (Personnel,
 * Subvention, Investissement…). Pour les recettes (pas de fonction dans le
 * pipeline), on retombe sur l'ancien split sur ":".
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

  const { groups } = groupSubPostes(poste);
  // Si le grouping n'a produit qu'un seul groupe sans clé sémantique ("—",
  // typique Marseille où les noms n'ont ni `:` ni `fonction`), on rend une
  // liste plate sans header de section — le faux header serait du bruit.
  const isFlat = groups.length === 1 && groups[0].key === "—";
  // Au moins un groupe est imputé depuis l'historique CA → afficher le
  // disclaimer global en tête de fiche.
  const hasImputed = groups.some((g) => g.confidence === "high" || g.confidence === "medium");

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

      {hasImputed && (
        <p className="fx-poste-imputation-note">
          {locale === "en"
            ? "Functional breakdown projected from prior executed years. Final allocation will be confirmed in the Compte Administratif."
            : "Ventilation par fonction projetée depuis l'exécution des années passées. À confirmer au Compte Administratif."}
        </p>
      )}

      <div className="fx-poste-groups">
        {groups.map((g) => (
          <section key={g.key} className="fx-poste-group">
            {!isFlat && (
              <header>
                <span>
                  {g.key}
                  {g.confidence === "medium" && (
                    <span
                      className="fx-poste-conf fx-poste-conf-medium"
                      title={locale === "en"
                        ? "Estimated from the most recent executed year — may vary"
                        : "Estimé depuis le dernier exercice exécuté — susceptible de varier"}
                    >
                      ~
                    </span>
                  )}
                </span>
                <span className="muted tnum">{fmtEur(g.total)}</span>
              </header>
            )}
            <ul>
              {g.items.map((it) => {
                const flowShort = shortFlow(it.flow, locale);
                return (
                  <li key={it.rank}>
                    <span className="lbl">{it.name}</span>
                    {flowShort && (
                      <span className="fx-poste-tag" title={it.flow}>{flowShort}</span>
                    )}
                    <span className="bar" aria-hidden="true">
                      <span
                        className="fill"
                        style={{ width: `${Math.max(2, (it.value / maxSub) * 100)}%` }}
                      />
                    </span>
                    <span className="v tnum">{fmtEur(it.value)}</span>
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
        {groups.length === 0 && (
          <p className="fx-note">{fill(t("fx.poste.no_subpostes"), { year: poste.year })}</p>
        )}
      </div>
    </div>
  );
}
