"use client";

import type { BudgetPosteFiche, BudgetPosteSubPoste } from "@/lib/fusion-data";
import { useT, useLocale } from "@/lib/localeContext";
import { fill, numLocale } from "@/lib/fmt";
import posteLabels from "@/data/poste-labels.json";

type Props = { poste: BudgetPosteFiche };

function makeFmtEur(locale: "fr" | "en") {
  const locStr = numLocale(locale);
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
const FLOW_SHORT_FR: Record<string, string> = posteLabels.FLOW_SHORT_FR;

const FLOW_SHORT_EN: Record<string, string> = posteLabels.FLOW_SHORT_EN;

function shortFlow(flow: string | undefined, locale: "fr" | "en"): string | null {
  if (!flow) return null;
  const map = locale === "en" ? FLOW_SHORT_EN : FLOW_SHORT_FR;
  return map[flow] || flow;
}

/**
 * EN display for sub-poste line labels. Labels are either a leaf
 * ("Rémunérations du personnel") or "Prefix: leaf" ("Invest. Aménagement:
 * Subventions d'investissement", "Reversements Fiscaux: FNGIR"). We translate
 * the prefix and the leaf separately and keep any untranslated token as-is
 * (proper nouns / acronyms like FNGIR stay). The long tail falls back to French.
 * Source of the FR labels is pipeline/seeds/seed_label_friendly.csv.
 */
const LABEL_PREFIX_EN: Record<string, string> = posteLabels.LABEL_PREFIX_EN;

const LABEL_LEAF_EN: Record<string, string> = posteLabels.LABEL_LEAF_EN;

function labelEn(label: string): string {
  if (LABEL_LEAF_EN[label]) return LABEL_LEAF_EN[label];
  const i = label.indexOf(": ");
  if (i > 0) {
    const p = label.slice(0, i);
    const rest = label.slice(i + 2);
    return `${LABEL_PREFIX_EN[p] ?? p}: ${labelEn(rest)}`;
  }
  return label;
}

/** EN for fonction group headers (functional M57 nomenclature). Long tail
 *  (smallest fonctions) falls back to French. */
const FONCTION_EN: Record<string, string> = posteLabels.FONCTION_EN;

function fonctionEn(key: string): string {
  return FONCTION_EN[key] ?? FLOW_SHORT_EN[key] ?? key;
}

type GroupedRow = {
  /** Libellé de la nature comptable, nettoyé du préfixe redondant "Thématique: ". */
  name: string;
  value: number;
  /** `ode_categorie_flux` brut depuis le pipeline (traduit + raccourci au render). */
  flow?: string;
  rank: number;
  /** Libellé technique original (BP/CA officiel), si différent du `name` friendly.
   *  Affiché en tooltip pour audit / vérification source. */
  original?: string;
};

type Group = {
  key: string;
  total: number;
  items: GroupedRow[];
  /** Confiance de la ventilation. "ca"=exécuté direct, "high"/"medium"=imputé. */
  confidence: "ca" | "high" | "medium" | "unknown";
  /** True si au moins un item du group provient d'une répartition proportionnelle
   *  (BP voté éclaté selon les ratios historiques CA). */
  imputed: boolean;
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
      // Cas "Non spécifié" (combo volatile, exclu du seed d'imputation) :
      // on regroupe par flow_category (Personnel / Subventions / Achats…)
      // au lieu d'un faux groupe "Non spécifié". Plus prudent et lisible.
      if (it.fonction === "Non spécifié" && it.flow_category) {
        key = it.flow_category;
      } else {
        key = it.fonction || "Autre";
      }
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
      g = { key, total: 0, items: [], confidence: "ca", imputed: false };
      map.set(key, g);
      order.push(key);
    }
    g.total += it.value;
    // Extraire le libellé original (sans préfixe section) pour le tooltip
    let original: string | undefined;
    if (it.name_original && it.name_original !== it.name) {
      const prefix = `${poste.label}: `;
      original = it.name_original.startsWith(prefix)
        ? it.name_original.slice(prefix.length)
        : it.name_original;
    }
    g.items.push({
      name: rowName,
      value: it.value,
      flow: mode === "fonction" ? it.flow_category : undefined,
      rank: i + 1,
      original,
    });
    // Propagate worst confidence to group level (ca < high < medium < unknown)
    const order_conf = { ca: 0, high: 1, medium: 2, unknown: 3 } as const;
    const itc = it.fonction_confidence ?? "ca";
    if (order_conf[itc] > order_conf[g.confidence]) {
      g.confidence = itc;
    }
    if (it.fonction_imputed) g.imputed = true;
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
  const kindLabel = poste.kind === "depense" ? t("fx.poste.kind.depense") : t("fx.poste.kind.recette");
  const maxSub = poste.subPostes[0]?.value || 1;

  const { groups } = groupSubPostes(poste);
  // Si le grouping n'a produit qu'un seul groupe sans clé sémantique ("—",
  // typique Marseille où les noms n'ont ni `:` ni `fonction`), on rend une
  // liste plate sans header de section — le faux header serait du bruit.
  const isFlat = groups.length === 1 && groups[0].key === "—";
  // Au moins un groupe est imputé depuis l'historique CA → afficher le
  // disclaimer global en tête de fiche.
  const hasImputed = groups.some((g) => g.imputed);

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
            ? "Functional breakdown projected proportionally from prior executed years (2019-2024 average shares). Total amount is exact (voted). Final allocation will be confirmed in the Compte Administratif."
            : "Ventilation par fonction projetée selon les parts moyennes observées sur les exercices clos (2019-2024). Le montant total est voté (exact). À confirmer au Compte Administratif."}
        </p>
      )}

      <div className="fx-poste-groups">
        {groups.map((g, gi) => {
          const body = (
            <ul>
              {g.items.map((it) => {
                const flowShort = shortFlow(it.flow, locale);
                const lblTitle = it.original
                  ? (locale === "en"
                      ? `Original label (M57): ${it.original}`
                      : `Libellé d'origine (M57) : ${it.original}`)
                  : undefined;
                return (
                  <li key={it.rank}>
                    <span className="lbl" title={lblTitle}>
                      {locale === "en" ? labelEn(it.name) : it.name}
                      {it.original && <span className="fx-poste-orig-marker" aria-hidden="true"> ⓘ</span>}
                    </span>
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
          );

          // Flat mode (recettes / Marseille sans fonction) : liste plate, pas de
          // header donc rien à replier — on garde le rendu actuel.
          if (isFlat) {
            return (
              <section key={g.key} className="fx-poste-group">
                {body}
              </section>
            );
          }

          // Sinon : chaque fonction est repliable. Replié par défaut (vue
          // d'ensemble scannable), sauf la première (la plus grosse) ouverte
          // pour montrer le détail d'emblée.
          return (
            <details key={g.key} className="fx-poste-group" open={gi === 0}>
              <summary>
                <span className="fx-poste-group-name">
                  {locale === "en" ? fonctionEn(g.key) : g.key}
                  {g.imputed && (
                    <span
                      className="fx-poste-projected"
                      title={locale === "en"
                        ? "Projected from historical average — see note above"
                        : "Projeté depuis la moyenne historique — voir la note ci-dessus"}
                    >
                      {locale === "en" ? "projected" : "projeté"}
                    </span>
                  )}
                </span>
                <span className="fx-poste-group-meta">
                  <span className="muted tnum">{fmtEur(g.total)}</span>
                  <span className="fx-poste-group-chev" aria-hidden="true">›</span>
                </span>
              </summary>
              {body}
            </details>
          );
        })}
        {groups.length === 0 && (
          <p className="fx-note">{fill(t("fx.poste.no_subpostes"), { year: poste.year })}</p>
        )}
      </div>
    </div>
  );
}
