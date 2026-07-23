import type { LandingModel, DeckCard, MarqueeItem, LandingChip } from "@/components/landing/types";
import type { Locale } from "@/lib/localeContext";
import PlaceSwitcher from "@/components/PlaceSwitcher";
import { fmtBillions, fmtInt, fmtMillions } from "@/lib/fmt";
import {
  MARSEILLE_ARRONDISSEMENT_PATHS,
  MARSEILLE_VIEWBOX,
} from "@/components/fusion/marseille-arrondissements";

const BASE = "/fr/city/marseille";
const IMG = "/img/fr/marseille/places";

/** Plain, pre-loaded numbers handed from the server page to the client model
 *  builder — keeps the builder fs-free so it can run client-side (live FR/EN
 *  toggle) without the fusion-data node:fs leak. */
export type MarseilleLandingData = {
  budYear: number;
  totalDep: number;
  pop: number;
  nbMarches: number;
  topBenef: { name: string; montant: number }[];
  // Curated featured entities for the deck (each links to ONE fiche).
  friche: { name: string; montant: number } | null;
  criee: { name: string; montant: number } | null;
  cultureMontant: number | null;
};

const eur = (n: number) =>
  n >= 1e9 ? `${fmtBillions(n)} Md€` : `${fmtMillions(n, 0)} M€`;

type S = {
  headline: React.ReactNode;
  scalePer: string;
  scaleDelta: (perYear: string, year: number) => string;
  // Deck kickers/ctas per featured entity.
  place_k: string; place_t: string; place_m: string; place_c: string;
  grant_k: string; grant_c: string; grant_m: string;
  theme_k: string; theme_t: string; theme_m: string; theme_c: string;
  chips_h: React.ReactNode;
  chip_bud: string; chip_bud_d: string;
  chip_subv: string; chip_subv_d: string;
  chip_mar: string; chip_mar_d: string;
  chip_lieux: string; chip_lieux_d: string;
};

const STRINGS: Record<"fr" | "en", S> = {
  fr: {
    headline: <>Suivez l&apos;argent public de <PlaceSwitcher variant="h1" currentSlug="marseille" /></>,
    scalePer: "par habitant, par mois",
    scaleDelta: (perYear, year) => `≈ ${perYear} par an · dépenses réelles ${year}`,
    place_k: "Un lieu", place_t: "MuCEM", place_m: "Musée national · 2ᵉ arr.", place_c: "Voir le lieu",
    grant_k: "Une subvention", grant_c: "Voir le bénéficiaire", grant_m: "cumul des subventions de la Ville",
    theme_k: "Une thématique", theme_t: "Culture", theme_m: "bénéficiaires culturels de la Ville", theme_c: "Voir la thématique",
    chips_h: <>Explorez les <em>données</em></>,
    chip_bud: "Budget", chip_bud_d: "Recettes et dépenses, année par année.",
    chip_subv: "Subventions", chip_subv_d: "Qui reçoit, combien, pour quoi.",
    chip_mar: "Marchés publics", chip_mar_d: "Ce que la Ville achète et à qui.",
    chip_lieux: "Lieux", chip_lieux_d: "Lieux publics et patrimoniaux, cartographiés.",
  },
  en: {
    headline: <>Follow the public money of <PlaceSwitcher variant="h1" currentSlug="marseille" /></>,
    scalePer: "per resident, per month",
    scaleDelta: (perYear, year) => `≈ ${perYear} per year · ${year} actual spending`,
    place_k: "A place", place_t: "MuCEM", place_m: "National museum · 2nd district", place_c: "See the place",
    grant_k: "A grant", grant_c: "See the beneficiary", grant_m: "total grants from the City",
    theme_k: "A theme", theme_t: "Culture", theme_m: "the City's cultural beneficiaries", theme_c: "See the theme",
    chips_h: <>Explore the <em>data</em></>,
    chip_bud: "Budget", chip_bud_d: "Revenue and spending, year by year.",
    chip_subv: "Grants", chip_subv_d: "Who receives, how much, for what.",
    chip_mar: "Public contracts", chip_mar_d: "What the City buys, and from whom.",
    chip_lieux: "Places", chip_lieux_d: "Public and heritage places, mapped.",
  },
};

