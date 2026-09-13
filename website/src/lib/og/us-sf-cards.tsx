import { shareCard } from "@/lib/og/card";
import { themeFor, themeImage, localPhotoDataUri } from "@/lib/og/theme-image";
import { ogFmtUsd, ogFmtEn } from "@/lib/og";
import { loadSfPlacesIndex, loadSfPlace } from "@/lib/us/sf-places-data";
import { loadSfPayee } from "@/lib/us/sf-payees-data";
import { loadSfContractFiche } from "@/app/[lang]/usa/san-francisco/contracts/data";
import {
  blockLead,
  stripFileNumber,
  stripTruncation,
  SERIES_LAST_YEAR,
  type BlockDecision,
  type BlockIndex,
} from "@/components/us/city/block-records";

/**
 * San Francisco share cards.
 *
 * Until these existed only /us had an opengraph-image, so every SF entity
 * shared the site-wide card — the same grey rectangle whatever you linked.
 *
 * English throughout: a shared SF link should read as an SF artifact, not as a
 * French site's page about SF.
 */

const SOURCE = "DataSF";

/** A share card must never 500 — a failed card means the shared link renders
 *  nothing at all. Any loader that throws (the exports use both a throwing and
 *  a nullable reader) degrades to a plainer card instead. */
function safe<T>(load: () => T): T | null {
  try {
    return load();
  } catch {
    return null;
  }
}


export function renderSfPlaceOg(slug: string) {
  // Counts live on the index entry; the photo lives on the fiche.
  const row = safe(() => loadSfPlacesIndex().find((r) => r.slug === slug)) ?? undefined;
  const fiche = safe(() => loadSfPlace(slug));
  const name = row?.name ?? fiche?.name ?? "San Francisco";

  // funds_usd is 0 for plenty of places (no contract payments recorded). Lead
  // with the archive there rather than print "$0", which reads as a finding.
  const figure = row?.funds_usd
    ? { label: "Contract dollars", value: ogFmtUsd(row.funds_usd), qualifier: "paid to vendors for work at this place" }
    : row?.n_documents
      ? { label: "Archive documents", value: ogFmtEn(row.n_documents), qualifier: "held at the Internet Archive" }
      : null;

  const own = localPhotoDataUri(fiche?.photo);
  const borrowed = own
    ? null
    : themeImage(themeFor(row?.kind, fiche?.family, fiche?.owning_dept?.name), "sf", "en");

  return shareCard({
    route: "/places",
    kicker: [row?.kind, "San Francisco"].filter(Boolean).join(" · "),
    title: name,
    figure,
    image: own ?? borrowed?.src ?? null,
    imageCaption: borrowed?.caption ?? null,
    source: fiche?.photo ? `${SOURCE} · Internet Archive` : SOURCE,
    url: `qipu.org/us/city/sf/places/place/${slug}`,
  });
}

export function renderSfPayeeOg(slug: string) {
  const payee = safe(() => loadSfPayee(slug));
  const name = payee?.name ?? "City payee";

  const years =
    payee?.first_year && payee?.last_year ? `across ${payee.first_year}–${payee.last_year}` : "";
  const dept = payee?.top_departments?.[0];

  const bars = Object.entries(payee?.by_year ?? {})
    .sort(([a], [b]) => Number(a) - Number(b))
    .slice(-8)
    .map(([y, v]) => ({ label: String(y).slice(-2), v: Number(v) || 0 }));

  const borrowed = themeImage(themeFor(dept, payee?.kind), "sf", "en");

  return shareCard({
    route: "/who-gets-paid",
    kicker: "Paid by the City · San Francisco",
    title: name,
    figure: payee?.total_paid_usd
      ? {
          label: "Total paid",
          value: ogFmtUsd(payee.total_paid_usd),
          qualifier: [years, dept].filter(Boolean).join(", "),
        }
      : null,
    image: borrowed?.src ?? null,
    imageCaption: borrowed?.caption ?? null,
    bars,
    source: SOURCE,
    url: `qipu.org/us/city/sf/who-gets-paid/payee/${slug}`,
  });
}

