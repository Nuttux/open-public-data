import type { LandingModel, DeckCard, MarqueeItem, LandingChip } from "@/components/landing/types";
import type { Locale } from "@/lib/localeContext";
import PlaceSwitcher from "@/components/PlaceSwitcher";
import { loadBudget, loadQuemRecebe, loadContratos, funcaoSlug } from "@/lib/br/recife-data";
import { loadPlace } from "@/lib/br/recife-places-data";
import { fmtBrl, fmtBrlCompact, fmtBrlDeck, fmtInt } from "@/lib/br/format";

const BASE = "/br/city/recife";

function truncate(s: string, n: number) {
  if (s.length <= n) return s;
  const cut = s.slice(0, n);
  const sp = cut.lastIndexOf(" ");
  return (sp > n * 0.6 ? cut.slice(0, sp) : cut).trimEnd() + "…";
}

const SMALL = new Set(["e", "de", "da", "do", "dos", "das", "a", "o", "ao", "aos", "à", "às", "em", "para", "com"]);
function titleCase(s: string) {
  return s.toLocaleLowerCase("pt-BR").split(/\s+/)
    .map((w, i) => (i > 0 && SMALL.has(w)) ? w : w ? w[0].toLocaleUpperCase("pt-BR") + w.slice(1) : w).join(" ");
}

type S = {
  headline: React.ReactNode;
  scalePer: string; scaleDelta: (v: string, y: number) => string;
  // deck = four CONCRETE entities that each open a fiche (drawer), mirroring
  // Paris (place · recipient · contract · subsidy).
  deck: {
    place_k: string; place_cta: string; obras_word: string;
    rec_k: string; rec_meta: string; rec_cta: string;
    ct_k: string; ct_cta: string;
    subv_k: string; subv_meta: string; subv_cta: string;
  };
  chips_h: React.ReactNode;
  chip_orc: string; chip_orc_d: string; chip_qr: string; chip_qr_d: string; chip_ct: string; chip_ct_d: string; chip_lug: string; chip_lug_d: string;
  ativos: string; concluidas: string;
};

const STRINGS: Record<"pt" | "en", S> = {
  pt: {
    headline: <>Para onde vai o <em>dinheiro público</em><br />de <PlaceSwitcher variant="h1" currentSlug="recife" />?</>,
    scalePer: "por habitante, por mês",
    scaleDelta: (v, y) => `≈ ${v} por ano · orçamento executado de ${y}`,
    deck: {
      place_k: "Um lugar no mapa", place_cta: "Abrir o lugar", obras_word: "obras identificadas",
      rec_k: "Maior recebedor", rec_meta: "Fornecedor da cidade · 2024–2026", rec_cta: "Ver o recebedor",
      ct_k: "Um contrato", ct_cta: "Ver o contrato",
      subv_k: "Maior subvenção", subv_meta: "Entidade de saúde · subvenção", subv_cta: "Ver a entidade",
    },
    chips_h: <>Explore os <em>dados</em></>,
    chip_orc: "Orçamento", chip_orc_d: "Despesa executada por função, ano a ano.",
    chip_qr: "Quem recebe", chip_qr_d: "Organizações pagas e subvenções.",
    chip_ct: "Contratos", chip_ct_d: "Contratos e licitações da cidade.",
    chip_lug: "Lugares", chip_lug_d: "Equipamentos e obras no mapa da cidade.",
    ativos: "ativos", concluidas: "licitações",
  },
  en: {
    headline: <>Where does <em>public money</em><br />go in <PlaceSwitcher variant="h1" currentSlug="recife" />?</>,
    scalePer: "per resident, per month",
    scaleDelta: (v, y) => `≈ ${v} per year · ${y} executed budget`,
    deck: {
      place_k: "A place on the map", place_cta: "Open the place", obras_word: "identified works",
      rec_k: "Largest recipient", rec_meta: "City supplier · 2024–2026", rec_cta: "See the recipient",
      ct_k: "One contract", ct_cta: "See the contract",
      subv_k: "Largest subsidy", subv_meta: "Health institution · subsidy", subv_cta: "See the institution",
    },
    chips_h: <>Explore the <em>data</em></>,
    chip_orc: "Budget", chip_orc_d: "Executed spending by function, year by year.",
    chip_qr: "Who's paid", chip_qr_d: "Paid organisations and subsidies.",
    chip_ct: "Contracts", chip_ct_d: "City contracts and tenders.",
    chip_lug: "Places", chip_lug_d: "Facilities and public works on the city map.",
    ativos: "active", concluidas: "tenders",
  },
};

