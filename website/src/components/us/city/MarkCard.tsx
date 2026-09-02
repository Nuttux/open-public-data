"use client";
/* ═══════════════════════════════════════════════════════════════════════
   MarkCard — THE DOT'S OWN ANSWER, AND IT IS NOT A FICHE.

   A press on a subject mark asks a different question than a press on the
   city: "what is this mark", and the answer is that subject's records at
   that place, in the window on screen — nothing more, and none of the
   fiche. Both maps ask it (`CityGLMap` on the GPU, `CityTileMap` on tiles),
   so the answer is built and drawn here, once.

   `buildMarkCard` is the pure half: which of the block's rows are lit, one
   row per item, and what each row SAYS. The reasoning for every rule is in
   the comments below and was measured on the published shards; the card
   used to live inline in the GPU map and moved here unchanged.
   ═══════════════════════════════════════════════════════════════════════ */

import { THEME_INK, WINDOW_YEARS } from "@/lib/citygl/theme-ink";
import { useT } from "@/lib/localeContext";

import {
  blockPlaceName,
  isPrintableLine,
  loadBlockRecord,
  sourceHref,
  stripFileNumber,
  usdShort,
  type BlockDecision,
  type BlockIndex,
  type ClassifyFile,
} from "./block-records";

/** what a mark press carries, on either map */
export interface MarkHitLike {
  readonly bit: number;
  readonly block: number;
}

export interface MarkCardRow {
  readonly d: BlockDecision;
  /** the plain-English subject this line matched, if any */
  readonly says: string | null;
}

export interface MarkCardData {
  hit: MarkHitLike;
  label: string;
  ink: string;
  place: string;
  rows: readonly MarkCardRow[];
  year: number;
}

/* ── ONE ITEM IS ONE ROW, AND A FRAGMENT IS NOT AN ITEM ────────────────────
   The card was listing every row the filter admitted, and a good number of
   them are continuation fragments of the item above: "Fiscal Impact)
   09/05/23; RECEIVED AND ASSIGNED to…", "As defined herein; and authorizing
   the Director of MOHCD…". Measured over the lit rows: 10% are shorter than
   a readable line and 7% carry no classification at all. `isPrintableLine`
   is the fiche's own test for exactly this. A row is dropped only when it
   fails that AND has no headline either.

   A line that opens lower-case, or with one of these words, is the tail of
   the one before it. 72 rows, 0.4%. `The`, `To`, `For`, `Of` and `In` were
   in the list and came out: "The sum of $2000 be and the same is hereby set
   aside" opens a real appropriation. */
const CONTINUES =
  /^[^A-Za-z0-9]*(?:[a-z]|(?:And|As|Or|But|With|Said|Which|Thence|Including|Provided|Together)\b)/;

/* `city` and `own` are stopwords because "The city buys land" and "Changing
   the city's own rules" are real answers that must survive under any card */
const STOP = new Set(["and", "the", "of", "a", "on", "in", "to", "for", "its", "city", "own"]);
const keyWords = (x: string): Set<string> =>
  new Set((x.toLowerCase().match(/[a-z]+/g) ?? []).filter((w) => w.length > 2 && !STOP.has(w)));
const shareAWord = (a: string, b: string): boolean => {
  const y = keyWords(b);
  for (const w of keyWords(a)) if (y.has(w)) return true;
  return false;
};

/**
 * The card for a mark, or null when the window holds nothing readable.
 *
 * `year` is the SETTLED year the marks stand on; `classify` is the
 * subject/action vocabulary (`loadClassify`), null when it failed to load —
 * rows then carry their line and no heading.
 */
