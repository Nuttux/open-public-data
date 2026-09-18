import { describe, expect, it, afterEach } from "vitest";
import { searchQueryProps } from "./analytics-helpers";

const vraiCrypto = globalThis.crypto;
afterEach(() => { Object.defineProperty(globalThis, "crypto", { value: vraiCrypto, configurable: true }); });

describe("searchQueryProps", () => {
  it("donne l'empreinte, la longueur et le nombre de résultats, jamais le texte", async () => {
    const p = await searchQueryProps("  Vesoul ", 5, "fr_communes");
    expect(p).toEqual({ q_hash: expect.stringMatching(/^[0-9a-f]{16}$/), q_len: 6, results_count: 5, corpus: "fr_communes" });
    expect(JSON.stringify(p).toLowerCase()).not.toContain("vesoul");
  });

  it("regroupe deux frappes identiques et sépare deux frappes différentes", async () => {
    const [a, b, c] = await Promise.all([
      searchQueryProps("Vesoul", 5, "fr_communes"),
      searchQueryProps("vesoul ", 5, "fr_communes"),
      searchQueryProps("Vesoule", 0, "fr_communes"),
    ]);
    expect(a.q_hash).toBe(b.q_hash);
    expect(a.q_hash).not.toBe(c.q_hash);
  });

  it("garde la recherche sans résultat, qui est le signal utile", async () => {
    const p = await searchQueryProps("zzzqqq", 0, "br_municipios");
    expect(p.results_count).toBe(0);
    expect(p.corpus).toBe("br_municipios");
  });

  // Le défaut corrigé le 2026-09-18 : le hachage était attendu DANS l'appel qui
  // envoie l'événement, donc son échec emportait l'événement entier.
  it("rend quand même les propriétés si le hachage échoue", async () => {
    Object.defineProperty(globalThis, "crypto", {
      value: { subtle: { digest: () => { throw new Error("pas de crypto ici"); } } },
      configurable: true,
    });
    const p = await searchQueryProps("Vesoul", 5, "fr_communes");
    expect(p).toEqual({ q_hash: "", q_len: 6, results_count: 5, corpus: "fr_communes" });
  });
});
