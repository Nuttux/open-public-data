import { describe, expect, it } from "vitest";
import { pageContext, pagePattern } from "./page-context";

const cases: [string, Partial<ReturnType<typeof pageContext>>][] = [
  ["/fr", { page_country: "fr", page_tier: "hub", page_city: "paris", page_kind: "landing", page_pattern: "/", page_locale: "fr" }],
  ["/en", { page_country: "fr", page_kind: "landing", page_locale: "en" }],
  ["/pt", { page_country: "br", page_city: "recife", page_kind: "landing" }],
  ["/en/usa", { page_country: "us", page_tier: "national", page_kind: "country" }],
  ["/fr/france/pantin", { page_country: "fr", page_tier: "commune", page_city: "pantin", page_family: "ville", page_kind: "city", page_pattern: "/france/{commune}" }],
  ["/fr/france/Les-Vans?year=2023", { page_city: "les-vans", page_pattern: "/france/{commune}" }],
  ["/fr/france/pantin/marches", { page_tier: "commune", page_family: "marches", page_kind: "hub", page_pattern: "/france/{commune}/marches" }],
  ["/fr/france/pantin/fournisseur/123456789", { page_kind: "fiche", page_entity_type: "fournisseur", page_pattern: "/france/{commune}/fournisseur/{n}" }],
  ["/fr/france/pantin/fonction/culture", { page_kind: "fiche", page_entity_type: "fonction", page_pattern: "/france/{commune}/fonction/{slug}" }],
  ["/fr/france/comparer/pantin/bobigny", { page_country: "fr", page_family: "comparer", page_kind: "compare", page_pattern: "/france/comparer/{commune}/{commune}" }],
  ["/fr/france/paris", { page_tier: "hub", page_city: "paris", page_kind: "city", page_pattern: "/france/paris" }],
  ["/en/france/paris/budget", { page_tier: "hub", page_family: "budget", page_kind: "hub", page_locale: "en", page_pattern: "/france/paris/budget" }],
  ["/fr/france/paris/budget/poste/culture", { page_kind: "fiche", page_entity_type: "poste", page_pattern: "/france/paris/budget/poste/{slug}" }],
  ["/fr/france/paris/subventions/association/secours-populaire", { page_family: "subventions", page_kind: "fiche", page_entity_type: "association" }],
  ["/fr/france/paris/subventions/associations/page/2", { page_kind: "explorer", page_pattern: "/france/paris/subventions/associations/{parts}" }],
  ["/fr/france/paris/marches/contrat/decp-2025T01374", { page_kind: "fiche", page_entity_type: "contrat", page_pattern: "/france/paris/marches/contrat/{slug}" }],
  ["/fr/france/paris/marches/fournisseur/552032534", { page_kind: "fiche", page_entity_type: "fournisseur", page_pattern: "/france/paris/marches/fournisseur/{n}" }],
  ["/fr/france/paris/marches/categorie/travaux", { page_kind: "fiche", page_entity_type: "categorie" }],
  ["/fr/france/paris/dette/stress-test", { page_family: "dette", page_kind: "hub", page_pattern: "/france/paris/dette/stress-test" }],
  ["/fr/france/paris/dette/garanties/arrondissement/19", { page_kind: "fiche", page_entity_type: "arrondissement", page_pattern: "/france/paris/dette/garanties/arrondissement/{n}" }],
  ["/fr/france/paris/lieux", { page_family: "lieux", page_kind: "explorer" }],
  ["/fr/france/paris/lieu/theatre-du-chatelet", { page_family: "lieu", page_kind: "fiche", page_entity_type: "lieu" }],
  ["/fr/france/marseille/subventions/theme/culture", { page_tier: "hub", page_city: "marseille", page_kind: "fiche", page_entity_type: "theme" }],
  ["/fr/france/budget", { page_country: "fr", page_tier: "national", page_city: null, page_family: "budget", page_kind: "hub", page_pattern: "/france/budget" }],
  ["/fr/france/budget/bucket/local/dept/93", { page_tier: "national", page_kind: "fiche", page_entity_type: "dept", page_pattern: "/france/budget/bucket/local/dept/{n}" }],
  ["/fr/france/daily-bread/bucket/local", { page_family: "daily-bread", page_kind: "hub" }],
  ["/fr/france/dette", { page_tier: "national", page_family: "dette", page_kind: "hub" }],
  ["/en/usa/san-francisco", { page_country: "us", page_tier: "hub", page_city: "san-francisco", page_kind: "city", page_pattern: "/usa/san-francisco" }],
  ["/en/usa/san-francisco/payroll/role/nurse", { page_kind: "fiche", page_entity_type: "role", page_pattern: "/usa/san-francisco/payroll/role/{slug}" }],
  ["/en/usa/san-francisco/contracts/contract/1000028725", { page_kind: "fiche", page_entity_type: "contract" }],
  ["/en/usa/national", { page_country: "us", page_tier: "national", page_kind: "landing" }],
  ["/pt/brasil/recife/quem-recebe/05291944000189", { page_country: "br", page_tier: "hub", page_city: "recife", page_family: "quem-recebe", page_kind: "fiche", page_entity_type: "quem-recebe", page_pattern: "/brasil/recife/quem-recebe/{n}" }],
  ["/fr/methode", { page_country: "none", page_tier: "site", page_family: "methode", page_kind: "static" }],
  ["/en/method", { page_tier: "site", page_family: "methode", page_kind: "static" }],
  ["/fr/chat", { page_family: "chat", page_kind: "chat" }],
  ["/fr/analyses/top-10", { page_family: "analyses", page_kind: "fiche", page_entity_type: "analyse" }],
];

describe("pageContext", () => {
  for (const [path, expected] of cases) {
    it(path, () => {
      const ctx = pageContext(path);
      for (const [k, v] of Object.entries(expected)) {
        expect(ctx[k as keyof typeof ctx], `${path} → ${k}`).toBe(v);
      }
    });
  }

  it("keeps big cities by name and turns other places into {commune}", () => {
    expect(pagePattern("/fr/france/marseille/budget")).toBe("/france/marseille/budget");
    expect(pagePattern("/fr/france/lyon/budget")).toBe("/france/{commune}/budget");
  });

  it("stamps the address language, and falls back to the document language", () => {
    expect(pageContext("/en/france/paris").page_locale).toBe("en");
    expect(pageContext("/france/paris", "fr").page_locale).toBe("fr");
  });
});
