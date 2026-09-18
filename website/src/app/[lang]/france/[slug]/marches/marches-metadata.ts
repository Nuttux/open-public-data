import type { Metadata } from "next";
import { marchesManifestEntry } from "@/lib/commune-marches";
import { deNom } from "@/lib/nom-commune";
import { buildLocaleAwareMetadata } from "@/lib/seo";
import type { FrHub } from "@/lib/seo/sections/national";

/** The DECP file every commune explorer cites (data.gouv.fr, consolidated). */
export const DECP_SOURCE_URL =
  "https://www.data.gouv.fr/fr/datasets/donnees-essentielles-de-la-commande-publique-consolidees-format-tabulaire/";

/**
 * <title> and description of a commune's public-contracts explorer, from the
 * committed manifest (same total as the page header, no bucket read). Shared
 * by the national route and the cities that keep their own address
 * (Marseille, `france/marseille/marches`).
 */
export function communeMarchesMetadata(slug: string, nom: string): Promise<Metadata> {
  const path = `/france/${slug}/marches`;
  const m = marchesManifestEntry(slug);
  // Une série finie depuis plus de deux ans ne va pas dans le titre (voir
  // lib/seo/sections/marseille.ts, isRecent) : titre descriptif, sans chiffre.
  if (!m || m.nb === 0 || m.years.length === 0 || Math.max(...m.years) < new Date().getFullYear() - 2) {
    return buildLocaleAwareMetadata({
      title: `Les marchés publics ${deNom(nom)}`,
      description: `Montants, fournisseurs et domaines des marchés publics ${deNom(nom)}. Source : DECP consolidé (data.gouv.fr).`,
      en: {
        title: `The public contracts of ${nom}`,
        description: `Amounts, suppliers and categories of ${nom}'s public contracts. Source: consolidated DECP (data.gouv.fr).`,
      },
      path,
    });
  }
  const y0 = Math.min(...m.years);
  const y1 = Math.max(...m.years);
  // Même arrondi que l'en-tête (CommuneMarchesClient, split()).
  const amount = (tag: string) => {
    const a = Math.abs(m.montant);
    // English writes the euro first and its unit after (« €4.85B ») ; French
    // keeps « 4,85 Md€ ». Same rounding as the page header (split()).
    const en = tag === "en-GB";
    if (a >= 1e9) { const v = (m.montant / 1e9).toLocaleString(tag, { maximumFractionDigits: 2 }); return en ? `€${v}B` : `${v} Md€`; }
    if (a >= 1e6) { const v = (m.montant / 1e6).toLocaleString(tag, { maximumFractionDigits: a >= 1e8 ? 0 : 1 }); return en ? `€${v}M` : `${v} M€`; }
    const v = Math.round(m.montant / 1e3).toLocaleString(tag);
    return en ? `€${v}k` : `${v} k€`;
  };
  const nbFr = m.nb.toLocaleString("fr-FR");
  const nbEn = m.nb.toLocaleString("en-GB");
  return buildLocaleAwareMetadata({
    title: `Marchés publics ${deNom(nom)} : ${nbFr} marchés, ${amount("fr-FR")}`,
    description: `${nom} a notifié ${nbFr} marchés publics de ${y0} à ${y1}, pour ${amount("fr-FR")} de contrats : fournisseurs, domaines et montants, année par année. Source : DECP consolidé (data.gouv.fr).`,
    en: {
      title: `${nom} public contracts: ${nbEn} awarded, ${amount("en-GB")}`,
      description: `${nom} awarded ${nbEn} public contracts from ${y0} to ${y1}, worth ${amount("en-GB")}: suppliers, categories and amounts, year by year. Source: consolidated DECP (data.gouv.fr).`,
    },
    path,
  });
}

/**
 * The same page as a hub for the JSON-LD (BreadcrumbList + Dataset) the other
 * section pages carry (2026-09-18) : Qipu › commune › Marchés publics, the
 * answer in both languages, the DECP file as the dataset.
 */
export function communeMarchesHub(slug: string, nom: string): FrHub {
  const path = `/france/${slug}/marches`;
  const m = marchesManifestEntry(slug);
  const years = m && m.years.length ? m.years.slice().sort((a, b) => a - b) : [];
  const recent = years.length > 0 && years[years.length - 1] >= new Date().getFullYear() - 2;
  const nbFr = m ? m.nb.toLocaleString("fr-FR") : "";
  const nbEn = m ? m.nb.toLocaleString("en-GB") : "";
  const fr = recent && m
    ? { title: `Marchés publics ${deNom(nom)} : ${nbFr} marchés`, description: `${nom} a notifié ${nbFr} marchés publics de ${years[0]} à ${years[years.length - 1]} : fournisseurs, domaines et montants, année par année. Source : DECP consolidé (data.gouv.fr).` }
    : { title: `Les marchés publics ${deNom(nom)}`, description: `Montants, fournisseurs et domaines des marchés publics ${deNom(nom)}. Source : DECP consolidé (data.gouv.fr).` };
  const en = recent && m
    ? { title: `${nom} public contracts: ${nbEn} awarded`, description: `${nom} awarded ${nbEn} public contracts from ${years[0]} to ${years[years.length - 1]}: suppliers, categories and amounts, year by year. Source: consolidated DECP (data.gouv.fr).` }
    : { title: `The public contracts of ${nom}`, description: `Amounts, suppliers and categories of ${nom}'s public contracts. Source: consolidated DECP (data.gouv.fr).` };
  return {
    path,
    fr,
    en,
    parents: [{ fr: nom, en: nom, path: `/france/${slug}` }],
    crumb: { fr: "Marchés publics", en: "Public contracts" },
    dataset: {
      creator: "data.gouv.fr — Données essentielles de la commande publique (DECP), consolidées",
      license: "https://www.etalab.gouv.fr/licence-ouverte-open-licence/",
      spatialCoverage: nom,
      temporalCoverage: years.length ? `${years[0]}/${years[years.length - 1]}` : undefined,
      keywords: ["marchés publics", "commande publique", "DECP", nom],
    },
  };
}
