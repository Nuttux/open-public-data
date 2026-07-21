import Link from "next/link";
import ScopeDropdown from "@/components/fusion/ScopeDropdown";
import { ARRONDISSEMENT_PATHS } from "@/components/fusion/paris-arrondissements";
import { fmtInt, fmtBillions, fmtMillions, fill, numLocale } from "@/lib/fmt";
import type { LandingStats } from "@/lib/fusion-data";
import type { BlogPostMeta } from "@/lib/blog";
import type { LandingModel, DeckCard, MarqueeItem } from "@/components/landing/types";

/**
 * Paris adapter for the shared landing template. Maps LandingStats + i18n → a
 * LandingModel; the generic <Landing/> renders it. This is the Paris twin of
 * lib/us/sf-landing-model.tsx — same template, city-specific data. Kept out of
 * the fusion barrel (direct imports only) so it stays client-bundle-safe, like
 * LandingClient itself.
 */

type T = (key: string) => string;

// ── Marquee source — curated, politically-neutral entities (see the neutrality
//    notes that governed this list). Interleaved by type so the visible window
//    always mixes angles. Locale is resolved in the adapter below. ──
type MarqueeSource = {
  href: string;
  type: "projet" | "asso" | "bailleur" | "fournisseur" | "categorie" | "poste";
  label_fr: string;
  label_en: string;
  amount_fr: string;
  amount_en: string;
};

