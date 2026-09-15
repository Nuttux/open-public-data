import { describe, expect, it } from "vitest";
import { normalizeObjet, isObjetCryptic, shortObjet, cutObjet, rowObjet } from "./objet-normalizer";

describe("rowObjet — a row title and its detail, from the raw object (2025 DECP samples)", () => {
  const TRILIB = "Fourniture, pose, collecte, maintenance et entretien de stations de tri sur l’espace public parisien (TRILIB) - Collecte et maintenance de propreté des modules, lavage des modules déchets alimentaires et collecte des dépôts sauvages aux abords des stations";
  it("splits the framework name from the lot and cuts each at a clause, never mid-word", () => {
    const r = rowObjet(TRILIB);
    expect(r.title.length).toBeLessThanOrEqual(74);
    expect(r.title).toMatch(/stations de tri/i);
    expect(r.title).toBe("Fourniture, pose, collecte, maintenance et entretien de stations de tri…");
    expect(r.detail).toMatch(/^Collecte et maintenance de propreté des modules/);
    expect(r.detail!.length).toBeLessThanOrEqual(66);
  });
  it("drops a long parenthetical, keeps a short acronym, and drops a trailing purchasing group", () => {
    const r = rowObjet("Services de communications électroniques (Internet, interconnexion, données mobiles M2M, téléphonie fixe, diffusion d’information multicanale) - SIPPEREC");
    expect(r.title).toBe("Services de communications électroniques");
    expect(r.detail).toBeNull();
    expect(rowObjet("Mobilier urbain (JCDecaux) - Lot 2 - Abris voyageurs").title).toMatch(/\(JCDecaux\)/);
  });
  it("drops the tender boilerplate", () => {
    const r = rowObjet("La présente consultation doit permettre, à l’issue d’une procédure de dialogue compétitif, à la collectivité parisienne d’attribuer un marché ayant pour objet la mise en place et de maintenance du nouveau Système d’Informations financier de la Collectivité parisienne (Ville, CASVP, MGP et Paris Musées).");
    expect(r.title).toMatch(/^Mise en place/);
    expect(r.title).not.toMatch(/consultation/i);
    const m = rowObjet("Accords-cadres relatifs à des travaux de menuiseries extérieures bois et PVC, en 3 lots, dans les bâtiments de la Ville de Paris et de l’Établissement public Paris Musées (EPPM).  - Accord-cadre à marchés subséquents - Travaux de menuiseries extérieures dans les bâtiments de la Ville de Paris, pour des surfaces supérieures à 50m² d’ouverture de baies");
    expect(m.title).toMatch(/^Travaux de menuiseries extérieures bois et PVC/);
    expect(m.title).not.toMatch(/en 3 lots/);
    // The procedure label is not a lot: the detail starts with the works themselves.
    expect(m.detail).toMatch(/^Travaux de menuiseries extérieures/);
  });
  it("drops the multi-holder framework wording too", () => {
    const r = rowObjet("Accord-cadre multi-attributaires à marchés subséquents de travaux d’éclairage public et d’illuminations dans les 1er à 20e arrondissements - Titulaire 2");
    expect(r.title).toMatch(/^Travaux d’éclairage public/);
    expect(r.detail).toBeNull(); // « Titulaire 2 » names nothing
  });
  it("keeps a short object whole", () => {
    expect(rowObjet("Transport PAM75")).toEqual({ title: "Transport PAM75", detail: null });
  });
});

