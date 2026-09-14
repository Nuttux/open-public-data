import { displayOrgName } from "./fournisseur-display";

/**
 * Nom d'un organisme prêteur tel qu'un lecteur le reconnaît. La source
 * (jeu « dette-garantie », opendata.paris.fr) écrit des sigles : « CDC »,
 * « LBP », « CE ». On ne développe que les sigles sans ambiguïté dans le
 * financement du logement social, variantes d'écriture comprises ; les autres
 * restent tels que publiés.
 */
const PRETEURS: Record<string, string> = {
  "CDC": "Caisse des Dépôts",
  "LBP": "La Banque Postale",
  "BANQUE POSTALE ENTREPRISE": "La Banque Postale",
  "CE": "Caisse d’Épargne",
  "LBP/CE": "La Banque Postale et Caisse d’Épargne",
  "CA": "Crédit Agricole",
  "CA IDF": "Crédit Agricole Île-de-France",
  "CRCA IDF": "Crédit Agricole Île-de-France",
  "SG": "Société Générale",
  "CF": "Crédit Foncier",
  "CFF": "Crédit Foncier",
  "CRÉDIT FONCIER": "Crédit Foncier",
  "BAYER LB": "Bayerische Landesbank",
  "BAYER L.": "Bayerische Landesbank",
  "BAYERISCHE L.": "Bayerische Landesbank",
  "DP AG": "Deutsche Pfandbriefbank",
  "DPAG": "Deutsche Pfandbriefbank",
  "DEUTSCHE P. AG": "Deutsche Pfandbriefbank",
  "ARKEA": "Arkéa",
  "CCOOP": "Crédit Coopératif",
  "SFIL - CFFL": "SFIL",
  "BEI": "Banque européenne d’investissement",
  "BNP": "BNP Paribas",
  "BNPP": "BNP Paribas",
  "DEXIA": "Dexia",
  "DEXIA-CLF": "Dexia",
  "DEXIA CLF": "Dexia",
  "DEXIA-CFFL": "Dexia",
};

export function displayPreteur(raw: string | null | undefined): string {
  const name = (raw ?? "").trim();
  if (!name) return "";
  const known = PRETEURS[name.toUpperCase()];
  if (known) return known;
  // Un sigle inconnu reste en capitales : « GIC » ne doit pas devenir « Gic ».
  if (/^[A-Z0-9.&/-]{2,6}$/.test(name)) return name;
  return displayOrgName(name);
}
