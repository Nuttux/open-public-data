import type { JSX } from "react";
import { ogMark } from "@/components/og/OgMark";
import { ImageResponse } from "next/og";
import {
  loadLandingStats,
  loadBudgetPageData,
  loadQuiRecoitData,
  loadMarchesPageData,
  loadPatrimoineData,
  loadLogementSocialData,
} from "@/lib/fusion-data";
import { loadDailyBread, loadEurostatFiscalite } from "@/lib/national-data";

export const runtime = "nodejs";

const SIZE = { width: 1200, height: 630 };

const fmtBn = (n: number) =>
  (n / 1e9).toLocaleString("fr-FR", { maximumFractionDigits: 2, minimumFractionDigits: 2 });
const fmtMn = (n: number) =>
  (n / 1e6).toLocaleString("fr-FR", { maximumFractionDigits: 1, minimumFractionDigits: 1 });
const fmtFr = (n: number) => n.toLocaleString("fr-FR");

type ChartRowData = {
  label: string;
  value: string;
  share?: number; // 0..1
};

/**
 * Brand header — composant inline (next/og ne supporte pas les composants
 * React custom dans ImageResponse, donc on inline le markup).
 */
function brandHeader(slug: string) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 14, fontSize: 18, letterSpacing: 4, textTransform: "uppercase", color: "#b8551c" }}>
      {ogMark()}
      <div style={{ display: "flex" }}>Qipu · {slug}</div>
    </div>
  );
}

function footer(sourceText: string, urlText: string) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", marginTop: 32, paddingTop: 16, borderTop: "2px solid #111", fontSize: 14, color: "#666", letterSpacing: 2, textTransform: "uppercase" }}>
      <div style={{ display: "flex", maxWidth: 800 }}>{sourceText.slice(0, 90)}</div>
      <div style={{ display: "flex" }}>{urlText}</div>
    </div>
  );
}

/**
 * Template "Top N bars" — utilisé pour beaucoup de classements.
 * `rows` : jusqu'à 6 lignes, optionnellement avec une `share` ∈ [0..1] pour
 * dessiner la bar.
 */
function renderTopBars(opts: {
  slug: string;
  kicker: string;
  title: string;
  rows: ChartRowData[];
  sourceText: string;
  urlText: string;
}): JSX.Element {
  const { slug, kicker, title, rows, sourceText, urlText } = opts;
  return (
    <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", background: "#faf9f5", padding: "64px 72px", fontFamily: "sans-serif" }}>
      {brandHeader(slug)}
      <div style={{ display: "flex", marginTop: 36, fontSize: 14, letterSpacing: 3, textTransform: "uppercase", color: "#666" }}>{kicker}</div>
      <div style={{ display: "flex", marginTop: 8, fontSize: 52, fontWeight: 800, color: "#111", lineHeight: 1.05, letterSpacing: -1.5, maxWidth: 1040 }}>{title}</div>
      <div style={{ display: "flex", flexDirection: "column", marginTop: 30, gap: 10 }}>
        {rows.slice(0, 6).map((r, i) => (
          <div key={i} style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 22, color: "#111" }}>
              <span style={{ display: "flex", maxWidth: 820, overflow: "hidden" }}>{`${i + 1}. ${r.label}`}</span>
              <span style={{ display: "flex", fontWeight: 700 }}>{r.value}</span>
            </div>
            {r.share != null ? (
              <div style={{ display: "flex", height: 4, background: "#e4dccb", width: "100%" }}>
                <div style={{ display: "flex", height: 4, background: "#b8551c", width: `${Math.round(Math.max(0, Math.min(1, r.share)) * 100)}%` }} />
              </div>
            ) : null}
          </div>
        ))}
      </div>
      <div style={{ display: "flex", flex: 1 }} />
      {footer(sourceText, urlText)}
    </div>
  );
}