const MARQUEE_SOURCE: MarqueeSource[] = [
  // === PROJETS ===
  { href: "/fr/city/paris/investissements/projet/2024_18_51_019", type: "projet", label_fr: "Piscine Belliard", label_en: "Belliard Swimming Pool", amount_fr: "13,2 M€", amount_en: "€13.2M" },
  { href: "/fr/city/paris/investissements/projet/2024_19_54_014", type: "projet", label_fr: "Médiathèque James Baldwin", label_en: "James Baldwin Media Library", amount_fr: "6,6 M€", amount_en: "€6.6M" },
  { href: "/fr/city/paris/investissements/projet/2023_20_57_022", type: "projet", label_fr: "Parc Python-Duvernois", label_en: "Python-Duvernois Park", amount_fr: "4,2 M€", amount_en: "€4.2M" },
  { href: "/fr/city/paris/investissements/projet/2023_20_57_020", type: "projet", label_fr: "École Davout", label_en: "Davout School", amount_fr: "5,3 M€", amount_en: "€5.3M" },
  { href: "/fr/city/paris/investissements/projet/2024_18_51_017", type: "projet", label_fr: "Aréna 2 (porte de la Chapelle)", label_en: "Arena 2 (porte de la Chapelle)", amount_fr: "12 M€", amount_en: "€12M" },
  { href: "/fr/city/paris/investissements/projet/2024_16_45_010", type: "projet", label_fr: "Porte Maillot", label_en: "Porte Maillot", amount_fr: "7,1 M€", amount_en: "€7.1M" },
  { href: "/fr/city/paris/investissements/projet/2024_20_57_022", type: "projet", label_fr: "Porte de Montreuil", label_en: "Porte de Montreuil", amount_fr: "6,1 M€", amount_en: "€6.1M" },
  { href: "/fr/city/paris/marches/fournisseur/750043937", type: "fournisseur", label_fr: "Polyreva (propreté)", label_en: "Polyreva (cleaning services)", amount_fr: "235 M€ cumulés", amount_en: "€235M cumulative" },

  // === ASSOS / INSTITUTIONS PUBLIQUES-PUBLIQUES ===
  { href: "/fr/city/paris/subventions/association/CENTRE%20ACTION%20SOCIALE%20VILLE%20PARIS", type: "asso", label_fr: "CASVP", label_en: "CASVP (city social action)", amount_fr: "416 M€/an", amount_en: "€416M/yr" },
  { href: "/fr/city/paris/subventions/association/PARIS%20MUSEES", type: "asso", label_fr: "Paris Musées", label_en: "Paris Musées (city museums)", amount_fr: "65 M€/an", amount_en: "€65M/yr" },
  { href: "/fr/city/paris/subventions/association/THEATRE%20MUSICAL%20DE%20PARIS", type: "asso", label_fr: "Théâtre du Châtelet", label_en: "Théâtre du Châtelet", amount_fr: "15,6 M€/an", amount_en: "€15.6M/yr" },
  { href: "/fr/city/paris/subventions/association/THEATRE%20DE%20LA%20VILLE", type: "asso", label_fr: "Théâtre de la Ville", label_en: "Théâtre de la Ville", amount_fr: "14,4 M€/an", amount_en: "€14.4M/yr" },
  { href: "/fr/city/paris/subventions/association/FORUM%20DES%20IMAGES", type: "asso", label_fr: "Forum des Images", label_en: "Forum des Images", amount_fr: "5,9 M€/an", amount_en: "€5.9M/yr" },
  { href: "/fr/city/paris/subventions/association/ATELIER%20PARISIEN%20D%27URBANISME", type: "asso", label_fr: "Atelier Parisien d'Urbanisme", label_en: "Paris Urban Planning Studio", amount_fr: "5,8 M€/an", amount_en: "€5.8M/yr" },
  { href: "/fr/city/paris/subventions/association/ORCHESTRE%20DE%20CHAMBRE%20DE%20PARIS", type: "asso", label_fr: "Orchestre de Chambre de Paris", label_en: "Paris Chamber Orchestra", amount_fr: "4,8 M€/an", amount_en: "€4.8M/yr" },
  { href: "/fr/city/paris/subventions/association/AGOSPAP", type: "asso", label_fr: "AGOSPAP (œuvres sociales agents)", label_en: "AGOSPAP (staff welfare)", amount_fr: "7 M€/an", amount_en: "€7M/yr" },
  { href: "/fr/city/paris/subventions/association/ABC%20PUERICULTURE", type: "asso", label_fr: "ABC Puériculture", label_en: "ABC Childcare", amount_fr: "8,6 M€/an", amount_en: "€8.6M/yr" },
  { href: "/fr/city/paris/subventions/association/CRESCENDO", type: "asso", label_fr: "Crescendo (petite enfance)", label_en: "Crescendo (early childhood)", amount_fr: "6,5 M€/an", amount_en: "€6.5M/yr" },
  { href: "/fr/city/paris/subventions/association/ALTERALIA", type: "asso", label_fr: "Alteralia (social)", label_en: "Alteralia (social action)", amount_fr: "7,3 M€/an", amount_en: "€7.3M/yr" },

  // === BAILLEURS ===
  { href: "/fr/city/paris/dette/bailleur/paris-habitat", type: "bailleur", label_fr: "Paris Habitat", label_en: "Paris Habitat (social housing)", amount_fr: "2,7 Md€ garanties", amount_en: "€2.7Bn guarantees" },
  { href: "/fr/city/paris/dette/bailleur/rivp", type: "bailleur", label_fr: "RIVP", label_en: "RIVP (social housing)", amount_fr: "4,25 Md€ garanties", amount_en: "€4.25Bn guarantees" },
  { href: "/fr/city/paris/dette/bailleur/elogie-siemp", type: "bailleur", label_fr: "Elogie-Siemp", label_en: "Elogie-Siemp (social housing)", amount_fr: "1,68 Md€ garanties", amount_en: "€1.68Bn guarantees" },
  { href: "/fr/city/paris/dette/bailleur/3f-residences", type: "bailleur", label_fr: "Immobilière 3F", label_en: "Immobilière 3F", amount_fr: "560 M€ garanties", amount_en: "€560M guarantees" },
  { href: "/fr/city/paris/dette/bailleur/icf-habitat", type: "bailleur", label_fr: "ICF Habitat La Sablière", label_en: "ICF Habitat La Sablière", amount_fr: "510 M€ garanties", amount_en: "€510M guarantees" },
  { href: "/fr/city/paris/dette/bailleur/batigere-habitat-ile-de-france", type: "bailleur", label_fr: "Batigère Habitat IDF", label_en: "Batigère Habitat IDF", amount_fr: "420 M€ garanties", amount_en: "€420M guarantees" },

  // === FOURNISSEURS NEUTRES CONSENSUELS ===
  { href: "/fr/city/paris/marches/fournisseur/622044501", type: "fournisseur", label_fr: "JCDecaux (mobilier urbain)", label_en: "JCDecaux (street furniture)", amount_fr: "314 M€ cumulés", amount_en: "€314M cumulative" },
  { href: "/fr/city/paris/marches/fournisseur/420948226", type: "fournisseur", label_fr: "Eurovia (voirie)", label_en: "Eurovia (roadworks)", amount_fr: "287 M€ cumulés", amount_en: "€287M cumulative" },
  { href: "/fr/city/paris/marches/fournisseur/321057978", type: "fournisseur", label_fr: "Urbaine de Travaux (BTP)", label_en: "Urbaine de Travaux (construction)", amount_fr: "259 M€ cumulés", amount_en: "€259M cumulative" },
  { href: "/fr/city/paris/marches/fournisseur/350050589", type: "fournisseur", label_fr: "Sepur (collecte déchets)", label_en: "Sepur (waste collection)", amount_fr: "255 M€ cumulés", amount_en: "€255M cumulative" },
  { href: "/fr/city/paris/marches/fournisseur/433900834", type: "fournisseur", label_fr: "Bouygues Bâtiment IDF", label_en: "Bouygues Bâtiment IDF", amount_fr: "237 M€ cumulés", amount_en: "€237M cumulative" },
  { href: "/fr/city/paris/marches/fournisseur/444578389", type: "fournisseur", label_fr: "Polysotis (propreté urbaine)", label_en: "Polysotis (urban cleaning)", amount_fr: "419 M€ cumulés", amount_en: "€419M cumulative" },
  { href: "/fr/city/paris/marches/fournisseur/441408812", type: "fournisseur", label_fr: "Korrigan (propreté)", label_en: "Korrigan (cleaning services)", amount_fr: "195 M€ cumulés", amount_en: "€195M cumulative" },
  { href: "/fr/city/paris/marches/fournisseur/424982650", type: "fournisseur", label_fr: "SCC France (informatique)", label_en: "SCC France (IT services)", amount_fr: "222 M€ cumulés", amount_en: "€222M cumulative" },
  { href: "/fr/city/paris/marches/fournisseur/325807220", type: "fournisseur", label_fr: "Maintenance Industrie (bâtiments)", label_en: "Maintenance Industrie (buildings)", amount_fr: "192 M€ cumulés", amount_en: "€192M cumulative" },

  // === CATÉGORIES MARCHÉS ===
  { href: "/fr/city/paris/marches/categorie/entretien-des-espaces-verts", type: "categorie", label_fr: "Entretien espaces verts", label_en: "Green spaces maintenance", amount_fr: "44 M€ · 23 marchés", amount_en: "€44M · 23 contracts" },
  { href: "/fr/city/paris/marches/categorie/travaux-d-amenagement-de-voirie", type: "categorie", label_fr: "Travaux de voirie", label_en: "Roadworks", amount_fr: "30 marchés/an", amount_en: "30 contracts/yr" },
  { href: "/fr/city/paris/marches/categorie/travaux-de-genie-climatique", type: "categorie", label_fr: "Génie climatique", label_en: "Climate engineering", amount_fr: "43 marchés/an", amount_en: "43 contracts/yr" },
  { href: "/fr/city/paris/marches/categorie/prestations-intellectuelles", type: "categorie", label_fr: "Prestations intellectuelles", label_en: "Consulting services", amount_fr: "119 marchés/an", amount_en: "119 contracts/yr" },
  { href: "/fr/city/paris/marches/categorie/fournitures-courantes-et-services", type: "categorie", label_fr: "Fournitures courantes & services", label_en: "Office supplies & services", amount_fr: "126 marchés/an", amount_en: "126 contracts/yr" },
  { href: "/fr/city/paris/marches/categorie/maitrise-d-oeuvre-btp", type: "categorie", label_fr: "Maîtrise d'œuvre BTP", label_en: "Construction supervision", amount_fr: "54 marchés/an", amount_en: "54 contracts/yr" },

  // === POSTES BUDGÉTAIRES ===
  { href: "/fr/city/paris/budget/poste/personnel-admin", type: "poste", label_fr: "Personnel & Administration", label_en: "Personnel & Administration", amount_fr: "2,53 Md€/an", amount_en: "€2.53Bn/yr" },
  { href: "/fr/city/paris/budget/poste/action-sociale", type: "poste", label_fr: "Action sociale", label_en: "Social action", amount_fr: "2,31 Md€/an", amount_en: "€2.31Bn/yr" },
  { href: "/fr/city/paris/budget/poste/amenagement-logement", type: "poste", label_fr: "Aménagement & Logement", label_en: "Housing & Planning", amount_fr: "1,3 Md€/an", amount_en: "€1.3Bn/yr" },
  { href: "/fr/city/paris/budget/poste/education", type: "poste", label_fr: "Éducation", label_en: "Education", amount_fr: "992 M€/an", amount_en: "€992M/yr" },
  { href: "/fr/city/paris/budget/poste/environnement", type: "poste", label_fr: "Environnement", label_en: "Environment", amount_fr: "918 M€/an", amount_en: "€918M/yr" },
  { href: "/fr/city/paris/budget/poste/transports", type: "poste", label_fr: "Transports", label_en: "Transport", amount_fr: "854 M€/an", amount_en: "€854M/yr" },
  { href: "/fr/city/paris/budget/poste/culture-sport", type: "poste", label_fr: "Culture & Sport", label_en: "Culture & Sports", amount_fr: "795 M€/an", amount_en: "€795M/yr" },
  { href: "/fr/city/paris/budget/poste/securite", type: "poste", label_fr: "Sécurité", label_en: "Security", amount_fr: "514 M€/an", amount_en: "€514M/yr" },
  { href: "/fr/city/paris/budget/poste/remboursement-dette", type: "poste", label_fr: "Remboursement de la dette", label_en: "Debt repayment", amount_fr: "710 M€/an", amount_en: "€710M/yr" },
  { href: "/fr/city/paris/budget/poste/economie", type: "poste", label_fr: "Économie", label_en: "Economy", amount_fr: "92 M€/an", amount_en: "€92M/yr" },
];

