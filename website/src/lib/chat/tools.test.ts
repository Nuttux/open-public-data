import { describe, it, expect } from "vitest";
import {
  list_datasets,
  get_subventions_summary,
  get_subventions_tendances,
  search_beneficiaire,
  get_marches_summary,
  search_marches,
  get_marches_tendances,
  get_budget_sankey,
  get_budget_nature,
  get_evolution_budget,
  get_vote_vs_execute,
  get_investissements,
  get_dette_structure,
  get_bilan,
  get_hors_bilan,
  get_logement_social,
  runTool,
} from "./tools";
import { SYSTEM_PROMPT } from "./systemPrompt";

// Tests contre les vrais exports de public/data : si un export change de
// forme, ces tests cassent avant que le chat ne réponde n'importe quoi.

describe("list_datasets", () => {
  it("couvre tous les domaines", () => {
    const d = list_datasets() as Record<string, unknown>;
    for (const k of [
      "subventions",
      "marches_publics",
      "budget",
      "budget_par_nature",
      "evolution_budget",
      "vote_vs_execute",
      "investissements",
      "dette_directe",
      "bilan_patrimoine",
      "garanties_hors_bilan",
      "logement_social",
    ]) {
      expect(d[k], k).toBeTruthy();
    }
  });
});

describe("subventions", () => {
  it("summary 2024 : total > 1 Md€ et top trié", () => {
    const r = get_subventions_summary({ year: 2024, top_n: 5 });
    expect("error" in r).toBe(false);
    if ("error" in r) return;
    expect(r.total_montant!).toBeGreaterThan(1_000_000_000);
    expect(r.top.length).toBe(5);
    expect(r.top[0].montant_total!).toBeGreaterThanOrEqual(r.top[1].montant_total!);
  });

  it("summary 2020 existe (l'ancien contexte disait le contraire)", () => {
    const r = get_subventions_summary({ year: 2020 });
    expect("error" in r).toBe(false);
  });

  it("summary filtré par thématique Culture", () => {
    const r = get_subventions_summary({ year: 2024, thematique: "culture" });
    if ("error" in r) throw new Error("no data");
    expect(r.top.every((t) => (t.thematique ?? "").toLowerCase().includes("culture"))).toBe(true);
    expect(r.total_montant!).toBeGreaterThan(0);
  });

  it("tendances : série complète + ventilation par thématique", () => {
    const all = get_subventions_tendances({});
    if ("error" in all || !("years_summary" in all)) throw new Error("no series");
    expect(all.years_summary!.length).toBeGreaterThanOrEqual(7);
    const y2024 = get_subventions_tendances({ year: 2024 });
    if ("error" in y2024 || !("par_thematique" in y2024)) throw new Error("no year detail");
    expect(y2024.par_thematique!.length).toBeGreaterThan(5);
  });

  it("search insensible aux accents : 'emmaus' trouve Emmaüs", () => {
    const r = search_beneficiaire({ query: "emmaus" });
    if ("error" in r) throw new Error(r.error as string);
    expect(r.nb_matches).toBeGreaterThan(0);
    expect(r.results.some((x) => (x.beneficiaire ?? "").toLowerCase().includes("emma"))).toBe(true);
  });

  it("search CASVP trouve le centre d'action sociale", () => {
    const r = search_beneficiaire({ query: "centre action sociale" });
    if ("error" in r) throw new Error(r.error as string);
    expect(r.results[0]?.total_toutes_annees).toBeGreaterThan(1_000_000_000);
  });
});

describe("marchés publics", () => {
  it("summary 2024 : enveloppe, nature, catégories, top contrats", () => {
    const r = get_marches_summary({ year: 2024, top_n: 3 });
    if ("error" in r) throw new Error(r.error as string);
    expect(r.enveloppe_max_totale!).toBeGreaterThan(1_000_000_000);
    expect(r.note).toMatch(/pluriannuel/);
    expect(r.par_nature?.length).toBeGreaterThan(0);
    expect(r.top_categories?.length).toBeGreaterThan(0);
    expect(r.top_contrats.length).toBe(3);
  });

  it("search multi-mots + accents : 'conseil' matche cross-années", () => {
    const r = search_marches({ query: "conseil", limit: 5 });
    if ("error" in r) throw new Error(r.error as string);
    expect(r.nb_matches).toBeGreaterThan(0);
    expect(r.note).toMatch(/pluriannuel/);
  });

  it("tendances couvre 2013+", () => {
    const r = get_marches_tendances();
    if ("error" in r || !("years" in r)) throw new Error("no data");
    expect(r.years.map((y) => y.year)).toContain(2013);
  });
});

