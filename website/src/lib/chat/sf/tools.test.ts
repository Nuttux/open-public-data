import { describe, it, expect } from "vitest";
import {
  list_datasets,
  get_budget_by_year,
  get_budget_breakdown,
  get_department_budget,
  get_department_line_items,
  get_budget_vs_actual,
  get_contracts_overview,
  search_contracts,
  get_top_payees,
  search_payee,
  get_payroll_by_year,
  get_payroll_by_department,
  get_payroll_by_family,
  get_payroll_distribution,
  get_payroll_overtime,
  find_oversight_documents,
} from "./tools";
import { SF_SYSTEM_PROMPT } from "./prompt";
import { runScopedTool } from "../registry";
import { CHAT_SCOPES, resolveScope, resolveScopedPath, scopeForPath } from "../scopes";

// Tests contre les vrais exports de public/data/us/sf : si un export change de
// forme, ils cassent avant que le chat ne réponde n'importe quoi.

const LATEST_BUDGET_FY = 2025;
const LATEST_PAYROLL_FY = 2025;

describe("scope containment", () => {
  it("un scope inconnu retombe sur Paris, jamais sur rien", () => {
    expect(resolveScope("sf").id).toBe("sf");
    expect(resolveScope("atlantis").id).toBe("paris");
    expect(resolveScope(undefined).id).toBe("paris");
    expect(resolveScope({ id: "sf" }).id).toBe("paris");
  });

  it("les chemins restent dans la ville du scope", () => {
    expect(resolveScopedPath(CHAT_SCOPES.sf, "budget_by_year.json")).toBe("us/sf/budget_by_year.json");
    expect(resolveScopedPath(CHAT_SCOPES.paris, "evolution_budget.json")).toBe("evolution_budget.json");
    // Paris lit à la racine : les racines des autres villes sont refusées.
    expect(resolveScopedPath(CHAT_SCOPES.paris, "us/sf/budget_by_year.json")).toBeNull();
    expect(resolveScopedPath(CHAT_SCOPES.sf, "../../evolution_budget.json")).toBeNull();
    expect(resolveScopedPath(CHAT_SCOPES.sf, "/etc/passwd")).toBeNull();
  });

  it("une route sans toolset ne monte aucun assistant", () => {
    expect(scopeForPath("/us/city/sf/budget")).toBe("sf");
    expect(scopeForPath("/fr/city/paris/budget")).toBe("paris");
    expect(scopeForPath("/us/national")).toBeNull();
    expect(scopeForPath("/br/city/recife")).toBeNull();
    expect(scopeForPath("/fr/city/marseille/budget")).toBeNull();
  });

  it("un outil Paris n'est pas atteignable depuis le scope sf", () => {
    expect(runScopedTool(CHAT_SCOPES.sf, "get_subventions_summary", { year: 2024 })).toHaveProperty("error");
    expect(runScopedTool(CHAT_SCOPES.sf, "get_payroll_by_year", {})).not.toHaveProperty("error");
  });
});

describe("list_datasets", () => {
  it("couvre budget, contrats, paiements, paie", () => {
    const d = list_datasets() as Record<string, unknown>;
    for (const k of ["budget", "budget_breakdown", "budget_vs_actual", "contracts", "vendor_payments", "payroll"]) {
      expect(d[k], k).toBeTruthy();
    }
  });
});

