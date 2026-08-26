import type { LandingModel, DeckCard, MarqueeItem } from "@/components/landing/types";
import PlaceSwitcher from "@/components/PlaceSwitcher";
import { readDataJson, readDataJsonOrNull } from "@/lib/data/read";
import { loadSfBudgetByYear } from "@/lib/us/sf-budget-data";
import { loadSfPlace, loadSfPlacesIndex, placeForContract } from "@/lib/us/sf-places-data";
import { loadSfPayee, loadSfPayeesIndex, type SfPayeeIndexEntry } from "@/lib/us/sf-payees-data";
import { deptSlug } from "@/lib/us/sf-budget-slugs";
import { fmtUsdCompact } from "@/lib/us/format";
import { landingClosing } from "@/lib/landing-closing";

const nfInt = new Intl.NumberFormat("en-US");

/**
 * Curated deck subjects — one per register (place / recipient / contract /
 * department), the SF twin of Paris's HERO_FEATURED_* constants. Only the
 * CHOICE of subject lives here; every number, date and photo on the cards is
 * read from the corpus, and a card that fails to resolve is simply not shown.
 * The recipient is not named: it is picked by rank (see topOperationalPayees).
 */
const DECK_PLACE_SLUG = "sf-main-library";
const DECK_DEPT_CODE = "AIR";

/** Pass-through payees (bond trustees, pension custodians) dwarf the ledger but
 *  aren't the city spending on services — exclude them from the showcase so the
 *  "largest payee" is a real operational payment, not debt/payroll mechanics. */
const PASSTHROUGH_PAYEE_KINDS = new Set(["fiscal_agent_debt_service", "payroll_passthrough"]);

/**
 * True when most of what a payee received is coded as something the City
 * BOUGHT, on the payee's own voucher lines (stg_us_sf_subobject_class).
 *
 * The second half of the same guard as PASSTHROUGH_PAYEE_KINDS. The ledger's
 * two largest recipients are health-plan carriers whose dollars are coded
 * `obligation` — employee coverage, not a purchase — and the payee fiche says
 * so, in words, with hollow bars. A landing card has no room for that
 * qualification, so it would state the opposite of what its own destination
 * page carefully explains. Ranking every recipient, obligations included, is
 * /who-gets-paid's job; the landing showcases purchases.
 *
 * Unclassified (no profile, no categorised dollars) stays in: this hides what
 * the source calls not-a-purchase, never what it simply doesn't describe.
 */
function isPurchaseMajority(slug: string): boolean {
  const cats = loadSfPayee(slug)?.profile?.categories ?? [];
  const total = cats.reduce((s, c) => s + c.usd, 0);
  if (total <= 0) return true;
  const purchase = cats.filter((c) => c.spend_class === "purchase").reduce((s, c) => s + c.usd, 0);
  return purchase / total >= 0.5;
}

/** The n biggest operational recipients, largest first. Walks the ranking and
 *  tests payees one at a time, so a full landing costs a dozen fiche reads. */
function topOperationalPayees(n: number): SfPayeeIndexEntry[] {
  const ranked = loadSfPayeesIndex()
    .filter((p) => !PASSTHROUGH_PAYEE_KINDS.has(p.kind))
    .sort((a, b) => b.total_paid_usd - a.total_paid_usd);
  const out: SfPayeeIndexEntry[] = [];
  for (const p of ranked) {
    if (out.length >= n) break;
    if (isPurchaseMajority(p.slug)) out.push(p);
  }
  return out;
}

/**
 * "DPH Public Health" → "Public Health"; "ADM GSA - City Administrator" →
 * "City Administrator". The source prefixes a department's name with its own
 * code, and sometimes with the agency it sits under; the code is the identity,
 * not the label, and a card has no room for either.
 */
function deptLabel(raw: string): string {
  const noCode = raw.replace(/^[A-Z]{2,4}\s+/, "").trim();
  const parts = noCode.split(" - ");
  return (parts[parts.length - 1] || noCode || raw).trim();
}

/**
 * Card-length names. The deck's title box is two lines by design — it is what
 * keeps the big numbers aligned across the row — so a subject whose registered
 * name cannot fit gets its common short form here, and only here. Nothing is
 * renamed: the fiche this card opens shows the register's own spelling in
 * full. Paris does the same, through i18n.
 */
const DECK_SHORT_NAMES: Record<string, string> = {
  "regents-of-the-university-of-california": "University of California",
};

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

/**
 * "$2.9B" → { amount: "$2.9", unit: "B" }; leaves plain dollars whole.
 *
 * Three-digit magnitudes lose their decimal ("$360.6M" → "$361M"). At the deck
 * number's size that tenth is noise, and six glyphs where the other cards have
 * four is enough to widen the card's column — the exact figure is on the fiche
 * the card opens.
 */
