import { describe, expect, it } from "vitest";
import {
  slugifyChapitre,
  slugifyLabel,
  slugifyBailleur,
  serviceToM57,
  guessTypologieFromName,
  resolveTypoBucket,
  detectJO,
} from "./projet-utils";

describe("slugifyChapitre", () => {
  it("strips accents and lowercases", () => {
    expect(slugifyChapitre("Éducation")).toBe("education");
    expect(slugifyChapitre("Santé & Social")).toBe("sante-social");
  });
  it("collapses non-alphanumeric runs into single dash", () => {
    expect(slugifyChapitre("Culture & Sport")).toBe("culture-sport");
    expect(slugifyChapitre("A  B   C")).toBe("a-b-c");
  });
  it("trims leading/trailing dashes", () => {
    expect(slugifyChapitre("--Hello--")).toBe("hello");
  });
  it("slugifyLabel is the same algorithm", () => {
    expect(slugifyLabel("Éducation")).toBe(slugifyChapitre("Éducation"));
  });
});

describe("slugifyBailleur", () => {
  it("returns empty for empty input", () => {
    expect(slugifyBailleur("")).toBe("");
  });
  it("strips legal-form suffix so OPH variant collides with bare name", () => {
    // Critical: 'Paris Habitat' and 'Paris Habitat OPH' must map to the same
    // slug — otherwise the same bailleur would generate two different fiches.
    expect(slugifyBailleur("Paris Habitat OPH")).toBe(slugifyBailleur("Paris Habitat"));
  });
  it("strips parenthesised content", () => {
    expect(slugifyBailleur("RIVP (Régie Immobilière)")).toBe("rivp");
  });
  it("normalises accents and case", () => {
    expect(slugifyBailleur("ÉLOGIE-SIEMP")).toBe("elogie-siemp");
  });
});

describe("serviceToM57", () => {
  it("maps known service axes", () => {
    expect(serviceToM57("Voirie")).toBe("Transports");
    expect(serviceToM57("Affaires Scolaires")).toBe("Enseignement");
    expect(serviceToM57("Jeunesse et Sports")).toBe("Culture & Sport");
  });
  it("returns null for unknown or empty input", () => {
    expect(serviceToM57(null)).toBeNull();
    expect(serviceToM57(undefined)).toBeNull();
    expect(serviceToM57("")).toBeNull();
    expect(serviceToM57("Inconnu")).toBeNull();
  });
});

describe("guessTypologieFromName", () => {
  it("matches across accents/case", () => {
    expect(guessTypologieFromName("École élémentaire")).toBe("ecole");
    expect(guessTypologieFromName("ECOLE MATERNELLE")).toBe("ecole");
  });
  it("matches creche/multi-accueil", () => {
    expect(guessTypologieFromName("Crèche multi-accueil 14e")).toBe("creche");
    expect(guessTypologieFromName("Halte-garderie")).toBe("creche");
  });
  it("groupe scolaire goes to college bucket per current rules", () => {
    // "groupe scolaire" matches the (college|groupe scolaire) rule.
    expect(guessTypologieFromName("Groupe scolaire Marx Dormoy")).toBe("college");
  });
  it("detects voirie keywords", () => {
    expect(guessTypologieFromName("Réaménagement avenue Daumesnil")).toBe("voirie");
    expect(guessTypologieFromName("Embellir votre quartier — secteur 19")).toBe("voirie");
  });
  it("returns null for non-matching input", () => {
    expect(guessTypologieFromName("Quelque chose de très abstrait")).toBeNull();
    expect(guessTypologieFromName(null)).toBeNull();
    expect(guessTypologieFromName(undefined)).toBeNull();
  });
});

describe("resolveTypoBucket", () => {
  it("maps normalised typology to bucket", () => {
    expect(resolveTypoBucket("ecole", null)).toBe("education");
    expect(resolveTypoBucket("piscine", null)).toBe("culture");
    expect(resolveTypoBucket("logement-social", null)).toBe("logesante");
  });
  it("falls back to name guess when typology is null", () => {
    expect(resolveTypoBucket(null, "Bibliothèque municipale")).toBe("education");
  });
  it("returns 'autre' when nothing matches", () => {
    expect(resolveTypoBucket(null, "xyz")).toBe("autre");
    expect(resolveTypoBucket(null, null)).toBe("autre");
  });
});

describe("detectJO", () => {
  it("detects explicit JO 2024 keywords", () => {
    expect(detectJO("Aménagement village olympique")).toBe(true);
    expect(detectJO("Arena Porte de la Chapelle")).toBe(true);
    expect(detectJO("Construction JO 2024")).toBe(true);
  });
  it("returns false for null/empty", () => {
    expect(detectJO(null)).toBe(false);
    expect(detectJO(undefined)).toBe(false);
    expect(detectJO("")).toBe(false);
  });
  it("documents known false-positive on the literal word 'olympique'", () => {
    // Current regex matches \bolympique — captures "Stade Olympique de Lyon"
    // even though that's not a Paris JO 2024 project. Test is here to make the
    // behaviour explicit; if we tighten the rule, update this expectation.
    expect(detectJO("Stade olympique fictif")).toBe(true);
  });
});
