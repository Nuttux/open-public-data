import type { LandingModel, DeckCard, MarqueeItem } from "@/components/landing/types";
import { readDataJson } from "@/lib/data/read";
import { loadSfBudgetByYear } from "@/lib/us/sf-budget-data";
import { loadSfPlacesIndex } from "@/lib/us/sf-places-data";
import { loadSfPayeesIndex } from "@/lib/us/sf-payees-data";
import { deptSlug } from "@/lib/us/sf-budget-slugs";
import { fmtUsdCompact } from "@/lib/us/format";

const nfInt = new Intl.NumberFormat("en-US");

/** Pass-through payees (bond trustees, pension custodians) dwarf the ledger but
 *  aren't the city spending on services — exclude them from the showcase so the
 *  "largest payee" is a real operational payment, not debt/payroll mechanics. */
const PASSTHROUGH_PAYEE_KINDS = new Set(["fiscal_agent_debt_service", "payroll_passthrough"]);

/** Operational payees, largest first — pass-throughs removed. */
function meaningfulPayees() {
  return loadSfPayeesIndex()
    .filter((p) => !PASSTHROUGH_PAYEE_KINDS.has(p.kind))
    .sort((a, b) => b.total_paid_usd - a.total_paid_usd);
}

/**
 * San Francisco peninsula silhouette — a coarse boundary (Point Lobos → Golden
 * Gate → the northern waterfront → Ferry Building → the Hunters Point /
 * Candlestick jut → the southern county line), fitted to a 200×140 viewBox.
 * Rendered at ~11% opacity, masked to the hero's lower-right corner: a sense
 * of place, the civic analogue to Paris's arrondissement silhouettes.
 */
const SF_OUTLINE =
  "M28.34,39.03 L29.23,19.88 L40.8,12 L60.38,12 L88.87,16.5 L112.02,15.38 " +
  "L126.26,15.38 L136.05,26.64 L142.29,35.65 L141.4,51.42 L140.51,62.68 " +
  "L150.3,85.2 L171.66,103.22 L160.98,117.86 L150.3,128 L94.21,128 " +
  "L46.14,125.75 L31.01,98.72 L33.68,69.44 Z";

/** "$2.9B" → { amount: "$2.9", unit: "B" }; leaves plain dollars whole. */
function splitCompact(usd: number): { amount: string; unit: string } {
  const s = fmtUsdCompact(usd);
  const m = s.match(/^(.*?)([TBMK])$/);
  return m ? { amount: m[1], unit: m[2] } : { amount: s, unit: "" };
}

/** Latest closed budget year and its total — the anchor for the scale act. */
function refBudget() {
  const by = loadSfBudgetByYear();
  const closed = by.sides.spending.points.filter((p) => p.execution_status === "closed");
  const ref = closed.reduce((a, b) => (b.fiscal_year > a.fiscal_year ? b : a));
  return { ref, population: by.population.value };
}

/** Top departments by executed spend for the latest year in the BvA export. */
function topDepts(n: number) {
  const f = readDataJson<{
    years: Record<
      string,
      { spending: Array<{ code: string; display_name: string; label: string; actual_usd: number }> }
    >;
  }>("us/sf/budget_vs_actual_departments.json");
  const years = Object.keys(f.years).sort();
  const rows = f.years[years[years.length - 1]].spending;
  return [...rows]
    .filter((r) => r.actual_usd > 0)
    .sort((a, b) => b.actual_usd - a.actual_usd)
    .slice(0, n);
}

