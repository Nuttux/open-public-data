import type { Metadata } from "next";
import Link from "next/link";
import "@/app/fusion.css";

import {
  Navbar,
  Footer,
  BarRow,
  SectionHead,
  BnEurCountUp,
  RevealOnScroll,
  MethodNote,
} from "@/components/fusion";
import BudgetTreemap, {
  type TreemapDatum,
} from "@/components/fusion/BudgetTreemap";
import { loadDailyBread } from "@/lib/national-data";
import { loadDrilldown } from "@/lib/budget-drilldown";
import { loadRecettesApu } from "@/lib/recettes-apu";
import { computeStateBuckets } from "@/lib/daily-bread";
import { RecettesPanel } from "@/components/fusion";
import { listCrossCuttingThemes } from "@/lib/cross-cutting";
import { CrossCuttingPanel } from "@/components/fusion";
import { buildLocaleAwareMetadata, readLocale } from "@/lib/seo";
import {
  buildProfileQueryString,
  parseDailyBreadProfile,
} from "@/lib/daily-bread-profile";
import fr from "@/i18n/fr";
import en from "@/i18n/en";

/**
 * /fr/national/budget — Budget Explorer impersonnel.
 *
 *  - §01 hero "1 808 Md€/an"
 *  - §02 treemap visuel des ~30 plus grosses cellules
 *  - §03 trois piliers (Sécu / État / Local)
 *  - §04 drill Sécu — 5 branches
 *  - §05 drill État — 10 agrégats éditoriaux + note méthodo
 *  - §06 drill Local — 3 échelles + détail bloc communal
 *  - §07 vues thématiques cross-cutting (Santé / Éducation / Solidarité)
 *  - §08 CTA Daily Bread
 *  - §09 sources
 *
 * Server component — toute la data est lue côté serveur. Le treemap est
 * un client component léger (interactivity hover/tooltip) qui reçoit ses
 * données pré-projetées en props.
 */

export async function generateMetadata(): Promise<Metadata> {
  return buildLocaleAwareMetadata({
    title:
      "Le budget de la France 2025 — 1 808 Md€/an · France Open Data",
    description:
      "Explorer les dépenses publiques françaises (~1 808 Md€/an) : Sécurité sociale, État central, collectivités locales. Données Eurostat, PLF, OFGL — sans calcul personnel.",
    en: {
      title:
        "The French budget 2025 — €1,808 bn/yr · France Open Data",
      description:
        "Explore French public expenditure (~€1,808 bn/yr): social security, central government, local authorities. Eurostat, PLF, OFGL data — no personal projection.",
    },
    path: "/fr/national/budget",
  });
}

// ─── Helpers ──────────────────────────────────────────────────────────────

function tFor(locale: "fr" | "en") {
  const dict: Record<string, string> = locale === "en" ? en : fr;
  const fallback: Record<string, string> = fr;
  return (key: string, params?: Record<string, string | number>): string => {
    let raw = dict[key] ?? fallback[key] ?? key;
    if (params) {
      for (const [k, v] of Object.entries(params)) {
        raw = raw.replace(new RegExp(`\\{${k}\\}`, "g"), String(v));
      }
    }
    return raw;
  };
}

function fmtBnEur(amountEur: number, locale: "fr" | "en"): string {
  if (!Number.isFinite(amountEur) || amountEur <= 0) return "—";
  const md = amountEur / 1e9;
  const rounded = md >= 100 ? md.toFixed(0) : md.toFixed(1);
  return locale === "fr"
    ? `${rounded.replace(".", ",")} Md€`
    : `€${rounded} bn`;
}

function fmtPct(share: number, locale: "fr" | "en"): string {
  const v = share * 100;
  const r = v >= 10 ? v.toFixed(0) : v.toFixed(1);
  return locale === "fr" ? `${r.replace(".", ",")} %` : `${r}%`;
}

// URLs drawer locales — pointent vers /fr/national/budget/bucket/... pour
// déclencher l'intercept Next.js depuis cette page (drawer overlay au
// lieu d'une nav full-page). Les routes standalone sous le même
// préfixe servent de fallback (deep-link, refresh, partage).
//
// `qs` (optional) = query string profil propagé pour que le drawer
// affiche les €/mois sur le profil quand l'utilisateur arrive depuis le
// cross-link Daily Bread (`?net=...&parts=...&c=...`). Sans ça, le
// drawer Budget Explorer perd le profil et n'affiche QUE les Md€.
function suffixQs(url: string, qs?: string): string {
  if (!qs) return url;
  const sep = url.includes("?") ? "&" : "?";
  return `${url}${sep}${qs}`;
}
function urlSecuLevel2(level2Key: string, qs?: string) {
  return suffixQs(`/fr/national/budget/bucket/secu/${level2Key}`, qs);
}
function urlEtatAggregation(aggKey: string, qs?: string) {
  return suffixQs(`/fr/national/budget/bucket/etat/agg/${aggKey}`, qs);
}
function urlEtatMission(missionCode: string, qs?: string) {
  return suffixQs(`/fr/national/budget/bucket/etat/${missionCode.toLowerCase()}`, qs);
}
function urlLocalLevel2(level2Key: string, qs?: string) {
  return suffixQs(`/fr/national/budget/bucket/local/${level2Key}`, qs);
}
function urlLocalDeptLevel2(level2Key: string, qs?: string) {
  return suffixQs(`/fr/national/budget/bucket/local/dept/${level2Key}`, qs);
}
function urlLocalRegionLevel2(level2Key: string, qs?: string) {
  return suffixQs(`/fr/national/budget/bucket/local/region/${level2Key}`, qs);
}

