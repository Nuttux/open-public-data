/**
 * Module SANS import serveur : utilisable dans les composants client (les
 * loaders de communes tirent le client GCS, qui ne se bundle pas côté navigateur).
 */

const SIGLES = new Set(["SA", "SAS", "SASU", "SARL", "SNC", "SCI", "SCOP", "SEM", "SPL", "EURL", "EPIC", "EDF", "GDF", "RATP", "SNCF", "CCAS", "OPH", "BTP", "TP", "IDF", "GIE", "OPAC", "OPHLM", "HLM", "UGAP", "ONF", "APAVE", "AFPA", "CNRS", "INRAE", "PACA", "AURA", "BFC", "CVL", "LTDA", "EIRELI", "EPP", "MEI",
  // Sigles fréquents des bénéficiaires de subventions (ceux sans voyelle restent en capitales tout seuls).
  "CASVP", "AP", "HP", "UNESCO", "CAF", "CPAM", "CNAF", "CROUS", "INSEE", "UNICEF", "ONU", "OCDE", "ADIL", "USEP", "UNSS", "EHPAD", "ESAT", "IME", "PMI", "CIDFF", "LGBT", "LGBTQI", "SOS", "ATD", "ACAT", "CGT", "CFDT", "FO", "UNEF", "CNOSF", "CROSIF", "ADAGP", "SACEM", "SACD", "CNC", "INA", "ENS", "ESPCI", "IRCAM", "CNAM", "APUR", "SEMAPA", "RIVP", "ANRU", "ADEME", "ANAH", "AFD", "UE", "CCI", "CMA", "MJC", "ASBL", "AMAP", "ESS", "SIAE", "ACI", "EI", "ETTI", "GEIQ", "IRIS", "OPCO", "AFEV", "FSGT", "UFOLEP", "UCPA", "MGEN", "APF", "UNAPEI", "APAJH", "ARS", "ESG", "ICF", "CGTH", "EGIS"]);
/** Mots français que la source écrit en capitales sans accents : un seul
 *  accentuation possible pour chacun, sinon il n'est pas dans la liste. */