export function buildSfLandingModel(): LandingModel {
  const { ref, population } = refBudget();
  const perMonth = Math.round((ref.per_resident_usd ?? 0) / 12);

  // ── Marquee: three honest strands, all hrefs derived from the live corpus ──
  const deptItems: MarqueeItem[] = topDepts(8).map((d) => ({
    href: `/us/city/sf/budget/dept/${deptSlug(d.code)}`,
    label: d.display_name || d.label,
    amount: fmtUsdCompact(d.actual_usd),
  }));

  const payeeItems: MarqueeItem[] = meaningfulPayees()
    .slice(0, 10)
    .map((p) => ({
      href: `/us/city/sf/who-gets-paid/payee/${p.slug}`,
      label: p.name,
      amount: fmtUsdCompact(p.total_paid_usd),
    }));

  const places = loadSfPlacesIndex();
  const placeItems: MarqueeItem[] = [...places]
    .sort((a, b) => b.n_documents + b.n_contracts - (a.n_documents + a.n_contracts))
    .slice(0, 8)
    .map((pl) => ({
      href: `/us/city/sf/places/place/${pl.slug}`,
      label: pl.name,
      amount:
        pl.n_documents > 0
          ? `${pl.n_documents} records`
          : `${pl.n_contracts} contracts`,
    }));

  const marquee = interleave([deptItems, payeeItems, placeItems]);

  // ── Deck: four civic subjects, each with a CC-licensed lead photo ──
  // (deck photos: pipeline/scripts/enrich/fetch_sf_landing_photos.py — Wikimedia
  //  Commons, free licences only; place photos come from the places export.)
  const landingCredits = readDataJson<Record<string, { author?: string }>>(
    "us/sf/landing/_photo_credits.json",
  );
  const placeCredits = readDataJson<Record<string, { author?: string }>>(
    "us/sf/places/_photo_credits.json",
  );
  const allDepts = topDepts(100);
  const deptByCode = (code: string) => allDepts.find((d) => d.code === code);

  const deck: DeckCard[] = [];

  const dph = deptByCode("DPH");
  if (dph) {
    const { amount, unit } = splitCompact(dph.actual_usd);
    deck.push({
      href: `/us/city/sf/budget/dept/${deptSlug(dph.code)}`,
      kicker: "Largest department",
      title: "Public Health",
      amount,
      amountUnit: unit,
      meta: `Executed spend · FY${ref.fiscal_year}`,
      cta: "See the department",
      photo: "/img/us/sf/landing/zsfg.jpg",
      photoCredit: landingCredits["zsfg"]?.author ?? null,
      photoAlt: "Zuckerberg San Francisco General Hospital",
    });
  }

  // Payroll — the citywide wage bill (a section, not a single entity).
  const payroll = readDataJson<{
    points: Array<{ fiscal_year: number; total_compensation_usd: number; n_employees: number }>;
  }>("us/sf/payroll_by_year.json");
  const pay = payroll.points[payroll.points.length - 1];
  {
    const { amount, unit } = splitCompact(pay.total_compensation_usd);
    deck.push({
      href: "/us/city/sf/payroll",
      kicker: "What city work pays",
      title: "The payroll",
      amount,
      amountUnit: unit,
      meta: `${nfInt.format(pay.n_employees)} people · FY${pay.fiscal_year}`,
      cta: "See the payroll",
      photo: "/img/us/sf/landing/city-hall.jpg",
      photoCredit: landingCredits["city-hall"]?.author ?? null,
      photoAlt: "San Francisco City Hall",
    });
  }

  const air = deptByCode("AIR");
  if (air) {
    const { amount, unit } = splitCompact(air.actual_usd);
    deck.push({
      href: `/us/city/sf/budget/dept/${deptSlug(air.code)}`,
      kicker: "The airport enterprise",
      title: "Airport · SFO",
      amount,
      amountUnit: unit,
      meta: `Executed spend · FY${ref.fiscal_year}`,
      cta: "See the department",
      photo: "/img/us/sf/landing/sfo.jpg",
      photoCredit: landingCredits["sfo"]?.author ?? null,
      photoAlt: "San Francisco International Airport from the air",
    });
  }

  const library = places.find((p) => p.slug === "sf-main-library");
  if (library) {
    deck.push({
      href: `/us/city/sf/places/place/${library.slug}`,
      kicker: "A place on the map",
      title: library.name,
      amount: nfInt.format(library.n_documents),
      amountUnit: "records",
      meta: `${library.kind} · archival record`,
      cta: "Open the place",
      photo: library.photo,
      photoCredit: library.photo ? placeCredits[library.slug]?.author ?? null : null,
      photoAlt: library.name,
    });
  }

  return {
    hero: {
      bg: { viewBox: "0 0 200 140", paths: [SF_OUTLINE] },
      headline: (
        <>
          San Francisco&rsquo;s public money,
          <br />
          <em>followed to the source</em>
        </>
      ),
    },
    deck,
    deckAriaLabel: "Featured departments, payees and places",
    marquee,
    marqueeAriaLabel: "Scrolling preview of departments, payees and places",
    scale: {
      value: nfInt.format(perMonth),
      unit: "$",
      unitLeading: true,
      per: "per resident, per month",
      delta: (
        <>
          out of <b>{fmtUsdCompact(ref.total_usd)}</b> the city spent in{" "}
          <b>FY{ref.fiscal_year}</b>
          <span className="fx-echelle-sep"> · </span>
          <b>{nfInt.format(population)}</b> residents (U.S. Census)
        </>
      ),
    },
    chips: {
      heading: (
        <>
          Explore the city, <em>section by section</em>.
        </>
      ),
      ariaLabel: "Explore San Francisco by section",
      items: [
        { href: "/us/city/sf/places", title: "Places", desc: "The city place by place — money and archival record for parks, libraries, hospitals and piers.", featured: true },
        { href: "/us/city/sf/budget", title: "Budget", desc: "Where the money goes, service by service — adopted vs executed, FY2010–2027." },
        { href: "/us/city/sf/who-gets-paid", title: "Payees", desc: "Every payment through the City's ledger, ranked and classified, to the voucher." },
        { href: "/us/city/sf/contracts", title: "Contracts", desc: "The active register with the sole-source lens and award-vs-paid on every contract." },
        { href: "/us/city/sf/payroll", title: "Payroll", desc: "What city work pays, and the overtime pattern in 24/7 services." },
        { href: "/us/city/sf/sources", title: "Sources & method", desc: "Every dataset behind these pages — perimeters, privacy rules and methodology." },
      ],
    },
  };
}

/** Round-robin merge of strands so the visible window always mixes angles. */
function interleave<T>(strands: T[][]): T[] {
  const queues = strands.map((s) => [...s]);
  const out: T[] = [];
  while (queues.some((q) => q.length > 0)) {
    for (const q of queues) {
      const next = q.shift();
      if (next) out.push(next);
    }
  }
  return out;
}
