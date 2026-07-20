"use client";

import type { BudgetPosteFiche, BudgetPosteSubPoste } from "@/lib/fusion-data";
import { useT, useLocale } from "@/lib/localeContext";
import { fill, numLocale } from "@/lib/fmt";

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

/**
 * EN display for sub-poste line labels. Labels are either a leaf
 * ("Rémunérations du personnel") or "Prefix: leaf" ("Invest. Aménagement:
 * Subventions d'investissement", "Reversements Fiscaux: FNGIR"). We translate
 * the prefix and the leaf separately and keep any untranslated token as-is
 * (proper nouns / acronyms like FNGIR stay). The long tail falls back to French.
 * Source of the FR labels is pipeline/seeds/seed_label_friendly.csv.
 */
const LABEL_PREFIX_EN: Record<string, string> = {
  "Reversements Fiscaux": "Tax redistributions",
  "Charges Fiscales": "Tax charges",
  "Administration": "Administration",
  "Aménagement": "Urban development",
  "Remboursement Dette": "Debt repayment",
  "Opérations Financières": "Financial operations",
  "Action Économique": "Economic action",
  "APA": "APA (elderly-care allowance)",
  "Autres": "Other",
  "Participations": "Equity holdings",
  "Subventions Équipement": "Capital grants",
  "Fonds Européens": "European funds",
  "Invest. Aménagement": "Capex — Urban development",
  "Invest. Administration": "Capex — Administration",
  "Invest. Culture": "Capex — Culture",
  "Invest. Transports": "Capex — Transport",
  "Invest. Environnement": "Capex — Environment",
  "Invest. Éducation": "Capex — Education",
  "Invest. Social": "Capex — Social",
  "Invest. Économie": "Capex — Economy",
  "Invest. Sécurité": "Capex — Security",
  "Invest. Logement": "Capex — Housing",
};