describe("budget", () => {
  it("série annuelle : montants croissants en ordre de grandeur, source citée", () => {
    const r = get_budget_by_year();
    expect("error" in r).toBe(false);
    if ("error" in r) return;
    expect(r.points.length).toBeGreaterThan(10);
    expect(r.source?.dataset_id).toBeTruthy();
    expect(r.source?.source_url).toContain("data.sfgov.org");
    const fy = r.points.find((p) => p.fiscal_year === LATEST_BUDGET_FY);
    expect(fy!.total_usd!).toBeGreaterThan(10_000_000_000);
  });

  it("breakdown par département : trié, part cohérente", () => {
    const r = get_budget_breakdown({ fiscal_year: LATEST_BUDGET_FY, limit: 5 });
    expect("error" in r).toBe(false);
    if ("error" in r) return;
    expect(r.rows.length).toBe(5);
    expect(r.rows[0].total_usd!).toBeGreaterThanOrEqual(r.rows[1].total_usd!);
    expect(r.rows[0].share_of_side!).toBeGreaterThan(0);
    expect(r.source?.source_url).toBeTruthy();
  });

  it("breakdown par character porte les gloses (jargon expliqué)", () => {
    const r = get_budget_breakdown({ fiscal_year: LATEST_BUDGET_FY, dimension: "characters" });
    expect("error" in r).toBe(false);
    if ("error" in r) return;
    expect(r.rows.some((x) => typeof x.gloss === "string" && x.gloss.length > 20)).toBe(true);
  });

  it("département en langage naturel → ventilation par character", () => {
    const r = get_department_budget({ fiscal_year: LATEST_BUDGET_FY, department: "public health" });
    expect("error" in r).toBe(false);
    if ("error" in r) return;
    expect(r.department_code).toBe("DPH");
    expect(r.by_character.length).toBeGreaterThan(3);
    expect(r.by_character[0].amount_usd!).toBeGreaterThanOrEqual(r.by_character[1].amount_usd!);
  });

  it("département inconnu → erreur + liste des départements", () => {
    const r = get_department_budget({ fiscal_year: LATEST_BUDGET_FY, department: "ministry of magic" });
    expect(r).toHaveProperty("error");
    expect((r as { departments_available?: string[] }).departments_available!.length).toBeGreaterThan(10);
  });

  it("line items : budget et paiements restent deux blocs distincts", () => {
    const r = get_department_line_items({ fiscal_year: LATEST_BUDGET_FY, department_code: "DPH", character_code: "SALARIES" });
    expect("error" in r).toBe(false);
    if ("error" in r) return;
    expect(r).toHaveProperty("budget_objects");
    expect(r).toHaveProperty("vendor_payments");
    expect(r.budget_source?.dataset_id).toBeTruthy();
  });

  it("voté vs réel : les deux mesures présentes sur une année close", () => {
    const r = get_budget_vs_actual({});
    expect("error" in r).toBe(false);
    if ("error" in r) return;
    const closed = r.points!.filter((p) => p.adopted_budget_usd != null && p.actual_all_funds_usd != null);
    expect(closed.length).toBeGreaterThan(3);
  });

  it("année invalide → erreur avec les années disponibles", () => {
    const r = get_budget_breakdown({ fiscal_year: 1850 });
    expect(r).toHaveProperty("error");
    expect((r as { fiscal_years?: readonly number[] }).fiscal_years!.length).toBeGreaterThan(5);
  });
});

describe("contracts", () => {
  it("overview : registre + actifs, avec périmètre", () => {
    const r = get_contracts_overview();
    expect("error" in r).toBe(false);
    if ("error" in r) return;
    expect(r.hero!.register.agreed_usd).toBeGreaterThan(0);
    expect(r.perimeter).toContain("GRANTS");
    expect(r.source?.dataset_id).toBeTruthy();
  });

  it("recherche : tri par enveloppe, note plafond ≠ dépense", () => {
    const r = search_contracts({ query: "street", limit: 5 });
    expect("error" in r).toBe(false);
    if ("error" in r) return;
    expect(r.n_matches).toBeGreaterThan(0);
    expect(r.results[0].agreed_usd!).toBeGreaterThanOrEqual(r.results[1].agreed_usd!);
    expect(r.amount_note).toContain("CEILING");
    expect(r.scope_note).toContain("ACTIVE");
  });

  it("recherche sans résultat → 0 match, pas d'erreur", () => {
    const r = search_contracts({ query: "zzzznotathing" });
    expect("error" in r).toBe(false);
    if ("error" in r) return;
    expect(r.n_matches).toBe(0);
  });
});