function splitCompact(usd: number): { amount: string; unit: string } {
  const s = fmtUsdCompact(usd);
  const m = s.match(/^(.*?)([TBMK])$/);
  if (!m) return { amount: s, unit: "" };
  const amount = m[1].replace(/\d{3,}\.\d+$/, (n) => String(Math.round(Number(n))));
  return { amount, unit: m[2] };
}

/** Latest closed budget year and its total — the anchor for the scale act. */
function refBudget() {
  const by = loadSfBudgetByYear();
  const closed = by.sides.spending.points.filter((p) => p.execution_status === "closed");
  const ref = closed.reduce((a, b) => (b.fiscal_year > a.fiscal_year ? b : a));
  return { ref, population: by.population.value };
}

/** The few fields of a contracts_active row the deck card needs. `title_clear`
 *  is the plain-English layer (the register carries no description field). */
type ActiveContractRow = {
  contract_no: string;
  title: string;
  title_plain?: string | null;
  title_clear?: string | null;
  department?: string | null;
  paid_usd: number;
  start?: string | null;
  src_arithmetic_consistent?: boolean;
};

/** A photo credit as the enrichment writes it. `license_verified` is the gate:
 *  a place photo resolved by web search sits in the export as provisional with
 *  an UNVERIFIED licence, and that is fine on a fiche behind its own credit
 *  line — it is not fine as a lead image on the front page. */
type PhotoCredit = {
  author?: string;
  license_verified?: boolean;
  provisional?: boolean;
};

/**
 * The one contract the deck shows: the most money paid, among contracts that
 * can be shown honestly at this size — the source reconciles their paid and
 * agreed amounts, the vulgarisation layer gave them a plain-English title
 * (the register's own is a code like "PUC SEWPCP NEW HEADWORKS FCLTY"), they
 * sit at a place with a free, licence-verified photo, and they have a fiche to
 * open. An argmax under stated conditions, not a hand-picked contract, so the
 * card follows the data and can never point at a dead page.
 */