export function renderSfContractOg(contractNo: string) {
  const fiche = safe(() => loadSfContractFiche(contractNo));
  const c = fiche?.contract;

  // Prefer the plain-English relabel from the vulgarisation layer; the raw
  // register title is procurement boilerplate.
  const title = c?.title_clear ?? c?.title_plain ?? c?.title ?? `Contract ${contractNo}`;

  const borrowed = themeImage(themeFor(c?.department, c?.contract_type), "sf", "en");

  return shareCard({
    route: "/contracts",
    kicker: [c?.department, `Contract ${contractNo}`].filter(Boolean).join(" · "),
    title,
    figure: c?.agreed_usd
      ? {
          label: "Agreed",
          value: ogFmtUsd(c.agreed_usd),
          qualifier: c.paid_usd ? `${ogFmtUsd(c.paid_usd)} paid to date` : undefined,
        }
      : null,
    image: borrowed?.src ?? null,
    imageCaption: borrowed?.caption ?? null,
    source: SOURCE,
    url: `qipu.org/us/city/sf/contracts/contract/${contractNo}`,
  });
}

/** One JSON file off the site's own static assets, or null. A share card that
 *  cannot reach a file degrades to a card with no figure; it never 500s. */
async function getJson<T>(url: string): Promise<T | null> {
  try {
    const r = await fetch(url);
    return r.ok ? ((await r.json()) as T) : null;
  } catch {
    return null;
  }
}

/**
 * THE QUOTATION HAS TO CLOSE.
 *
 * `shareCard` sets `WebkitLineClamp: 3` on the title, and **satori — what
 * `next/og` renders with — does not implement it.** So the Board's longest
 * sentences ran off the bottom of the card, opening with a quotation mark and
 * never closing: block 3752's lead reached *"…for the purpose of providing
 * financing for the construction"* and simply stopped, which reads as a broken
 * card rather than as a quotation.
 *
 * Cut here instead, on a word, with our own ellipsis INSIDE the closing mark —
 * the same convention `build_index.rec()` uses in the record itself, and the
 * same one `stripTruncation` exists to undo. 132 characters is three lines at
 * the size `shareCard` picks for a title this long.
 */
const CARD_QUOTE_CHARS = 132;

function quoteForCard(raw: string): string {
  const line = stripTruncation(stripFileNumber(raw));
  if (line.length <= CARD_QUOTE_CHARS) return line;
  const cut = line.slice(0, CARD_QUOTE_CHARS);
  const sp = cut.lastIndexOf(" ");
  return `${(sp > 60 ? cut.slice(0, sp) : cut).replace(/[,;:.\s]+$/, "")}…`;
}

/**
 * ── THE BLOCK SHARE CARD ─────────────────────────────────────────────────
 *
 * `/usa/san-francisco/the-city?block=3752`. Every link to a block used to preview as
 * the site-wide card, so a link to one block on the map and a link to the map
 * itself looked identical — which is most of the reason a block is worth
 * sharing and none of it survived the paste.
 *
 * **THE TITLE IS THE BOARD'S OWN SENTENCE, IN QUOTATION MARKS.** It is the one
 * thing this surface has that nothing else does, and it is what made the film
 * work. `blockLead` chooses it — the SAME function the panel's lead uses, so
 * the card can never show a line the page itself demoted. That is why the
 * speaker-list and roll-call gates had to land before this did.
 *
 * The decade counts are drawn as bars, which is the rail the panel draws, in
 * the one device `shareCard` already has for a series.
 */
