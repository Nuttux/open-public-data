import { describe, expect, it } from "vitest";
import { empruntSourceHref } from "./dette-garantie-links";

describe("empruntSourceHref", () => {
  it("filters by year, beneficiary, lender and mobilisation year, then searches the exact objet", () => {
    const href = empruntSourceHref({ year: 2025, beneficiaire: "RIVP (SEM)", preteur: "CDC", annee_mobilisation: 2023, objet: "Travaux réhabilitation patrimoine - 75000 - RGT" });
    expect(href).toBe(
      "https://opendata.paris.fr/explore/dataset/dette-garantie/table/?refine.annee_de_publication=2025" +
      "&refine.designation_du_beneficiaire=RIVP%20(SEM)&refine.organisme_preteur_ou_chef_de_file=CDC" +
      "&refine.annee_de_mobilisation=2023&q=%22Travaux%20r%C3%A9habilitation%20patrimoine%20-%2075000%20-%20RGT%22",
    );
  });
  it("leaves out filters it does not know", () => {
    const href = empruntSourceHref({ year: 2024, beneficiaire: "Paris Habitat", preteur: null, annee_mobilisation: null, objet: "17, bd Morland" });
    expect(href).not.toContain("organisme_preteur");
    expect(href).not.toContain("annee_de_mobilisation");
  });
});
