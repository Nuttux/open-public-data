/**
 * "Veja também" blocks of the Recife fiches (components/fiche/RelatedLinks.tsx).
 * Every row is read from the export the target route resolves against
 * (recipients.json, temas.json, orgaos.json…) and checked there before it is
 * listed, so no row can lead to a 404. Copy lives in the dictionaries under
 * `br.recife.related.*` (pt.ts, mirrored in en.ts).
 */
import type { RelatedBlock, RelatedRow } from "@/components/fiche/RelatedLinks";
import { fmtBrlCompact, funcaoSlug, hasValor, modalidadeLabel, slugModalidade, slugTema, titleCasePt } from "@/lib/br/format";
import {
  loadBudget,
  loadContratos,
  loadModalidade,
  loadOrgao,
  loadRecipient,
  loadTema,
  type ContratoItem,
  type FuncaoDetail,
  type ModalidadeDetail,
  type OrgaoDetail,
  type RecipientDetail,
  type TemaDetail,
} from "@/lib/br/recife-data";
import { readDataJsonOrNull } from "@/lib/data/read";
import type { RecifeLocale } from "@/lib/br/recife-answers";
import { relatedInt, relatedT } from "@/lib/related-t";

const BASE = "/br/city/recife";
const NS = "br/recife";
const brl = (n: number) => ({ v: fmtBrlCompact(n), u: "" });
const clip = (x: string, n = 90) => (x.length > n ? `${x.slice(0, n).replace(/\s+\S*$/, "")}…` : x);

/** Entries around `at` in a ranked list, nearest first, shown in list order. */
function neighbours<T>(list: T[], at: number, n: number): T[] {
  const picked: number[] = [];
  for (let d = 1; picked.length < n && (at - d >= 0 || at + d < list.length); d++) {
    if (at - d >= 0) picked.push(at - d);
    if (picked.length < n && at + d < list.length) picked.push(at + d);
  }
  return picked.sort((a, b) => a - b).map((i) => list[i]);
}

/**
 * Recipient: its theme and the theme's other main recipients, the other main
 * recipients paid by its main department, and the hub.
 */
export function recipientRelated(rec: RecipientDetail, locale: RecifeLocale): RelatedBlock | null {
  const t = relatedT(locale);
  const rows: RelatedRow[] = [];
  const seen = new Set<string>([rec.cnpj]);
  const tema = rec.tema ? loadTema(slugTema(rec.tema)) : null;
  if (tema) {
    rows.push({
      href: `${BASE}/tema/${tema.slug}`,
      label: t("br.recife.related.tema", { tema: tema.tema }),
      sub: t("br.recife.related.tema_sub", { n: relatedInt(tema.n_organizacoes, locale) }),
      amount: brl(tema.total_pago),
    });
    for (const r of tema.top_recebedores.filter((r) => !seen.has(r.cnpj) && r.total_pago > 0 && loadRecipient(r.cnpj)).slice(0, 2)) {
      seen.add(r.cnpj);
      rows.push({ href: `${BASE}/quem-recebe/${r.cnpj}`, label: r.nome, sub: t("br.recife.related.same_tema"), amount: brl(r.total_pago) });
    }
  }
  const main = (rec.by_orgao ?? []).find((o) => o.slug && loadOrgao(o.slug));
  const orgao = main?.slug ? loadOrgao(main.slug) : null;
  if (orgao) {
    const n = tema ? 2 : 4;
    for (const s of orgao.top_suppliers.filter((s) => !seen.has(s.cnpj) && s.pago > 0 && loadRecipient(s.cnpj)).slice(0, n)) {
      seen.add(s.cnpj);
      rows.push({ href: `${BASE}/quem-recebe/${s.cnpj}`, label: s.nome, sub: t("br.recife.related.same_orgao", { orgao: titleCasePt(orgao.orgao) }), amount: brl(s.pago) });
    }
  }
  rows.push({ href: `${BASE}/quem-recebe`, label: t("br.recife.related.hub_quem"), sub: t("br.recife.related.hub_quem_sub") });
  return { title: t("br.recife.related.title"), sub: t("br.recife.related.recipient_sub"), rows };
}

/**
 * Contract: the supplier's other contracts and its fiche (organisations only —
 * a CPF never has one), the department's largest other contracts, its page,
 * and the contracts hub. The fiche names supplier, department and modality
 * inline; these rows lead to the pages around them.
 */
