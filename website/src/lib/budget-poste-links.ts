/**
 * Correspondances poste budgétaire → pages du site, ÉCRITES À LA MAIN.
 *
 * Aucune de ces correspondances n'est déduite par ressemblance de mots : un
 * poste ne pointe que vers les pages que l'on sait être le même argent vu
 * d'un autre côté (par bénéficiaire, par contrat, par chantier, par lieu).
 * Le loader (`loadPosteLinks`, fusion-data.ts) VÉRIFIE chaque cible au rendu
 * pour l'année demandée et ne rend une rangée que si la page existe avec un
 * montant ; un poste sans correspondance sûre n'a pas de bloc du tout.
 *
 * Les libellés de thèmes sont ceux du jeu subventions ; les catégories de
 * marchés sont des préfixes (insensibles à la casse) du `categorie_libelle`
 * DECP ; les chapitres sont les slugs de /investissements/chapitre ; les
 * familles de lieux sont celles du seed lieux.
 */
export type PosteLinkSpec = {
  themes?: string[];
  categories?: string[];
  chapitre?: string;
  lieux?: string[];
  page?: "logement" | "dette";
};

export const POSTE_LINKS: Record<string, PosteLinkSpec> = {
  "action-sociale": {
    themes: ["Social - Solidarité", "Social - Petite enfance"],
    categories: ["service d'aide sociale à l'enfance", "Services d'accompagnement (PMI, familles)", "Services d'accueil à la petite enfance"],
    chapitre: "sante-social",
  },
  "amenagement-logement": { themes: ["Logement"], chapitre: "amenagement-habitat", lieux: ["urbain"], page: "logement" },
  "culture-sport": { themes: ["Culture", "Sport"], categories: ["Services culturels", "Livres"], chapitre: "culture-sport", lieux: ["culture", "sport"] },
  "education": { themes: ["Éducation"], categories: ["Services d'actions éducatives"], chapitre: "enseignement" },
  "administration-generale": { categories: ["Fournitures courantes et services", "postes de travail"], chapitre: "services-generaux", lieux: ["services"] },
  // « Reversements à l'État et aux communes » : de l'argent qui sort de Paris, aucune page du site ne le compte par destinataire.
  "transports": { themes: ["Transport"], categories: ["Travaux d'aménagement de voirie"], chapitre: "transports" },
  "environnement": {
    themes: ["Environnement"],
    categories: ["Travaux d'aménagement d'espaces verts", "entretien des espaces verts", "travaux d'arrosage", "Travaux sur le  réseau d'assainissement"],
    chapitre: "environnement",
    lieux: ["vert"],
  },
  "securite": { themes: ["Sécurité"], categories: ["Equipements de protection individuelle"], chapitre: "securite" },
  "economie": { themes: ["Économie"], chapitre: "action-economique" },
  "remboursement-de-la-dette": { page: "dette" },
  "interets-de-la-dette": { page: "dette" },
  // Recettes : seule l'origine des emprunts a une page sûre.
  "emprunts": { page: "dette" },
};
