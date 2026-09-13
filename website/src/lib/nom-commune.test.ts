import { describe, it, expect } from "vitest";

import { aNom, deNom, nomDistinct } from "./nom-commune";

describe("nomDistinct — le nom tel qu'une liste doit l'écrire", () => {
  it("ajoute le département quand le nom est partagé (slug suffixé par l'INSEE)", () => {
    expect(nomDistinct({ nom: "Saint-Denis", slug: "saint-denis-93066", dep_name: "Seine-Saint-Denis" })).toBe("Saint-Denis (Seine-Saint-Denis)");
    expect(nomDistinct({ nom: "Saint-Denis", slug: "saint-denis-97411", dep_name: "La Réunion" })).toBe("Saint-Denis (La Réunion)");
  });

  it("reconnaît les codes INSEE corses (2A, 2B)", () => {
    expect(nomDistinct({ nom: "Olmeto", slug: "olmeto-2a192", dep_name: "Corse-du-Sud" })).toBe("Olmeto (Corse-du-Sud)");
  });

  it("laisse le nom seul quand il est unique", () => {
    expect(nomDistinct({ nom: "Pantin", slug: "pantin", dep_name: "Seine-Saint-Denis" })).toBe("Pantin");
  });

  it("n'écrit pas de parenthèses vides sans département", () => {
    expect(nomDistinct({ nom: "Saint-Denis", slug: "saint-denis-93066" })).toBe("Saint-Denis");
  });
});

describe("deNom / aNom — contractions devant le nom de commune", () => {
  it("contracte « Le » et « Les », élide devant une voyelle", () => {
    expect(deNom("Le Havre")).toBe("du Havre");
    expect(deNom("Les Vans")).toBe("des Vans");
    expect(deNom("Altenach")).toBe("d’Altenach");
    expect(aNom("Le Havre")).toBe("au Havre");
  });
});
