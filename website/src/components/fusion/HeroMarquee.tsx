"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useLocale } from "@/lib/localeContext";

type Item = {
  href: string;
  type: "projet" | "asso" | "bailleur" | "fournisseur" | "categorie" | "poste";
  label_fr: string;
  label_en: string;
  amount_fr: string;
  amount_en: string;
};

/**
 * Curated list of clickable entities for the hero marquee. Each item links
 * to its root drawer intercept. Mix curé :
 *
 *  - Projets nommés (équipements publics visibles)
 *  - Subventions à institutions publiques-publiques (CASVP, Paris Musées, etc.)
 *  - Bailleurs sociaux (Paris Habitat, RIVP, Elogie-Siemp)
 *  - Fournisseurs neutres consensuels (JCDecaux, Eurovia, Sepur, etc.)
 *  - Catégories de marchés (espaces verts, voirie, etc.)
 *  - Postes budgétaires Ville (Action sociale, Éducation, etc.)
 *
 * Aucun fournisseur ambigü politiquement. Aucun bénéficiaire privé hors
 * institutions clairement publiques.
 *
 * L'ordre est interleavé par type (cycle projet → asso → bailleur → fournisseur
 * → catégorie → poste → projet ...) pour qu'à tout moment la fenêtre visible
 * mixe les angles.
 */