export function contratoRelated(c: ContratoItem, locale: RecifeLocale): RelatedBlock | null {
  const t = relatedT(locale);
  const seen = new Set<string>([c.contrato_id]);
  const all = loadContratos().contratos;
  const exists = new Set(all.map((x) => x.contrato_id));
  const contractRow = (x: { contrato_id: string; numero: string | null; objeto: string | null; valor: number | null; valor_suspeito?: boolean; ano: number | null }, sub: string): RelatedRow => ({
    href: `${BASE}/contratos/${encodeURIComponent(x.contrato_id)}`,
    label: x.objeto ? clip(titleCasePt(x.objeto)) : t("br.recife.related.contrato_n", { n: x.numero ?? t("br.recife.contrato.sem_numero") }),
    sub,
    amount: hasValor(x.valor) && !x.valor_suspeito ? brl(x.valor!) : null,
  });
  const byValue = <T extends { valor: number | null; valor_suspeito?: boolean; ano: number | null }>(a: T, b: T) =>
    (hasValor(b.valor) && !b.valor_suspeito ? b.valor! : 0) - (hasValor(a.valor) && !a.valor_suspeito ? a.valor! : 0) || (b.ano ?? 0) - (a.ano ?? 0);

  // The supplier — organisations only, a CPF has no page.
  const supplier: RelatedRow[] = [];
  const rec = c.is_org && c.fornecedor_cnpj ? loadRecipient(c.fornecedor_cnpj) : null;
  if (rec) {
    for (const x of rec.contratos.filter((x) => !seen.has(x.contrato_id) && exists.has(x.contrato_id)).sort(byValue).slice(0, 2)) {
      seen.add(x.contrato_id);
      supplier.push(contractRow(x, x.ano ? t("br.recife.related.same_fornecedor_ano", { ano: x.ano }) : t("br.recife.related.same_fornecedor")));
    }
    supplier.push({ href: `${BASE}/quem-recebe/${rec.cnpj}`, label: t("br.recife.related.fornecedor", { nome: titleCasePt(rec.nome) }), sub: t("br.recife.related.fornecedor_sub") });
  }
  // The contracting department: its page when it has one, and its largest
  // other contracts — read off the contracts export when it has no page.
  const orgao = c.orgao_slug ? loadOrgao(c.orgao_slug) : null;
  const modalidade = loadModalidade(slugModalidade(c.modalidade));
  const tail: RelatedRow[] = [];
  if (orgao) tail.push({ href: `${BASE}/orgao/${orgao.slug}`, label: t("br.recife.related.orgao", { orgao: titleCasePt(orgao.orgao) }), sub: t("br.recife.related.orgao_sub") });
  if (modalidade) tail.push({ href: `${BASE}/modalidade/${modalidade.slug}`, label: t("br.recife.related.modalidade", { mod: modalidadeLabel(modalidade.modalidade, locale) }), sub: t("br.recife.related.modalidade_sub") });
  tail.push({ href: `${BASE}/contratos`, label: t("br.recife.related.hub_contratos"), sub: t("br.recife.related.hub_contratos_sub") });
  const room = Math.max(0, 6 - supplier.length - tail.length);
  const sameOrgao = c.orgao
    ? (orgao ? orgao.top_contracts : all.filter((x) => x.orgao === c.orgao).sort(byValue))
      .filter((x) => !seen.has(x.contrato_id) && exists.has(x.contrato_id))
      .slice(0, Math.min(room, 3))
    : [];
  const orgaoRows = sameOrgao.map((x) => contractRow(x, x.ano ? t("br.recife.related.same_orgao_contrato_ano", { ano: x.ano }) : t("br.recife.related.same_orgao_contrato")));
  return { title: t("br.recife.related.title"), sub: t("br.recife.related.contrato_block_sub"), rows: [...supplier, ...orgaoRows, ...tail] };
}

type OrgaosFile = { items: Record<string, { orgao: string; slug: string; total_pago: number; n_suppliers: number }> };

