import { describe, expect, it } from "vitest";
import { opensInDrawer } from "./v3";

describe("opensInDrawer", () => {
  it("keeps the page under a fiche opened in the drawer", () => {
    expect(opensInDrawer("/france/paris/marches/contrat/2024T00118")).toBe(true);
    expect(opensInDrawer("/fr/france/paris/subventions/association/agospap")).toBe(true);
    expect(opensInDrawer("/france/paris/lieu/piscine-belliard")).toBe(true);
    expect(opensInDrawer("/france/paris/budget/poste/transports?year=2024")).toBe(true);
  });
  it("opens articles and section pages at their top", () => {
    expect(opensInDrawer("/analyses/patrimoine-paris-bilan-cout-historique")).toBe(false);
    expect(opensInDrawer("/en/analyses/garanties-emprunt")).toBe(false);
    expect(opensInDrawer("/france/paris/logement?year=2024")).toBe(false);
    expect(opensInDrawer("/france/paris")).toBe(false);
  });
});
