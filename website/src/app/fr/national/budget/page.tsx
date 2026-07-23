import type { Metadata } from "next";
import type { ReactNode } from "react";
import Link from "next/link";
import "@/app/fusion.css";
import Tip from "@/components/fusion/Tip";

import {
  Navbar,
  Footer,
  SectionHead,
  BnEurCountUp,
  RevealOnScroll,
  CrossCuttingPanel,
} from "@/components/fusion";
import BudgetTreemap, {
  type TreemapDatum,
} from "@/components/fusion/BudgetTreemap";
import { loadDailyBread } from "@/lib/national-data";
import { loadDrilldown } from "@/lib/budget-drilldown";
import { loadRecettesApu } from "@/lib/recettes-apu";
import { listCrossCuttingThemes } from "@/lib/cross-cutting";
import { RecettesPanel } from "@/components/fusion";
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
 *  - hero "1 808 Md€/an"
 *  - recettes (3 piliers) + déficit + note méthode (repliée)
 *  - treemap visuel des ~30 plus grosses cellules
 *  - drill Sécu — 5 branches
 *  - drill État — 12 agrégats éditoriaux + note méthode (repliée)
 *  - drill Local — 3 échelles + liens dépt/région
 *  - CTA Daily Bread
 *  - sources
 *
 * Server component — toute la data est lue côté serveur. Le treemap est
 * un client component léger (interactivity hover/tooltip) qui reçoit ses
 * données pré-projetées en props.
 */

export async function generateMetadata(): Promise<Metadata> {
  return buildLocaleAwareMetadata({
    title:
      "Le budget de la France 2025 — 1 808 Md€/an",
    description:
      "Explorer les dépenses publiques françaises (~1 808 Md€/an) : Sécurité sociale, État central, collectivités locales. Données Eurostat, PLF, OFGL — sans calcul personnel.",
    en: {
      title:
        "The French budget 2025 — €1,808 bn/yr",
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

// Glossaire des acronymes de comptabilité publique — wrappés en tooltip
// (Tip) sur leur première occurrence, au lieu d'être laissés bruts.
const GLOSS: Record<"fr" | "en", Record<string, string>> = {
  fr: {
    S1311:
      "Sous-secteur « administration centrale » : budget de l'État, opérateurs (ODAC) et comptes spéciaux.",
    S13: "Ensemble « administrations publiques » : Sécurité sociale + État central + collectivités locales.",
    ODAC: "Organismes divers d'administration centrale — opérateurs de l'État (universités, agences…), financés surtout par des fonds publics.",
    ASSO: "Administrations de sécurité sociale — caisses maladie, retraite, famille, chômage.",
    APUL: "Administrations publiques locales — communes, intercommunalités, départements, régions.",
  },
  en: {
    S1311:
      "The 'central government' sub-sector: the State budget, its agencies (ODAC) and special accounts.",
    S13: "The 'general government' sector: social security + central State + local government.",
    ODAC: "Central-government agencies — State operators (universities, agencies…), funded mostly from public money.",
    ASSO: "Social-security administrations — health, pension, family and unemployment funds.",
    APUL: "Local public administrations — municipalities, inter-municipal bodies, départements, regions.",
  },
};

// Wrap known glossary terms (first occurrence, longest-match-first) in a Tip.
function glossify(text: string, locale: "fr" | "en"): ReactNode {
  const gloss = GLOSS[locale];
  const terms = Object.keys(gloss).sort((a, b) => b.length - a.length);
  const re = new RegExp(`\\b(${terms.join("|")})\\b`, "g");
  const out: ReactNode[] = [];
  const seen = new Set<string>();
  let last = 0;
  let key = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const term = m[1];
    if (seen.has(term)) continue;
    seen.add(term);
    if (m.index > last) out.push(text.slice(last, m.index));
    out.push(
      <Tip key={key++} label={gloss[term]}>
        {term}
      </Tip>,
    );
    last = m.index + term.length;
  }
  if (out.length === 0) return text;
  if (last < text.length) out.push(text.slice(last));
  return out;
}

function fmtBnEur(amountEur: number, locale: "fr" | "en"): string {
  if (!Number.isFinite(amountEur) || amountEur <= 0) return "—";
  const md = amountEur / 1e9;
  const rounded = md >= 100 ? md.toFixed(0) : md.toFixed(1);
  return locale === "fr"
    ? `${rounded.replace(".", ",")} Md€`
    : `€${rounded} bn`;
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
              {glossify(t("budget.hero.amount_caption"), locale)}
            </span>
          </p>
          <p className="fx-page-lede" style={{ maxWidth: 820 }}>
            {glossify(t("budget.hero.subtitle", { year: yearRef }), locale)}
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
        </div>
      </RevealOnScroll>

      {/* §04 — GRANDES MISSIONS (thème × niveaux de gouvernement) ────── */}
      {crossCuttingThemes.length > 0 && (
        <RevealOnScroll className="fx-section">
          <div className="fx-wrap">
            <SectionHead
              kind={t("budget.cross_cutting.section.eyebrow")}
              title={t("budget.cross_cutting.section.title")}
              subtitle={t("budget.cross_cutting.section.intro")}
            />
            <div className="fx-cct-legend">
              {[
                { c: "#2a3680", label: t("budget.section.treemap.legend.secu") },
                { c: "#1a1d26", label: t("budget.section.treemap.legend.etat") },
                { c: "#c12323", label: locale === "en" ? "Municipal" : "Communes" },
                { c: "#a01b1b", label: locale === "en" ? "Departments" : "Départements" },
                { c: "#7a1414", label: locale === "en" ? "Regions" : "Régions" },
              ].map((l) => (
                <span key={l.label} className="fx-cct-legend-item">
                  <span
                    aria-hidden="true"
                    className="fx-cct-legend-sw"
                    style={{ background: l.c }}
                  />
                  {l.label}
                </span>
              ))}
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 0, marginTop: 8 }}>
              {crossCuttingThemes.map((theme) => (
                <CrossCuttingPanel
                  key={theme.key}
                  theme={theme}
                  locale={locale}
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
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "baseline",
              gap: 16,
              flexWrap: "wrap",
            }}
          >
            <p style={{ margin: 0, fontSize: 13, color: "var(--muted)", lineHeight: 1.6 }}>
              <span className="fx-footer-sources-label">
                {t("budget.section.sources.label")}
              </span>{" "}
              {[
                { label: "Eurostat gov_10a_main", url: "https://ec.europa.eu/eurostat/databrowser/view/gov_10a_main/default/table" },
                { label: "Eurostat nama_10_gdp", url: "https://ec.europa.eu/eurostat/databrowser/view/nama_10_gdp/default/table" },
                { label: "PLFSS", url: "https://www.securite-sociale.fr" },
                { label: "PLF", url: "https://www.data.gouv.fr" },
                { label: "OFGL", url: "https://www.ofgl.fr" },
              ].map((s, i) => (
                <span key={s.url}>
                  {i > 0 ? ", " : ""}
                  <a
                    href={s.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ color: "var(--ink-2)", textDecoration: "underline", textUnderlineOffset: 3 }}
                  >
                    {s.label}
                  </a>
                </span>
              ))}
            </p>
            <Link href="/methode" className="fx-footer-sources-methode">
              {locale === "en" ? "Method →" : "Méthode →"}
            </Link>
          </div>
        </div>
      </section>

      </main>
      <Footer />
    </div>
  );
}

// Cas non utilisés — lint silence
void urlEtatMission;