const SOURCE: Item[] = [
  // === PROJETS ===
  { href: "/ville/paris/investissements/projet/2024_18_51_019", type: "projet", label_fr: "Piscine Belliard", label_en: "Belliard Swimming Pool", amount_fr: "13,2 M€", amount_en: "€13.2M" },
  { href: "/ville/paris/investissements/projet/2024_19_54_014", type: "projet", label_fr: "Médiathèque James Baldwin", label_en: "James Baldwin Media Library", amount_fr: "6,6 M€", amount_en: "€6.6M" },
  { href: "/ville/paris/investissements/projet/2023_20_57_022", type: "projet", label_fr: "Parc Python-Duvernois", label_en: "Python-Duvernois Park", amount_fr: "4,2 M€", amount_en: "€4.2M" },
  { href: "/ville/paris/investissements/projet/2023_20_57_020", type: "projet", label_fr: "École Davout", label_en: "Davout School", amount_fr: "5,3 M€", amount_en: "€5.3M" },
  { href: "/ville/paris/investissements/projet/2024_18_51_017", type: "projet", label_fr: "Aréna 2 (porte de la Chapelle)", label_en: "Arena 2 (porte de la Chapelle)", amount_fr: "12 M€", amount_en: "€12M" },
  { href: "/ville/paris/investissements/projet/2024_16_45_010", type: "projet", label_fr: "Porte Maillot", label_en: "Porte Maillot", amount_fr: "7,1 M€", amount_en: "€7.1M" },
  { href: "/ville/paris/investissements/projet/2024_20_60_006", type: "projet", label_fr: "Porte de Montreuil", label_en: "Porte de Montreuil", amount_fr: "6,1 M€", amount_en: "€6.1M" },
  { href: "/ville/paris/marches/fournisseur/750043937", type: "fournisseur", label_fr: "Polyreva (propreté)", label_en: "Polyreva (cleaning services)", amount_fr: "235 M€ cumulés", amount_en: "€235M cumulative" },

  // === ASSOS / INSTITUTIONS PUBLIQUES-PUBLIQUES ===
  { href: "/ville/paris/subventions/association/CENTRE%20ACTION%20SOCIALE%20VILLE%20PARIS", type: "asso", label_fr: "CASVP", label_en: "CASVP (city social action)", amount_fr: "416 M€/an", amount_en: "€416M/yr" },
  { href: "/ville/paris/subventions/association/PARIS%20MUSEES", type: "asso", label_fr: "Paris Musées", label_en: "Paris Musées (city museums)", amount_fr: "65 M€/an", amount_en: "€65M/yr" },
  { href: "/ville/paris/subventions/association/THEATRE%20MUSICAL%20DE%20PARIS", type: "asso", label_fr: "Théâtre du Châtelet", label_en: "Théâtre du Châtelet", amount_fr: "15,6 M€/an", amount_en: "€15.6M/yr" },
  { href: "/ville/paris/subventions/association/THEATRE%20DE%20LA%20VILLE", type: "asso", label_fr: "Théâtre de la Ville", label_en: "Théâtre de la Ville", amount_fr: "14,4 M€/an", amount_en: "€14.4M/yr" },
  { href: "/ville/paris/subventions/association/FORUM%20DES%20IMAGES", type: "asso", label_fr: "Forum des Images", label_en: "Forum des Images", amount_fr: "5,9 M€/an", amount_en: "€5.9M/yr" },
  { href: "/ville/paris/subventions/association/ATELIER%20PARISIEN%20D%27URBANISME", type: "asso", label_fr: "Atelier Parisien d'Urbanisme", label_en: "Paris Urban Planning Studio", amount_fr: "5,8 M€/an", amount_en: "€5.8M/yr" },
  { href: "/ville/paris/subventions/association/ORCHESTRE%20DE%20CHAMBRE%20DE%20PARIS", type: "asso", label_fr: "Orchestre de Chambre de Paris", label_en: "Paris Chamber Orchestra", amount_fr: "4,8 M€/an", amount_en: "€4.8M/yr" },
  { href: "/ville/paris/subventions/association/AGOSPAP", type: "asso", label_fr: "AGOSPAP (œuvres sociales agents)", label_en: "AGOSPAP (staff welfare)", amount_fr: "7 M€/an", amount_en: "€7M/yr" },
  { href: "/ville/paris/subventions/association/ABC%20PUERICULTURE", type: "asso", label_fr: "ABC Puériculture", label_en: "ABC Childcare", amount_fr: "8,6 M€/an", amount_en: "€8.6M/yr" },
  { href: "/ville/paris/subventions/association/CRESCENDO", type: "asso", label_fr: "Crescendo (petite enfance)", label_en: "Crescendo (early childhood)", amount_fr: "6,5 M€/an", amount_en: "€6.5M/yr" },
  { href: "/ville/paris/subventions/association/ALTERALIA", type: "asso", label_fr: "Alteralia (social)", label_en: "Alteralia (social action)", amount_fr: "7,3 M€/an", amount_en: "€7.3M/yr" },

  // === BAILLEURS ===
  { href: "/ville/paris/dette/bailleur/paris-habitat", type: "bailleur", label_fr: "Paris Habitat", label_en: "Paris Habitat (social housing)", amount_fr: "2,7 Md€ garanties", amount_en: "€2.7Bn guarantees" },
  { href: "/ville/paris/dette/bailleur/rivp", type: "bailleur", label_fr: "RIVP", label_en: "RIVP (social housing)", amount_fr: "4,25 Md€ garanties", amount_en: "€4.25Bn guarantees" },
  { href: "/ville/paris/dette/bailleur/elogie-siemp", type: "bailleur", label_fr: "Elogie-Siemp", label_en: "Elogie-Siemp (social housing)", amount_fr: "1,68 Md€ garanties", amount_en: "€1.68Bn guarantees" },
  { href: "/ville/paris/dette/bailleur/3f-residences", type: "bailleur", label_fr: "Immobilière 3F", label_en: "Immobilière 3F", amount_fr: "560 M€ garanties", amount_en: "€560M guarantees" },
  { href: "/ville/paris/dette/bailleur/icf-habitat", type: "bailleur", label_fr: "ICF Habitat La Sablière", label_en: "ICF Habitat La Sablière", amount_fr: "510 M€ garanties", amount_en: "€510M guarantees" },
  { href: "/ville/paris/dette/bailleur/batigere", type: "bailleur", label_fr: "Batigère Habitat IDF", label_en: "Batigère Habitat IDF", amount_fr: "420 M€ garanties", amount_en: "€420M guarantees" },

  // === FOURNISSEURS NEUTRES CONSENSUELS ===
  { href: "/ville/paris/marches/fournisseur/622044501", type: "fournisseur", label_fr: "JCDecaux (mobilier urbain)", label_en: "JCDecaux (street furniture)", amount_fr: "314 M€ cumulés", amount_en: "€314M cumulative" },
  { href: "/ville/paris/marches/fournisseur/420948226", type: "fournisseur", label_fr: "Eurovia (voirie)", label_en: "Eurovia (roadworks)", amount_fr: "287 M€ cumulés", amount_en: "€287M cumulative" },
  { href: "/ville/paris/marches/fournisseur/321057978", type: "fournisseur", label_fr: "Urbaine de Travaux (BTP)", label_en: "Urbaine de Travaux (construction)", amount_fr: "259 M€ cumulés", amount_en: "€259M cumulative" },
  { href: "/ville/paris/marches/fournisseur/350050589", type: "fournisseur", label_fr: "Sepur (collecte déchets)", label_en: "Sepur (waste collection)", amount_fr: "255 M€ cumulés", amount_en: "€255M cumulative" },
  { href: "/ville/paris/marches/fournisseur/433900834", type: "fournisseur", label_fr: "Bouygues Bâtiment IDF", label_en: "Bouygues Bâtiment IDF", amount_fr: "237 M€ cumulés", amount_en: "€237M cumulative" },
  { href: "/ville/paris/marches/fournisseur/444578389", type: "fournisseur", label_fr: "Polysotis (propreté urbaine)", label_en: "Polysotis (urban cleaning)", amount_fr: "419 M€ cumulés", amount_en: "€419M cumulative" },
  { href: "/ville/paris/marches/fournisseur/441408812", type: "fournisseur", label_fr: "Korrigan (propreté)", label_en: "Korrigan (cleaning services)", amount_fr: "195 M€ cumulés", amount_en: "€195M cumulative" },
  { href: "/ville/paris/marches/fournisseur/424982650", type: "fournisseur", label_fr: "SCC France (informatique)", label_en: "SCC France (IT services)", amount_fr: "222 M€ cumulés", amount_en: "€222M cumulative" },
  { href: "/ville/paris/marches/fournisseur/325807220", type: "fournisseur", label_fr: "Maintenance Industrie (bâtiments)", label_en: "Maintenance Industrie (buildings)", amount_fr: "192 M€ cumulés", amount_en: "€192M cumulative" },

  // === CATÉGORIES MARCHÉS ===
  { href: "/ville/paris/marches/categorie/entretien-des-espaces-verts", type: "categorie", label_fr: "Entretien espaces verts", label_en: "Green spaces maintenance", amount_fr: "44 M€ · 23 marchés", amount_en: "€44M · 23 contracts" },
  { href: "/ville/paris/marches/categorie/travaux-d-am-nagement-de-voirie", type: "categorie", label_fr: "Travaux de voirie", label_en: "Roadworks", amount_fr: "30 marchés/an", amount_en: "30 contracts/yr" },
  { href: "/ville/paris/marches/categorie/travaux-de-g-nie-climatique", type: "categorie", label_fr: "Génie climatique", label_en: "Climate engineering", amount_fr: "43 marchés/an", amount_en: "43 contracts/yr" },
  { href: "/ville/paris/marches/categorie/prestations-intellectuelles", type: "categorie", label_fr: "Prestations intellectuelles", label_en: "Consulting services", amount_fr: "119 marchés/an", amount_en: "119 contracts/yr" },
  { href: "/ville/paris/marches/categorie/fournitures-courantes-et-services", type: "categorie", label_fr: "Fournitures courantes & services", label_en: "Office supplies & services", amount_fr: "126 marchés/an", amount_en: "126 contracts/yr" },
  { href: "/ville/paris/marches/categorie/maitrise-d-oeuvre-btp", type: "categorie", label_fr: "Maîtrise d'œuvre BTP", label_en: "Construction supervision", amount_fr: "54 marchés/an", amount_en: "54 contracts/yr" },

  // === POSTES BUDGÉTAIRES ===
  { href: "/ville/paris/budget/poste/personnel-admin", type: "poste", label_fr: "Personnel & Administration", label_en: "Personnel & Administration", amount_fr: "2,53 Md€/an", amount_en: "€2.53Bn/yr" },
  { href: "/ville/paris/budget/poste/action-sociale", type: "poste", label_fr: "Action sociale", label_en: "Social action", amount_fr: "2,31 Md€/an", amount_en: "€2.31Bn/yr" },
  { href: "/ville/paris/budget/poste/amenagement-logement", type: "poste", label_fr: "Aménagement & Logement", label_en: "Housing & Planning", amount_fr: "1,3 Md€/an", amount_en: "€1.3Bn/yr" },
  { href: "/ville/paris/budget/poste/education", type: "poste", label_fr: "Éducation", label_en: "Education", amount_fr: "992 M€/an", amount_en: "€992M/yr" },
  { href: "/ville/paris/budget/poste/environnement", type: "poste", label_fr: "Environnement", label_en: "Environment", amount_fr: "918 M€/an", amount_en: "€918M/yr" },
  { href: "/ville/paris/budget/poste/transports", type: "poste", label_fr: "Transports", label_en: "Transport", amount_fr: "854 M€/an", amount_en: "€854M/yr" },
  { href: "/ville/paris/budget/poste/culture-sport", type: "poste", label_fr: "Culture & Sport", label_en: "Culture & Sports", amount_fr: "795 M€/an", amount_en: "€795M/yr" },
  { href: "/ville/paris/budget/poste/securite", type: "poste", label_fr: "Sécurité", label_en: "Security", amount_fr: "514 M€/an", amount_en: "€514M/yr" },
  { href: "/ville/paris/budget/poste/remboursement-dette", type: "poste", label_fr: "Remboursement de la dette", label_en: "Debt repayment", amount_fr: "710 M€/an", amount_en: "€710M/yr" },
  { href: "/ville/paris/budget/poste/economie", type: "poste", label_fr: "Économie", label_en: "Economy", amount_fr: "92 M€/an", amount_en: "€92M/yr" },
];

