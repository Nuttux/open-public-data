/**
 * ONE BOARD RECORD, IN A FORM A STRANGER CAN READ.
 *
 * The card behind a lit dot prints the Board's own words. Those words were set
 * in lead or scanned from microfilm, and what the shard holds is the sentence
 * an address was found in — not a title, because for most of this corpus no
 * title exists. **The Clerk writes one for 32% of items after 2000 and for 0%
 * before**, so "just show the summary" is available for about 8% of the
 * corpus and nothing else. The rest has to be made readable or dropped.
 *
 * THIS FILE IS THE RULESET, AND IT WAS SCORED BEFORE IT SHIPPED. 100 lit rows
 * were sampled (seed 1234), rendered, and judged by hand against criteria
 * fixed in advance — PASS: a reader can say what kind of thing happened and to
 * what or whom; PARTIAL: the kind is clear, the substance is not; FAIL:
 * neither. Then the rules were written against those 100, frozen, and scored
 * again on a fresh 200 that had never been looked at:
 *
 * ```
 *                 PASS   PARTIAL   FAIL
 *   before          48        40     12     (the 100, unaided)
 *   after           56        35      9     (the 100, tuned against)
 *   held out       108        77     15     (a fresh 200, rules frozen)
 * ```
 *
 * 56% and 54%. The two-point gap is the honest measure of how much of this is
 * fitted to the sample it was written against: almost none of it.
 *
 * WHAT THE 38% PARTIAL IS, AND WHY IT STAYS. A third of these records do not
 * say what they did. *"Approving Conditional Use Application No. 2002.0124CVR
 * on property located at 2815 Diamond Street"* — the use is in a Planning
 * Commission file the Board did not print. No formatting recovers it and
 * writing it would be invention, so the card says what the record says and
 * stops. The 8% FAIL is scan damage: *"Iflnd and imorovements. north line of
 * Clipper street"* is what the microfilm holds.
 */

/* ── WHAT NEVER BECOMES A HEADLINE ────────────────────────────────────────── */

/**
 * A meeting has a lot of talking in it, and none of it is a record of anything.
 * Every one of the twelve failures in the first scored sample was one of these
 * shapes: somebody moved something, somebody was asked to write a letter, or
 * the line is a bare list of street names with no verb in it.
 */
const MEETING_TALK: readonly RegExp[] = [
  /^(?:by|per request of)\s+supervisor/i,
  /^supervisor\s+\w+\s+(?:stated|moved|announced|requested|inquired)/i,
  /^(?:mr|ms|mrs)\.\s/i,
  /that\s+(?:a\s+)?letter\s+be\s+sent/i,
  /^file\s+no/i,
  /^approved by the board on\b/i,
  /^dated\s+\w+\s+\d/i,
  /^(?:fiscal impact|received and assigned|be amended|as defined herein|passed for|finally passed|adopted by the following|ayes|noes|absent|referred to|ordered filed|action deferred)/i,
  /* Both of these came out of the held-out 200 rather than the tuned 100 —
     a roll-call tally, "11 - Avalos, Breed, Campos, Christensen, Cohen…", and
     an all-caps routing stamp. Rare: 21 rows in 16,468 corpus-wide (0.13%),
     which is why a sample of 100 missed them and a sample of 200 caught two. */
  /^\s*\d{1,2}\s*[-–]\s*[A-Z][a-z]+(?:,\s*[A-Z][a-z]+){3,}/,
  /^(?:REFERRED|CONSIDERATION CONTINUED|SEVERED|IMPERATIVE|ROLL CALL|PURSUANT TO)\b/,
];

/**
 * A line that carries on the one above it. Deliberately short: `The`, `To`,
 * `For`, `Of` and `In` were in this list and came out, because *"The sum of
 * $2000 be and the same is hereby set aside"* opens a real appropriation.
 *
 * The first version used a case-insensitive `[a-z]`, which matches capitals
 * too and flagged every heading in the corpus. That was measured before it
 * shipped, which is the only reason it is a sentence here and not a defect.
 */
const CONTINUES =
  /^[^A-Za-z0-9]*(?:[a-z]|(?:And|As|Or|But|With|Said|Which|Thence|Including|Provided|Together)\b)/;

/** a preposition-led scrap: *"In the residence of J. McCluskey, Assistant"* */
const PREPOSITION_LED = /^(?:In|On|At|To|For|From|Of|With|Between|Under|Near|Upon|By)\s/i;

const STREET_PHRASE =
  /\b[A-Z][\w']+(?:\s+[A-Z][\w']+)?\s+(?:Street|Avenue|Boulevard|Way|Place|Drive|Road|Court|Terrace|Lane|Alley)s?\b/gi;