describe("budget", () => {
  it("sankey 2024 : totaux + top links", () => {
    const r = get_budget_sankey({ year: 2024 });
    if ("error" in r) throw new Error(r.error as string);
    expect(r.totals?.depenses).toBeGreaterThan(10_000_000_000);
    expect(r.top_links.length).toBeGreaterThan(5);
  });

  it("nature 2024 : Personnel présent avec pct", () => {
    const r = get_budget_nature({ year: 2024 });
    if ("error" in r || !("par_nature" in r)) throw new Error("no data");
    const personnel = r.par_nature!.find((n) => (n.nature ?? "").toLowerCase().includes("personnel"));
    expect(personnel?.montant).toBeGreaterThan(2_000_000_000);
    expect(personnel?.pct).toBeGreaterThan(10);
  });

  it("nature × thématique : salaires fléchés Éducation", () => {
    const r = get_budget_nature({ year: 2024, nature: "personnel" });
    if ("error" in r || !("par_thematique" in r)) throw new Error("no niveau_2");
    const edu = r.par_thematique!.find((t) => (t.thematique ?? "").includes("ducation"));
    expect(edu?.montant).toBeGreaterThan(300_000_000);
    // nature inconnue → erreur propre avec la liste
    const bad = get_budget_nature({ year: 2024, nature: "zzz" });
    expect(bad).toHaveProperty("error");
  });

  it("évolution : série + année seule avec définitions", () => {
    const all = get_evolution_budget({});
    if ("error" in all || !("years" in all)) throw new Error("no series");
    expect(all.years!.length).toBeGreaterThanOrEqual(8);
    const y = get_evolution_budget({ year: 2024 });
    if ("error" in y || !("definitions" in y)) throw new Error("no detail");
    expect(y.epargne_brute).toBeDefined();
  });

  it("voté vs exécuté : taux plausibles (50–120 %)", () => {
    const r = get_vote_vs_execute({});
    if ("error" in r || !("comparaisons" in r)) throw new Error("no data");
    expect(r.comparaisons!.length).toBeGreaterThanOrEqual(6);
    for (const c of r.comparaisons!) {
      expect(c.taux_execution_global_pct).toBeGreaterThan(50);
      expect(c.taux_execution_global_pct).toBeLessThan(120);
    }
  });

  it("investissements : série + détail par chapitre trié", () => {
    const y = get_investissements({ year: 2024 });
    if ("error" in y || !("par_chapitre" in y)) throw new Error("no data");
    expect(y.par_chapitre!.length).toBeGreaterThan(3);
    expect(y.par_chapitre![0].depenses!).toBeGreaterThanOrEqual(y.par_chapitre![1].depenses!);
  });
});

describe("dette / bilan / garanties / logement", () => {
  it("dette : série pluriannuelle + détail instruments", () => {
    const s = get_dette_structure({});
    if (!("series" in s)) throw new Error("no series");
    expect(s.series!.length).toBeGreaterThanOrEqual(6);
    const y = get_dette_structure({ year: 2024 });
    if ("error" in y || !("instruments" in y)) throw new Error("no detail");
    expect(y.total_dette_financiere!).toBeGreaterThan(5_000_000_000);
    expect(y.instruments!.length).toBeGreaterThan(1);
    // émissions obligataires exposées (dont green bonds) + échéance lourde
    expect(y.emissions_obligataires!.length).toBeGreaterThan(3);
    expect(JSON.stringify(y.emissions_obligataires)).toMatch(/[Gg]reen/);
    expect(y.prochaine_echeance_lourde).toBeTruthy();
  });

  it("bilan 2024 : kpis + totaux", () => {
    const r = get_bilan({ year: 2024 });
    if ("error" in r || !("kpis" in r)) throw new Error("no data");
    expect(r.totals?.fonds_propres).toBeGreaterThan(10_000_000_000);
  });

  it("hors-bilan 2024 : top bénéficiaires (bailleurs) + note garanties≠dette", () => {
    const r = get_hors_bilan({ year: 2024 });
    if ("error" in r || !("top_beneficiaires" in r)) throw new Error("no data");
    expect(r.note).toMatch(/dette directe/);
    expect(r.top_beneficiaires!.length).toBeGreaterThan(2);
    expect(r.totals?.capital_restant).toBeGreaterThan(10_000_000_000);
  });

  it("logement social : totaux Paris + arrondissements", () => {
    const r = get_logement_social();
    if ("error" in r || !("paris_total" in r)) throw new Error("no data");
    expect(r.paris_total).toBeTruthy();
    expect(r.arrondissements_plus_tendus!.length).toBe(5);
  });
});

describe("runTool & prompt", () => {
  it("runTool dispatch + outil inconnu", () => {
    expect(runTool("list_datasets", {})).toBeTruthy();
    expect(runTool("nope", {})).toEqual({ error: "tool inconnu: nope" });
    // args invalides → erreur JSON propre, pas de throw
    expect(runTool("get_subventions_summary", { year: 1999 })).toHaveProperty("error");
  });

  it("SYSTEM_PROMPT contient l'inventaire généré, sans 'undefined'", () => {
    expect(SYSTEM_PROMPT).toContain("2024");
    expect(SYSTEM_PROMPT).toContain("get_vote_vs_execute");
    expect(SYSTEM_PROMPT).toContain("pluriannuelle");
    expect(SYSTEM_PROMPT).not.toContain("undefined");
    expect(SYSTEM_PROMPT.length).toBeGreaterThan(4000);
    expect(SYSTEM_PROMPT.length).toBeLessThan(20000);
  });
});
