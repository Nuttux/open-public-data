import { describe, expect, it } from "vitest";

import { arrondissementInvestConfig } from "./arrondissement-invest";
import { associationConfig } from "./association";
import { bailleurConfig } from "./bailleur";
import { categorieConfig } from "./categorie";
import { chapitreConfig } from "./chapitre";
import { contratConfig } from "./contrat";
import { fournisseurConfig } from "./fournisseur";
import { lieuConfig, lieuStaticParams } from "./lieu";
import { logementArrondissementConfig } from "./logement-arrondissement";
import { posteConfig } from "./poste";
import { projetConfig } from "./projet";
import { themeConfig } from "./theme";

/**
 * Smoke-tests des 12 configs d'entités Paris contre le corpus RÉEL
 * (public/data, échantillons vérifiés 2026-07). Si un refresh de données
 * supprime un échantillon, remplacer l'échantillon — un échec ici signifie
 * soit une dérive de config (load() cassé), soit une URL d'entité morte
 * publiée quelque part sur le site.
 */

describe("entity configs load() against real corpus samples", () => {
  it("association — CENTRE ACTION SOCIALE VILLE PARIS", async () => {
    const d = await associationConfig.load({ slug: "CENTRE ACTION SOCIALE VILLE PARIS" }, {});
    expect(d).not.toBeNull();
    expect(d!.asso.name.length).toBeGreaterThan(0);
  });

  it("theme — social", async () => {
    const d = await themeConfig.load({ slug: "social" }, {});
    expect(d).not.toBeNull();
    expect(d!.fiche.theme.length).toBeGreaterThan(0);
  });

  it("poste — impots-taxes", async () => {
    const d = await posteConfig.load({ slug: "impots-taxes" }, {});
    expect(d).not.toBeNull();
    expect(d!.poste.label.length).toBeGreaterThan(0);
  });

  it("contrat — decp-2025T03576", async () => {
    const d = await contratConfig.load({ numero: "decp-2025T03576" }, {});
    expect(d).not.toBeNull();
    // Le h1 retombe sur objet_clair || normalizeObjet(objet) — l'objet brut
    // doit exister pour que le titre ne soit jamais vide.
    expect(d!.contrat.objet.length).toBeGreaterThan(0);
    expect(d!.contrat.numero).toBe("decp-2025T03576");
  });

  it("fournisseur — 56207750300224", async () => {
    const d = await fournisseurConfig.load({ siren: "56207750300224" }, {});
    expect(d).not.toBeNull();
    expect(d!.fournisseur.nom.length).toBeGreaterThan(0);
  });

  it("categorie — entretien-des-espaces-verts", async () => {
    const d = await categorieConfig.load({ slug: "entretien-des-espaces-verts" }, {});
    expect(d).not.toBeNull();
    expect(d!.fiche.category.length).toBeGreaterThan(0);
  });

  it("projet — 2024_18_51_021", async () => {
    const d = await projetConfig.load({ id: "2024_18_51_021" }, {});
    expect(d).not.toBeNull();
    expect(d!.projet.name.length).toBeGreaterThan(0);
  });

  it("arrondissement-invest — 18", async () => {
    const d = await arrondissementInvestConfig.load({ num: "18" }, {});
    expect(d).not.toBeNull();
    expect(d!.arr.arr).toBe(18);
  });

  it("chapitre — amenagement-habitat", async () => {
    const d = await chapitreConfig.load({ slug: "amenagement-habitat" }, {});
    expect(d).not.toBeNull();
    expect(d!.chap.label.length).toBeGreaterThan(0);
  });

  it("logement-arrondissement — 7", async () => {
    const d = await logementArrondissementConfig.load({ arr: "7" }, {});
    expect(d).not.toBeNull();
    expect(d!.data.label.length).toBeGreaterThan(0);
  });

  it("bailleur — rivp", async () => {
    const d = await bailleurConfig.load({ slug: "rivp" }, {});
    expect(d).not.toBeNull();
    expect(d!.bailleur.name.length).toBeGreaterThan(0);
  });

  it("lieu — adidas-arena", async () => {
    const d = await lieuConfig.load({ slug: "adidas-arena" }, {});
    expect(d).not.toBeNull();
    expect(d!.lieu.name.length).toBeGreaterThan(0);
  });
});

describe("lieu generateStaticParams pass-through", () => {
  it("returns at least 50 entries, each with a slug", () => {
    const params = lieuStaticParams();
    expect(params.length).toBeGreaterThanOrEqual(50);
    for (const p of params) {
      expect(typeof p.slug).toBe("string");
      expect(p.slug.length).toBeGreaterThan(0);
    }
  });
});