describe("normalizeObjet", () => {
  it("returns empty for falsy input", () => {
    expect(normalizeObjet("")).toBe("");
  });

  it("expands abbreviations and replaces underscores", () => {
    const out = normalizeObjet("SA3_ACMS_TVX_AMENAGT_COURS");
    // Should contain expanded forms — we don't pin the exact rendering since
    // the cosmetic regex leaves some artefacts, but the core abbreviations
    // must have been expanded.
    expect(out).toMatch(/Travaux/i);
    expect(out).toMatch(/Aménagement/i);
    expect(out).not.toMatch(/_/); // underscores all replaced
  });

  it("lowercases French stopwords inside ALL-CAPS text", () => {
    const out = normalizeObjet("MARCHES DE TRAVAUX DES ECOLES");
    // "DES" → "des", "DE" → "de" (stopwords lowered).
    expect(out).toMatch(/\bdes\b/);
    expect(out).toMatch(/\bde\b/);
  });

  it("keeps short acronyms (≤3 chars) uppercase in ALL-CAPS context", () => {
    // Un acronyme court non traduit garde ses capitales (il ne doit pas devenir
    // « Pmr »). L'exemple était « MOE », qui est désormais TRADUIT — voir le
    // test suivant ; on prend donc un acronyme qu'on ne développe pas.
    const out = normalizeObjet("TRAVAUX ACCESSIBILITE PMR DES ECOLES");
    expect(out).toMatch(/\bPMR\b/);
  });

  it("traduit le vocabulaire de la commande publique", () => {
    // Ces sigles ouvrent une grande partie des objets de marché et ne veulent
    // rien dire pour un lecteur non initié : on les développe plutôt que de
    // republier le libellé administratif tel quel.
    expect(normalizeObjet("MISSION MOE POUR LES ECOLES")).toMatch(/maîtrise d’œuvre/i);
    expect(normalizeObjet("CSP4:MA SUB_AC:MISSION MOE AMENAGEMENT")).not.toMatch(/SUB_AC/i);
    expect(normalizeObjet("AMENAGEMENT PLACE PARIS 8ÈME.")).toMatch(/\b8e\b/);
  });

  it("strips the leading internal section code", () => {
    // "CSP<n>"/"SA<n>" are Ville section identifiers — pure gestion, no meaning
    // for a reader. They open ~42% of the corpus.
    expect(normalizeObjet("CSP5 RENOVATION PARTIELLE MUSEE CARNAVALET")).not.toMatch(/CSP5/i);
    expect(normalizeObjet("SA4.TRVX CSTRUCT PISCINE")).not.toMatch(/SA4/i);
    expect(normalizeObjet("CSP4: AC_BC - LOT 1 : TVX")).not.toMatch(/CSP4/i);
    // The other management codes measured in the corpus (2026-09-14).
    expect(normalizeObjet("A4: TRAVAUX D'ECLAIRAGE PUBLIC ET D'ILLUMINATION - LOT 5")).toMatch(/^Travaux/);
    expect(normalizeObjet("MGP-AMOA")).not.toMatch(/MGP/);
    expect(normalizeObjet("M.SUBS TRAVAUX MISE CONFORMITE FILTRATION PISCINE DIDOT")).not.toMatch(/^M\./);
    expect(normalizeObjet("MS_MOE RELATIVE A RESTAURATION DU PRONAOS")).not.toMatch(/^MS/);
    expect(normalizeObjet("MA13_REDACTION ET CONCEPTION GRAPHIQUE DU JOURNAL")).toMatch(/^Redaction/i);
    expect(normalizeObjet("MSAC - FOURNITURES DE FLEURS COUPEES")).toMatch(/^Fournitures/i);
    // A word that starts like a code is kept: no separator, no strip.
    expect(normalizeObjet("MAINTENANCE DES ASCENSEURS DU MUSEE")).toMatch(/^Maintenance/);
    expect(normalizeObjet("MS PROJECT LICENCES ET SUPPORT")).toMatch(/^MS /);
    // Only in leading position — a section code is only unambiguous there.
    expect(normalizeObjet("TRAVAUX SECTEUR SA4")).toMatch(/\bSA4\b/);
    // A leading lot number is information, not noise — it must survive.
    expect(normalizeObjet("LOT2 AMENAGT")).toMatch(/lot 2/i);
  });

  it("restores accents on recurring domain vocabulary", () => {
    const out = normalizeObjet("CSP5 RENOVATION PARTIELLE MUSEE CARNAVALET");
    expect(out).toMatch(/Rénovation/);
    expect(out).toMatch(/[Mm]usée/);
    // Case of the source word is preserved — no capital mid-sentence.
    expect(normalizeObjet("travaux de renovation")).toMatch(/de rénovation/);
  });

  it("normalises lot-and-number patterns", () => {
    // Case-insensitive: the leading-letter capitalisation pass may upper-case
    // the first character ("Lot 2 …"), but the lot-and-number normalisation
    // is what we're checking here.
    expect(normalizeObjet("LOT2 AMENAGT")).toMatch(/lot 2/i);
    expect(normalizeObjet("L3 fournitures")).toMatch(/lot 3/i);
  });

  it("idempotent on already-readable input", () => {
    const readable = "Travaux d'aménagement";
    // Running twice should not introduce new artefacts vs running once.
    expect(normalizeObjet(normalizeObjet(readable))).toBe(normalizeObjet(readable));
  });
});

describe("isObjetCryptic", () => {
  it("returns false for empty input", () => {
    expect(isObjetCryptic("")).toBe(false);
  });

  it("flags cryptic ALL-CAPS abbreviations", () => {
    expect(isObjetCryptic("SA3_ACMS_TVX_AMENAGT")).toBe(true);
    expect(isObjetCryptic("PRESTATIONS DE TRVX SUR ETS")).toBe(true);
  });

  it("flags inputs with underscores", () => {
    expect(isObjetCryptic("foo_bar_baz")).toBe(true);
  });

  it("does not flag readable French sentences", () => {
    expect(isObjetCryptic("Travaux d'aménagement de cours d'écoles")).toBe(false);
  });
});