export async function buildMarkCard(
  hit: MarkHitLike,
  o: {
    index: BlockIndex;
    themes: readonly { bit: number; label: string }[];
    year: number;
    classify: ClassifyFile | null;
  },
): Promise<MarkCardData | null> {
  const th = o.themes.find((x) => x.bit === hit.bit);
  const rec = await loadBlockRecord(o.index, hit.block);
  if (!rec) return null;
  const half = WINDOW_YEARS / 2;
  const inWindow = rec.decisions.filter(
    (d) =>
      Math.floor((d.m ?? 0) / 2 ** hit.bit) % 2 === 1 &&
      d.y >= o.year - half && d.y <= o.year + half,
  );
  /* one row per page, the one with the most readable line */
  const best = new Map<string, BlockDecision>();
  for (const d of inWindow) {
    if (d.cs === undefined && (!isPrintableLine(d.t) || CONTINUES.test(d.t.trim()))) continue;
    const had = best.get(d.u);
    if (!had) { best.set(d.u, d); continue; }
    const score = (x: BlockDecision) => (isPrintableLine(x.t) ? 1e6 : 0) + x.t.length;
    if (score(d) > score(had)) best.set(d.u, d);
  }
  const rows = [...best.values()].sort((a, b) => b.y - a.y);
  if (!rows.length) return null;

  /* ── WHAT A ROW SAYS ─────────────────────────────────────────────────────
     `cs` and `ca` are joined in the pipeline from the classification, read
     against the item's FULL text — a statement about the record, "Parking ·
     Ordered", which is what a heading has to be. The card already names the
     subject, so a row whose subject repeats it spends its line on the verb
     alone; sharing a word is the test ("Housing" under "Homelessness &
     shelter" collapses, and nothing is lost). A row whose line came from the
     Board's printed page heading (`g === "h"`) keeps its line and loses the
     heading: a heading is printed once for a PAGE and can belong to another
     item on it — 8.3% of lit rows, measured. */
  const cf = o.classify;
  const says = (d: BlockDecision): string | null => {
    if (d.g === "h") return null;
    if (!cf || d.cs === undefined) return null;
    const sub = cf.sub[d.cs];
    if (!sub) return null;
    const act = d.ca === undefined ? null : cf.act[d.ca];
    if (shareAWord(sub, th?.label ?? "")) return act;
    return act ? `${sub} · ${act}` : sub;
  };
  return {
    hit,
    label: th?.label ?? "",
    ink: THEME_INK[hit.bit % THEME_INK.length],
    place: blockPlaceName(rec.streets) ?? o.index.b[hit.block] ?? "",
    rows: rows.map((d) => ({ d, says: says(d) })),
    year: o.year,
  };
}

function tOr(t: (k: string) => string, k: string, en: string): string {
  const v = t(k);
  return v === k ? en : v;
}

export default function MarkCard({ card, onClose }: { card: MarkCardData; onClose: () => void }) {
  const t = useT();
  return (
    <section className="fx-mark-card">
      <header className="fx-mark-card-h">
        <span className="fx-mark-card-dot" style={{ background: card.ink }} aria-hidden />
        <h3>{card.label}</h3>
        <button
          type="button"
          className="fx-mark-card-x"
          onClick={onClose}
          aria-label={tOr(t, "us.sf.thecity.mark.close", "Close")}
        >
          ×
        </button>
      </header>
      {/* the window, in the record list's own caption; the streets are not
          repeated — they are under the dot */}
      <p className="fx-city-record-cap" style={{ margin: "0 0 6px" }}>
        {tOr(t, "us.sf.thecity.mark.window", "{a}–{b}")
          .replace("{a}", String(card.year - WINDOW_YEARS / 2))
          .replace("{b}", String(card.year + WINDOW_YEARS / 2))}
      </p>
      <div className="fx-city-record-list fx-mark-card-rows">
        {card.rows.map(({ d, says }) => (
          <span className="fx-city-record-line" key={`${d.u}-${d.y}-${d.t.slice(0, 20)}`}>
            <a
              className="fx-city-record-row"
              href={sourceHref(d)}
              target="_blank"
              rel="noopener noreferrer"
              title={stripFileNumber(d.t)}
            >
              <span className="fx-city-record-dot" style={{ background: card.ink }} />
              <span className="fx-city-record-text">
                <span className="fx-city-record-tag">
                  {d.y}
                  {/* one sum to a row: where the line already prints a figure
                      it carries the money */}
                  {d.a > 0 && !(d.pl && /[$£€]/.test(d.pl)) ? ` · ${usdShort(d.a)}` : ""}
                  {!d.pl && says ? ` · ${says}` : ""}
                </span>
                {d.pl || stripFileNumber(d.t)}
              </span>
              <span className="fx-city-record-n">↗</span>
            </a>
          </span>
        ))}
      </div>
    </section>
  );
}