describe("vendor payments", () => {
  it("top payees : buckets présents et avertissement fiscal agent", () => {
    const r = get_top_payees({ fiscal_year: 2024, limit: 5 });
    expect("error" in r).toBe(false);
    if ("error" in r) return;
    expect(r.payees.length).toBe(5);
    expect(r.payees[0].paid_usd!).toBeGreaterThan(0);
    expect(r.bucket_note).toContain("NOT suppliers");
    expect(r.payees.every((p) => typeof p.bucket === "string" || p.bucket === undefined)).toBe(true);
  });

  it("recherche fournisseur : cumul + détail par année", () => {
    const r = search_payee({ query: "kaiser" });
    expect("error" in r).toBe(false);
    if ("error" in r) return;
    expect(r.n_matches).toBeGreaterThan(0);
    expect(Object.keys(r.results[0].byYear).length).toBeGreaterThan(1);
  });

  it("les personnes physiques ne sont jamais renvoyées", () => {
    // Le bucket 'person' (bailleurs particuliers) est filtré en amont : aucune
    // requête ne doit pouvoir faire remonter un individu nommé.
    const r = search_payee({ query: "a", limit: 20 });
    if ("error" in r) return;
    expect(r.results.every((x) => x.bucket !== "person")).toBe(true);
  });
});

describe("payroll", () => {
  it("série : masse salariale, effectif, médiane", () => {
    const r = get_payroll_by_year();
    // Sans `fiscal_year`, l'outil renvoie la série complète.
    if (!("points" in r)) throw new Error("expected the series payload");
    const last = r.points.at(-1)!;
    expect(last.total_compensation_usd!).toBeGreaterThan(1_000_000_000);
    expect(last.n_employees!).toBeGreaterThan(10_000);
    expect(last.median_total_comp_usd!).toBeGreaterThan(0);
    expect(r.headcount_note).toContain("NOT full-time equivalents");
  });

  it("par département : trié, et ciblage d'un département", () => {
    const all = get_payroll_by_department({ fiscal_year: LATEST_PAYROLL_FY, limit: 5 });
    // Sans `department`, l'outil renvoie le classement ; avec, une seule ligne.
    if (!("departments" in all)) throw new Error("expected the ranking payload");
    expect(all.departments.length).toBe(5);
    expect(all.departments[0].total_compensation_usd!).toBeGreaterThanOrEqual(all.departments[1].total_compensation_usd!);
    const one = get_payroll_by_department({ fiscal_year: LATEST_PAYROLL_FY, department: "police" });
    expect("error" in one).toBe(false);
  });

  it("par famille de métier : citywide trié", () => {
    const r = get_payroll_by_family({ fiscal_year: LATEST_PAYROLL_FY });
    expect("error" in r).toBe(false);
    if ("error" in r) return;
    expect(r.families!.length).toBeGreaterThan(3);
    expect(r.families![0].total_compensation_usd!).toBeGreaterThanOrEqual(r.families![1].total_compensation_usd!);
  });

  it("distribution : percentiles ordonnés", () => {
    const r = get_payroll_distribution({ fiscal_year: LATEST_PAYROLL_FY });
    expect("error" in r).toBe(false);
    // Le mode « une année » renvoie les percentiles à plat (pas de `points`).
    if ("error" in r || "points" in r) throw new Error("expected a single-year payload");
    expect(r.p25_usd!).toBeLessThan(r.median_usd!);
    expect(r.median_usd!).toBeLessThan(r.p90_usd!);
  });

  it("heures sup : série citywide + titres", () => {
    const r = get_payroll_overtime({ fiscal_year: LATEST_PAYROLL_FY });
    expect("error" in r).toBe(false);
    if ("error" in r) return;
    expect(r.citywide.length).toBeGreaterThan(5);
    expect(r.top_titles.length).toBeGreaterThan(0);
  });
});