/** Round-robin merge by type so the visible window always mixes angles. */
function interleaveByType(items: MarqueeSource[]): MarqueeSource[] {
  const buckets = new Map<MarqueeSource["type"], MarqueeSource[]>();
  for (const it of items) {
    if (!buckets.has(it.type)) buckets.set(it.type, []);
    buckets.get(it.type)!.push(it);
  }
  const queues = [...buckets.values()];
  const out: MarqueeSource[] = [];
  while (queues.some((q) => q.length > 0)) {
    for (const q of queues) {
      const next = q.shift();
      if (next) out.push(next);
    }
  }
  return out;
}

export function buildParisLandingModel(
  t: T,
  locale: string,
  stats: LandingStats,
  posts: BlogPostMeta[],
): LandingModel {
  const isEn = locale === "en";

  // ── Deck: the 4 featured entities (lieu / asso / marché catégorie / bailleur).
  //    Titles come from i18n (not the data `nom`) so EN can gloss French names. ──
  const deck: DeckCard[] = [];
  const fl = stats.featuredLieu;
  const fa = stats.featuredAsso;
  const fm = stats.featuredMarcheCategorie;
  const fb = stats.featuredBailleur;

  if (fl) {
    deck.push({
      href: `/fr/city/paris/lieu/${fl.slug}`,
      scroll: false,
      kicker: t("fx.land.deck.lieu.kicker"),
      title: fl.name,
      amount: fmtInt(fl.argentTotal / 1e6),
      amountUnit: "M €",
      meta: fill(t(fl.depuis ? "fx.land.deck.lieu.meta" : "fx.land.deck.lieu.meta_nodate"), {
        kind: fl.kind,
        arr: fl.arrondissement,
        depuis: fl.depuis ?? "",
      }),
      cta: t("fx.land.deck.lieu.cta"),
      photo: fl.photoPath,
      photoCredit: fl.credit,
    });
  }
  if (fa) {
    deck.push({
      href: `/fr/city/paris/subventions/association/${fa.slug}`,
      scroll: false,
      kicker: t("fx.land.deck.c2.kicker"),
      title: t("fx.land.deck.c2.title"),
      amount: fmtInt(fa.montant / 1e6),
      amountUnit: "M €",
      meta: fill(t("fx.land.deck.c2.meta"), { year: fa.year, theme: fa.theme ?? "Culture" }),
      cta: t("fx.land.deck.c2.cta"),
      photo: fa.photoPath,
      photoCredit: fa.photoCredit,
    });
  }
  if (fm) {
    deck.push({
      href: `/fr/city/paris/marches/categorie/${fm.slug}`,
      scroll: false,
      kicker: t("fx.land.deck.c3.kicker"),
      title: t("fx.land.deck.c3.title"),
      amount: fm.total >= 1e9 ? fmtBillions(fm.total) : fmtMillions(fm.total),
      amountUnit: fm.total >= 1e9 ? "Md €" : "M €",
      meta: fill(t("fx.land.deck.c3.meta"), { year: fm.year, nb: fm.nbMarches }),
      cta: t("fx.land.deck.c3.cta"),
      photo: fm.photoPath,
      photoCredit: fm.photoCredit,
    });
  }
  if (fb) {
    deck.push({
      href: `/fr/city/paris/dette/bailleur/${fb.slug}`,
      scroll: false,
      kicker: t("fx.land.deck.c4.kicker"),
      title: t("fx.land.deck.c4.title"),
      amount: fb.capitalRestant >= 1e9 ? fmtBillions(fb.capitalRestant) : fmtMillions(fb.capitalRestant),
      amountUnit: fb.capitalRestant >= 1e9 ? "Md €" : "M €",
      meta: fill(t("fx.land.deck.c4.meta"), { year: fb.year, nb: fb.nbEmprunts }),
      cta: t("fx.land.deck.c4.cta"),
      photo: fb.photoPath,
      photoCredit: fb.photoCredit,
    });
  }

  // ── Marquee: locale-resolved, drawer-intercept links (scroll:false). ──
  const marquee: MarqueeItem[] = interleaveByType(MARQUEE_SOURCE).map((it) => ({
    href: it.href,
    scroll: false,
    label: isEn ? it.label_en : it.label_fr,
    amount: isEn ? it.amount_en : it.amount_fr,
  }));

  return {
    hero: {
      bg: { viewBox: "0 0 200 140", paths: ARRONDISSEMENT_PATHS },
      headline: (
        <>
          {t("fx.land.h1.before")}
          <em>{t("fx.land.h1.em")}</em>
          <br />
          {t("fx.land.h1.mid")}
          <ScopeDropdown variant="h1" />
          {t("fx.land.h1.after")}
        </>
      ),
    },
    deck,
    deckAriaLabel: t("fx.land.deck.aria"),
    marquee,
    marqueeAriaLabel: isEn
      ? "Scrolling preview of entities documented on this site"
      : "Aperçu défilant des entités documentées sur le site",
    scale: {
      value: fmtInt(stats.perCapitaMonth),
      unit: "€",
      unitLeading: false,
      per: t("fx.land.echelle.per"),
      delta: fill(
        t(stats.budgetType === "execute" ? "fx.land.echelle.total.executed" : "fx.land.echelle.total"),
        { amount: fmtBillions(stats.totalDepenses) },
      ),
    },
    chips: {
      heading: (
        <>
          {t("fx.land.chips.h2.before")}
          <em>{t("fx.land.chips.h2.em")}</em>
          {t("fx.land.chips.h2.dot")}
        </>
      ),
      ariaLabel: t("fx.land.chips.aria"),
      items: [
        { href: "/fr/city/paris/lieux", title: t("fx.land.chips.lieux"), desc: t("fx.land.chips.lieux_desc"), featured: true },
        { href: "/fr/city/paris/budget", title: t("fx.land.chips.budget"), desc: t("fx.land.chips.budget_desc") },
        { href: "/fr/city/paris/investissements", title: t("fx.land.chips.invest"), desc: t("fx.land.chips.invest_desc") },
        { href: "/fr/city/paris/subventions", title: t("fx.land.chips.subv"), desc: t("fx.land.chips.subv_desc") },
        { href: "/fr/city/paris/marches", title: t("fx.land.chips.marches"), desc: t("fx.land.chips.marches_desc") },
        { href: "/fr/city/paris/dette", title: t("fx.land.chips.dette"), desc: t("fx.land.chips.dette_desc") },
        { href: "/fr/city/paris/logement", title: t("fx.land.chips.logement"), desc: t("fx.land.chips.logement_desc") },
      ],
    },
    extras: <ParisLandingTail t={t} locale={locale} posts={posts} />,
  };
}

