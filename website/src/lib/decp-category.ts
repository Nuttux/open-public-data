/**
 * The eleven purchase categories of the national contracts model (DECP),
 * written in French by the pipeline for every commune. The English page
 * names them in English ; a label not listed stays as the source has it.
 */
const DECP_CATEGORY_EN: Record<string, string> = {
  "Administration publique": "Public administration",
  "Alimentation & Restauration": "Food and catering",
  "Construction & Bâtiment": "Construction and buildings",
  "Culture & Loisirs": "Culture and leisure",
  "Environnement & Propreté": "Environment and cleaning",
  "Informatique & Télécom": "IT and telecoms",
  "Santé & Social": "Health and social care",
  "Services professionnels": "Professional services",
  "Transport & Véhicules": "Transport and vehicles",
  "Éducation & Formation": "Education and training",
  "Énergie": "Energy",
  "Autres": "Other",
};

export function decpCategory(label: string, locale: string): string {
  if (locale === "en") return DECP_CATEGORY_EN[label] ?? label;
  return label.replace(/ & /g, " et ");
}