export function buildMarseilleLandingModel(locale: Locale, data: MarseilleLandingData): LandingModel {
  const s = STRINGS[locale === "en" ? "en" : "fr"];
  const { budYear, totalDep, pop, topBenef, friche, criee, cultureMontant } = data;

  const perMonth = pop ? Math.round(totalDep / pop / 12) : 0;
  const perYear = pop ? Math.round(totalDep / pop) : 0;

  // Deck — four SPECIFIC entities (Paris logic), each linking to one fiche:
  // a place, two real grant recipients, a theme. Photos are the places' own.
  const deck: DeckCard[] = [
    // A place — MuCEM.
    card(`${BASE}/lieu/mucem`, s.place_k, s.place_t, "", s.place_m, s.place_c,
      `${IMG}/mucem.jpg`, "MuCEM · F. Pécassou / Wikimedia · CC BY-SA 3.0", "MuCEM, Marseille"),
    // A grant recipient — Friche la Belle de Mai (a place you know).
    ...(friche ? [card(
      `${BASE}/subventions/association/${encodeURIComponent(friche.name)}`,
      s.grant_k, "Friche la Belle de Mai", eur(friche.montant), s.grant_m, s.grant_c,
      `${IMG}/friche-belle-de-mai.jpg`, "Friche la Belle de Mai · Charlotte Noblet / Wikimedia · CC BY-SA 4.0", "Friche la Belle de Mai")] : []),
    // A theme — Culture.
    ...(cultureMontant != null ? [card(
      `${BASE}/subventions/theme/culture`, s.theme_k, s.theme_t, eur(cultureMontant), s.theme_m, s.theme_c,
      `${IMG}/palais-longchamp.jpg`, "Palais Longchamp · Arnaud 25 / Wikimedia · CC BY-SA 4.0", "Palais Longchamp, Marseille")] : []),
    // A grant recipient — Théâtre La Criée.
    ...(criee ? [card(
      `${BASE}/subventions/association/${encodeURIComponent(criee.name)}`,
      s.grant_k, "Théâtre La Criée", eur(criee.montant), s.grant_m, s.grant_c,
      `${IMG}/la-criee.jpg`, "Théâtre La Criée · Arnaud 25 / Wikimedia · CC BY-SA 4.0", "Théâtre La Criée, Marseille")] : []),
  ];

  // Marquee — top subvention recipients, hrefs to their (live) fiche route.
  const marquee: MarqueeItem[] = topBenef.map((r) => ({
    href: `${BASE}/subventions/association/${encodeURIComponent(r.name)}`,
    label: r.name,
    amount: eur(r.montant),
    scroll: false,
  }));

  const chips: LandingChip[] = [
    { href: `${BASE}/budget`, title: s.chip_bud, desc: s.chip_bud_d, featured: true },
    { href: `${BASE}/subventions`, title: s.chip_subv, desc: s.chip_subv_d },
    { href: `${BASE}/marches`, title: s.chip_mar, desc: s.chip_mar_d },
    { href: `${BASE}/lieux`, title: s.chip_lieux, desc: s.chip_lieux_d },
  ];

  return {
    hero: {
      bg: {
        viewBox: MARSEILLE_VIEWBOX,
        paths: MARSEILLE_ARRONDISSEMENT_PATHS.flatMap((a) => a.paths),
      },
      headline: s.headline,
    },
    deck,
    marquee,
    scale: {
      value: fmtInt(perMonth),
      unit: "€",
      unitLeading: false,
      per: s.scalePer,
      delta: s.scaleDelta(`${fmtInt(perYear)} €`, budYear),
    },
    chips: { heading: s.chips_h, items: chips },
  };
}

function card(
  href: string, kicker: string, title: string, amount: string, meta: string, cta: string,
  photo: string | null = null, photoCredit: string | null = null, photoAlt?: string,
): DeckCard {
  // Split a trailing unit word ("2,1 Md€" → amount "2,1", unit "Md€").
  const m = amount.match(/^(.*?)\s(Md€|M€|€)$/);
  return {
    href, scroll: false, kicker, title,
    amount: m ? m[1] : amount, amountUnit: m ? m[2] : "",
    meta, cta, photo, photoCredit, photoAlt,
  };
}