/** Interleave items by type — round-robin cycle through type buckets so the
 *  visible window always mixes angles instead of a long run of same type. */
function interleaveByType(items: Item[]): Item[] {
  const buckets = new Map<Item["type"], Item[]>();
  for (const it of items) {
    if (!buckets.has(it.type)) buckets.set(it.type, []);
    buckets.get(it.type)!.push(it);
  }
  const queues = [...buckets.values()];
  const out: Item[] = [];
  while (queues.some((q) => q.length > 0)) {
    for (const q of queues) {
      const next = q.shift();
      if (next) out.push(next);
    }
  }
  return out;
}

const ITEMS = interleaveByType(SOURCE);

export default function HeroMarquee() {
  const { locale } = useLocale();
  const isEn = locale === "en";
  // Duplique la liste pour permettre un défilement infini sans cassure visuelle.
  // L'animation se déplace de -50%, ce qui ramène la 2ᵉ moitié à la position de la 1ʳᵉ.
  const doubled = [...ITEMS, ...ITEMS];

  // Démarrage à un point aléatoire du cycle de 65s (pour ne pas voir toujours
  // le même item d'abord). Appliqué post-mount pour éviter un mismatch
  // d'hydration server/client.
  const [delaySec, setDelaySec] = useState<number | null>(null);
  useEffect(() => {
    setDelaySec(-Math.random() * 65);
  }, []);

  return (
    <section className="fx-marquee" aria-label={isEn ? "Scrolling preview of entities documented on this site" : "Aperçu défilant des entités documentées sur le site"}>
      <div
        className="fx-marquee-track"
        style={delaySec !== null ? { animationDelay: `${delaySec}s` } : undefined}
      >
        {doubled.map((item, i) => (
          <Link
            key={i}
            href={item.href}
            className="fx-marquee-item"
            scroll={false}
            aria-hidden={i >= ITEMS.length ? "true" : undefined}
            tabIndex={i >= ITEMS.length ? -1 : undefined}
          >
            <span className="fx-marquee-label">{isEn ? item.label_en : item.label_fr}</span>
            <span className="fx-marquee-amount">{isEn ? item.amount_en : item.amount_fr}</span>
          </Link>
        ))}
      </div>
    </section>
  );
}