describe("prompt SF", () => {
  it("contient l'inventaire généré, sans 'undefined'", () => {
    expect(SF_SYSTEM_PROMPT).toContain("FY2025");
    expect(SF_SYSTEM_PROMPT).toContain("get_payroll_by_family");
    expect(SF_SYSTEM_PROMPT).not.toContain("undefined");
    expect(SF_SYSTEM_PROMPT).not.toContain("NaN");
    expect(SF_SYSTEM_PROMPT.length).toBeGreaterThan(4000);
    expect(SF_SYSTEM_PROMPT.length).toBeLessThan(20000);
  });

  it("porte les pièges qui font mentir les chiffres SF", () => {
    expect(SF_SYSTEM_PROMPT).toContain("ALL FUNDS");
    expect(SF_SYSTEM_PROMPT).toContain("agreed ≠ spent");
    expect(SF_SYSTEM_PROMPT).toContain("fiscal agents");
    expect(SF_SYSTEM_PROMPT).toContain("full-time equivalents");
  });

  it("garde le protocole partagé avec Paris (contrat avec l'UI)", () => {
    expect(SF_SYSTEM_PROMPT).toContain("<followups>");
  });
});

describe("oversight documents (archive pointer layer)", () => {
  it("l'export ne contient AUCUN texte de document", () => {
    // La contrainte est tenue par la donnée, pas par le prompt : s'il n'y a
    // pas de texte d'OCR dans le fichier, aucun chiffre de scan ne peut fuir.
    const r = find_oversight_documents({ topic: "overtime" });
    expect("error" in r).toBe(false);
    if ("error" in r) return;
    const blob = JSON.stringify(r);
    for (const banned of ["ocr", "snippet", "excerpt"]) {
      expect(blob.toLowerCase().includes(`"${banned}`), banned).toBe(false);
    }
    for (const doc of r.documents) {
      // `note` n'apparaît que pour les rapports scannés en plusieurs copies.
      const keys = Object.keys(doc).filter((k) => k !== "note").sort();
      expect(keys).toEqual(["author", "author_is_city_oversight_body", "link", "source", "title", "year"]);
    }
  });

  it("trouve les audits de la Ville sur les heures supplémentaires", () => {
    const r = find_oversight_documents({ topic: "overtime" });
    if ("error" in r) throw new Error(r.error as string);
    expect(r.n_matches).toBeGreaterThan(0);
    const titles = r.documents.map((d) => d.title ?? "").join(" | ");
    expect(titles).toMatch(/Overtime pay expenditures/i);
    expect(r.documents.every((d) => (d.link ?? "").startsWith("https://archive.org/"))).toBe(true);
  });

  it("respecte la doctrine de libellé des pools", () => {
    const r = find_oversight_documents({ topic: "audit", limit: 10 });
    if ("error" in r) throw new Error(r.error as string);
    for (const d of r.documents) {
      expect(
        d.source === "Internet Archive — San Francisco Public Library partnership scans" ||
          d.source === "Internet Archive — Democracy's Library",
      ).toBe(true);
    }
  });

  it("le prompt interdit d'extraire un chiffre d'un scan", () => {
    expect(SF_SYSTEM_PROMPT).toContain("Point, never quote");
    expect(SF_SYSTEM_PROMPT).toContain("find_oversight_documents");
    expect(SF_SYSTEM_PROMPT).toMatch(/never be called that|never called that/);
  });
});

describe("dédoublonnage des rapports", () => {
  it("un même rapport scanné plusieurs fois n'apparaît qu'une fois", () => {
    const r = find_oversight_documents({ topic: "parks", limit: 10 });
    if ("error" in r) throw new Error(r.error as string);
    const titles = r.documents.map((d) => (d.title ?? "").toLowerCase());
    expect(new Set(titles).size).toBe(titles.length);
    // Le rapport annuel des parcs existe en plusieurs exemplaires scannés :
    // la copie retenue doit le dire plutôt que de faire disparaître le reste.
    expect(r.documents.some((d) => "note" in d)).toBe(true);
  });
});

