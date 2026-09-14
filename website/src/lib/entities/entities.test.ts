import { describe, expect, it } from "vitest";

import { arrondissementGarantiesConfig } from "./arrondissement-garanties";
import { arrondissementInvestConfig } from "./arrondissement-invest";
import { associationConfig } from "./association";
import { bailleurConfig } from "./bailleur";
import { instrumentDetteConfig } from "./instrument-dette";
import { masseConfig } from "./masse";
import { categorieConfig } from "./categorie";
import { chapitreConfig } from "./chapitre";
import { contratConfig } from "./contrat";
import { fournisseurConfig } from "./fournisseur";
import { lieuConfig, lieuStaticParams } from "./lieu";
import { logementArrondissementConfig } from "./logement-arrondissement";
import { posteConfig } from "./poste";
import { natureConfig } from "./nature";
import { offresConfig } from "./offres";
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

  it("offres — 1 (single bid), the fiche behind a bar of the marchés scene", async () => {
    const d = await offresConfig.load({ slug: "1" }, {});
    expect(d).not.toBeNull();
    expect(d!.fiche.bucket).toBe("1");
    expect(d!.fiche.count).toBeGreaterThan(0);
    expect(d!.fiche.total).toBeGreaterThan(0);
    expect(d!.fiche.topContrats.length).toBeGreaterThan(0);
    expect(d!.fiche.years.length).toBeGreaterThan(0);
    // The year rides in the slug; an uncovered year falls back to the latest covered one.
    const older = await offresConfig.load({ slug: "6-plus-2015" }, {});
    expect(older!.fiche.year).toBe(d!.fiche.year);
    expect(older!.fiche.hrefSlug).toBe("6-plus");
    const y2024 = await offresConfig.load({ slug: "1-2024" }, {});
    expect(y2024!.fiche.year).toBe(2024);
    expect(y2024!.fiche.hrefSlug).toBe(d!.fiche.year === 2024 ? "1" : "1-2024");
    expect(await offresConfig.load({ slug: "7" }, {})).toBeNull();
    expect(await offresConfig.load({ slug: "1-20" }, {})).toBeNull();
  });

  it("theme — social", async () => {
    const d = await themeConfig.load({ slug: "social" }, {});
    expect(d).not.toBeNull();
    expect(d!.fiche.theme.length).toBeGreaterThan(0);
  });

  it("nature — salaires", async () => {
    const d = await natureConfig.load({ slug: "salaires" }, {});
    expect(d).not.toBeNull();
    expect(d!.nature.total).toBeGreaterThan(1e9);
    expect(d!.nature.byPoste[0].value).toBeGreaterThan(0);
    // the sum over postes is the total: the fiche and the ribbon agree
    const sum = d!.nature.byPoste.reduce((s, p) => s + p.value, 0);
    expect(Math.abs(sum - d!.nature.total) / d!.nature.total).toBeLessThan(1e-6);
    expect(await natureConfig.load({ slug: "nope" }, {})).toBeNull();
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

  it("masse — actif-immobilise (bilan)", async () => {
    const d = await masseConfig.load({ slug: "actif-immobilise" }, {});
    expect(d).not.toBeNull();
    expect(d!.masse.label).toBe("Actif immobilisé");
    expect(d!.masse.side).toBe("actif");
  });

  it("masse — dettes-financieres, ?year=2019", async () => {
    const d = await masseConfig.load({ slug: "dettes-financieres" }, { year: "2019" });
    expect(d).not.toBeNull();
    expect(d!.year).toBe(2019);
    expect(d!.masse.side).toBe("passif");
  });

  it("instrument — obligataire (avec émissions)", async () => {
    const d = await instrumentDetteConfig.load({ slug: "obligataire" }, {});
    expect(d).not.toBeNull();
    expect(d!.instrument.key).toBe("obligataire");
    expect(d!.bondIssuances.length).toBeGreaterThan(0);
  });

  it("garanties arrondissement — 12", async () => {
    const d = await arrondissementGarantiesConfig.load({ num: "12" }, {});
    expect(d).not.toBeNull();
    expect(d!.arr.arr).toBe(12);
    expect(d!.arr.count_emprunts).toBeGreaterThan(0);
  });

  it("garanties arrondissement — 0 (Paris Centre agrégé)", async () => {
    const d = await arrondissementGarantiesConfig.load({ num: "0" }, {});
    expect(d).not.toBeNull();
    expect(d!.arr.arr).toBe(0);
    expect(d!.arr.count_emprunts).toBeGreaterThan(0);
    expect(d!.arr.top_beneficiaires.length).toBeGreaterThan(0);
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