export async function renderSfBlockOg(id: string, origin: string) {
  /* ── FETCHED, NOT READ OFF DISK, AND THAT IS NOT A STYLE CHOICE ────────
     This card is a route handler under `/api/`, and `next.config.ts` excludes
     `./public/data/us/sf/city/**` from every `/api/**` function — 12.5 MB of
     map tiers have no business in a share-card bundle. A `readFileSync` here
     works in dev, where the real filesystem is under the server, and returns
     500 in production, where the file was never packed. The BR cards learned
     this the same way.

     So the card reads the two files the way the BROWSER reads them: over HTTP,
     from the same origin, off the static asset the map already serves. No
     tracing rule to keep in step with, and nothing to exclude. */
  const idx = await getJson<BlockIndex>(`${origin}/data/us/sf/city/blocks/block-index.json`);
  const i = idx ? idx.b.indexOf(id) : -1;
  const entry =
    idx && i >= 0
      ? (
          await getJson<Record<string, { d?: BlockDecision[]; s?: string[] }>>(
            `${origin}/data/us/sf/city/blocks/block-${String(i % idx.meta.shards).padStart(2, "0")}.json`,
          )
        )?.[id]
      : undefined;
  const rows = entry?.d ?? [];

  /* ── A SHARE CARD NAMES A PLACE, NOT OUR FILING SYSTEM ─────────────────
     The kicker read "Block 1595 · San Francisco". An assessor block number is
     how the CITY files its parcels and how this pipeline joins them; it is not
     how anybody says where they are. Pasted into a chat it tells the reader
     nothing and reads as a database key escaping into public.

     The block already carries the streets it fronts, so the card can say
     "California Street · San Francisco" — the level a person would use out
     loud. The block number stays in the URL, where it belongs. */
  const fronts = (entry?.s ?? [])
    .map((s) => s.split("|"))
    .map(([name, kind]) =>
      [name, kind]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .replace(/\b[a-z]/g, (c) => c.toUpperCase())
        .replace(/\bSt\b/, "Street")
        .replace(/\bAve\b/, "Avenue")
        .replace(/\bBlvd\b/, "Boulevard"),
    )
    .filter(Boolean);
  const placeName = fronts.length ? fronts.slice(0, 2).join(" at ") : "";
  const lead = rows.length ? blockLead(rows) : null;

  /* THE SPAN IS CLAMPED THE WAY THE PAGE CLAMPS IT. `y1` is 2025 on block
     3752 while the page prints 1906–2016, because the Board's scanned series
     ends at SERIES_LAST_YEAR. A card is read beside the page it links to and
     may not out-claim it. */
  const y0 = idx && i >= 0 ? idx.y0[i] : 0;
  const y1 = idx && i >= 0 ? Math.min(idx.y1[i], SERIES_LAST_YEAR) : 0;
  const n = idx && i >= 0 ? idx.n[i] : 0;
  const ns = idx && i >= 0 ? idx.ns[i] : 0;
  const span = y0 && y1 ? `${y0}–${y1}` : "";

  /* ── A BLOCK WITH NOTHING STILL HAS TO SAY SOMETHING ──────────────────
     633 of the 5,404 blocks carry no decision of their own, and the first
     card for one of them was a title and 500 px of empty paper. Silence on a
     share card reads as a broken renderer, not as a finding.

     MEASURED off the shipped index, because the two silences are different
     and a reader is owed the difference: 335 of those 633 carry a record on
     the streets they front and 298 carry nothing at all. */
  /* ── AND THE REST OF THE CARD STOPS SAYING "BLOCK" TOO ─────────────────
     The kicker was fixed to name a street and every other line still read
     "Decisions on this block" — the same jargon, one line down. An assessor
     block is our filing unit, not a place a person stands in. The card names
     the street above; here it just says "here". */
  const emptyFigure =
    ns > 0
      ? {
          label: "Nothing recorded here",
          value: ogFmtEn(ns),
          qualifier: "decisions on the streets around it, none on the ground itself",
        }
      : {
          label: "Decisions here",
          /* NOT an em dash. At the figure's 96 px the display face draws it as
             a long black rule, and a redaction bar is the last thing this
             card may look like. */
          value: "None",
          qualifier: "the record places nothing here, nor on the streets around it",
        };

  const bars = Object.entries(
    rows.reduce<Record<number, number>>((acc, r) => {
      if (r.y) acc[Math.floor(r.y / 10) * 10] = (acc[Math.floor(r.y / 10) * 10] ?? 0) + 1;
      return acc;
    }, {}),
  )
    .sort(([a], [b]) => Number(a) - Number(b))
    .map(([d, v]) => ({ label: `'${String(d).slice(-2)}`, v }));

  return shareCard({
    route: "/the-city",
    kicker: [placeName || null, "San Francisco"].filter(Boolean).join(" · "),
    // No line means a block the record says nothing about — 308 of 5,404. The
    // card says so plainly rather than printing an empty quotation.
    // ── OUR SENTENCE GOES UNQUOTED; THE CLERK'S KEEPS ITS MARKS ────────
    // This card is what a link to a block looks like when it is pasted
    // somewhere, so it is the version most people will ever read — and the
    // Clerk's line cut to 132 characters is the worst case for legibility.
    // Where a written line exists it leads, WITHOUT quotation marks, because
    // the words are ours; where none does, the Board's own line is quoted
    // exactly as before. The same rule the fiche and the map card keep.
    title: lead
      ? (lead.pl ? lead.pl : `“${quoteForCard(lead.t)}”`)
      : placeName || "San Francisco",
    figure: n
      ? {
          label: "Decisions here",
          value: ogFmtEn(n),
          qualifier: span ? `${span}, each linked to the page of the scan` : undefined,
        }
      : emptyFigure,
    bars: bars.length > 1 ? bars : null,
    /* The corpus is cited even where it yielded nothing — the absence IS a
       result of searching it — but only the blocks that quote it claim the
       scans. */
    source: lead ? "Journal of Proceedings · Internet Archive" : "Journal of Proceedings, 1906–2016",
    url: `qipu.org/us/city/sf/the-city?block=${id}`,
  });
}