const NOT_A_SENTENCE = new Set([
  "and", "the", "of", "to", "at", "from", "between", "a", "an", "st", "ave",
]);

/**
 * *"Arietta Avenue, Elliott Street and Raymond Avenue"* says where and never
 * says what. Tested structurally rather than by enumerating punctuation — take
 * the street phrases out and see whether a sentence is left — because the
 * first version matched exactly two streets joined by a comma and this line
 * has three joined by an "and".
 */
function isStreetList(line: string): boolean {
  const rest = line.replace(STREET_PHRASE, " ").replace(/[^A-Za-z ]+/g, " ");
  const words = rest
    .split(/\s+/)
    .filter((w) => w && !NOT_A_SENTENCE.has(w.toLowerCase()));
  return words.length < 3;
}

const BROKEN_CHAR = /[^A-Za-z0-9\s.,;:'"()$%&/-]/;
const NO_VOWEL = /[aeiouAEIOU]/;

/** the shortest line that has ever carried a record on its own */
const MIN_CHARS = 40;
/** below this a preposition-led line is a scrap, above it it is a description */
const SCRAP_CHARS = 60;
/** share of words the scanner mangled, above which the line is unquotable */
const BROKEN_MAX = 0.18;

/** whether a cleaned line can stand as the headline of its own card row */
export function isReadableLine(line: string): boolean {
  const t = line.trim();
  if (t.length < MIN_CHARS) return false;
  if (CONTINUES.test(t)) return false;
  if (MEETING_TALK.some((r) => r.test(t))) return false;
  if (t.length < SCRAP_CHARS && PREPOSITION_LED.test(t)) return false;
  if (isStreetList(t)) return false;
  const words = t.split(/\s+/);
  const broken = words.filter(
    (w) => BROKEN_CHAR.test(w) || (w.length >= 4 && !NO_VOWEL.test(w)),
  ).length;
  return broken / Math.max(1, words.length) < BROKEN_MAX;
}

/* ── CUTTING THE BOILERPLATE OUT OF THE MIDDLE ────────────────────────────── */

/**
 * THE PAYLOAD IS USUALLY BEHIND THE FORMULA, so truncating at a length cuts
 * the wrong half off. *"Initiating landmark designation **under Article 10 of
 * the Planning Code** of 2 Henry Adams Street"* — a 112-character cut lands
 * inside the citation and loses the building.
 *
 * These phrases are deleted where they sit, before any length is measured.
 */
const DEAD_WEIGHT: readonly RegExp[] = [
  /\bunder Article \d+[A-Za-z]* of the(?: Planning Code)?\b/gi,
  /\bpursuant to [^,;]{0,60}?Code\b/gi,
  /\bin accordance with the (?:recommendation|provisions) of[^,;]{0,50}/gi,
  /,?\s*finding and determining that\b/gi,
  /\bof the City and County of San Francisco\b/gi,
  /\ba California limited partnership,?\b/gi,
  /\bCase No\.?\s*[\w.-]+,?/gi,
  /\bFile No\.?\s*[\d-]+,?/gi,
  /\((?:New|Second) Series\),?/gi,
  /\b(?:Resolution|Ordinance|Motion) No\.?\s*[\w.-]+,?/gi,
  /\(District \d+\),?/gi,
  /\bas amended\b/gi,
  /\bAdopting Final Negative Declaration,?\s*/gi,
  /\bexecution and delivery of\b/gi,
  /\bApproving and authorizing\b/gi,
  /\bAuthorizing and directing\b/gi,
];

/**
 * A case number says nothing a reader can use, but DELETING one breaks the
 * sentence around it: *"Approving Conditional Use Application No. 2002.0124CVR
 * on property at 2815 Diamond Street"* became *"Approving on property at 2815
 * Diamond Street"*. Replaced with the plain noun instead.
 */
const CASE_NUMBER = /\b(?:Conditional Use )?Application No\.?\s*[\w.-]+,?/gi;

/** phrases that open a tail carrying no substance — cut to the end of the line */
const DEAD_TAIL =
  /[\s,;]*\b(?:and (?:adopting|making) (?:environmental |CEQA )?findings|and adopting the? ?[Pp]lanning [Cc]ode findings|and directing the Clerk|and authorizing the Clerk|in accordance with the recommendation)\b.*$/i;

/**
 * *"also known as Miriwa Center"* is the building's name and stays. The phrase
 * is only cut when the source line breaks off right after it — which is how
 * *"Approving map of 1255 California Street, also known as the"* ends.
 */
const BROKEN_ALIAS = /[\s,;]*\balso known as(?:\s+the)?$/i;

const DANGLING =
  /[\s,;-]+(?:the|a|an|of|to|for|and|in|on|at|by|with|as|near|from)$/i;

/** strip trailing function words until the line ends on something */
export function undangle(line: string): string {
  let t = line;
  for (let i = 0; i < 4; i++) {
    const next = t.replace(DANGLING, "");
    if (next === t) break;
    t = next;
  }
  return t;
}

/**
 * `150879 [Multifamily Housing Revenue Note - 666 Ellis Street - Not to Exceed
 * $22,168,000] Sponsors: Mayor, Kim` → the bracket, and only the bracket. The
 * modern Clerk's bracketed subject IS the title, and the file number and the
 * sponsor tail around it are not.
 */
const MODERN_TITLE = /^\d{5,}\s*(?=\[)/;
const BRACKETED = /^\[([^\]]{12,})\]/;
const SPONSORS = /\s*\b(?:Sponsors?|Sponsored by)\s*:.*$/i;
/** the Journal's list markers: `3)`, `(5.`, and the OCR crumb `4 i To …` */
const LIST_MARKER = /^\(?\d{1,2}[).]\s+/;
const SCAN_CRUMB = /^\d{1,3}\s+[a-z]{1,2}\s+(?=[A-Z])/;

/** the Board's line, with the parts that are not the record taken out */
export function cleanLine(raw: string): string {
  let t = raw.replace(/\s+/g, " ").trim().replace(/…$/, "").replace(/\.$/, "");
  t = t.replace(MODERN_TITLE, "");
  const bracket = BRACKETED.exec(t);
  if (bracket) t = bracket[1];
  t = t.replace(SPONSORS, "").replace(LIST_MARKER, "").replace(SCAN_CRUMB, "");
  t = t.replace(CASE_NUMBER, "a conditional use");
  for (const r of DEAD_WEIGHT) t = t.replace(r, " ");
  t = t.replace(DEAD_TAIL, "").replace(BROKEN_ALIAS, "");
  /* cutting mid-sentence can leave a doubled article — "Authorizing the a
     multifamily housing revenue note". "of a" is good English and stays. */
  t = t.replace(/\b(?:the|a|an)\s+(a|an|the)\b/gi, "$1");
  t = t.replace(/\b(of|and|the|to)\s+\1\b/gi, "$1");
  t = t.replace(/\s+([,;])/g, "$1").replace(/\s{2,}/g, " ").replace(/^[\s,;-]+|[\s,;-]+$/g, "");
  return t ? t[0].toUpperCase() + t.slice(1) : t;
}

/** the longest headline a card row can hold at the panel's width */
const HEADLINE_CAP = 112;
/** never cut so short that the clause carries nothing */
const HEADLINE_MIN = 45;

/** cut at the last clause boundary that fits, not at the character that fits */
export function trimLine(line: string, cap = HEADLINE_CAP): string {
  if (line.length <= cap) return undangle(line);
  let cut = -1;
  for (const m of line.matchAll(/,\s|;\s|\s\(|\s-\s/g)) {
    const at = m.index ?? -1;
    if (at >= HEADLINE_MIN && at <= cap) cut = at;
  }
  if (cut < 0) cut = line.lastIndexOf(" ", cap);
  if (cut < 0) cut = cap;
  return `${undangle(line.slice(0, cut).replace(/[\s,;-]+$/, ""))}…`;
}

/* ── WHERE IT HAPPENED ────────────────────────────────────────────────────── */

/** the type word is case-insensitive: the old Journal prints "741 Mission street" */
const STREET_ADDRESS =
  /\b\d{1,5}(?:-\d{1,5})?\s+[A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,2}\s+(?:[Ss]treet|[Ss]t|[Aa]venue|[Aa]ve|[Bb]oulevard|[Bb]lvd|[Ww]ay|[Pp]lace|[Dd]rive|[Rr]oad)\b/;

const NAMED_STREET =
  /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\s+([Ss]treet|[Aa]venue|[Bb]oulevard|[Ww]ay|[Pp]lace|[Dd]rive|[Rr]oad)\b/;

const TYPE_SHORT: Record<string, string> = {
  s: "St", a: "Ave", b: "Blvd", w: "Way", p: "Pl", d: "Dr", r: "Rd",
};

/**
 * THE BLOCK'S CROSS-STREETS ARE ONLY SAFE WHEN THE LINE NAMES NO STREET OF ITS
 * OWN. Adding them to every row was free — 3,436 of the 3,441 blocks holding a
 * lit row already publish their street names — and it printed a contradiction:
 * *"Along the easterly side of Nineteenth avenue"* under the label **23rd Ave ·
 * 24th Ave**. The item names several streets and the geocode matched one of
 * them; the block is not wrong, it is just not the street in the sentence.
 *
 * So the line's own street wins, and the block's cross-streets are the
 * fallback for a line that names none.
 */
export function placeOf(line: string, blockPlace: string | null): string | null {
  const addr = STREET_ADDRESS.exec(line);
  if (addr)
    return addr[0].replace(
      /\s(street|avenue|boulevard|way|place|drive|road)\b/,
      (_, w: string) => ` ${w[0].toUpperCase()}${w.slice(1)}`,
    );
  const named = NAMED_STREET.exec(line);
  if (named) return `${named[1]} ${TYPE_SHORT[named[2][0].toLowerCase()]}`;
  return blockPlace;
}

/* ── HOW MUCH ─────────────────────────────────────────────────────────────── */

const MONEY = /\$\s?\d[\d,]*(?:\.\d{2})?/;
/** below this a figure is a street width or a lot dimension, not a sum */
const SUM_MIN = 100;

export function formatSum(raw: string): string | null {
  const m = MONEY.exec(raw);
  if (!m) return null;
  const v = Number.parseInt(m[0].split(".")[0].replace(/[^\d]/g, ""), 10);
  if (!Number.isFinite(v) || v < SUM_MIN) return null;
  return v >= 1e6
    ? `$${(v / 1e6).toFixed(1)}M`
    : `$${v.toLocaleString("en-US")}`;
}

/* ── THE ROW ──────────────────────────────────────────────────────────────── */

export interface RecordLine {
  /** the record's own words, or null when the line cannot carry the row */
  readonly headline: string | null;
  /** what the record IS — shown above the headline, or as it when there is none */
  readonly tag: string | null;
  readonly place: string | null;
  readonly sum: string | null;
}

/**
 * ONE ROW OF THE CARD. When the line reads, it is the headline and the
 * classification sits above it as a label; when it does not, the
 * classification becomes the headline and the line is not printed at all —
 * a reader gets *"The city buys land · Arietta Ave"* rather than
 * *"Arietta Avenue, Elliott Street and Raymond Avenue"*.
 */
export function recordLine(
  raw: string,
  tag: string | null,
  blockPlace: string | null,
): RecordLine {
  const clean = cleanLine(raw);
  const readable = isReadableLine(clean);
  return {
    headline: readable ? trimLine(clean) : tag,
    tag: readable ? tag : null,
    place: placeOf(clean, blockPlace),
    sum: formatSum(raw),
  };
}

/* ── MONEY, ONE WAY ─────────────────────────────────────────────────────────
   The written lines print money four ways in one list — "$339,102,572",
   "$20.1M", "$1,500,000", "$9 billion" (audit of 2026-09-09). A figure of a
   million or more with commas in it is shown compact; anything under a
   million, and anything already written in words, stays as written. */
const LONG_MONEY = /\$(\d{1,3}(?:,\d{3}){2,})(?:\.\d+)?/g;
export function compactMoney(text: string): string {
  return text.replace(LONG_MONEY, (whole, digits: string) => {
    const v = Number(digits.replace(/,/g, ""));
    if (!Number.isFinite(v) || v < 1e6) return whole;
    return v >= 1e9 ? `$${(v / 1e9).toFixed(1)}B` : `$${(v / 1e6).toFixed(1)}M`;
  });
}

/* ── ONE FILE, SEVERAL STEPS ────────────────────────────────────────────────
   A Board file passes through committee, a first reading and a final vote,
   and the minutes record each; the year list read "Police policy for
   electronic location trackers" three times in a row. The lines carry no
   file number, so the file is recognised by its stem: the written line
   without its money and without its closing status. MEASURED on 2026: 14
   files fold 16 rows out of 570 — few, but they sit at the top of the list. */
const STATUS_TAIL = /\s*(?:,\s*)?(?:finally passed|passed on (?:first|second) reading|passed second reading|moved for approval|sent to (?:the )?[a-z ]*committee|declared necessary and adopted|adopted|approved|sought|proposed|to go to voters[^,]*|sent to [A-Z][a-z]+ voters)\s*$/i;
const MONEY_PHRASE = /\s*(?:to rise to|raised to|to grow by|of|for)\s+\$[\d,.]+(?:M|B|K| billion| million)?/gi;
export function fileStem(line: string): string {
  return line.replace(MONEY_PHRASE, " ").replace(STATUS_TAIL, "").replace(/\s+/g, " ").trim().toLowerCase();
}

/** how far along a line's status is — the row shown for a folded file is
 *  the furthest one, and its steps are counted beside it */
export function statusRank(line: string): number {
  const l = line.toLowerCase();
  if (/finally passed|declared necessary and adopted/.test(l)) return 5;
  if (/, adopted|\badopted\b|approved/.test(l)) return 4;
  if (/passed on (first|second) reading|passed second reading/.test(l)) return 3;
  if (/moved for approval|sent to .*committee/.test(l)) return 2;
  if (/sought|proposed|to go to voters|sent to .* voters/.test(l)) return 1;
  return 0;
}
