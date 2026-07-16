import { describe, expect, it } from "vitest";
import { normalizeObjet, isObjetCryptic } from "./objet-normalizer";

describe("normalizeObjet", () => {
  it("returns empty for falsy input", () => {
    expect(normalizeObjet("")).toBe("");
  });

  it("expands abbreviations and replaces underscores", () => {
    const out = normalizeObjet("SA3_ACMS_TVX_AMENAGT_COURS");
    // Should contain expanded forms — we don't pin the exact rendering since
    // the cosmetic regex leaves some artefacts, but the core abbreviations
    // must have been expanded.
    expect(out).toMatch(/Travaux/i);
    expect(out).toMatch(/Aménagement/i);
    expect(out).not.toMatch(/_/); // underscores all replaced
  });

  it("lowercases French stopwords inside ALL-CAPS text", () => {
    const out = normalizeObjet("MARCHES DE TRAVAUX DES ECOLES");
    // "DES" → "des", "DE" → "de" (stopwords lowered).
    expect(out).toMatch(/\bdes\b/);
    expect(out).toMatch(/\bde\b/);
  });

  it("keeps short acronyms (≤3 chars) uppercase in ALL-CAPS context", () => {
    // MOE is a 3-char acronym → stays uppercase. (This test used to use "SA3",
    // but a leading "SA<n>" is now stripped as a section code — see below.)
    const out = normalizeObjet("MISSION MOE POUR LES ECOLES");
    expect(out).toMatch(/\bMOE\b/);
  });

  it("strips the leading internal section code", () => {
    // "CSP<n>"/"SA<n>" are Ville section identifiers — pure gestion, no meaning
    // for a reader. They open ~42% of the corpus.
    expect(normalizeObjet("CSP5 RENOVATION PARTIELLE MUSEE CARNAVALET")).not.toMatch(/CSP5/i);
    expect(normalizeObjet("SA4.TRVX CSTRUCT PISCINE")).not.toMatch(/SA4/i);
    expect(normalizeObjet("CSP4: AC_BC - LOT 1 : TVX")).not.toMatch(/CSP4/i);
    // Only in leading position — a section code is only unambiguous there.
    expect(normalizeObjet("TRAVAUX SECTEUR SA4")).toMatch(/\bSA4\b/);
    // A leading lot number is information, not noise — it must survive.
    expect(normalizeObjet("LOT2 AMENAGT")).toMatch(/lot 2/i);
  });

  it("restores accents on recurring domain vocabulary", () => {
    const out = normalizeObjet("CSP5 RENOVATION PARTIELLE MUSEE CARNAVALET");
    expect(out).toMatch(/Rénovation/);
    expect(out).toMatch(/[Mm]usée/);
    // Case of the source word is preserved — no capital mid-sentence.
    expect(normalizeObjet("travaux de renovation")).toMatch(/de rénovation/);
  });

  it("normalises lot-and-number patterns", () => {
    // Case-insensitive: the leading-letter capitalisation pass may upper-case
    // the first character ("Lot 2 …"), but the lot-and-number normalisation
    // is what we're checking here.
    expect(normalizeObjet("LOT2 AMENAGT")).toMatch(/lot 2/i);
    expect(normalizeObjet("L3 fournitures")).toMatch(/lot 3/i);
  });

  it("idempotent on already-readable input", () => {
    const readable = "Travaux d'aménagement";
    // Running twice should not introduce new artefacts vs running once.
    expect(normalizeObjet(normalizeObjet(readable))).toBe(normalizeObjet(readable));
  });
});

describe("isObjetCryptic", () => {
  it("returns false for empty input", () => {
    expect(isObjetCryptic("")).toBe(false);
  });

  it("flags cryptic ALL-CAPS abbreviations", () => {
    expect(isObjetCryptic("SA3_ACMS_TVX_AMENAGT")).toBe(true);
    expect(isObjetCryptic("PRESTATIONS DE TRVX SUR ETS")).toBe(true);
  });

  it("flags inputs with underscores", () => {
    expect(isObjetCryptic("foo_bar_baz")).toBe(true);
  });

  it("does not flag readable French sentences", () => {
    expect(isObjetCryptic("Travaux d'aménagement de cours d'écoles")).toBe(false);
  });
});
