/**
 * Suggestion chips as measurable objects — the bandit's arms.
 *
 * The editorial tables stay in suggestions.ts (validated questions only).
 * Here each question gets a stable id and a family, the panel picks what to
 * show (3 by weight + 1 exploration, shuffled), and the weights come from
 * chip-weights.json, rewritten weekly by the product digest routine through
 * a pull request. Clicks are logged with the chip id and its position so the
 * digest can separate "our chip was attractive" from "the visitor asked".
 */
import type { Locale } from "@/lib/localeContext";
import type { ChatScopeId } from "./scopes";
import { SUGGESTION_TABLES, type SectionKey } from "./suggestions";
import weightsFile from "./chip-weights.json";

export type Chip = { id: string; text: string; family: string };
export type ShownChip = Chip & { pos: number };

type Weights = Record<string, { score: number; n: number }>;
const WEIGHTS: Weights = (weightsFile as { weights: Weights }).weights ?? {};
const FAMILY_ORDER: SectionKey[] = ["budget", "dette", "subventions", "marches", "logement", "investissements", "payroll"];
export const SHOWN = 4;
export const EXPLORE_SLOTS = 1;

/** Stable short id from the question text (djb2), so a reworded chip is a new arm. */
export function chipId(text: string): string {
  let h = 5381;
  for (let i = 0; i < text.length; i++) h = ((h << 5) + h + text.charCodeAt(i)) >>> 0;
  return "c" + h.toString(36);
}

function table(locale: Locale, scope: ChatScopeId) {
  return scope === "sf" ? SUGGESTION_TABLES.sf : locale === "en" ? SUGGESTION_TABLES.en : SUGGESTION_TABLES.fr;
}

/** The family of a question = the first thematic section that lists it; "general" for default-only chips. */
function familyOf(text: string, locale: Locale, scope: ChatScopeId): string {
  const t = table(locale, scope);
  return FAMILY_ORDER.find((s) => t[s].includes(text)) ?? "general";
}

function toChip(text: string, locale: Locale, scope: ChatScopeId): Chip {
  return { id: chipId(text), text, family: familyOf(text, locale, scope) };
}

/** The section's own chips, editorial order (index 0 is the teaser). */
export function chipsFor(section: SectionKey, locale: Locale, scope: ChatScopeId): Chip[] {
  const t = table(locale, scope);
  const list = t[section].length ? t[section] : t.default;
  return list.map((x) => toChip(x, locale, scope));
}

/** Every chip of the scope, deduplicated — the exploration pool. */
export function scopePool(locale: Locale, scope: ChatScopeId): Chip[] {
  const seen = new Set<string>();
  const out: Chip[] = [];
  for (const list of Object.values(table(locale, scope))) {
    for (const x of list) {
      const c = toChip(x, locale, scope);
      if (seen.has(c.id)) continue;
      seen.add(c.id);
      out.push(c);
    }
  }
  return out;
}

export function chipScore(id: string): number {
  return WEIGHTS[id]?.score ?? 0.5;
}

/**
 * What the panel shows: the section's best (SHOWN - EXPLORE_SLOTS) chips by
 * weight, ties broken at random, plus EXPLORE_SLOTS chips drawn at random from
 * the rest of the scope; order shuffled so position 1 does not win by default.
 * Deterministic when `rng` always returns 0 (SSR-safe first render).
 */
export function pickChips(section: SectionKey, locale: Locale, scope: ChatScopeId, rng: () => number = Math.random): ShownChip[] {
  const own = chipsFor(section, locale, scope);
  const ownIds = new Set(own.map((c) => c.id));
  const rest = scopePool(locale, scope).filter((c) => !ownIds.has(c.id));
  const ranked = own
    .map((c) => ({ c, key: chipScore(c.id) + rng() * 1e-3 }))
    .sort((a, b) => b.key - a.key)
    .map((x) => x.c);
  const keep = Math.max(0, SHOWN - EXPLORE_SLOTS);
  const chosen = ranked.slice(0, keep);
  const pool = rest.length ? rest : ranked.slice(keep);
  for (let i = 0; i < EXPLORE_SLOTS && pool.length; i++) {
    const [pick] = pool.splice(Math.floor(rng() * pool.length), 1);
    chosen.push(pick);
  }
  for (let i = chosen.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [chosen[i], chosen[j]] = [chosen[j], chosen[i]];
  }
  return chosen.map((c, pos) => ({ ...c, pos }));
}