function deckContract(placePhoto: (slug: string) => string | null): {
  row: ActiveContractRow;
  place: ReturnType<typeof placeForContract>;
} | null {
  const rows =
    readDataJsonOrNull<{ rows: ActiveContractRow[] }>("us/sf/contracts_active.json")?.rows ?? [];
  const eligible = rows
    .filter((r) => r.paid_usd > 0 && r.src_arithmetic_consistent && (r.title_clear ?? "").trim())
    .sort((a, b) => b.paid_usd - a.paid_usd);
  for (const row of eligible) {
    const place = placeForContract(row.contract_no);
    if (!place || !placePhoto(place.slug)) continue;
    // Last, because it touches the filesystem: no fiche, no card.
    if (!readDataJsonOrNull<unknown>(`us/sf/contracts/fiche/${row.contract_no}.json`)) continue;
    return { row, place };
  }
  return null;
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

  const payeeItems: MarqueeItem[] = topOperationalPayees(10)
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
  const landingCredits = readDataJson<Record<string, PhotoCredit>>(
    "enrichment/us_sf_landing/_photo_credits.json",
  );
  const placeCredits = readDataJson<Record<string, PhotoCredit>>(
    "enrichment/us_sf_places/_photo_credits.json",
  );
  /** A place's lead photo, but only with a verified free licence — otherwise
   *  no photo, and the card falls back to its plain variant. */
  const placePhoto = (slug: string): string | null => {
    const credit = placeCredits[slug];
    if (!credit?.license_verified || credit.provisional) return null;
    return loadSfPlacesIndex().find((p) => p.slug === slug)?.photo ?? null;
  };
  const allDepts = topDepts(100);
  const deptByCode = (code: string) => allDepts.find((d) => d.code === code);

  // Deck — four concrete entities, one per register (place / recipient /
  // contract / department), a place first, like Paris and Recife. No register
  // appears twice: the deck is a tour of what the site holds, not a ranking.
  // Numbers all read from the corpus; a card renders only if its entity loads.
  const deck: DeckCard[] = [];

  // 1 · A place — led by its archive. The money is real but small next to a
  //     department's; what makes this place worth the first card is that the
  //     City's paper record of it is here, digitised, and linked line by line.
  const library = places.find((p) => p.slug === DECK_PLACE_SLUG);
  const libraryDocs = library ? loadSfPlace(library.slug)?.documents ?? [] : [];
  const oldestDoc = libraryDocs
    .map((d) => d.year)
    .filter((y): y is number => typeof y === "number")
    .sort((a, b) => a - b)[0];
  if (library) {
    const { amount, unit } = splitCompact(library.funds_usd);
    const archive =
      library.n_documents > 0
        ? `${library.n_documents} archival records${oldestDoc ? `, back to ${oldestDoc}` : ""}`
        : library.kind;
    deck.push({
      href: `/us/city/sf/places/place/${library.slug}`,
      kicker: "A place, and its archive",
      title: library.name,
      amount,
      amountUnit: unit,
      meta: `Paid to vendors here · ${archive}`,
      cta: "Open the place",
      photo: placePhoto(library.slug),
      photoCredit: placePhoto(library.slug) ? placeCredits[library.slug]?.author ?? null : null,
      photoAlt: library.name,
    });
  }

  // 2 · A recipient — the biggest one the City actually BUYS from (see
  //     isPurchaseMajority). Photographed by the hospital where it holds
  //     contracts, not by a civic building it has nothing to do with.
  const payee = topOperationalPayees(1)[0];
  const payeeFiche = payee ? loadSfPayee(payee.slug) : null;
  if (payee) {
    const { amount, unit } = splitCompact(payee.total_paid_usd);
    // The department that paid the most of it — read as an argmax, not as
    // "the first row", so the card never depends on the export's ordering.
    const payer = (payeeFiche?.profile?.departments ?? []).reduce<
      { department: string; usd: number } | null
    >((best, d) => (best && best.usd >= d.usd ? best : d), null)?.department;
    const since = payeeFiche?.first_year;
    deck.push({
      href: `/us/city/sf/who-gets-paid/payee/${payee.slug}`,
      kicker: "Largest service provider",
      title: DECK_SHORT_NAMES[payee.slug] ?? payee.name,
      amount,
      amountUnit: unit,
      meta: [payer ? `Paid by ${deptLabel(payer)}` : "Paid by the City", since ? `since FY${since}` : null]
        .filter(Boolean)
        .join(" · "),
      cta: "See the recipient",
      photo: "/img/us/sf/landing/zsfg.jpg",
      photoCredit: landingCredits["zsfg"]?.author ?? null,
      photoAlt: "Zuckerberg San Francisco General Hospital",
    });
  }

  // 3 · A contract — in the plain-English words of the vulgarisation layer,
  //     photographed by the place it pays for.
  const picked = deckContract(placePhoto);
  if (picked?.place) {
    const { row, place } = picked;
    const { amount, unit } = splitCompact(row.paid_usd);
    const startYear = row.start ? row.start.slice(0, 4) : null;
    deck.push({
      href: `/us/city/sf/contracts/contract/${row.contract_no}`,
      kicker: "A public contract",
      title: row.title_clear || row.title_plain || row.title,
      amount,
      amountUnit: unit,
      meta: [
        "Paid to date",
        row.department ? deptLabel(row.department) : null,
        startYear ? `since ${startYear}` : null,
      ]
        .filter(Boolean)
        .join(" · "),
      cta: "See the contract",
      photo: placePhoto(place.slug),
      photoCredit: placeCredits[place.slug]?.author ?? null,
      photoAlt: place.name,
    });
  }

  // 4 · A department — the airport, which the City runs as a business and
  //     which no other card would surface.
  const air = deptByCode(DECK_DEPT_CODE);
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

  return {
    hero: {
      bg: { viewBox: "0 0 200 140", paths: [SF_OUTLINE] },
      headline: (
        <>
          Where does <em>public money</em>
          <br />
          go in <PlaceSwitcher variant="h1" currentSlug="sf" />?
        </>
      ),
    },
    deck,
    deckAriaLabel: "Featured place, recipient, contract and department",
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
          Explore <em>every section</em>.
        </>
      ),
      ariaLabel: "Explore San Francisco by section",
      items: [
        { href: "/us/city/sf/places", title: "Places", desc: "Parks, libraries, hospitals, piers: money and archival record.", featured: true },
        { href: "/us/city/sf/budget", title: "Budget", desc: "Revenue and spending, by service area or by type." },
        { href: "/us/city/sf/who-gets-paid", title: "Payees", desc: "Every payment in the City's ledger." },
        { href: "/us/city/sf/contracts", title: "Contracts", desc: "The active register — sole-source lens, award vs paid." },
        { href: "/us/city/sf/payroll", title: "Payroll", desc: "What city work pays, and the overtime pattern." },
        { href: "/us/city/sf/sources", title: "Sources & method", desc: "Every dataset — perimeters, privacy, method." },
      ],
    },
    closing: landingClosing("en"),
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
