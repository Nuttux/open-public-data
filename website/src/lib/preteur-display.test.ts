import { describe, expect, it } from "vitest";
import { displayPreteur } from "./preteur-display";

describe("displayPreteur", () => {
  it("expands unambiguous lender acronyms", () => {
    expect(displayPreteur("CDC")).toBe("Caisse des Dépôts");
    expect(displayPreteur("LBP")).toBe("La Banque Postale");
    expect(displayPreteur("CE")).toBe("Caisse d’Épargne");
    expect(displayPreteur("CA IdF")).toBe("Crédit Agricole Île-de-France");
  });
  it("merges spelling variants", () => {
    expect(displayPreteur("DEXIA-CLF")).toBe(displayPreteur("DEXIA CLF"));
    expect(displayPreteur("CFF")).toBe(displayPreteur("CF"));
  });
  it("keeps unknown acronyms in capitals", () => {
    expect(displayPreteur("GIC")).toBe("GIC");
    expect(displayPreteur("FPLLF")).toBe("FPLLF");
  });
  it("returns empty for missing names", () => {
    expect(displayPreteur(null)).toBe("");
  });
});
