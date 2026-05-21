"use client";

import Link from "next/link";

type Item = { href: string; label: string; amount: string };

/**
 * Mix curé d'entités déjà cliquables vers le drawer global :
 * - Projets (équipements publics nommés)
 * - Subventions à institutions publiques-publiques (CASVP, Paris Musées, Théâtres, etc.)
 * - Bailleurs sociaux (Paris Habitat, RIVP)
 * - Fournisseurs neutres consensuels (JCDecaux mobilier, Eurovia voirie)
 *
 * Aucun fournisseur ambigü politiquement. Aucun bénéficiaire privé hors
 * institutions clairement publiques. Les montants sont curés et stables
 * (top entités, ordres de grandeur cumulés sur les fenêtres connues).
 */
const ITEMS: Item[] = [
  // Projets nommés (équipements publics)
  { href: "/ville/paris/investissements/projet/2024_18_51_019", label: "Piscine Belliard", amount: "13,2 M€" },
  { href: "/ville/paris/investissements/projet/2024_19_54_014", label: "Médiathèque James Baldwin", amount: "6,6 M€" },
  { href: "/ville/paris/investissements/projet/2023_20_57_022", label: "Parc Python-Duvernois", amount: "4,2 M€" },
  { href: "/ville/paris/investissements/projet/2023_20_57_020", label: "École Davout (10 salles)", amount: "5,3 M€" },
  // Institutions publiques-publiques (Ville)
  { href: "/ville/paris/subventions/association/CENTRE%20ACTION%20SOCIALE%20VILLE%20PARIS", label: "CASVP", amount: "416 M€/an" },
  { href: "/ville/paris/subventions/association/PARIS%20MUSEES", label: "Paris Musées", amount: "65 M€/an" },
  { href: "/ville/paris/subventions/association/THEATRE%20MUSICAL%20DE%20PARIS", label: "Théâtre du Châtelet", amount: "15,6 M€/an" },
  { href: "/ville/paris/subventions/association/THEATRE%20DE%20LA%20VILLE", label: "Théâtre de la Ville", amount: "14,4 M€/an" },
  { href: "/ville/paris/subventions/association/FORUM%20DES%20IMAGES", label: "Forum des Images", amount: "5,9 M€/an" },
  { href: "/ville/paris/subventions/association/ATELIER%20PARISIEN%20D%27URBANISME", label: "Atelier Parisien d'Urbanisme", amount: "5,8 M€/an" },
  { href: "/ville/paris/subventions/association/ORCHESTRE%20DE%20CHAMBRE%20DE%20PARIS", label: "Orchestre de Chambre de Paris", amount: "4,8 M€/an" },
  { href: "/ville/paris/subventions/association/AGOSPAP", label: "AGOSPAP", amount: "7 M€/an" },
  { href: "/ville/paris/subventions/association/ABC%20PUERICULTURE", label: "ABC Puériculture", amount: "8,6 M€/an" },
  { href: "/ville/paris/subventions/association/CRESCENDO", label: "Crescendo (petite enfance)", amount: "6,5 M€/an" },
  // Bailleurs sociaux (Ville)
  { href: "/ville/paris/dette/bailleur/paris-habitat", label: "Paris Habitat", amount: "2,7 Md€ garanties" },
  { href: "/ville/paris/dette/bailleur/rivp", label: "RIVP", amount: "4,25 Md€ garanties" },
  { href: "/ville/paris/dette/bailleur/elogie-siemp", label: "Elogie-Siemp", amount: "1,68 Md€ garanties" },
  // Fournisseurs consensuels neutres
  { href: "/ville/paris/marches/fournisseur/622044501", label: "JCDecaux (mobilier urbain)", amount: "314 M€ cumulés" },
  { href: "/ville/paris/marches/fournisseur/420948226", label: "Eurovia (voirie)", amount: "287 M€ cumulés" },
  { href: "/ville/paris/marches/fournisseur/321057978", label: "Urbaine de Travaux (BTP)", amount: "259 M€ cumulés" },
  { href: "/ville/paris/marches/fournisseur/350050589", label: "Sepur (collecte déchets)", amount: "255 M€ cumulés" },
  // Catégories de marchés
  { href: "/ville/paris/marches/categorie/entretien-des-espaces-verts", label: "Entretien espaces verts", amount: "44 M€ · 23 marchés" },
  { href: "/ville/paris/marches/categorie/travaux-d-amenagement-de-voirie", label: "Travaux de voirie", amount: "30 marchés/an" },
  { href: "/ville/paris/marches/categorie/travaux-de-genie-climatique", label: "Génie climatique", amount: "43 marchés/an" },
  // Postes budgétaires
  { href: "/ville/paris/budget/poste/personnel-admin", label: "Personnel & Administration", amount: "2,53 Md€/an" },
  { href: "/ville/paris/budget/poste/action-sociale", label: "Action sociale", amount: "2,31 Md€/an" },
  { href: "/ville/paris/budget/poste/amenagement-logement", label: "Aménagement & Logement", amount: "1,3 Md€/an" },
  { href: "/ville/paris/budget/poste/education", label: "Éducation", amount: "992 M€/an" },
  { href: "/ville/paris/budget/poste/environnement", label: "Environnement", amount: "918 M€/an" },
  { href: "/ville/paris/budget/poste/transports", label: "Transports", amount: "854 M€/an" },
];

export default function HeroMarquee() {
  // Duplique la liste pour permettre un défilement infini sans cassure visuelle.
  // L'animation se déplace de -50%, ce qui ramène la 2ᵉ moitié à la position de la 1ʳᵉ.
  const doubled = [...ITEMS, ...ITEMS];

  return (
    <section className="fx-marquee" aria-label="Aperçu défilant des entités documentées sur le site">
      <div className="fx-marquee-track">
        {doubled.map((item, i) => (
          <Link
            key={i}
            href={item.href}
            className="fx-marquee-item"
            scroll={false}
            aria-hidden={i >= ITEMS.length ? "true" : undefined}
            tabIndex={i >= ITEMS.length ? -1 : undefined}
          >
            <span className="fx-marquee-label">{item.label}</span>
            <span className="fx-marquee-amount">{item.amount}</span>
          </Link>
        ))}
      </div>
    </section>
  );
}