export function buildRecifeLandingModel(locale: Locale): LandingModel {
  const s = STRINGS[locale === "en" ? "en" : "pt"];
  const budget = loadBudget();
  const qr = loadQuemRecebe();
  const contratos = loadContratos();

  // signature scale act — R$/resident/month, latest complete year
  const complete = budget.anos.filter((a) => budget.curva_mensal.some((c) => c.ano === a.ano && c.mes === 12));
  const refAno = (complete.length ? complete : budget.anos).reduce((a, b) => (b.ano > a.ano ? b : a));
  const pop = budget.populacao?.populacao ?? 0;
  const perMonth = pop ? Math.round(refAno.total_pago / pop / 12) : 0;
  const perYear = pop ? Math.round(refAno.total_pago / pop) : 0;

  // marquee — top funções + top recebedores, all hrefs from the live corpus
  const funcaoItems: MarqueeItem[] = refAno.funcoes.filter((f) => f.pago > 0).slice(0, 8).map((f) => ({
    href: `${BASE}/budget/funcao/${funcaoSlug(f.funcao)}?year=${refAno.ano}`,
    label: titleCase(f.funcao), amount: fmtBrlCompact(f.pago),
  }));
  const recItems: MarqueeItem[] = qr.top_recebedores.slice(0, 10).map((r) => ({
    href: `${BASE}/quem-recebe/${r.cnpj}`, label: r.nome, amount: fmtBrlCompact(r.total_pago),
  }));
  const marquee = interleave([funcaoItems, recItems]);

  // deck — four CONCRETE entities, each opening its fiche (drawer), like Paris.
  // Selections come from the live corpus (top-ranked / curated place); every
  // number is read from the data. Photos are representative Recife civic
  // images (Wikimedia Commons, CC0/CC-BY). Cards render only if the entity loads.
  const IMG = "/img/br/recife/landing";
  const topRec = qr.top_recebedores.find((r) => !/\b(BANCO|CAIXA)\b/i.test(r.nome)) ?? qr.top_recebedores[0];
  const topSubv = qr.top_subvencoes[0];
  const bigContrato = contratos.contratos
    .filter((c) => (c.valor ?? 0) < 1e9) // guard against a data outlier
    .reduce<typeof contratos.contratos[number] | null>((best, c) => (!best || (c.valor ?? 0) > (best.valor ?? 0) ? c : best), null);
  const geraldao = loadPlace("ginasio-de-esportes-geraldo-magalhaes");

  const deck: DeckCard[] = [];
  if (geraldao) {
    deck.push(card(`${BASE}/lugares/${geraldao.slug}`, s.deck.place_k, titleCase(geraldao.nome),
      fmtBrlDeck(geraldao.obras_total ?? 0),
      `${titleCase(geraldao.familia)} · ${fmtInt(geraldao.n_obras ?? 0)} ${geraldao.familia ? s.deck.obras_word : ""}`.trim(),
      s.deck.place_cta,
      `${IMG}/geraldao.jpg`, "Geraldão · Ícaro Messias / Wikimedia · CC BY-SA 2.0", titleCase(geraldao.nome)));
  }
  if (topRec) {
    deck.push(card(`${BASE}/quem-recebe/${topRec.cnpj}`, s.deck.rec_k, truncate(titleCase(topRec.nome), 40),
      fmtBrlDeck(topRec.total_pago), s.deck.rec_meta, s.deck.rec_cta,
      `${IMG}/praca-rio-branco.jpg`, "Praça Rio Branco · Wilfredor / Wikimedia · CC0", "Marco Zero, Praça Rio Branco, Recife"));
  }
  if (bigContrato) {
    deck.push(card(`${BASE}/contratos/${bigContrato.contrato_id}`, s.deck.ct_k, truncate(titleCase(bigContrato.fornecedor ?? ""), 40),
      fmtBrlDeck(bigContrato.valor ?? 0), truncate(titleCase(bigContrato.objeto ?? ""), 46), s.deck.ct_cta,
      `${IMG}/ponte-nassau.jpg`, "Ponte Maurício de Nassau · Joelkaula / Wikimedia · CC BY-SA 4.0", "Ponte Maurício de Nassau, Recife"));
  }
  if (topSubv) {
    deck.push(card(`${BASE}/quem-recebe/${topSubv.cnpj}`, s.deck.subv_k, truncate(titleCase(topSubv.nome), 40),
      fmtBrlDeck(topSubv.subvencao_pago), s.deck.subv_meta, s.deck.subv_cta,
      `${IMG}/hospital-restauracao.jpg`, "Hospital da Restauração · MPPE / Wikimedia · CC BY 2.0", "Hospital da Restauração, Recife"));
  }

  const chips: LandingChip[] = [
    { href: `${BASE}/lugares`, title: s.chip_lug, desc: s.chip_lug_d, featured: true },
    { href: `${BASE}/budget`, title: s.chip_orc, desc: s.chip_orc_d },
    { href: `${BASE}/quem-recebe`, title: s.chip_qr, desc: s.chip_qr_d },
    { href: `${BASE}/contratos`, title: s.chip_ct, desc: s.chip_ct_d },
  ];

  return {
    hero: { headline: s.headline },
    deck,
    marquee,
    scale: {
      value: fmtInt(perMonth), unit: "R$ ", unitLeading: true,
      per: s.scalePer,
      delta: s.scaleDelta(fmtBrl(perYear), refAno.ano),
    },
    chips: { heading: s.chips_h, items: chips },
  };
}

function card(
  href: string, kicker: string, title: string, amount: string, meta: string, cta: string,
  photo: string | null = null, photoCredit: string | null = null, photoAlt?: string,
): DeckCard {
  // amount like "R$ 571,2 mi" → small leading "R$", bare display number "571,2",
  // small trailing magnitude "mi" — mirrors Paris (bare digits + small unit) so
  // the giant number never wraps between the currency mark and the figure.
  const m = amount.match(/^(−?)R\$\s(.+?)(?:\s(bi|mi|mil))?$/);
  return {
    href, scroll: false, kicker, title,
    amountLead: m ? `${m[1]}R$` : "",
    amount: m ? m[2] : amount,
    amountUnit: m && m[3] ? m[3] : "",
    meta, cta, photo, photoCredit, photoAlt,
  };
}

function interleave(lists: MarqueeItem[][]): MarqueeItem[] {
  const out: MarqueeItem[] = [];
  const max = Math.max(...lists.map((l) => l.length));
  for (let i = 0; i < max; i++) for (const l of lists) if (l[i]) out.push(l[i]);
  return out;
}