/** Analyses teaser + méthode — Paris-only tail acts, routed via model.extras. */
function ParisLandingTail({ t, locale, posts }: { t: T; locale: string; posts: BlogPostMeta[] }) {
  return (
    <>
      {posts.length > 0 && (
        <section className="fx-analyses" id="analyses">
          <div className="fx-wrap">
            <div className="fx-analyses-head">
              <h2>
                {t("fx.land.analyses.h2.before")}
                <em>{t("fx.land.analyses.h2.em")}</em>
                {t("fx.land.analyses.h2.dot")}
              </h2>
              <p className="fx-sub">{t("fx.land.analyses.sub")}</p>
            </div>

            <div className="fx-analyses-grid">
              {posts.slice(0, 3).map((p) => (
                <Link key={p.slug} href={`/analyses/${p.slug}`} className="fx-analyses-card">
                  {p.image && (
                    <div className="fx-analyses-media">
                      <img src={p.image} alt="" loading="lazy" />
                    </div>
                  )}
                  <div className="fx-analyses-body">
                    {(locale === "en" && p.category_en) || p.category ? (
                      <span className="fx-analyses-cat">
                        {locale === "en" && p.category_en ? p.category_en : p.category}
                      </span>
                    ) : null}
                    <h3 className="fx-analyses-title">{locale === "en" && p.title_en ? p.title_en : p.title}</h3>
                    <p className="fx-analyses-desc">{locale === "en" && p.description_en ? p.description_en : p.description}</p>
                    <div className="fx-analyses-foot">
                      <span>
                        {new Date(p.date).toLocaleDateString(numLocale(locale), {
                          day: "numeric",
                          month: "long",
                          year: "numeric",
                        })}
                      </span>
                      <span aria-hidden="true">·</span>
                      <span>{p.readingTime}</span>
                    </div>
                  </div>
                </Link>
              ))}
            </div>

            <div className="fx-analyses-foot-all">
              <Link href="/analyses">{t("fx.land.analyses.see_all")} →</Link>
            </div>
          </div>
        </section>
      )}

      <section className="fx-meth" id="meth">
        <div className="fx-wrap">
          <h2>
            {t("fx.land.meth.h2.before")}
            <em>{t("fx.land.meth.h2.em")}</em>
            {t("fx.land.meth.h2.dot")}
          </h2>
          <div className="fx-meth-cols">
            <div className="fx-meth-c">
              <h3>{t("fx.land.meth.01.h")}</h3>
              <p>{t("fx.land.meth.01.p")}</p>
              <Link href="/methode#sources">{t("fx.land.meth.01.cta")}</Link>
            </div>
            <div className="fx-meth-c">
              <h3>{t("fx.land.meth.02.h")}</h3>
              <p>{t("fx.land.meth.02.p")}</p>
              <Link href="/methode#construction">{t("fx.land.meth.02.cta")}</Link>
            </div>
            <div className="fx-meth-c">
              <h3>{t("fx.land.meth.03.h")}</h3>
              <p>{t("fx.land.meth.03.p")}</p>
              <a href="https://github.com/AbstractsMachine/france-open-data-pipeline" target="_blank" rel="noopener noreferrer">
                {t("fx.land.meth.03.cta")}
              </a>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
