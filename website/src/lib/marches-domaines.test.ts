import { describe, expect, it } from "vitest";
import { DOMAINES, domaineLabel, domaineOf, isDomaineSlug } from "./marches-domaines";

describe("domaineOf", () => {
  it("maps the City's categories (2013-2024), accents and case aside", () => {
    expect(domaineOf({ categorie_libelle: "Collecte ordures ménagères et autres déchets" })).toBe("proprete-dechets");
    expect(domaineOf({ categorie_libelle: "travaux de génie civil et ouvrages d'art" })).toBe("voirie-espace-public");
    expect(domaineOf({ categorie_libelle: "Travaux sur le  réseau d'assainissement" })).toBe("eau-assainissement");
    expect(domaineOf({ categorie_libelle: "Services d'actions éducatives scolaires et périscolaires" })).toBe("education-enfance");
    expect(domaineOf({ categorie_libelle: "Electricité (distribué)" })).toBe("energie");
  });
  it("maps a DECP row by its CPV family when the category is only a CCAG", () => {
    expect(domaineOf({ categorie_libelle: "Fournitures courantes et services", decp_cpv_famille: "Environnement / propreté", _source_origin: "decp" })).toBe("proprete-dechets");
    expect(domaineOf({ categorie_libelle: "Travaux", decp_cpv_famille: "Travaux construction" })).toBe("batiments");
    expect(domaineOf({ categorie_libelle: "Techniques de l'information et de la communication", decp_cpv_famille: "Postes / télécoms" })).toBe("numerique");
    // No family: the CCAG-level fallback still lands somewhere sensible.
    expect(domaineOf({ categorie_libelle: "Fournitures courantes et services" })).toBe("fonctionnement");
    expect(domaineOf({ categorie_libelle: "Prestations intellectuelles" })).toBe("etudes-conseil");
  });
  it("falls back on keywords, then « autres »", () => {
    expect(domaineOf({ categorie_libelle: "Maintenance des matériels de nettoiement" })).toBe("proprete-dechets");
    expect(domaineOf({ categorie_libelle: "Prestations de lutte contre les frelons asiatiques" })).toBe("autres");
    expect(domaineOf({})).toBe("autres");
  });
  it("takes the numero overrides for contracts the source misfiled", () => {
    expect(domaineOf({ numero_marche: "20162370000574", categorie_libelle: "Organisation des services : audit, conseil, contrôle gestion" })).toBe("social-sante");
  });
  it("labels every domain in both languages", () => {
    for (const d of DOMAINES) {
      expect(isDomaineSlug(d.slug)).toBe(true);
      expect(domaineLabel(d.slug, "fr")).toBe(d.fr);
      expect(domaineLabel(d.slug, "en")).toBe(d.en);
    }
    expect(domaineLabel("nope", "fr")).toBe("Autres achats");
  });
});