const LABEL_LEAF_EN: Record<string, string> = {
  "Rémunérations du personnel": "Staff pay",
  "Administration: Rémunérations du personnel": "Administration: Staff pay",
  "Contributions obligatoires": "Mandatory contributions",
  "Subventions d'intervention": "Intervention grants",
  "Charges d'intervention": "Intervention costs",
  "Charges de sécurité sociale et prévoyance": "Social security & welfare charges",
  "Charges sécurité sociale et": "Social security charges",
  "Frais de séjour, héberg., inhumation": "Residential care, housing & burial",
  "Immobilisations corporelles en cours": "Tangible assets under construction",
  "Immobilisations incorporelles en cours": "Intangible assets under construction",
  "Immobilisations corporelles": "Tangible assets",
  "Autres immobilisations corporelles": "Other tangible assets",
  "Dotations aux amortissements (immobilisations incorporelles)": "Depreciation (intangible assets)",
  "Dotations aux provisions (risques de fonctionnement)": "Provisions (operating risks)",
  "Subventions d'investissement": "Capital grants",
  "Contrats de prestations de services": "Service contracts",
  "Aides aux personnes": "Personal assistance",
  "Prélèvement national péréquation DMTO": "National DMTO equalisation levy",
  "Fonds de péréquation des ressources communales et intercommunales": "Municipal & inter-municipal equalisation fund",
  "Emprunts en euros": "Euro-denominated loans",
  "Emprunt obligataire remboursable in fine": "Bullet-repayment bond",
  "Intérêts réglés à l'échéance": "Interest paid at maturity",
  "Intérêts — rattachement des ICNE (intérêts courus non échus)": "Interest — accrued, not yet due (ICNE)",
  "Communes": "Municipalities",
  "Départements": "Departments",
  "Autres attributions et participations": "Other allocations & holdings",
  "Autres formes de participation": "Other equity holdings",
  "Participations": "Equity holdings",
  "Terrains": "Land",
  "Constructions": "Buildings",
  "Constructions sur sol d'autrui": "Construction on third-party land",
  "Locations": "Rentals",
  "Achats non stockés de matières et fourni": "Non-stocked supplies & materials",
  "Achats d'études, prestations de services": "Purchases of studies & services",
  "Entretien et réparations": "Maintenance & repairs",
  "Personnel intérimaire & vacations": "Temporary & casual staff",
  "Autres charges de personnel": "Other staff costs",
  "Créances / particuliers et personnes de droit privé": "Receivables / individuals & private entities",
  "Charges diverses de gestion courante": "Miscellaneous operating charges",
  "Frais d'études, recherche, développement": "Studies, research & development",
  "Dettes - Autres organismes, particuliers": "Debt — other bodies & individuals",
  "Impôts, taxes, versements (autre orga.)": "Taxes & levies (other bodies)",
  "Autres impôts, taxes (Admin Impôts)": "Other taxes & levies",
  "Divers": "Miscellaneous",
  "Dotation": "Grant",
  "Immobilisations incorporelles": "Intangible assets",
  "Avances commandes immo corporelles": "Advances on asset orders",
  "Pertes sur créances irrécouvrables": "Bad-debt write-offs",
  "Services bancaires et assimilés": "Banking & similar services",
  "Primes d'assurances": "Insurance premiums",
  "Pub., publications, relations publiques": "Advertising, publications & PR",
  "Etudes et recherches": "Studies & research",
  "Études et recherches": "Studies & research",
  "Déplacements et missions": "Travel & missions",
  "Honoraires": "Professional fees",
  "honoraires": "Professional fees",
  "Fournitures administratives": "Office supplies",
  "Fournitures d'entretien": "Maintenance supplies",
  "Fêtes et cérémonies": "Events & ceremonies",
  "Transports collectifs": "Public transport",
  "Frais d'affranchissement": "Postage",
  "Frais de télécommunications": "Telecoms costs",
  "Prestations de services": "Services",
  "Redevances / droits": "Fees & charges",
  "Autres charges exceptionnelles": "Other exceptional charges",
  "Charges exceptionnelles": "Exceptional charges",
  "Subventions de fonctionnement": "Operating grants",
  "Subventions exceptionnelles": "Exceptional grants",
  "Autres subventions": "Other grants",
};

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
const FONCTION_EN: Record<string, string> = {
  "Opérations non ventilable": "Non-allocable operations",
  "Adm générale collectivité": "General administration",
  "Non spécifié": "Unspecified",
  "Autre intervention social": "Other social intervention",
  "Autres transports": "Other transport",
  "Crèches et garderies": "Nurseries & daycare",
  "Aide sociale à l'enfance": "Child welfare",
  "Services communs": "Shared services",
  "Ser com collecte propreté": "Cleaning & waste collection",
  "Logement social": "Social housing",
  "Personnes handicapées": "People with disabilities",
  "Écoles primaires": "Primary schools",
  "Autres instances": "Other bodies",
  "Réserves Foncières": "Land reserves",
  "Écoles maternelles": "Nursery schools",
  "Police, sécurité, justice": "Police, security & justice",
  "Espaces verts urbains": "Urban green spaces",
  "Voirie communale": "Municipal roads",
  "Opérations d’aménagement": "Development operations",
  "Autre int prot bien pers": "Other protection of persons & property",
  "Hébergt resto scolaire": "School catering & boarding",
  "Incendie et secours": "Fire & rescue",
  "Tri, valo et trait déchet": "Waste sorting, recovery & treatment",
  "Collecte des déchets": "Waste collection",
  "Autre action en faveur": "Other support action",
  "APA à domicile": "Home care allowance (APA)",
  "Classes regroupées": "Combined classes",
  "Théâtre spectable vivant": "Theatre & performing arts",
  "Collèges": "Middle schools",
  "Salles de sport, gymnases": "Sports halls & gymnasiums",
  "Éclairage public": "Public lighting",
  "Activité art action manif": "Arts & events",
  "Personnel non ventilé": "Unallocated staff",
  "Musées": "Museums",
  "Propreté urbaine": "Urban cleanliness",
  "Personnes en difficulté": "People in hardship",
  "Transport ferroviaire": "Rail transport",
  "Piscines": "Swimming pools",
  "Assemblée délibérante": "Deliberative assembly",
  "Autres actions vie social": "Other community-life action",
  "Manifestations sportives": "Sporting events",
  "Autres moyens généraux": "Other general resources",
  "Transport sur route": "Road transport",
  "Bibliothèque, médiathèque": "Libraries & media centres",
  "Bibliothèques médiathèque": "Libraries & media centres",
  "Parc privé collectivité": "City-owned private stock",
  "Activités artistiques,act": "Artistic activities",
  "Enseignement supérieur": "Higher education",
  "PMI et planif familiale": "Maternal & child health, family planning",
  "APA versé établissemnt": "Care allowance to facilities (APA)",
  "Aide au secteur locatif": "Rental-sector support",
  "APA versé bénéf établisem": "Care allowance, facility residents (APA)",
  "Cimetière pompe funèbre": "Cemeteries & funeral services",
  "Prév et éducation santé": "Health prevention & education",
  "Autres": "Other",
  "Circulations douces": "Walking & cycling",
  "Eaux pluviales": "Stormwater",
  "Autr action petite enfanc": "Other early-childhood action",
  "Industrie,commerce artisa": "Industry, trade & crafts",
  "Patrimoine": "Heritage",
  "Insertion éco sociale": "Social & economic inclusion",
  "Halte fluv autre infra fl": "River docks & waterway infrastructure",
  "Admin général Etat": "General state administration",
  "Apprentissage": "Apprenticeship",
  "Autres actions d’aménagem": "Other development action",
  "Disp autre étab sanitaire": "Other health facilities",
  "Recherche et innovation": "Research & innovation",
  "Équipements de voirie": "Road equipment",
  "Cités scolaires": "School complexes",
};

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