// ─── Page ─────────────────────────────────────────────────────────────────

type Search = Promise<Record<string, string | string[] | undefined>>;

export default async function FranceBudgetPage({
  searchParams,
}: {
  searchParams?: Search;
}) {
  const locale = await readLocale();
  const t = tFor(locale);
  const db = loadDailyBread();
  const drilldown = loadDrilldown();
  const crossCuttingThemes = listCrossCuttingThemes();

  // Cross-link profil (?net=...&parts=...&c=...) — propagé aux drill links
  // pour que le drawer Budget Explorer affiche AUSSI les €/mois sur le profil
  // (sinon il n'affiche que Md€/an, perdant le contexte personnel).
  const sp = (await searchParams) ?? {};
  const profile = parseDailyBreadProfile(sp);
  const profileQs = profile.hasProfile
    ? buildProfileQueryString(profile)
    : undefined;

  // ── Totaux institutions (Stage 1 absolus) ───────────────────────────────
  const inst = db?.apu_subsectors.institutions;
  const secuAnnual = inst?.S1314?.annual_eur ?? 0;
  const etatAnnual = inst?.S1311?.annual_eur ?? 0;
  const localAnnual = inst?.S1313?.annual_eur ?? 0;
  // Le total montré au héro = somme non-consolidée des trois sous-secteurs
  // S1311 + S1313 + S1314 (= APU "vues par sous-secteur" avant transferts).
  // Cet agrégat est ce que le pipeline Stage 1 publie : chaque institution
  // dépense brut, avant la déconsolidation S13. C'est aussi le bon dénominateur
  // pour comprendre "qui dépense quoi" sans masquer les flux intra-admin.
  const totalAnnual = secuAnnual + etatAnnual + localAnnual;
  const yearRef = db?.apu_subsectors.year ?? 2025;
  // Pour les drills État (treemap §02 + BarList §05), on n'utilise PAS
  // `etatAnnual` (S1311, ≈ 676 Md€) comme base — les `share_of_parent` du
  // drilldown sont normalisés sur `state_breakdown.total_net_cp_eur` (≈ 447
  // Md€, somme des 33 missions PLF). Multiplier S1311 par ces parts
  // surestimerait d'un facteur 676/447 ≈ 1,51× (ex: Défense 60 Md€ → 91 Md€).
  // Les 229 Md€ S1311 hors missions PLF (ODAC, transferts UE, régimes
  // spéciaux non rattachés) sont documentés dans la note méthodo §05.
  const etatAttribuableAnnual = db?.state_breakdown.total_net_cp_eur ?? 0;

  // ── Drilldown levels (peuvent être vides si stub) ───────────────────────
  const secuBranches = drilldown?.buckets.secu.level2 ?? [];
  const etatAggregations = drilldown?.buckets.etat.aggregations ?? [];
  const localBlocLevel2 = drilldown?.buckets.local.level2 ?? [];

  // ── Local sub-blocs (Bloc communal / Dept / Region) ────────────────────
  const apulItems = db?.subsector_breakdowns.apul_breakdown.items;
  const blocCommunalShare = apulItems?.part_communes_epci?.value ?? 0.55;
  const deptShare = apulItems?.part_departements?.value ?? 0.3;
  const regionShare = apulItems?.part_regions?.value ?? 0.15;
  const blocCommunalAnnual = localAnnual * blocCommunalShare;
  const deptAnnual = localAnnual * deptShare;
  const regionAnnual = localAnnual * regionShare;

  // ── Treemap data (top ~30 cellules) ──────────────────────────────────────
  // On fabrique une liste des plus grosses cellules toutes échelles confondues :
  //  - 5 branches Sécu (level2 secu)
  //  - 10 agrégats éditoriaux État (aggregations)
  //  - 9 fonctions OFGL bloc communal (local level2) — on garde les ~6 plus
  //    grosses pour rester lisible
  //  - blocs Départements + Régions (synthétique, on n'éclate pas par fonction
  //    pour éviter de noyer le treemap)
  const treemapItems: TreemapDatum[] = [];

  // Sécu
  for (const b of secuBranches) {
    const value = secuAnnual * (b.share_of_parent ?? 0);
    if (value <= 0) continue;
    treemapItems.push({
      id: `secu-${b.key}`,
      href: urlSecuLevel2(b.key, profileQs),
      shortLabel: locale === "en" ? b.label_en : b.label_fr,
      fullLabel: locale === "en"
        ? `${b.label_en} — Social security`
        : `${b.label_fr} — Sécurité sociale`,
      value,
      group: "secu",
      groupLabel: t("budget.section.treemap.legend.secu"),
      shareOfTotal: totalAnnual > 0 ? value / totalAnnual : 0,
    });
  }

  // État — agrégats éditoriaux. Base = `total_net_cp_eur` (somme PLF = 447
  // Md€), pas S1311 — cf. note plus haut sur les 229 Md€ non-attribués.
  for (const a of etatAggregations) {
    const value = etatAttribuableAnnual * (a.share_of_parent ?? 0);
    if (value <= 0) continue;
    treemapItems.push({
      id: `etat-${a.key}`,
      href: urlEtatAggregation(a.key, profileQs),
      shortLabel: locale === "en" ? a.label_en : a.label_fr,
      fullLabel: locale === "en"
        ? `${a.label_en} — Central government`
        : `${a.label_fr} — État central`,
      value,
      group: "etat",
      groupLabel: t("budget.section.treemap.legend.etat"),
      shareOfTotal: totalAnnual > 0 ? value / totalAnnual : 0,
    });
  }

  // Local bloc communal — top 6 fonctions (on garde l'essentiel pour le treemap)
  const blocCommunalSorted = [...localBlocLevel2]
    .sort((a, b) => (b.share_of_parent ?? 0) - (a.share_of_parent ?? 0))
    .slice(0, 6);
  for (const e of blocCommunalSorted) {
    const value = blocCommunalAnnual * (e.share_of_parent ?? 0);
    if (value <= 0) continue;
    treemapItems.push({
      id: `local-bloc-${e.key}`,
      href: urlLocalLevel2(e.key, profileQs),
      shortLabel: locale === "en" ? e.label_en : e.label_fr,
      fullLabel: locale === "en"
        ? `${e.label_en} — Municipal block`
        : `${e.label_fr} — Bloc communal`,
      value,
      group: "local",
      groupLabel: t("budget.section.treemap.legend.local"),
      shareOfTotal: totalAnnual > 0 ? value / totalAnnual : 0,
    });
  }

  // Local — Départements + Régions agrégés (1 cellule chacun).
  // Click → ouvre le drawer du 1er level2 dept/region (= porte d'entrée vers
  // le scope ; les 9 fonctions par scope sont aussi listées dans §06).
  const deptL2List = drilldown?.buckets.local.departement?.level2 ?? [];
  const regL2List = drilldown?.buckets.local.region?.level2 ?? [];
  const deptFirstHref =
    deptL2List.length > 0
      ? urlLocalDeptLevel2(deptL2List[0].key, profileQs)
      : "/fr/national/budget#bucket-local";
  const regFirstHref =
    regL2List.length > 0
      ? urlLocalRegionLevel2(regL2List[0].key, profileQs)
      : "/fr/national/budget#bucket-local";
  if (deptAnnual > 0) {
    treemapItems.push({
      id: `local-dept`,
      href: deptFirstHref,
      shortLabel: locale === "en" ? "Departments" : "Départements",
      fullLabel: locale === "en"
        ? "Departments — Local authorities"
        : "Départements — Collectivités locales",
      value: deptAnnual,
      group: "local",
      groupLabel: t("budget.section.treemap.legend.local"),
      shareOfTotal: totalAnnual > 0 ? deptAnnual / totalAnnual : 0,
    });
  }
  if (regionAnnual > 0) {
    treemapItems.push({
      id: `local-region`,
      href: regFirstHref,
      shortLabel: locale === "en" ? "Regions" : "Régions",
      fullLabel: locale === "en"
        ? "Regions — Local authorities"
        : "Régions — Collectivités locales",
      value: regionAnnual,
      group: "local",
      groupLabel: t("budget.section.treemap.legend.local"),
      shareOfTotal: totalAnnual > 0 ? regionAnnual / totalAnnual : 0,
    });
  }

  // Total en Md€ — passé à `BnEurCountUp mode="rawMd"` qui se charge de la
  // mise en forme côté client (séparateurs FR/EN, arrondi adaptatif). Source :
  // `db.apu_subsectors.institutions` (Stage 1, somme S1311+S1313+S1314).
  const totalMd = totalAnnual / 1e9;

  return (
    <div className="theme-fusion">
      <Navbar />
      <main id="main-content" tabIndex={-1}>

      {/* §01 — HERO impersonnel ──────────────────────────────────────── */}
      <section className="fx-page-header">
        <div className="fx-wrap">
          <p className="fx-page-kicker">{t("budget.page.kicker")}</p>
          <h1 className="fx-page-title">
            <em>{t("budget.hero.title")}</em>
          </h1>
          <p
            className="tnum"
            style={{
              fontFamily: "'Inter Tight', Inter, sans-serif",
              fontSize: "clamp(72px, 12vw, 160px)",
              lineHeight: 0.9,
              letterSpacing: "-0.04em",
              fontWeight: 700,
              margin: "8px 0 18px",
              color: "var(--ink)",
            }}
          >
            {/* Count-up déclenché au scroll-in (one-shot, easeOutCubic 1200ms).
                Cohérence avec le hero Daily Bread §01 qui anime le total
                €/mois au mount via `useCountUp`. `BnEurCountUp` est une
                variante server-friendly (le format est résolu client-side
                à partir de `locale` + `mode`) — `CountUpOnReveal` exige
                une fonction `format` qui ne traverse pas la frontière RSC. */}
            <BnEurCountUp
              value={totalMd}
              locale={locale}
              mode="rawMd"
              durationMs={1200}
              threshold={0.2}
            />
            <span
              style={{
                fontSize: "0.22em",
                marginLeft: "0.32em",
                fontWeight: 500,
                color: "var(--muted)",
                letterSpacing: 0,
                whiteSpace: "nowrap",
              }}
            >
              {t("budget.hero.amount_unit")}
            </span>
            {/* Caption forcée en bloc sur mobile (sinon "publiques (S13)"
                wrap seul sous "administrations" → fragmente une expression
                INSEE inviolable). Sur desktop, reste inline à droite. */}
            <span
              className="fx-budget-hero-caption"
              style={{
                fontSize: "0.16em",
                marginLeft: "0.5em",
                fontWeight: 500,
                color: "var(--muted)",
                letterSpacing: 0,
              }}
            >
              {t("budget.hero.amount_caption")}
            </span>
          </p>
          <p className="fx-page-lede" style={{ maxWidth: 820 }}>
            {t("budget.hero.subtitle", { year: yearRef })}
          </p>
          <p
            style={{
              fontFamily: "'JetBrains Mono', ui-monospace, monospace",
              fontSize: 12,
              color: "var(--muted)",
              letterSpacing: "0.04em",
              marginTop: 14,
              maxWidth: 820,
            }}
          >
            {t("budget.hero.source")}
          </p>
        </div>
      </section>

      {/* §02 — RECETTES "d'où vient l'argent" ──────────────────────── */}
      {(() => {
        const recettes = loadRecettesApu();
        if (!recettes) return null;
        return (
          <RevealOnScroll>
            <RecettesPanel data={recettes} locale={locale} t={t} />
          </RevealOnScroll>
        );
      })()}

      {/* §03 — TREEMAP ──────────────────────────────────────────────── */}
      <RevealOnScroll className="fx-section">
        <div className="fx-wrap">
          <SectionHead
            number="03"
            kind={t("budget.section.treemap.kind")}
            title={t("budget.section.treemap.title")}
            subtitle={t("budget.section.treemap.subtitle")}
          />
          {/* Légende */}
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: 18,
              marginBottom: 18,
              fontFamily: "'JetBrains Mono', ui-monospace, monospace",
              fontSize: 12,
              letterSpacing: "0.04em",
              color: "var(--ink-2)",
            }}
            aria-hidden="true"
          >
            <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
              <span style={{ width: 14, height: 14, background: "#2a3680", display: "inline-block" }} />
              {t("budget.section.treemap.legend.secu")} · {fmtBnEur(secuAnnual, locale)}
            </span>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
              <span style={{ width: 14, height: 14, background: "#1a1d26", display: "inline-block" }} />
              {t("budget.section.treemap.legend.etat")} · {fmtBnEur(etatAnnual, locale)}
            </span>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
              <span style={{ width: 14, height: 14, background: "#c12323", display: "inline-block" }} />
              {t("budget.section.treemap.legend.local")} · {fmtBnEur(localAnnual, locale)}
            </span>
          </div>
          <BudgetTreemap
            data={treemapItems}
            height={680}
            locale={locale}
            totalLabel={t("budget.section.treemap.total_label")}
          />
          <MethodNote marginTop={14} maxWidth={720}>
            {t("budget.hero.note_unconsolidated")}
          </MethodNote>
        </div>
      </RevealOnScroll>

      {/* §04 — TROIS PILIERS ───────────────────────────────────────── */}
      <RevealOnScroll className="fx-section">
        <div className="fx-wrap">
          <SectionHead
            number="04"
            kind={t("budget.section.institutions.kind")}
            title={t("budget.section.institutions.title")}
            subtitle={t("budget.section.institutions.subtitle")}
          />
          <div className="fx-grid-tiles">
            {(
              [
                {
                  key: "secu",
                  // Anchor scroll vers §04 (drill Sécu) — pas de page bucket
                  // dédiée, les 5 branches sont déjà listées dans cette section.
                  href: "/fr/national/budget#bucket-secu",
                  rank: "01",
                  title: t("budget.card.secu.title"),
                  subtitle: t("budget.card.secu.subtitle"),
                  amount: secuAnnual,
                  share: totalAnnual > 0 ? secuAnnual / totalAnnual : 0,
                  color: "#2a3680",
                },
                {
                  key: "etat",
                  href: "/fr/national/budget#bucket-etat",
                  rank: "02",
                  title: t("budget.card.etat.title"),
                  subtitle: t("budget.card.etat.subtitle"),
                  amount: etatAnnual,
                  share: totalAnnual > 0 ? etatAnnual / totalAnnual : 0,
                  color: "#1a1d26",
                },
                {
                  key: "local",
                  href: "/fr/national/budget#bucket-local",
                  rank: "03",
                  title: t("budget.card.local.title"),
                  subtitle: t("budget.card.local.subtitle"),
                  amount: localAnnual,
                  share: totalAnnual > 0 ? localAnnual / totalAnnual : 0,
                  color: "#c12323",
                },
              ] as const
            ).map((p) => (
              <Link
                key={p.key}
                href={p.href}
                /* anchor scroll vers la section bucket — laisser scroll: true (défaut) */
                className="fx-tile fx-tile-institution"
                style={{ ['--inst-color' as string]: p.color }}
              >
                <div className="fx-tile-top">
                  <span
                    className="fx-tile-n"
                    style={{ color: p.color, fontWeight: 600 }}
                  >
                    {p.rank}
                  </span>
                  <span className="fx-tile-kind">
                    {fmtPct(p.share, locale)}
                  </span>
                </div>
                <div
                  style={{
                    width: 32,
                    height: 4,
                    background: p.color,
                    marginBottom: 18,
                  }}
                  aria-hidden="true"
                />
                <h3
                  style={{
                    fontFamily: "'Inter Tight', Inter, sans-serif",
                    fontSize: 22,
                    fontWeight: 700,
                    lineHeight: 1.15,
                    margin: "0 0 8px",
                    letterSpacing: "-0.015em",
                  }}
                >
                  {p.title}
                </h3>
                <p
                  style={{
                    fontSize: 14,
                    lineHeight: 1.5,
                    color: "var(--muted)",
                    margin: "0 0 22px",
                    flex: 1,
                  }}
                >
                  {p.subtitle}
                </p>
                <div
                  className="tnum"
                  style={{
                    fontFamily: "'Inter Tight', Inter, sans-serif",
                    fontSize: 36,
                    fontWeight: 700,
                    letterSpacing: "-0.025em",
                    lineHeight: 1,
                    marginTop: "auto",
                  }}
                >
                  {/* Count-up sur le scroll-in : reproduit la cinétique
                      §02 Daily Bread (`db-stack-tri-amt`) où chaque montant
                      institutionnel s'incrémente quand le panneau apparaît.
                      `BnEurCountUp` reçoit la valeur en € (pas Md€) et
                      formatte côté client → server-friendly. */}
                  <BnEurCountUp
                    value={p.amount}
                    locale={locale}
                    durationMs={900}
                    threshold={0.25}
                  />
                </div>
                <p
                  style={{
                    fontFamily: "'JetBrains Mono', ui-monospace, monospace",
                    fontSize: 11,
                    color: "var(--muted)",
                    letterSpacing: "0.08em",
                    textTransform: "uppercase",
                    marginTop: 8,
                  }}
                >
                  /an · {fmtPct(p.share, locale)} {t("budget.section.treemap.total_label")}
                </p>
              </Link>
            ))}
          </div>
        </div>
      </RevealOnScroll>

      {/* §05 — DRILL SÉCU ──────────────────────────────────────────── */}
      <RevealOnScroll className="fx-section" id="bucket-secu">
        <div className="fx-wrap">
          <SectionHead
            number="05"
            kind={t("budget.section.secu.kind")}
            title={t("budget.section.secu.title")}
            subtitle={t("budget.section.secu.subtitle")}
          />
          <BarRow
            color="secu"
            reveal
            header={{
              left: t("budget.section.secu.header_left"),
              right: t("budget.section.secu.header_right"),
            }}
            items={secuBranches.map((b) => {
              const value = secuAnnual * (b.share_of_parent ?? 0);
              return {
                label: locale === "en" ? b.label_en : b.label_fr,
                value,
                href: urlSecuLevel2(b.key, profileQs),
                display: (
                  <>
                    {fmtBnEur(value, locale)}
                    <span style={{ marginLeft: 10, color: "var(--muted)" }}>
                      · {fmtPct(b.share_of_parent ?? 0, locale)}
                    </span>
                  </>
                ),
              };
            })}
          />
        </div>
      </RevealOnScroll>

      {/* §06 — DRILL ÉTAT ──────────────────────────────────────────── */}
      <RevealOnScroll className="fx-section" id="bucket-etat">
        <div className="fx-wrap">
          <SectionHead
            number="06"
            kind={t("budget.section.etat.kind")}
            title={t("budget.section.etat.title")}
            subtitle={t("budget.section.etat.subtitle")}
          />
          <MethodNote marginBottom={26} maxWidth={760}>
            {t("budget.section.etat.method_note")}
          </MethodNote>
          <BarRow
            color="etat"
            reveal
            header={{
              left: t("budget.section.etat.header_left"),
              right: t("budget.section.etat.header_right"),
            }}
            items={(() => {
              if (!db) return [];
              // Utilise computeStateBuckets qui applique l'overlay S1311
              // (CAS Pensions par ministère + ODAC + PSR-UE + budgets
              // annexes + résiduel) → 12 buckets sommant à 100 % de S1311.
              const buckets = computeStateBuckets(etatAnnual, db);
              return buckets.map((b) => {
                // Sub-text : missions PLF + items overlay (CAS, ODAC, etc.)
                const missionLabels = b.missions.map((m) => m.label).slice(0, 3);
                const overlayLabels = (b.overlay_items ?? [])
                  .map((it) => (locale === "en" ? it.label_en : it.label_fr))
                  .slice(0, 4);
                const subParts = [...missionLabels, ...overlayLabels];
                // Lien drawer : (a) buckets PLF → page agrégat
                // (b) contribution_ue → fiche recette UE (PSR-UE décomposé)
                // (c) autres_etat_hors_plf : pas de drawer (résiduel).
                const hasAgg = etatAggregations.some(
                  (a) => a.key === (b.key === "autres_ministeres" ? "autres" : b.key),
                );
                const aggKey = b.key === "autres_ministeres" ? "autres" : b.key;
                const href =
                  b.key === "contribution_ue"
                    ? "/fr/national/budget/recettes/psr_ue"
                    : hasAgg
                      ? urlEtatAggregation(aggKey, profileQs)
                      : undefined;
                return {
                  label: locale === "en" ? b.label_en : b.label_fr,
                  value: b.annual_eur,
                  href,
                  display: (
                    <>
                      {fmtBnEur(b.annual_eur, locale)}
                      <span style={{ marginLeft: 10, color: "var(--muted)" }}>
                        · {fmtPct(b.share_of_state, locale)}
                      </span>
                    </>
                  ),
                  sub: subParts.length > 1 ? subParts.join(" · ") : undefined,
                };
              });
            })()}
          />
        </div>
      </RevealOnScroll>

      {/* §07 — DRILL LOCAL ─────────────────────────────────────────── */}
      <RevealOnScroll className="fx-section" id="bucket-local">
        <div className="fx-wrap">
          <SectionHead
            number="07"
            kind={t("budget.section.local.kind")}
            title={t("budget.section.local.title")}
            subtitle={t("budget.section.local.subtitle")}
          />
          {/* 3 sub-cards (Bloc communal / Départements / Régions). Chaque card
              ouvre le drawer du 1er level2 du scope (porte d'entrée). Les 9
              fonctions par scope sont listées juste en dessous. */}
          <div className="fx-grid-tiles" style={{ marginBottom: 36 }}>
            {(
              [
                {
                  key: "bloc",
                  // Bloc communal : ouvre la 1re fonction OFGL (services_generaux
                  // ou la plus grosse) si dispo, sinon scroll vers la liste.
                  href:
                    blocCommunalSorted.length > 0
                      ? urlLocalLevel2(blocCommunalSorted[0].key, profileQs)
                      : "/fr/national/budget#bucket-local",
                  rank: "06.1",
                  title: locale === "en"
                    ? "Municipal block"
                    : "Bloc communal (communes + EPCI)",
                  subtitle: locale === "en"
                    ? "Schools, social action (CCAS), urban planning, sport, waste."
                    : "Écoles, CCAS, urbanisme, sport, déchets.",
                  amount: blocCommunalAnnual,
                  share: blocCommunalShare,
                },
                {
                  key: "dept",
                  href: deptFirstHref,
                  rank: "06.2",
                  title: locale === "en" ? "Departments" : "Départements",
                  subtitle: locale === "en"
                    ? "Social action (RSA, dependency, child welfare), middle schools, departmental roads."
                    : "Action sociale (RSA, dépendance, enfance), collèges, voirie départementale.",
                  amount: deptAnnual,
                  share: deptShare,
                },
                {
                  key: "region",
                  href: regFirstHref,
                  rank: "06.3",
                  title: locale === "en" ? "Regions" : "Régions",
                  subtitle: locale === "en"
                    ? "TER trains, high schools, professional training, economic development."
                    : "TER, lycées, formation professionnelle, développement économique.",
                  amount: regionAnnual,
                  share: regionShare,
                },
              ] as const
            ).map((p) => (
              <Link key={p.key} href={p.href} scroll={false} className="fx-tile">
                <div className="fx-tile-top">
                  <span className="fx-tile-n">{p.rank}</span>
                  <span className="fx-tile-kind">{fmtPct(p.share, locale)}</span>
                </div>
                <div
                  style={{
                    width: 32,
                    height: 4,
                    background: "#c12323",
                    marginBottom: 18,
                  }}
                  aria-hidden="true"
                />
                <h3
                  style={{
                    fontFamily: "'Inter Tight', Inter, sans-serif",
                    fontSize: 20,
                    fontWeight: 700,
                    lineHeight: 1.15,
                    margin: "0 0 8px",
                  }}
                >
                  {p.title}
                </h3>
                <p
                  style={{
                    fontSize: 14,
                    lineHeight: 1.5,
                    color: "var(--muted)",
                    margin: "0 0 22px",
                    flex: 1,
                  }}
                >
                  {p.subtitle}
                </p>
                <div
                  className="tnum"
                  style={{
                    fontFamily: "'Inter Tight', Inter, sans-serif",
                    fontSize: 32,
                    fontWeight: 700,
                    letterSpacing: "-0.025em",
                    lineHeight: 1,
                    marginTop: "auto",
                  }}
                >
                  <BnEurCountUp
                    value={p.amount}
                    locale={locale}
                    durationMs={900}
                    threshold={0.25}
                  />
                </div>
                <p
                  style={{
                    fontFamily: "'JetBrains Mono', ui-monospace, monospace",
                    fontSize: 11,
                    color: "var(--muted)",
                    letterSpacing: "0.08em",
                    textTransform: "uppercase",
                    marginTop: 8,
                  }}
                >
                  /an · {fmtPct(p.share, locale)} APUL
                </p>
              </Link>
            ))}
          </div>

          {/* Détail bloc communal — 9 fonctions OFGL */}
          <div style={{ marginTop: 28 }}>
            <h3
              style={{
                fontFamily: "'Inter Tight', Inter, sans-serif",
                fontSize: 22,
                fontWeight: 700,
                margin: "0 0 6px",
                letterSpacing: "-0.015em",
              }}
            >
              {t("budget.section.local.bloc.title")}
            </h3>
            <p
              style={{
                fontSize: 14,
                color: "var(--muted-2)",
                margin: "0 0 22px",
                maxWidth: 720,
                lineHeight: 1.55,
              }}
            >
              {t("budget.section.local.bloc.subtitle")}
            </p>
            <BarRow
              color="local"
              reveal
              header={{
                left: t("budget.section.local.bloc.header_left"),
                right: t("budget.section.local.bloc.header_right"),
              }}
              items={localBlocLevel2.map((e) => {
                const value = blocCommunalAnnual * (e.share_of_parent ?? 0);
                return {
                  label: locale === "en" ? e.label_en : e.label_fr,
                  value,
                  href: urlLocalLevel2(e.key, profileQs),
                  display: (
                    <>
                      {fmtBnEur(value, locale)}
                      <span style={{ marginLeft: 10, color: "var(--muted)" }}>
                        · {fmtPct(e.share_of_parent ?? 0, locale)}
                      </span>
                    </>
                  ),
                };
              })}
            />
          </div>

          {/* Liens dépt / région — accès direct sans drawer */}
          <div
            style={{
              display: "flex",
              gap: 28,
              flexWrap: "wrap",
              marginTop: 36,
              paddingTop: 28,
              borderTop: "1px solid var(--rule)",
            }}
          >
            <div style={{ flex: 1, minWidth: 280 }}>
              <p
                style={{
                  fontFamily: "'JetBrains Mono', ui-monospace, monospace",
                  fontSize: 11,
                  letterSpacing: "0.08em",
                  textTransform: "uppercase",
                  color: "var(--ocre)",
                  marginBottom: 10,
                }}
              >
                {locale === "en" ? "Departmental detail" : "Détail départements"}
              </p>
              <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 4 }}>
                {(drilldown?.buckets.local.departement?.level2 ?? []).map((e) => (
                  <li key={e.key}>
                    <Link
                      href={urlLocalDeptLevel2(e.key, profileQs)}
                      scroll={false}
                      style={{
                        fontSize: 14,
                        color: "var(--ink-2)",
                        borderBottom: "1px solid var(--rule)",
                        paddingBottom: 6,
                        display: "flex",
                        justifyContent: "space-between",
                        gap: 12,
                      }}
                    >
                      <span>{locale === "en" ? e.label_en : e.label_fr}</span>
                      <span className="tnum" style={{ color: "var(--muted)", fontFamily: "'JetBrains Mono', ui-monospace, monospace", fontSize: 12 }}>
                        {fmtPct(e.share_of_parent ?? 0, locale)}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
            <div style={{ flex: 1, minWidth: 280 }}>
              <p
                style={{
                  fontFamily: "'JetBrains Mono', ui-monospace, monospace",
                  fontSize: 11,
                  letterSpacing: "0.08em",
                  textTransform: "uppercase",
                  color: "var(--ocre)",
                  marginBottom: 10,
                }}
              >
                {locale === "en" ? "Regional detail" : "Détail régions"}
              </p>
              <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 4 }}>
                {(drilldown?.buckets.local.region?.level2 ?? []).map((e) => (
                  <li key={e.key}>
                    <Link
                      href={urlLocalRegionLevel2(e.key, profileQs)}
                      scroll={false}
                      style={{
                        fontSize: 14,
                        color: "var(--ink-2)",
                        borderBottom: "1px solid var(--rule)",
                        paddingBottom: 6,
                        display: "flex",
                        justifyContent: "space-between",
                        gap: 12,
                      }}
                    >
                      <span>{locale === "en" ? e.label_en : e.label_fr}</span>
                      <span className="tnum" style={{ color: "var(--muted)", fontFamily: "'JetBrains Mono', ui-monospace, monospace", fontSize: 12 }}>
                        {fmtPct(e.share_of_parent ?? 0, locale)}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </RevealOnScroll>

      {/* §08 — VUES THÉMATIQUES (cross-cutting) ────────────────────── */}
      {crossCuttingThemes.length > 0 && (
        <RevealOnScroll className="fx-section">
          <div className="fx-wrap">
            <SectionHead
              number="08"
              kind={t("budget.cross_cutting.section.eyebrow")}
              title={t("budget.cross_cutting.section.title")}
              subtitle={t("budget.cross_cutting.section.intro")}
            />
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 36,
                marginTop: 12,
              }}
            >
              {crossCuttingThemes.map((theme, idx) => (
                <CrossCuttingPanel
                  key={theme.key}
                  number={`07.${idx + 1}`}
                  theme={theme}
                  locale={locale}
                  eyebrow={t("budget.cross_cutting.eyebrow_panel")}
                  shareOfTotalLabel={t("budget.cross_cutting.share_of_total")}
                  caveatsLabel={t("budget.cross_cutting.caveats_label")}
                  sourcesLabel={t("budget.cross_cutting.sources_label")}
                />
              ))}
            </div>
          </div>
        </RevealOnScroll>
      )}

      {/* §08 — CTA Daily Bread ─────────────────────────────────────── */}
      <RevealOnScroll className="fx-section fx-section-cta-warm">
        <div className="fx-wrap" style={{ maxWidth: 820 }}>
          <SectionHead
            number="09"
            kind={t("budget.cta.daily_bread.kind")}
            title={t("budget.cta.daily_bread.title")}
            subtitle={t("budget.cta.daily_bread.body")}
          />
          <Link
            href={profileQs ? `/fr/national/daily-bread?${profileQs}` : "/fr/national/daily-bread"}
            className="fx-btn fx-btn-primary"
            style={{ marginTop: 8 }}
          >
            {t("budget.cta.daily_bread.button")}
          </Link>
        </div>
      </RevealOnScroll>

      {/* §09 — SOURCES ─────────────────────────────────────────────── */}
      <section className="fx-footer-sources">
        <div className="fx-wrap">
          <div className="fx-footer-sources-head">
            <span className="fx-footer-sources-label">
              {t("budget.section.sources.label")}
            </span>
            <Link href="/methode" className="fx-footer-sources-methode">
              {locale === "en" ? "Method →" : "Méthode →"}
            </Link>
          </div>
          <p className="fx-footer-sources-note">
            {t("budget.section.sources.note", { year: yearRef })}
          </p>
          <ul style={{ listStyle: "disc", paddingLeft: 18, margin: "8px 0 0", display: "flex", flexDirection: "column", gap: 6 }}>
            <li style={{ fontSize: 13, color: "var(--muted)" }}>{t("budget.section.sources.eurostat")}</li>
            <li style={{ fontSize: 13, color: "var(--muted)" }}>{t("budget.section.sources.gdp")}</li>
            <li style={{ fontSize: 13, color: "var(--muted)" }}>{t("budget.section.sources.plfss")}</li>
            <li style={{ fontSize: 13, color: "var(--muted)" }}>{t("budget.section.sources.plf")}</li>
            <li style={{ fontSize: 13, color: "var(--muted)" }}>{t("budget.section.sources.ofgl")}</li>
          </ul>
        </div>
      </section>

      </main>
      <Footer />
    </div>
  );
}

// Cas non utilisés — lint silence
void urlEtatMission;
