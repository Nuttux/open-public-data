import "server-only";
import type { RelatedBlock, RelatedRow } from "@/components/fiche/RelatedLinks";
import { communeNatureSlugs, type CommuneFonctions, type FonctionPart, type NatureFamille } from "@/lib/commune-fonctions";
import { makeFmt } from "@/lib/fmt";
import { deNom } from "@/lib/nom-commune";
import { relatedT } from "@/lib/related-t";

/**
 * "See also" of the commune fiches that read the DGFiP cross-tabulation
 * (/fr/city/[slug]/fonction/…, /nature/…) — components/fiche/RelatedLinks.tsx.
 * Rows come from the commune's own document, the one both routes resolve
 * against; nature rows are limited to the families the manifest declares,
 * which is the list the route and the sitemap serve.
 */
type L = "fr" | "en";
const FMT = { fr: makeFmt("fr"), en: makeFmt("en") };
const eur = (n: number, locale: L) => {
  const c = FMT[locale].fmtCompactEur(n);
  return { v: c.value, u: c.unit };
};
const pct = (share: number | null, locale: L) =>
  share == null ? null : (share * 100).toLocaleString(locale === "en" ? "en-GB" : "fr-FR", { maximumFractionDigits: 1 });

function communeRow(doc: CommuneFonctions, locale: L): RelatedRow {
  const t = relatedT(locale);
  const nom = doc.commune.nom;
  return { href: `/fr/city/${doc.commune.slug}`, label: t("fx.related.commune.page", { nom, de_nom: deNom(nom) }) };
}

/** A public policy of a commune: the commune's other policies, then the commune page. */
export function communeFonctionRelated(doc: CommuneFonctions, fonction: FonctionPart, locale: L): RelatedBlock | null {
  const t = relatedT(locale);
  const rows: RelatedRow[] = doc.fonctions
    .filter((f) => f.slug && f.slug !== fonction.slug && f.montant > 0)
    .sort((a, b) => b.montant - a.montant)
    .slice(0, 5)
    .map((f) => {
      const p = pct(f.share, locale);
      return {
        href: `/fr/city/${doc.commune.slug}/fonction/${f.slug}`,
        label: locale === "en" ? f.libelle_en : f.libelle,
        sub: p != null ? t("fx.related.commune.fonc_sub", { pct: p, year: doc.annee }) : t("fx.related.commune.year_sub", { year: doc.annee }),
        amount: eur(f.montant, locale),
      };
    });
  rows.push(communeRow(doc, locale));
  const nom = doc.commune.nom;
  return { title: t("fx.related.title"), sub: t("fx.related.commune.fonc_block_sub", { nom, de_nom: deNom(nom), year: doc.annee }), rows };
}

/** A spending family of a commune: its other families with a page, then the commune page. */
export function communeNatureRelated(doc: CommuneFonctions, nature: NatureFamille, locale: L): RelatedBlock | null {
  const t = relatedT(locale);
  const served = new Set(communeNatureSlugs(doc.commune.slug));
  const rows: RelatedRow[] = (doc.natures ?? [])
    .filter((n) => n.slug !== nature.slug && served.has(n.slug) && n.montant > 0)
    .sort((a, b) => b.montant - a.montant)
    .slice(0, 5)
    .map((n) => {
      const p = pct(n.share, locale);
      return {
        href: `/fr/city/${doc.commune.slug}/nature/${n.slug}`,
        label: locale === "en" ? n.libelle_en : n.libelle,
        sub: p != null ? t("fx.related.commune.nat_sub", { pct: p, year: doc.annee }) : t("fx.related.commune.year_sub", { year: doc.annee }),
        amount: eur(n.montant, locale),
      };
    });
  rows.push(communeRow(doc, locale));
  const nom = doc.commune.nom;
  return { title: t("fx.related.title"), sub: t("fx.related.commune.nat_block_sub", { nom, de_nom: deNom(nom), year: doc.annee }), rows };
}
