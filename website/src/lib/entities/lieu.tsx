import Link from "@/components/LocalizedLink";

import LieuFiche from "@/components/fusion/LieuFiche";
import LieuxVoisins from "@/components/fusion/LieuxVoisins";
import type { EntityPageConfig } from "@/lib/entity-page";
import { loadLieu, loadLieuxIndex } from "@/lib/lieux-data";
import { clip, dataDate, eur, int, ordEn, ordFr, sourceLine, type SeoAnswer } from "@/lib/entities/seo-text";
import { lieuRelated } from "@/lib/entities/related";

type D = { lieu: NonNullable<ReturnType<typeof loadLieu>> };

export function lieuStaticParams(): { slug: string }[] {
  return loadLieuxIndex().map((l) => ({ slug: l.slug }));
}

/**
 * La phrase d'accroche ne promet que ce que la fiche contient.
 *
 * Elle annonçait à toutes les fiches « N délibérations du Conseil de Paris, les
 * extraits du Bulletin municipal depuis 1882 et les investissements de la
 * Ville ». Sur les lieux ajoutés le 2026-09-11, cela donnait « 0 délibération »
 * et promettait une archive absente. Un lecteur arrivé par un moteur de
 * recherche sur cette promesse repart : on n'énumère donc que les registres
 * réellement présents, et l'argent d'abord quand il y en a.
 */
function lieuAnswer(lieu: D["lieu"], locale: "fr" | "en"): SeoAnswer {
  const n = lieu.stats.n_lieu ?? 0;
  const kind = (locale === "en" ? lieu.kind_en : lieu.kind_fr) || "";
  const where = lieu.arrondissement > 0 ? `, ${locale === "en" ? ordEn(lieu.arrondissement) : ordFr(lieu.arrondissement)} arrondissement` : "";
  const date = dataDate("lieux/index.json", locale);
  const src = "Conseil de Paris, Bulletin municipal officiel, opendata.paris.fr";
  // Le total d'argent fait autorité dans l'index (l'export y dédoublonne les
  // chantiers publiés deux fois) — on ne le recalcule pas depuis la fiche.
  const euros = loadLieuxIndex().find((l) => l.slug === lieu.slug)?.argent_total_eur ?? 0;
  const nBmo = lieu.bmo_extraits?.length ?? 0;
  const depuis = lieu.seuil_commun;
  const bits: string[] = [];
  // Titre : le nom, puis le premier chiffre de la phrase (l'argent, sinon les
  // délibérations) ; sans l'un ni l'autre, l'arrondissement que la fiche affiche.
  const name = clip(lieu.name, 38);
  const arr = lieu.arrondissement > 0 ? (locale === "en" ? ordEn(lieu.arrondissement) : ordFr(lieu.arrondissement)) : null;
  if (locale === "en") {
    if (euros > 0) bits.push(`${eur(euros, "en")} of City money${depuis ? ` since ${depuis}` : ""}`);
    if (n > 0) bits.push(`${int(n, "en")} Paris Council deliberation${n > 1 ? "s" : ""}`);
    if (nBmo > 0) bits.push("municipal bulletin extracts");
    return {
      title: euros > 0
        ? `${name}: ${eur(euros, "en")} of City money (Paris)`
        : n > 0
          ? `${name}: ${int(n, "en")} Paris Council deliberation${n > 1 ? "s" : ""}`
          : `${name}, Paris${arr ? ` ${arr} arrondissement` : ""}`,
      answer: `${lieu.name} (${kind.toLowerCase()}${where}): ${liste(bits, "en")}, every fact linked to its source. ${sourceLine("en", src, date)}`,
    };
  }
  if (euros > 0) bits.push(`${eur(euros, "fr")} d’argent public${depuis ? ` depuis ${depuis}` : ""}`);
  if (n > 0) bits.push(`${int(n, "fr")} délibération${n > 1 ? "s" : ""} du Conseil de Paris`);
  if (nBmo > 0) bits.push("des extraits du Bulletin municipal officiel");
  return {
    title: euros > 0
      ? `${name} : ${eur(euros, "fr")} d’argent public (Paris)`
      : n > 0
        ? `${name} : ${int(n, "fr")} délibération${n > 1 ? "s" : ""} du Conseil de Paris`
        : `${name}, Paris${arr ? ` ${arr}` : ""}`,
    answer: `${lieu.name} (${kind.toLowerCase()}${where}) : ${liste(bits, "fr")}, chaque fait relié à sa source. ${sourceLine("fr", src, date)}`,
  };
}