const ACCENTS: Record<string, string> = {
  BATIMENT: "Bâtiment", BATIMENTS: "Bâtiments",
  THEATRE: "Théâtre", THEATRES: "Théâtres", ECOLE: "École", ECOLES: "Écoles", EDUCATION: "Éducation", EDUCATIVE: "Éducative", EDUCATIF: "Éducatif",
  SOCIETE: "Société", SOCIETES: "Sociétés", ETUDES: "Études", ETUDIANTS: "Étudiants", ETUDIANT: "Étudiant", ENERGIE: "Énergie", ENERGIES: "Énergies",
  ETABLISSEMENT: "Établissement", ETABLISSEMENTS: "Établissements", REGIE: "Régie", REGION: "Région", REGIONAL: "Régional", REGIONALE: "Régionale",
  METROPOLE: "Métropole", CITE: "Cité", CITES: "Cités", MUSEE: "Musée", MUSEES: "Musées", OPERA: "Opéra", SANTE: "Santé", SECURITE: "Sécurité",
  SOLIDARITE: "Solidarité", SOLIDARITES: "Solidarités", COMITE: "Comité", FEDERATION: "Fédération", FRANCAIS: "Français", FRANCAISE: "Française",
  ECONOMIE: "Économie", ECONOMIQUE: "Économique", EQUIPEMENT: "Équipement", EQUIPEMENTS: "Équipements", ELEVES: "Élèves", HOPITAL: "Hôpital",
  HOPITAUX: "Hôpitaux", GENERAL: "Général", GENERALE: "Générale", DEPARTEMENT: "Département", DEPARTEMENTAL: "Départemental",
  DEVELOPPEMENT: "Développement", MEDIATION: "Médiation", ACTIVITES: "Activités", CREATION: "Création", CREATIONS: "Créations", AGEES: "Âgées",
  EGALITE: "Égalité", LIBERTE: "Liberté", RESIDENCE: "Résidence", RESIDENCES: "Résidences", PREVENTION: "Prévention", CINEMA: "Cinéma",
  CINEMAS: "Cinémas", MEDECINS: "Médecins", MEDICAL: "Médical", MEDICALE: "Médicale", MEDICO: "Médico", EVENEMENTS: "Événements",
  CHATELET: "Châtelet", CHATEAU: "Château", BIBLIOTHEQUE: "Bibliothèque", BIBLIOTHEQUES: "Bibliothèques", MEDIATHEQUE: "Médiathèque",
  UNIVERSITE: "Université", ELYSEES: "Élysées", GAITE: "Gaîté", SCENE: "Scène", SCENES: "Scènes", ETOILE: "Étoile", DELEGATION: "Délégation",
  RESEAU: "Réseau", RESEAUX: "Réseaux", SEJOURS: "Séjours", DIVERSITE: "Diversité", HUMANITE: "Humanité", CHARITE: "Charité",
  INTEGRATION: "Intégration", IMMIGRES: "Immigrés", REFUGIES: "Réfugiés", HEBERGEMENT: "Hébergement", HANDICAPES: "Handicapés",
  CHOREGRAPHIQUE: "Chorégraphique", METIERS: "Métiers", ACADEMIE: "Académie", ECOLOGIE: "Écologie", ECOLOGIQUE: "Écologique", EGLISE: "Église",
  CATHEDRALE: "Cathédrale", COLLEGE: "Collège", LYCEE: "Lycée", LYCEES: "Lycées", CRECHE: "Crèche", CRECHES: "Crèches", THERAPEUTIQUE: "Thérapeutique",
  PERISCOLAIRE: "Périscolaire", COOPERATIVE: "Coopérative", COOPERATION: "Coopération", EDITIONS: "Éditions", ESPERANCE: "Espérance",
  ELECTRICITE: "Électricité", ELECTRIQUE: "Électrique", ENTREPRISES: "Entreprises", ADMINISTRE: "Administré", MUSEUM: "Muséum",
  PATRIMONIAL: "Patrimonial", HABITAT: "Habitat", AMENAGEMENT: "Aménagement", SYNDICAT: "Syndicat", TELEVISION: "Télévision",
  FESTIVAL: "Festival", PREFECTURE: "Préfecture", SENAT: "Sénat", REPUBLIQUE: "République", ETAT: "État",
};

const MINUSCULES = new Set(["de", "du", "des", "et", "la", "le", "les", "en", "sur", "sous", "au", "aux", "d", "l", "pour", "par"]);

/** Affichage d'une raison sociale DECP (souvent en capitales) : casse de
 *  titre, sigles gardés en capitales (sans voyelle, avec chiffre, ou liste
 *  connue), petits mots en minuscules. Une raison sociale déjà en casse
 *  mixte est laissée telle quelle. */
export function displayFournisseur(nom: string): string {
  const s = nom.trim();
  if (s !== s.toUpperCase()) return s;
  return s
    .split(/(\s+|[-/()'’])/)
    .map((tok, i) => {
      if (!/[A-Za-zÀ-ÿ0-9]/.test(tok)) return tok;
      const up = tok.toUpperCase();
      if (SIGLES.has(up) || /[\d.]/.test(up) || (up.length <= 4 && !/[AEIOUYÀÂÉÈÊËÎÏÔÙÛÜ]/.test(up))) return up;
      const low = tok.toLowerCase();
      if (i > 0 && MINUSCULES.has(low)) return low;
      if (ACCENTS[up]) return ACCENTS[up];
      return low.charAt(0).toUpperCase() + low.slice(1);
    })
    .join("");
}

/** Nom d'un bénéficiaire ou d'un titulaire pour un titre ou une rangée : la
 *  même casse que les raisons sociales. La graphie de la source reste dite sur
 *  la fiche, sous la phrase de tête. */
export const displayOrgName = displayFournisseur;