describe("accord-cadre abbreviation", () => {
  it("expands a leading AC before a kind of work", () => {
    expect(normalizeObjet("AC travaux de réparation des installations")).toBe("Accord-cadre de travaux de réparation des installations");
  });
  it("leaves AC alone elsewhere", () => {
    expect(normalizeObjet("Remplacement AC du bâtiment")).toContain("AC");
  });
});

describe("shortObjet", () => {
  const head = "Accord-cadre de travaux de réparation, amélioration et efficacité énergétique des installations de génie climatique";
  it("keeps short titles whole", () => {
    expect(shortObjet("Entretien des parcs")).toBe("Entretien des parcs");
  });
  it("separates the lot even when the whole title fits", () => {
    expect(shortObjet("Travaux du parvis et des abords de Notre-Dame  - Aménagements extérieurs"))
      .toBe("Travaux du parvis et des abords de Notre-Dame · Aménagements extérieurs");
  });
  it("keeps a short lot at the end of a long title", () => {
    const out = shortObjet(`${head} - CVC Généraliste`);
    expect(out.endsWith(" · CVC Généraliste")).toBe(true);
    expect(out.length).toBeLessThanOrEqual(110);
    expect(shortObjet(`${head} - Recherche et réparation de fuites`)).not.toBe(out);
  });
  it("shows a long self-sufficient lot on its own", () => {
    const lot = "Travaux d'aménagement paysager des cours des établissements parisiens dans les arrondissements 18e, 19e et 20e";
    expect(shortObjet(`Accord-cadre à marchés subséquents pour les travaux d'aménagement paysager des cours. - ${lot}`)).toBe(lot);
  });
  it("drops a trailing list of arrondissement numbers from the lot", () => {
    expect(shortObjet(`${head} - Chaufferies gaz Ouest (1-2-3-4-6-7-8-9-14-15-16-17-18)`).endsWith(" · Chaufferies gaz Ouest")).toBe(true);
  });
  it("does not split lists of numbers", () => {
    expect(shortObjet("PARIS CTR 9 - 10 - 11 - 12")).not.toContain("·");
  });
  it("cuts plain long titles with an ellipsis", () => {
    const out = shortObjet("x".repeat(200));
    expect(out.length).toBe(111);
    expect(out.endsWith("…")).toBe(true);
    expect(cutObjet("court")).toBe("court");
  });
});

describe("codes de procédure en tête (2026-09-15)", () => {
  it("strips AC_BC, AC/BC, ACMS and MULTI-ATT layers, and a leading « LOT n : »", () => {
    const r = rowObjet("CSP4: AC_BC - LOT 1 : TVX SIGNALISATION HORIZONTALE A PARIS");
    expect(r.title).toMatch(/signalisation/i);
    expect(r.title).not.toMatch(/^(AC|Lot)/i);
    expect(normalizeObjet("SA4 _ACBC/MULTI-ATTRIBUTAIRES_DÉCONTAMINATION ÉQUIPEMTS VDP")).toMatch(/^D[ée]contamination/i);
    expect(normalizeObjet("SA4/MULTI-ATT._TVX PLOMBERIE/INSTALLATIONS SANITAIRES_LOT3")).not.toMatch(/^multi/i);
    expect(normalizeObjet("CSP5 AC/BC TVX ACCESSIBILITE TS HANDICAPS EQUIPMT PUBLICS")).not.toMatch(/^AC/);
    expect(normalizeObjet("SA3.AC_MS.TVX RENVAT° STATIONS")).not.toMatch(/^AC/);
  });
  it("keeps words that merely start with those letters", () => {
    expect(normalizeObjet("MAINTENANCE DES ASCENSEURS DES ECOLES")).toMatch(/^Maintenance/);
    expect(normalizeObjet("ACCUEIL DES ENFANTS EN CENTRE DE LOISIRS")).toMatch(/^Accueil/);
    expect(normalizeObjet("MULTIMEDIA POUR LES BIBLIOTHEQUES")).toMatch(/^Multim/i);
    expect(normalizeObjet("MS N°1 LOT 3 FOURNITURE D'ELECTRICITE")).toMatch(/^MS/);
  });
});

describe("accords-cadres à bons de commande (2026-09-15)", () => {
  it("drops the procedure formula and the « prestations de » that follows", () => {
    const r = rowObjet("Accords-cadres à bons de commande pour des prestations de nettoyage de locaux à destination de divers établissements de la Ville - Nettoyage de locaux à destination de divers établissements de la Ville de Paris (lot 3)");
    expect(r.title).toMatch(/^Nettoyage de locaux/);
    expect(r.title).not.toMatch(/bons de commande/i);
  });
});
