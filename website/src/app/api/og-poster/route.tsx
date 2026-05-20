/**
 * Daily Bread — share-poster endpoint.
 *
 * Generates a 1080×1080 PNG that summarises a user's tax-and-spending profile
 * (calculated from the same query-string the `/france/daily-bread` page uses).
 *
 * Anonymous-only by design (cultural taboo on personal income in France):
 * the poster shows what the user funds via concrete equivalents (GP visits,
 * retraite %, school-days, transit tickets) + a Sécu/État/Local stack-bar.
 * No revenue, no monthly total in €. The framing positions the share as a
 * civic gesture ("voilà ce que je finance") rather than a personal disclosure.
 *
 * Used in two places:
 * 1. The "Télécharger l'image" button on the page (download/open in new tab).
 * 2. As a dynamic `og:image` so that links shared to Twitter/Slack render
 *    a personalised preview card (cf. `daily-bread/page.tsx` generateMetadata).
 *
 * Runtime is `nodejs` because `loadDailyBread()` uses `node:fs` synchronously.
 * Fonts are best-effort fetched from Google Fonts; if the fetch fails we
 * silently fall back to system sans-serif (the layout still works — only the
 * exact typeface differs).
 */

import { ImageResponse } from "next/og";
import { NextRequest } from "next/server";
import {
  computeBreakdown,
  computeBreakdownRetraite,
  computeBreakdownCapital,
  computeBreakdownIndependant,
  computeInstitutionShares,
  computeAssoBreakdown,
  computeStateBuckets,
  type IndepActivityType,
} from "@/lib/daily-bread";
import { loadDailyBread } from "@/lib/national-data";
import { findCommuneByAny } from "@/lib/all-communes";

export const runtime = "nodejs";
// Always render dynamically — params drive the output.
export const dynamic = "force-dynamic";

const INDEP_TYPES: IndepActivityType[] = ["vente", "services_bic", "services_bnc"];

// Brand palette — aligned with theme-fusion / theme-db-scrolly (post-rebrand).
// Sécu = bleu fusion, État = charbon, Local = rouge républicain éditorial,
// ocre as a secondary editorial accent (not used here directly but kept
// consistent in case eyebrows are reintroduced).
const COL = {
  paper: "#fafaf7",
  ink: "#0a0a0a",
  cobalt: "#2a3680", // Sécu (bleu fusion sombre)
  charbon: "#1a1d26", // État
  local: "#c12323", // Local (rouge fusion)
  ocre: "#a67638", // accent éditorial
  rule: "#0a0a0a",
  muted: "#5f6672",
};

// Bloc communal share of S1313 (APUL) — communes + EPCI ≈ 60 %.
// Same constant computeLocalLevels uses (`part_communes_epci.value`).
const BLOC_COMMUNAL_SHARE_OF_LOCAL = 0.6;

// Shares (%) used to compute the anonymous equivalents.
//   • CNAM (santé) ≈ 46 % de l'ASSO  (cf. asso_breakdown.part_cnam_maladie)
//   • CNAV (retraites) ≈ 39 % de l'ASSO
// Education = mission "Enseignement scolaire" (~19,87 % du budget BG)
//
// Equivalent unit references (sources):
//   • Consultation généraliste = 30 €   (Convention médicale 2024)
//   • Pension mensuelle moyenne = 1 626 €  (DREES 2023, retraités résidant en France)
//   • Coût d'une journée d'école / élève public = 52 €  (DEPP RERS 2023, ~9 350 €/an primaire)
//   • Ticket de transport urbain = 2,50 €  (UTP, prix moyen national 2024)
const EQUIV_REF = {
  consultation_eur: 30,
  pension_avg_eur: 1626,
  ecole_day_eur: 52,
  ticket_eur: 2.5,
};

// Fonts — best-effort. Returns [] if Google Fonts is unreachable.
//
// We resolve TTF URLs dynamically through the Google Fonts CSS API rather
// than hard-coding versioned `gstatic.com` URLs (those rotate when Google
// re-issues a font). The CSS API takes a `User-Agent` to choose the format —
// a desktop UA returns TTF, which `next/og` ingests directly.
let _fontsPromise: Promise<
  Array<{ name: string; data: ArrayBuffer; style: "normal" | "italic"; weight: number }>