/** « a, b et c » — une énumération lisible, vide si rien à annoncer. */
function liste(bits: string[], locale: "fr" | "en"): string {
  if (!bits.length) return locale === "en" ? "what the City publishes about it" : "ce que la Ville en publie";
  if (bits.length === 1) return bits[0];
  const et = locale === "en" ? " and " : " et ";
  return bits.slice(0, -1).join(", ") + et + bits[bits.length - 1];
}


export const lieuConfig: EntityPageConfig<D> = {
  load: ({ slug }) => {
    const lieu = loadLieu(slug);
    if (!lieu) return null;
    return { lieu };
  },
  notFoundMetadata: (locale) => ({
    title: locale === "en" ? "Place not found — Qipu" : "Lieu introuvable — Qipu",
    robots: { index: false },
  }),
  metadata: ({ lieu }, locale, { slug }) => {
    const title = `${lieu.name} — ${locale === "en" ? lieu.kind_en : lieu.kind_fr} · Qipu`;
    const description = locale === "en"
      ? `${lieu.name}: ${lieu.stats.n_lieu ?? 0} Conseil de Paris deliberations, municipal bulletin extracts back to 1882, city investments — every fact linked to its source.`
      : `${lieu.name} : ${lieu.stats.n_lieu ?? 0} délibérations du Conseil de Paris, extraits du Bulletin municipal depuis 1882, investissements de la Ville — chaque fait relié à sa source.`;
    const canonical = `/france/paris/lieu/${slug}`;
    return {
      title,
      description,
      alternates: { canonical, languages: { "fr-FR": canonical, "en-US": canonical } },
      openGraph: { title, description, type: "article", locale: locale === "en" ? "en_US" : "fr_FR" },
    };
  },
  seo: ({ lieu }, locale) => lieuAnswer(lieu, locale),
  related: ({ lieu }, locale) => lieuRelated(lieu, locale),
  page: {
    // Pas de section fx-page-header : la fiche lieu rend son back-link,
    // kicker et h1 directement dans le fx-fiche-wrap (layout pré-refacto).
    body: ({ lieu }, locale) => {
      const kind = locale === "en" ? lieu.kind_en : lieu.kind_fr;
      return (
        <>
          <nav className="fx-fiche-back">
            <Link href="/france/paris/lieux" className="fx-row-link">← {locale === "en" ? "All places" : "Tous les lieux"}</Link>
          </nav>
          <div className="fx-page-kicker">
            {kind}
            {lieu.arrondissement > 0 ? ` · ${lieu.arrondissement}${lieu.arrondissement === 1 ? "er" : "e"}` : ""}
          </div>
          <h1 className="fx-page-title" style={{ fontSize: "clamp(26px, 3.4vw, 40px)", margin: "4px 0 24px" }}>
            {lieu.name}
          </h1>
          {(() => {
            // La réponse SEO reste entière dans le DOM ; à l'écran, la phrase
            // « Source : … » passe en petit sous la phrase de réponse.
            const answer = lieuAnswer(lieu, locale).answer;
            const cut = answer.search(/\sSource\s?:/);
            const main = cut > 0 ? answer.slice(0, cut) : answer;
            const src = cut > 0 ? answer.slice(cut + 1) : "";
            return (
              <>
                <p className="fx-page-lede fx-answer fx-lieu-lede">{main}</p>
                {src && <p className="fx-v3-lead-src">{src}</p>}
              </>
            );
          })()}
          <LieuFiche lieu={lieu} />
          <LieuxVoisins slug={lieu.slug} famille={lieu.famille} arrondissement={lieu.arrondissement} />
        </>
      );
    },
  },
  drawer: {
    kicker: ({ lieu }) => `${lieu.kind_fr} · ${lieu.arrondissement}${lieu.arrondissement === 1 ? "er" : "e"}`,
    title: ({ lieu }) => lieu.name,
    shareUrl: ({ lieu }) => `/france/paris/lieu/${lieu.slug}`,
    backHref: () => "/france/paris/lieux",
    breadcrumbLabel: ({ lieu }) => lieu.name,
    children: ({ lieu }) => <LieuFiche lieu={lieu} />,
  },
  staticParams: lieuStaticParams,
};
