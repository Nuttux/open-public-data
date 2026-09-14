import { describe, expect, it } from "vitest";
import { lotInfo, lotRepeatFlags, sumLots } from "./marches-shape";

describe("lotRepeatFlags / sumLots", () => {
  const lot = "SA2-ATELIERS SPORTIFS _ÉCOLES ÉLÉMENTAIRES PUBLIQUES V.P.";
  it("counts a lot shared by several holders once", () => {
    const rows = [
      { objet: lot, montant_max: 57824009.99, fournisseur_nom: "DINAMYK SPORT", fournisseur_siret: "79192238800024" },
      { objet: lot.toLowerCase() + "  ", montant_max: 57824009.99, fournisseur_nom: "SPORT ET VOUS", fournisseur_siret: "79077194300012" },
      { objet: lot, montant_max: 57824009.99, fournisseur_nom: "VIBRONS SPORTS", fournisseur_siret: "79046568600018" },
    ];
    expect(lotRepeatFlags(rows)).toEqual([false, true, true]);
    expect(sumLots(rows)).toBeCloseTo(57824009.99, 2);
  });
  it("keeps two rows of the same holder", () => {
    const rows = [
      { objet: "CSP1.FOURNITURE PAPIER", montant_max: 5e6, fournisseur_nom: "UGAP", fournisseur_siret: "77605646700587" },
      { objet: "CSP1.FOURNITURE PAPIER", montant_max: 5e6, fournisseur_nom: "UGAP", fournisseur_siret: "77605646700587" },
    ];
    expect(sumLots(rows)).toBe(10e6);
  });
  it("keeps lots with different amounts or titles", () => {
    const rows = [
      { objet: lot, montant_max: 57824009.99, fournisseur_siret: "79192238800024" },
      { objet: lot, montant_max: 39552009.99, fournisseur_siret: "42824230900048" },
      { objet: "Autre lot", montant_max: 57824009.99, fournisseur_siret: "80235395300010" },
    ];
    expect(lotRepeatFlags(rows)).toEqual([false, false, false]);
  });
  it("reads holders listed together on a multi-holder record", () => {
    const rows = [
      { objet: "AC travaux - CVC Généraliste", montant_max: 17e6, fournisseur_nom: "BALAS", fournisseur_siret: "56207779200058" },
      { objet: "AC travaux - CVC Généraliste", montant_max: 17e6, fournisseur_nom: "MARCHE MULTIATTRIBUTAIRE", fournisseur_siret: "38302656400047|85480074501125" },
    ];
    expect(sumLots(rows)).toBe(17e6);
  });
  it("does not merge rows whose holders are unknown or whose title is empty", () => {
    expect(sumLots([{ objet: "X", montant_max: 1, fournisseur_nom: "Non précisé" }, { objet: "X", montant_max: 1, fournisseur_nom: "" }])).toBe(2);
    expect(sumLots([{ objet: "", montant_max: 1, fournisseur_siret: "111111111" }, { objet: "", montant_max: 1, fournisseur_siret: "222222222" }])).toBe(2);
  });
  it("uses the amount function it is given", () => {
    const rows = [
      { objet: "L", montant_max: 0, montant_min: 3, fournisseur_siret: "111111111" },
      { objet: "L", montant_max: 0, montant_min: 3, fournisseur_siret: "222222222" },
    ];
    expect(sumLots(rows, (r) => Number(r.montant_max || r.montant_min || 0))).toBe(3);
  });
});

describe("lotInfo", () => {
  it("counts every company of a shared lot, including those listed together", () => {
    const rows = [
      { objet: "AC travaux - CVC Généraliste", montant_max: 17e6, fournisseur_nom: "BALAS", fournisseur_siret: "56207779200058" },
      { objet: "AC travaux - CVC Généraliste", montant_max: 17e6, fournisseur_nom: "UNION TECHNIQUE DU BATIMENT", fournisseur_siret: "57206414500087" },
      { objet: "AC travaux - CVC Généraliste", montant_max: 17e6, fournisseur_nom: "MARCHE MULTIATTRIBUTAIRE", fournisseur_siret: "38302656400047|85480074501125|78432563100074" },
      { objet: "Autre contrat", montant_max: 1e6, fournisseur_nom: "SEUL", fournisseur_siret: "11111111100011" },
    ];
    expect(lotInfo(rows)).toEqual([
      { repeat: false, holders: 5 },
      { repeat: true, holders: 5 },
      { repeat: true, holders: 5 },
      { repeat: false, holders: 1 },
    ]);
  });
});
