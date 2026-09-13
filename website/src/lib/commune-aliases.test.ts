import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it, expect } from "vitest";

import { computeAliases } from "../../scripts/build-commune-aliases.mjs";
import aliases from "@/data/commune-aliases.json";

/**
 * La table des adresses naturelles est un fichier généré : si l'index des
 * communes bouge (nouvelle synchronisation OFGL, fusion de communes) et que la
 * table n'est pas régénérée, une adresse redirige vers une commune qui n'existe
 * plus ou une nouvelle homonymie repasse en 404. Ce test la recalcule.
 */
describe("commune-aliases.json — adresses naturelles des communes homonymes", () => {
  const index = JSON.parse(
    readFileSync(path.join(process.cwd(), "public/data/communes-all/index.json"), "utf8"),
  ) as { communes: Record<string, { slug: string; pop: number }>; slug_to_insee: Record<string, string> };

  it("est à jour avec l'index des communes (sinon : node scripts/build-commune-aliases.mjs)", () => {
    const fresh = computeAliases(index);
    expect(aliases.redirect).toEqual(fresh.redirect);
    expect(aliases.choose).toEqual(fresh.choose);
  });

  it("ne masque aucune vraie commune", () => {
    for (const base of [...Object.keys(aliases.redirect), ...Object.keys(aliases.choose)]) {
      expect(index.slug_to_insee[base]).toBeUndefined();
    }
  });

  it("ne mène qu'à des communes qui existent", () => {
    for (const to of Object.values(aliases.redirect as Record<string, string>)) expect(index.slug_to_insee[to]).toBeDefined();
    for (const list of Object.values(aliases.choose as Record<string, string[]>)) {
      expect(list.length).toBeGreaterThan(1);
      for (const s of list) expect(index.slug_to_insee[s]).toBeDefined();
    }
  });
});
