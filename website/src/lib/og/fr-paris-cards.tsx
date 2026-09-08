import { shareCard } from "@/lib/og/card";
import { themeFor, themeImage, localPhotoDataUri } from "@/lib/og/theme-image";
import { ogFmtEur, ogFmtFr } from "@/lib/og";
import { loadLieuxIndex } from "@/lib/lieux-data";
import { loadAssociation, loadContrat, loadFournisseur, loadMarcheVulgarization } from "@/lib/fusion-data";
import { assocSlug } from "@/lib/assoc-slug";

/**
 * Paris share cards, on the shared template.
 *
 * The lieu card is new: the most photogenic and most linkable Paris entity had
 * no opengraph-image at all, so those 157 photos never reached a feed.
 */

const SOURCE = "Paris Open Data";

/** A share card must never 500 — a failed card means the shared link renders
 *  nothing at all. Any loader that throws (the exports use both a throwing and
 *  a nullable reader) degrades to a plainer card instead. */
function safe<T>(load: () => T): T | null {
  try {
    return load();
  } catch {
    return null;
  }
}


export function renderParisLieuOg(slug: string) {
  const lieu = safe(() => loadLieuxIndex().find((l) => l.slug === slug)) ?? undefined;
  const nom = lieu?.name ?? "Paris";

  const own = localPhotoDataUri(lieu?.photo);
  const borrowed = own ? null : themeImage(themeFor(lieu?.kind_fr, lieu?.famille), "paris", "fr");

  const arr = lieu?.arrondissement ? `${lieu.arrondissement}e` : null;

  return shareCard({
    route: "/lieux",
    kicker: [lieu?.kind_fr, arr ? `Paris ${arr}` : "Paris"].filter(Boolean).join(" · "),
    title: nom,
    figure: lieu?.argent_total_eur
      ? {
          label: "Argent engagé",
          value: ogFmtEur(lieu.argent_total_eur),
          qualifier: lieu.n_moments
            ? `${ogFmtFr(lieu.n_moments)} décisions et opérations recensées`
            : undefined,
        }
      : null,
    image: own ?? borrowed?.src ?? null,
    imageCaption: borrowed?.caption ?? null,
    source: SOURCE,
    url: `qipu.org/fr/city/paris/lieu/${slug}`,
  });
}

export function renderParisContratOg(numero: string) {
  const c = safe(() => loadContrat(numero, "paris"));
  // Same precedence as the fiche: the plain-French rewrite when it exists,
  // the raw DECP label otherwise.
  const vulg = safe(() => loadMarcheVulgarization(numero, "paris"));
  const titre = vulg?.objet_clair ?? c?.objet ?? `Marché ${numero}`;

  // montantMax is the notified envelope; montantMin only differs on ranged lots.
  const montant = c?.montantMax || c?.montantMin || 0;
  const borrowed = themeImage(themeFor(c?.categorie, c?.objet), "paris", "fr");

  return shareCard({
    route: "/marches",
    kicker: [c?.categorie, `Marché ${numero}`].filter(Boolean).join(" · "),
    title: titre,
    figure: montant
      ? {
          label: "Montant notifié",
          value: ogFmtEur(montant),
          // "MARCHE MULTIATTRIBUTAIRE" is the register's placeholder for a
          // multi-awardee lot, not a supplier — say that in French instead of
          // printing the placeholder as if it were a company.
          qualifier: [
            c?.multiAttributaire ? "plusieurs titulaires" : c?.fournisseur,
            c?.year ? `notifié en ${c.year}` : null,
          ]
            .filter(Boolean)
            .join(", "),
        }
      : null,
    image: borrowed?.src ?? null,
    imageCaption: borrowed?.caption ?? null,
    source: `${SOURCE} · DECP`,
    url: `qipu.org/fr/city/paris/marches/contrat/${numero}`,
  });
}

export function renderParisFournisseurOg(siren: string) {
  const f = safe(() => loadFournisseur(siren, "paris"));
  const nom = f?.nom ?? "Fournisseur";
  // The supplier's biggest category is the best theme signal it carries.
  const topCat = f?.byCategory?.slice().sort((a, b) => b.amount - a.amount)[0]?.category;
  const borrowed = themeImage(themeFor(topCat), "paris", "fr");

  return shareCard({
    route: "/marches",
    kicker: "Fournisseur de la Ville · Paris",
    title: nom,
    figure: f?.totalAmount
      ? {
          label: "Cumul notifié",
          value: ogFmtEur(f.totalAmount),
          qualifier: f.contratCount ? `${ogFmtFr(f.contratCount)} marchés notifiés` : undefined,
        }
      : null,
    image: borrowed?.src ?? null,
    imageCaption: borrowed?.caption ?? null,
    source: `${SOURCE} · DECP`,
    url: `qipu.org/fr/city/paris/marches/fournisseur/${siren}`,
  });
}

export function renderParisAssociationOg(slug: string) {
  const a = safe(() => loadAssociation(slug, "paris"));
  const nom = a?.name ?? "Association";
  const borrowed = themeImage(themeFor(a?.theme), "paris", "fr");

  const annees =
    a?.yearsActive?.length
      ? `${Math.min(...a.yearsActive)}–${Math.max(...a.yearsActive)}`
      : null;

  return shareCard({
    route: "/subventions",
    kicker: [a?.theme, "Paris"].filter(Boolean).join(" · "),
    title: nom,
    figure: a?.totalAmount
      ? {
          label: "Cumul reçu",
          value: ogFmtEur(a.totalAmount),
          qualifier: [
            a.subventionCount ? `${ogFmtFr(a.subventionCount)} subventions` : null,
            annees,
          ]
            .filter(Boolean)
            .join(", "),
        }
      : null,
    image: borrowed?.src ?? null,
    imageCaption: borrowed?.caption ?? null,
    source: SOURCE,
    url: `qipu.org/fr/city/paris/subventions/association/${assocSlug(decodeURIComponent(slug))}`,
  });
}