> | null = null;

const FONT_CSS_URL =
  "https://fonts.googleapis.com/css2?family=Inter+Tight:wght@500;600;700&family=Instrument+Serif:ital@1&display=swap";
// Using a legacy UA forces Google Fonts to serve TTF (not WOFF2), which is
// what `next/og`'s satori-based parser ingests directly. Modern UAs trigger
// WOFF2 unicode-range subsets which satori does not decompress.
const LEGACY_UA = "Mozilla/4.0";

async function fetchTTF(
  name: "Inter Tight" | "Instrument Serif",
  weightOrItalic: string,
): Promise<ArrayBuffer | null> {
  try {
    const cssRes = await fetch(FONT_CSS_URL, {
      headers: { "User-Agent": LEGACY_UA },
      cache: "force-cache",
    });
    if (!cssRes.ok) return null;
    const css = await cssRes.text();
    // Find the @font-face block matching family + weight/style, then its TTF URL.
    const familyRe = new RegExp(
      `font-family:\\s*'${name}';[\\s\\S]*?${weightOrItalic}[\\s\\S]*?src:\\s*url\\((https://fonts\\.gstatic\\.com/[^)]+\\.ttf)\\)\\s*format\\('truetype'\\)`,
    );
    const m = css.match(familyRe);
    if (!m) return null;
    const ttfRes = await fetch(m[1], { cache: "force-cache" });
    if (!ttfRes.ok) return null;
    return await ttfRes.arrayBuffer();
  } catch {
    return null;
  }
}

function loadFonts() {
  if (_fontsPromise) return _fontsPromise;
  _fontsPromise = (async () => {
    const [interTightBold, interTightSemi, instrument] = await Promise.all([
      fetchTTF("Inter Tight", "font-weight:\\s*700"),
      fetchTTF("Inter Tight", "font-weight:\\s*600"),
      fetchTTF("Instrument Serif", "font-style:\\s*italic"),
    ]);
    const out: Array<{ name: string; data: ArrayBuffer; style: "normal" | "italic"; weight: number }> = [];
    if (interTightBold) out.push({ name: "Inter Tight", data: interTightBold, style: "normal", weight: 700 });
    if (interTightSemi) out.push({ name: "Inter Tight", data: interTightSemi, style: "normal", weight: 600 });
    if (instrument) out.push({ name: "Instrument Serif", data: instrument, style: "italic", weight: 400 });
    return out;
  })();
  return _fontsPromise;
}