/** Department: its neighbours in the ranking of departments by amount paid, the two hubs. */
export function orgaoRelated(o: OrgaoDetail, locale: RecifeLocale): RelatedBlock | null {
  const t = relatedT(locale);
  const ranked = Object.values(readDataJsonOrNull<OrgaosFile>(`${NS}/orgaos.json`)?.items ?? {}).sort((a, b) => b.total_pago - a.total_pago);
  const rows: RelatedRow[] = neighbours(ranked, ranked.findIndex((x) => x.slug === o.slug), 4).map((x) => ({
    href: `${BASE}/orgao/${x.slug}`,
    label: titleCasePt(x.orgao),
    sub: t("br.recife.related.orgao_peer_sub", { n: relatedInt(x.n_suppliers, locale) }),
    amount: brl(x.total_pago),
  }));
  rows.push({ href: `${BASE}/quem-recebe`, label: t("br.recife.related.hub_quem"), sub: t("br.recife.related.hub_quem_sub") });
  rows.push({ href: `${BASE}/contratos`, label: t("br.recife.related.hub_contratos"), sub: t("br.recife.related.hub_contratos_sub") });
  return { title: t("br.recife.related.title"), sub: t("br.recife.related.orgao_block_sub"), rows };
}

type TemasFile = { items: Record<string, { tema: string; slug: string; total_pago: number; n_organizacoes: number }> };

/** Theme: its neighbours in the ranking of themes, the recipients hub. */
export function temaRelated(tm: TemaDetail, locale: RecifeLocale): RelatedBlock | null {
  const t = relatedT(locale);
  const ranked = Object.values(readDataJsonOrNull<TemasFile>(`${NS}/temas.json`)?.items ?? {}).sort((a, b) => b.total_pago - a.total_pago);
  const rows: RelatedRow[] = neighbours(ranked, ranked.findIndex((x) => x.slug === tm.slug), 5).map((x) => ({
    href: `${BASE}/tema/${x.slug}`,
    label: x.tema,
    sub: t("br.recife.related.tema_sub", { n: relatedInt(x.n_organizacoes, locale) }),
    amount: brl(x.total_pago),
  }));
  rows.push({ href: `${BASE}/quem-recebe`, label: t("br.recife.related.hub_quem"), sub: t("br.recife.related.hub_quem_sub") });
  return { title: t("br.recife.related.title"), sub: t("br.recife.related.tema_block_sub"), rows };
}

type ModalidadesFile = { items: Record<string, { modalidade: string; slug: string; n_contratos: number; valor_total: number }> };

/** Procurement modality: the other modalities, the contracts hub. */
export function modalidadeRelated(m: ModalidadeDetail, locale: RecifeLocale): RelatedBlock | null {
  const t = relatedT(locale);
  const rows: RelatedRow[] = Object.values(readDataJsonOrNull<ModalidadesFile>(`${NS}/modalidades.json`)?.items ?? {})
    .filter((x) => x.slug !== m.slug && loadModalidade(x.slug))
    .sort((a, b) => b.n_contratos - a.n_contratos)
    .slice(0, 5)
    .map((x) => ({
      href: `${BASE}/modalidade/${x.slug}`,
      label: modalidadeLabel(x.modalidade, locale),
      sub: t("br.recife.related.modalidade_peer_sub", { n: relatedInt(x.n_contratos, locale) }),
    }));
  rows.push({ href: `${BASE}/contratos`, label: t("br.recife.related.hub_contratos"), sub: t("br.recife.related.hub_contratos_sub") });
  return { title: t("br.recife.related.title"), sub: t("br.recife.related.modalidade_block_sub"), rows };
}

/** Budget function: its neighbours among the same year's functions, the budget page. */
export function funcaoRelated(f: FuncaoDetail, locale: RecifeLocale): RelatedBlock | null {
  const t = relatedT(locale);
  const year = loadBudget().anos.find((a) => a.ano === f.ano);
  const ranked = (year?.funcoes ?? []).filter((x) => x.pago > 0).sort((a, b) => b.pago - a.pago);
  const rows: RelatedRow[] = neighbours(ranked, ranked.findIndex((x) => funcaoSlug(x.funcao) === funcaoSlug(f.funcao)), 5).map((x) => ({
    href: `${BASE}/budget/funcao/${funcaoSlug(x.funcao)}?year=${f.ano}`,
    label: titleCasePt(x.funcao),
    sub: t("br.recife.related.funcao_peer_sub", { ano: f.ano }),
    amount: brl(x.pago),
  }));
  rows.push({ href: `${BASE}/budget?year=${f.ano}`, label: t("br.recife.related.hub_budget", { ano: f.ano }), sub: t("br.recife.related.hub_budget_sub") });
  return { title: t("br.recife.related.title"), sub: t("br.recife.related.funcao_block_sub", { ano: f.ano }), rows };
}