/**
 * Template "KPI géant + sub-KPIs" — pour les charts type capacité de
 * désendettement, ratio SRU, etc.
 */
function renderHeroKpi(opts: {
  slug: string;
  kicker: string;
  title: string;
  heroValue: string;
  heroUnit?: string;
  heroLabel?: string;
  subKpis?: Array<{ label: string; value: string; accent?: boolean }>;
  sourceText: string;
  urlText: string;
}): JSX.Element {
  const { slug, kicker, title, heroValue, heroUnit, heroLabel, subKpis, sourceText, urlText } = opts;
  return (
    <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", background: "#faf9f5", padding: "64px 72px", fontFamily: "sans-serif" }}>
      {brandHeader(slug)}
      <div style={{ display: "flex", marginTop: 36, fontSize: 14, letterSpacing: 3, textTransform: "uppercase", color: "#666" }}>{kicker}</div>
      <div style={{ display: "flex", marginTop: 8, fontSize: 56, fontWeight: 800, color: "#111", lineHeight: 1.05, letterSpacing: -2, maxWidth: 1040 }}>{title}</div>
      <div style={{ display: "flex", flex: 1 }} />
      <div style={{ display: "flex", flexDirection: "column" }}>
        {heroLabel ? (
          <div style={{ display: "flex", fontSize: 14, color: "#666", letterSpacing: 2, textTransform: "uppercase" }}>{heroLabel}</div>
        ) : null}
        <div style={{ display: "flex", alignItems: "baseline", gap: 18 }}>
          <span style={{ display: "flex", fontSize: 130, fontWeight: 800, color: "#111", letterSpacing: -3, lineHeight: 1 }}>{heroValue}</span>
          {heroUnit ? (
            <span style={{ display: "flex", fontSize: 44, fontWeight: 700, color: "#666" }}>{heroUnit}</span>
          ) : null}
        </div>
      </div>
      {subKpis && subKpis.length ? (
        <div style={{ display: "flex", gap: 56, marginTop: 24 }}>
          {subKpis.map((k, i) => (
            <div key={i} style={{ display: "flex", flexDirection: "column" }}>
              <div style={{ display: "flex", fontSize: 13, color: "#666", letterSpacing: 2, textTransform: "uppercase" }}>{k.label}</div>
              <div style={{ display: "flex", fontSize: 40, fontWeight: 700, color: k.accent ? "#b8551c" : "#111", marginTop: 4 }}>{k.value}</div>
            </div>
          ))}
        </div>
      ) : null}
      {footer(sourceText, urlText)}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Chart resolvers — chaque chart-id charge ses data et fournit le JSX
// ─────────────────────────────────────────────────────────────────────

async function resolveChart(chart: string): Promise<JSX.Element> {
  switch (chart) {
    case "paris-budget-sankey": {
      const d = loadBudgetPageData();
      const topDep = d.topDepenses.slice(0, 5).map((x) => ({
        label: x.label,
        value: `${fmtMn(x.value)} M€`,
        share: x.value / d.depenses,
      }));
      return renderTopBars({
        slug: "/budget · sankey",
        kicker: `Budget Paris ${d.year}`,
        title: `${fmtBn(d.depenses)} Md€ — où va l'argent ?`,
        rows: topDep,
        sourceText: "Source Paris Open Data · Comptes M57",
        urlText: "qipu.org/fr/city/paris/budget",
      });
    }
    case "paris-subv-top-themes": {
      const d = loadQuiRecoitData();
      const rows = (d.byTheme ?? [])
        .slice(0, 6)
        .map((t) => ({ label: t.theme, value: `${fmtMn(t.amount)} M€`, share: t.amount / d.total }));
      return renderTopBars({
        slug: "/subventions · thèmes",
        kicker: `Subventions Paris ${d.year}`,
        title: `${fmtBn(d.total)} Md€ versés — par thème`,
        rows,
        sourceText: "Source Paris Open Data · Annexe CA",
        urlText: "qipu.org/fr/city/paris/subventions",
      });
    }
    case "paris-subv-top-benef": {
      const d = loadQuiRecoitData();
      const rows = d.top10.slice(0, 6).map((b) => ({
        label: b.name,
        value: `${fmtMn(b.amount)} M€`,
        share: b.amount / d.total,
      }));
      return renderTopBars({
        slug: "/subventions · top 10",
        kicker: `Subventions Paris ${d.year}`,
        title: `Top bénéficiaires — ${Math.round(d.concentrationTop10Pct)}% du total`,
        rows,
        sourceText: "Source Paris Open Data · Annexe CA",
        urlText: "qipu.org/fr/city/paris/subventions",
      });
    }
    case "paris-marches-top-fournisseurs": {
      const d = loadMarchesPageData();
      const rows = d.top10.slice(0, 6).map((f) => ({
        label: f.name,
        value: `${fmtMn(f.amount)} M€`,
        share: f.amount / d.total,
      }));
      const top10Share = d.top10.reduce((s, x) => s + x.amount, 0) / (d.total || 1);
      return renderTopBars({
        slug: "/marchés · top fournisseurs",
        kicker: `Marchés publics Paris ${d.year}`,
        title: `Top 10 fournisseurs — ${Math.round(top10Share * 100)}% des enveloppes`,
        rows,
        sourceText: "Source DECP · Ville de Paris",
        urlText: "qipu.org/fr/city/paris/marches",
      });
    }
    case "paris-dette-capacite": {
      const d = loadPatrimoineData();
      const cap = d.capaciteDesendettement ?? 0;
      const seuilAlerte = 12;
      const seuilCritique = 20;
      const status =
        cap < seuilAlerte ? "Sain" : cap < seuilCritique ? "Vigilance" : "Critique";
      return renderHeroKpi({
        slug: "/dette · capacité de désendettement",
        kicker: `Dette financière Ville de Paris · ${d.year}`,
        title: "Capacité de désendettement",
        heroLabel: "Années pour rembourser à épargne brute constante",
        heroValue: cap.toLocaleString("fr-FR", { maximumFractionDigits: 1, minimumFractionDigits: 1 }),
        heroUnit: "ans",
        subKpis: [
          { label: "Seuil alerte CRC", value: `${seuilAlerte} ans` },
          { label: "Seuil critique", value: `${seuilCritique} ans` },
          { label: "Statut", value: status, accent: status !== "Sain" },
        ],
        sourceText: "Source Paris Open Data · Bilan + CA",
        urlText: "qipu.org/fr/city/paris/dette",
      });
    }
    case "paris-logement-tension": {
      const d = loadLogementSocialData();
      const demandes = d.tension?.paris.demandesActives ?? 0;
      const attrib = d.tension?.paris.attributions ?? 0;
      const ratio = d.tension?.paris.ratio ?? null;
      return renderHeroKpi({
        slug: "/logement · tension",
        kicker: `Logement social Paris · ${d.year}`,
        title: "Combien de demandeurs pour 1 attribution ?",
        heroLabel: "Ratio demandes actives / attributions année",
        heroValue: ratio ? ratio.toFixed(1).replace(".", ",") : "—",
        heroUnit: "demandeurs/attribution",
        subKpis: [
          { label: "Demandes actives", value: fmtFr(demandes) },
          { label: "Attributions", value: fmtFr(attrib) },
          { label: "Logements financés", value: fmtFr(d.nouveauxParAn), accent: true },
        ],
        sourceText: "Source DRIHL · Paris Open Data",
        urlText: "qipu.org/fr/city/paris/logement",
      });
    }
    case "fr-daily-bread-composition": {
      const db = loadDailyBread();
      const apu = db?.apu_subsectors;
      if (!apu) break;
      const totals = (apu.institutions as Record<string, { annual_eur: number; label_fr: string }>);
      const s11 = totals["S1311"]?.annual_eur ?? 0;
      const s13 = totals["S1313"]?.annual_eur ?? 0;
      const s14 = totals["S1314"]?.annual_eur ?? 0;
      const tot = s11 + s13 + s14;
      const rows = [
        { label: "Sécurité sociale (S1314)", value: `${fmtBn(s14)} Md€`, share: s14 / tot },
        { label: "État central (S1311)", value: `${fmtBn(s11)} Md€`, share: s11 / tot },
        { label: "Collectivités locales (S1313)", value: `${fmtBn(s13)} Md€`, share: s13 / tot },
      ];
      return renderTopBars({
        slug: "/daily-bread · composition",
        kicker: `Dépenses publiques France · ${apu.year ?? ""}`,
        title: `${fmtBn(tot)} Md€ — qui dépense quoi ?`,
        rows,
        sourceText: "Source Eurostat · gov_10a_main",
        urlText: "qipu.org/fr/national/daily-bread",
      });
    }
    case "fr-fiscalite-categories": {
      const d = loadEurostatFiscalite();
      if (!d) break;
      const totalPo = d.fr_total_po.pc_gdp ?? 0;
      const cats = (d.fr_breakdown ?? [])
        .filter((c): c is typeof c & { pc_gdp: number } => c.pc_gdp != null)
        .slice(0, 6)
        .map((c) => ({
          label: c.label_fr,
          value: `${c.pc_gdp.toLocaleString("fr-FR", { maximumFractionDigits: 1, minimumFractionDigits: 1 })} % PIB`,
          share: c.pc_gdp / (totalPo || 1),
        }));
      return renderTopBars({
        slug: "/fiscalité · catégories",
        kicker: `Prélèvements obligatoires France · ${d.latest_year}`,
        title: `${totalPo.toLocaleString("fr-FR", { maximumFractionDigits: 1 })}% du PIB — qui paie quoi ?`,
        rows: cats,
        sourceText: "Source Eurostat · gov_10a_taxag",
        urlText: "qipu.org/fr/national/fiscalite",
      });
    }
    case "landing-per-capita": {
      const stats = loadLandingStats();
      return renderHeroKpi({
        slug: "/ · par habitant",
        kicker: `Budget Paris ${stats.year} ${stats.budgetType === "vote" ? "voté" : "exécuté"}`,
        title: "Chaque mois, la Ville dépense",
        heroValue: Math.round(stats.perCapitaMonth).toLocaleString("fr-FR"),
        heroUnit: "€/habitant/mois",
        heroLabel: `Sur ${fmtBn(stats.totalDepenses)} Md€ rapportés à ${fmtFr(stats.parisPopulation)} Parisiens (INSEE)`,
        subKpis: [
          { label: "Par an", value: `${Math.round(stats.perCapitaYear).toLocaleString("fr-FR")} €` },
          { label: "Population", value: fmtFr(stats.parisPopulation) },
        ],
        sourceText: "Source Paris Open Data · INSEE",
        urlText: "qipu.org",
      });
    }
    default:
      break;
  }
  // Fallback — chart-id inconnu, on renvoie une carte générique.
  return renderHeroKpi({
    slug: "Qipu",
    kicker: "Finances publiques sourcées",
    title: "On documente les finances publiques françaises.",
    heroValue: "—",
    heroLabel: "Chart non trouvé",
    sourceText: "qipu.org",
    urlText: "qipu.org",
  });
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const chart = url.searchParams.get("chart") ?? "";
  try {
    const jsx = await resolveChart(chart);
    return new ImageResponse(jsx, { ...SIZE });
  } catch {
    const fallback = renderHeroKpi({
      slug: "Qipu",
      kicker: "Erreur de rendu",
      title: "Image non disponible",
      heroValue: "—",
      sourceText: "qipu.org",
      urlText: "qipu.org",
    });
    return new ImageResponse(fallback, { ...SIZE });
  }
}