function clampNonNeg(n: number): number {
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

// TF estimate — same heuristic as DailyBreadClient (impots_locaux × 0.4 × 2.2).
function estimateTaxeFonciereFromCommune(impots_locaux_eur_hab: number): number {
  return Math.round(impots_locaux_eur_hab * 0.4 * 2.2);
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const localeParam = (searchParams.get("lang") || "fr").toLowerCase();
  const locale: "fr" | "en" = localeParam === "en" ? "en" : "fr";

  // Parse params (mirror DailyBreadClient defaults).
  const rawNet = searchParams.get("net");
  const salaireMonthly = rawNet !== null ? clampNonNeg(Number(rawNet)) : 2100;
  const pensionMonthly = clampNonNeg(Number(searchParams.get("pension") ?? 0));
  const capitalAnnuel = clampNonNeg(Number(searchParams.get("capital") ?? 0));
  const indepCaAnnuel = clampNonNeg(Number(searchParams.get("indep_ca") ?? 0));
  const rawParts = Number(searchParams.get("parts") || 1);
  const parts = Number.isFinite(rawParts) ? Math.min(10, Math.max(1, rawParts)) : 1;
  const communeSlug = searchParams.get("c") || "paris";
  const isOwner = searchParams.get("owner") === "1";
  const tfCustom = clampNonNeg(Number(searchParams.get("tf") || 0));
  const rawIndepType = (searchParams.get("indep_type") || "services_bic") as IndepActivityType;
  const indepType: IndepActivityType = INDEP_TYPES.includes(rawIndepType)
    ? rawIndepType
    : "services_bic";

  const db = loadDailyBread();
  if (!db) {
    return new Response("daily_bread.json not found", { status: 500 });
  }

  // ── Compute breakdowns server-side ─────────────────────────────────
  const breakdownSalaire =
    salaireMonthly > 0
      ? computeBreakdown({ net_annuel: salaireMonthly * 12, parts }, db)
      : { cotisations_sal: 0, csg: 0, ir: 0, tva_estimee: 0, total: 0 };
  const breakdownRetraite =
    pensionMonthly > 0
      ? computeBreakdownRetraite(pensionMonthly * 12, parts, db)
      : { csg_crds_casa: 0, ir: 0, tva_estimee: 0, total: 0, taux_csg_applied: 0 };
  const breakdownCapital =
    capitalAnnuel > 0
      ? computeBreakdownCapital(capitalAnnuel, db)
      : { ir: 0, prelevements_sociaux: 0, tva_estimee: 0, total: 0 };
  const breakdownIndep =
    indepCaAnnuel > 0
      ? computeBreakdownIndependant(indepCaAnnuel, indepType, parts, db)
      : { cotisations_urssaf: 0, ir: 0, tva_estimee: 0, total: 0, benefice_imposable: 0 };

  // Commune lookup (for the city label and TF).
  const commune = findCommuneByAny(communeSlug);
  const communeNom = commune?.nom ?? (locale === "en" ? "France" : "France");
  const impotsLocauxEurHab = commune?.kpis?.impots_locaux?.eur_hab ?? 0;

  let tfEstimated = 0;
  if (isOwner) {
    if (tfCustom > 0) tfEstimated = tfCustom;
    else if (impotsLocauxEurHab > 0) tfEstimated = estimateTaxeFonciereFromCommune(impotsLocauxEurHab);
  }

  const totalAnnuel =
    breakdownSalaire.total +
    breakdownRetraite.total +
    breakdownCapital.total +
    breakdownIndep.total +
    tfEstimated;

  const institutionShares = computeInstitutionShares(totalAnnuel, db);
  const secu = institutionShares.find((i) => i.code === "S1314");
  const etat = institutionShares.find((i) => i.code === "S1311");
  const local = institutionShares.find((i) => i.code === "S1313");

  // Aligné sur la page : Math.round sur share×100, sans renormaliser.
  // Le total peut faire 99% (ex: 44+37+18) — c'est honnête (le ~1% restant
  // correspond aux administrations résiduelles S1312 non représentées).
  const pctSecu = Math.round((secu?.share ?? 0) * 100);
  const pctEtat = Math.round((etat?.share ?? 0) * 100);
  const pctLocal = Math.round((local?.share ?? 0) * 100);

  // ── Equivalents (anonymous mode) ──────────────────────────────────
  // Sécu sub-branches: CNAM (santé) and CNAV (retraites).
  const secuMonthly = (secu?.annual_eur ?? 0) / 12;
  const assoBreakdown = secuMonthly > 0 ? computeAssoBreakdown(secuMonthly * 12, db) : [];
  const cnamMonthly =
    (assoBreakdown.find((b) => b.key === "part_cnam_maladie")?.annual_eur ?? 0) / 12;
  const cnavMonthly =
    (assoBreakdown.find((b) => b.key === "part_cnav_retraites")?.annual_eur ?? 0) / 12;

  // Education monthly: bucket "education" (Enseignement scolaire + Recherche).
  const etatAnnuel = etat?.annual_eur ?? 0;
  const stateBuckets = etatAnnuel > 0 ? computeStateBuckets(etatAnnuel, db) : [];
  // Bucket key réel = "education_recherche" (cf computeStateBuckets dans
  // lib/daily-bread.ts). Avant : on cherchait "education" qui n'existait pas,
  // d'où l'équivalent affiché toujours à 0.0 jours d'école.
  const educationMonthly =
    stateBuckets.find((b) => b.key === "education_recherche")?.monthly_eur ?? 0;

  // Bloc communal monthly (Local × ~60 %).
  const localMonthly = (local?.annual_eur ?? 0) / 12;
  const blocCommunalMonthly = localMonthly * BLOC_COMMUNAL_SHARE_OF_LOCAL;

  // The 4 anonymous equivalents.
  const equivConsultations = Math.round(cnamMonthly / EQUIV_REF.consultation_eur);
  const equivRetraitePct = Math.round((cnavMonthly / EQUIV_REF.pension_avg_eur) * 100);
  const equivEcoleJours = (educationMonthly / EQUIV_REF.ecole_day_eur).toFixed(1);
  const equivTrajets = Math.round(blocCommunalMonthly / EQUIV_REF.ticket_eur);

  // ── Strings (i18n) ─────────────────────────────────────────────────
  const T = locale === "en"
    ? {
        eyebrow: "DAILY BREAD",
        site: "franceopendata.org",
        titre: "My month of public service",
        tagline: "“This is what I fund, every month.”",
        anon_consult: (n: number) => `≈ ${n}  GP visits`,
        anon_retraite: (p: number) => `≈ ${p}%  of an average pension`,
        anon_ecole: (d: string) => `≈ ${d}  school-days for one pupil`,
        anon_trajets: (n: number) => `≈ ${n}  city-bus tickets`,
        legend_secu: "Soc. security",
        legend_etat: "State",
        legend_local: "Local",
        meta_single: "Single",
        meta_couple: "Couple",
        meta_kid: "+1 child",
        meta_kids: (n: number) => `+${n} children`,
        baseline: "France Open Data — making what public service produces visible.",
        cta_arrow: "→",
      }
    : {
        eyebrow: "DAILY BREAD",
        site: "franceopendata.org",
        titre: "Mon mois de service public",
        tagline: "« Voilà ce que je finance, chaque mois. »",
        anon_consult: (n: number) => `≈ ${n}  consultations chez le généraliste`,
        anon_retraite: (p: number) => `≈ ${p} %  d'une retraite mensuelle moyenne`,
        anon_ecole: (d: string) =>
          `≈ ${d}  jours d'école pour 1 élève public`,
        anon_trajets: (n: number) => `≈ ${n}  trajets de transport urbain`,
        legend_secu: "Sécu",
        legend_etat: "État",
        legend_local: "Local",
        meta_single: "Célibataire",
        meta_couple: "Couple",
        meta_kid: "+1 enfant",
        meta_kids: (n: number) => `+${n} enfants`,
        baseline: "France Open Data — rendre visible ce que produit le service public.",
        cta_arrow: "→",
      };

  // Household label.
  const partsLabel = (() => {
    if (parts <= 1) return T.meta_single;
    if (parts === 2) return T.meta_couple;
    if (parts === 1.5) return `${T.meta_single} ${T.meta_kid}`;
    if (parts > 2) {
      const kids = Math.round((parts - 2) * 2);
      if (kids === 1) return `${T.meta_couple} ${T.meta_kid}`;
      return `${T.meta_couple} ${T.meta_kids(kids)}`;
    }
    return T.meta_single;
  })();

  // Try to load fonts; fail gracefully.
  let fonts: Awaited<ReturnType<typeof loadFonts>> = [];
  try {
    fonts = await loadFonts();
  } catch {
    fonts = [];
  }

  const hasInterTight = fonts.some((f) => f.name === "Inter Tight");
  const hasInstrument = fonts.some((f) => f.name === "Instrument Serif");
  const dispFont = hasInterTight ? "Inter Tight" : "sans-serif";
  const serifFont = hasInstrument ? "Instrument Serif" : "Georgia, serif";

  // ── JSX poster — branch by mode ────────────────────────────────────
  const HeaderStrip = (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        paddingBottom: 18,
        borderBottom: `1px solid ${COL.rule}`,
        fontSize: 22,
        letterSpacing: 6,
        textTransform: "uppercase",
        fontWeight: 700,
      }}
    >
      <span style={{ display: "flex" }}>{T.eyebrow}</span>
      <span style={{ display: "flex", color: COL.muted, letterSpacing: 3 }}>
        {T.site}
      </span>
    </div>
  );

  const StackBar = (
    <div style={{ display: "flex", flexDirection: "column", marginTop: 36 }}>
      <div
        style={{
          display: "flex",
          height: 76,
          border: `1px solid ${COL.rule}`,
          overflow: "hidden",
        }}
      >
        <div
          style={{
            width: `${pctSecu}%`,
            background: COL.cobalt,
            color: "#ffffff",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 26,
            fontWeight: 700,
            letterSpacing: -0.3,
          }}
        >
          {pctSecu}%
        </div>
        <div
          style={{
            width: `${pctEtat}%`,
            background: COL.charbon,
            color: "#ffffff",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 26,
            fontWeight: 700,
            letterSpacing: -0.3,
          }}
        >
          {pctEtat}%
        </div>
        <div
          style={{
            width: `${pctLocal}%`,
            background: COL.local,
            color: "#ffffff",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 26,
            fontWeight: 700,
            letterSpacing: -0.3,
          }}
        >
          {pctLocal}%
        </div>
      </div>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          marginTop: 12,
          fontSize: 22,
          color: COL.muted,
          letterSpacing: 1,
          textTransform: "uppercase",
          fontWeight: 600,
        }}
      >
        <span style={{ display: "flex" }}>{T.legend_secu}</span>
        <span style={{ display: "flex" }}>{T.legend_etat}</span>
        <span style={{ display: "flex" }}>{T.legend_local}</span>
      </div>
    </div>
  );

  // Two-line footer: civic baseline (top) + meta (bottom).
  const Footer = (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        paddingTop: 24,
        borderTop: `1px solid ${COL.rule}`,
        gap: 10,
      }}
    >
      <div
        style={{
          display: "flex",
          fontSize: 24,
          fontWeight: 600,
          color: COL.ink,
          letterSpacing: 0.2,
        }}
      >
        {T.baseline}
      </div>
      <div
        style={{
          display: "flex",
          fontSize: 22,
          color: COL.muted,
          letterSpacing: 1,
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <span style={{ display: "flex" }}>
          {partsLabel} · {communeNom}
        </span>
        <span style={{ display: "flex", color: COL.ink, fontWeight: 700 }}>
          {T.cta_arrow} {T.site}
        </span>
      </div>
    </div>
  );

  const PosterShell = (children: React.ReactNode) => (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        background: COL.paper,
        padding: "72px 88px 72px 88px",
        fontFamily: dispFont,
        color: COL.ink,
      }}
    >
      {HeaderStrip}
      {children}
      {/* Spacer pushes footer down */}
      <div style={{ flex: 1, display: "flex" }} />
      {Footer}
    </div>
  );

  // Single mode — anonymous, civic framing.
  // Surtitre (Inter Tight 700, big) + italic tagline serif (Instrument Serif),
  // then 4 concrete equivalents, then the Sécu/État/Local stack-bar.
  const body = (
    <div style={{ display: "flex", flexDirection: "column" }}>
      {/* Civic surtitre */}
      <div
        style={{
          display: "flex",
          marginTop: 56,
          fontSize: 64,
          fontWeight: 700,
          letterSpacing: -1.2,
          lineHeight: 1.05,
          color: COL.ink,
        }}
      >
        {T.titre}
      </div>

      {/* Italic civic tagline */}
      <div
        style={{
          display: "flex",
          marginTop: 14,
          fontFamily: serifFont,
          fontStyle: "italic",
          fontSize: 38,
          fontWeight: 400,
          color: COL.ocre,
          letterSpacing: -0.2,
          lineHeight: 1.2,
        }}
      >
        {T.tagline}
      </div>

      {/* Equivalents list */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          marginTop: 48,
          gap: 22,
        }}
      >
        {[
          { text: T.anon_consult(equivConsultations), col: COL.cobalt },
          { text: T.anon_retraite(equivRetraitePct), col: COL.cobalt },
          { text: T.anon_ecole(equivEcoleJours), col: COL.charbon },
          { text: T.anon_trajets(equivTrajets), col: COL.local },
        ].map((row, i) => (
          <div
            key={i}
            style={{
              display: "flex",
              alignItems: "baseline",
              fontSize: 44,
              fontWeight: 600,
              letterSpacing: -0.6,
              color: COL.ink,
            }}
          >
            <span
              style={{
                display: "flex",
                width: 14,
                height: 14,
                background: row.col,
                marginRight: 22,
                alignSelf: "center",
              }}
            />
            <span style={{ display: "flex" }}>{row.text}</span>
          </div>
        ))}
      </div>

      {StackBar}
    </div>
  );

  return new ImageResponse(PosterShell(body), {
    width: 1080,
    height: 1080,
    fonts: fonts.length
      ? fonts.map((f) => ({
          name: f.name,
          data: f.data,
          style: f.style,
          weight: f.weight as 400 | 600 | 700,
        }))
      : undefined,
    headers: {
      "Cache-Control": "public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800",
    },
  });
}
