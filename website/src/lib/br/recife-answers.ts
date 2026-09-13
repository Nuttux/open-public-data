/**
 * The answer every Recife entity page opens with — title + one sentence
 * (lib/seo/page-answer.ts), in Portuguese on pt.qipu.org and in English on
 * www. Typed structurally on the fields each page already loads.
 *
 * The source named is the one the fiches cite: the Portal da Transparência
 * of the Prefeitura do Recife (dados abertos).
 */
import { fmtBrlCompact, fmtShare, titleCasePt } from "@/lib/br/format";
import { isoDate, n, sourceSentence, type PageAnswer } from "@/lib/seo/page-answer";
import { clip } from "@/lib/entities/seo-text";

export type RecifeLocale = "pt" | "en";

type Src = { name?: string | null; as_of?: string | null } | null | undefined;

const PORTAL = "Portal da Transparência do Recife";
function src(locale: RecifeLocale, s: Src, fallbackIso?: string | null): string {
  // The dataset name the fiche cites ("Despesas Orçamentárias"), under the portal it comes from.
  const ds = (s?.name || "").replace(/\s+,/g, ",").trim();
  const name = ds && ds !== PORTAL ? `${PORTAL} (${ds})` : PORTAL;
  return sourceSentence(locale, name, isoDate(s?.as_of ?? fallbackIso ?? null, locale));
}

function years(rows: { ano: number }[]): { first: number | null; last: number | null } {
  const ys = rows.map((r) => r.ano).filter((y) => Number.isFinite(y)).sort((a, b) => a - b);
  return { first: ys[0] ?? null, last: ys[ys.length - 1] ?? null };
}
function lead(locale: RecifeLocale, first: number | null, last: number | null): string {
  if (first == null || last == null) return "";
  if (first === last) return locale === "pt" ? `Em ${last},` : `In ${last},`;
  return locale === "pt" ? `Entre ${first} e ${last},` : `Between ${first} and ${last},`;
}
function span(first: number | null, last: number | null): string {
  if (first == null || last == null) return "";
  return first === last ? ` (${last})` : ` (${first}–${last})`;
}

export function recipientAnswer(
  r: {
    nome: string;
    total_pago: number;
    n_contratos: number;
    principal_orgao: string | null;
    by_year: { ano: number }[];
    source?: Src;
  },
  locale: RecifeLocale,
): PageAnswer {
  const { first, last } = years(r.by_year);
  const amt = fmtBrlCompact(r.total_pago);
  const org = r.principal_orgao ? titleCasePt(r.principal_orgao) : null;
  if (locale === "en") {
    return {
      title: `${clip(titleCasePt(r.nome), 38)}: ${amt} paid by Recife`,
      answer: `${lead("en", first, last)} the Prefeitura do Recife paid ${amt} to ${r.nome}${org ? `, mostly through ${org}` : ""}${
        r.n_contratos > 0 ? `, with ${n("contract", r.n_contratos)} on file` : ""
      }. ${src("en", r.source)}`.trim(),
    };
  }
  return {
    title: `${clip(titleCasePt(r.nome), 38)}: ${amt} da Prefeitura do Recife`,
    answer: `${lead("pt", first, last)} a Prefeitura do Recife pagou ${amt} a ${r.nome}${org ? `, principalmente pelo órgão ${org}` : ""}${
      r.n_contratos > 0 ? `, em ${n("contrato", r.n_contratos, "pt")}` : ""
    }. ${src("pt", r.source)}`.trim(),
  };
}

export function orgaoAnswer(
  o: { orgao: string; total_pago: number; n_suppliers: number; n_contratos: number; by_year: { ano: number }[]; source?: Src },
  locale: RecifeLocale,
): PageAnswer {
  const { first, last } = years(o.by_year);
  const amt = fmtBrlCompact(o.total_pago);
  const name = titleCasePt(o.orgao);
  if (locale === "en") {
    return {
      title: `${name}: ${amt} paid to ${n("supplier", o.n_suppliers)} by this Recife city body${span(first, last)}`,
      answer: `${lead("en", first, last)} Recife's ${name} paid ${amt} to ${n("supplier", o.n_suppliers)}${
        o.n_contratos > 0 ? ` under ${n("contract", o.n_contratos)}` : ""
      }. ${src("en", o.source)}`.trim(),
    };
  }
  return {
    title: `${name}: ${amt} pagos a ${n("fornecedor", o.n_suppliers, "pt", "fornecedores")} por este órgão do Recife${span(first, last)}`,
    answer: `${lead("pt", first, last)} ${name} pagou ${amt} a ${n("fornecedor", o.n_suppliers, "pt", "fornecedores")}${
      o.n_contratos > 0 ? ` em ${n("contrato", o.n_contratos, "pt")}` : ""
    }. ${src("pt", o.source)}`.trim(),
  };
}

export function temaAnswer(
  t: { tema: string; total_pago: number; n_organizacoes: number; subvencao_total: number; n_subvencionadas: number; by_year: { ano: number }[]; source?: Src },
  locale: RecifeLocale,
): PageAnswer {
  const { first, last } = years(t.by_year);
  const amt = fmtBrlCompact(t.total_pago);
  if (locale === "en") {
    return {
      title: `${t.tema} in Recife: ${amt} paid to ${n("organisation", t.n_organizacoes)}${span(first, last)}`,
      answer: `${lead("en", first, last)} the City of Recife paid ${amt} to ${n("organisation", t.n_organizacoes)} working in ${t.tema.toLowerCase()}${
        t.subvencao_total > 0 ? `, of which ${fmtBrlCompact(t.subvencao_total)} as grants to ${n("non-profit", t.n_subvencionadas)}` : ""
      }. ${src("en", t.source)}`.trim(),
    };
  }
  return {
    title: `${t.tema} no Recife: ${amt} pagos a ${n("organização", t.n_organizacoes, "pt", "organizações")}${span(first, last)}`,
    answer: `${lead("pt", first, last)} a Prefeitura do Recife pagou ${amt} a ${n("organização", t.n_organizacoes, "pt", "organizações")} da área de ${t.tema.toLowerCase()}${
      t.subvencao_total > 0 ? `, sendo ${fmtBrlCompact(t.subvencao_total)} em subvenções a ${n("entidade", t.n_subvencionadas, "pt")} sem fins lucrativos` : ""
    }. ${src("pt", t.source)}`.trim(),
  };
}

export function modalidadeAnswer(
  m: { modalidade: string; n_contratos: number; valor_total: number; n_ativos: number; by_year: { ano: number }[]; source?: Src },
  locale: RecifeLocale,
): PageAnswer {
  const { first, last } = years(m.by_year);
  const name = titleCasePt(m.modalidade);
  const amt = fmtBrlCompact(m.valor_total);
  if (locale === "en") {
    return {
      title: `${name} in Recife: ${n("contract", m.n_contratos)}, ${amt}${span(first, last)}`,
      answer: `${lead("en", first, last)} the City of Recife signed ${n("contract", m.n_contratos)} through ${name.toLowerCase()}, worth ${amt} in total, ${n("of them", m.n_ativos, "en", "of them")} still active. ${src("en", m.source)}`.trim(),
    };
  }
  return {
    title: `${name} no Recife: ${n("contrato", m.n_contratos, "pt")}, ${amt}${span(first, last)}`,
    answer: `${lead("pt", first, last)} a Prefeitura do Recife firmou ${n("contrato", m.n_contratos, "pt")} por ${name.toLowerCase()}, no valor total de ${amt}, ${m.n_ativos} deles ainda vigentes. ${src("pt", m.source)}`.trim(),
  };
}

export function funcaoAnswer(
  f: { funcao: string; ano: number; total_pago: number; share_of_year: number; delta_pct: number | null; source?: Src },
  locale: RecifeLocale,
): PageAnswer {
  const amt = fmtBrlCompact(f.total_pago);
  const delta =
    f.delta_pct == null
      ? ""
      : locale === "en"
        ? `, ${f.delta_pct >= 0 ? "up" : "down"} ${Math.abs(f.delta_pct).toFixed(1)}% on the previous year`
        : `, ${f.delta_pct >= 0 ? "alta" : "queda"} de ${Math.abs(f.delta_pct).toFixed(1).replace(".", ",")}% em relação ao ano anterior`;
  if (locale === "en") {
    return {
      title: `${titleCasePt(f.funcao)}: ${amt} spent by the City of Recife in ${f.ano}`,
      answer: `In ${f.ano}, the City of Recife spent ${amt} on ${f.funcao.toLowerCase()}, ${fmtShare(f.share_of_year)} of the year's executed budget${delta}. ${src("en", f.source)}`,
    };
  }
  return {
    title: `${titleCasePt(f.funcao)}: ${amt} gastos pela Prefeitura do Recife em ${f.ano}`,
    answer: `Em ${f.ano}, a Prefeitura do Recife gastou ${amt} com ${f.funcao.toLowerCase()}, ${fmtShare(f.share_of_year)} da despesa executada do ano${delta}. ${src("pt", f.source)}`,
  };
}

export function contratoAnswer(
  c: {
    numero: string | null;
    ano: number | null;
    orgao: string | null;
    objeto: string | null;
    modalidade: string;
    fornecedor: string | null;
    valor: number | null;
    is_ativo: boolean;
  },
  source: Src,
  locale: RecifeLocale,
): PageAnswer {
  const ref = c.numero ?? (locale === "en" ? "no number" : "sem número");
  const amt = c.valor != null ? fmtBrlCompact(c.valor) : null;
  const org = c.orgao ? titleCasePt(c.orgao) : null;
  const obj = c.objeto ? c.objeto.trim().replace(/\.$/u, "") : null;
  // « ADESAO A ATA DE RP N. 070/2023 PE. N. 022/2023 » : une référence de
  // procédure, pas un objet. Le titre prend alors le fournisseur, ce qu'on cherche.
  const objTitle = obj && (obj.match(/\d/g) ?? []).length < 6 ? obj : null;
  const who = c.fornecedor ? clip(titleCasePt(c.fornecedor), 38) : null;
  if (locale === "en") {
    return {
      title: objTitle ? `${clip(objTitle, 55)}: ${amt ? `${amt} ` : ""}contract (Recife${c.ano ? `, ${c.ano}` : ""})` : who ? `Recife contract with ${who}${amt ? `: ${amt}` : ""}${c.ano ? ` (${c.ano})` : ""}` : `Recife contract ${ref}${amt ? `: ${amt}` : ""}${c.ano ? ` (${c.ano})` : ""}`,
      answer: `${c.ano ? `In ${c.ano}, ` : ""}the City of Recife${org ? ` (${org})` : ""} signed contract ${ref}${c.fornecedor ? ` with ${c.fornecedor}` : ""}${amt ? ` for ${amt}` : ""} by ${titleCasePt(c.modalidade).toLowerCase()}${
        obj ? `: ${obj}` : ""
      }. ${c.is_ativo ? "Still in force. " : ""}${src("en", source)}`,
    };
  }
  return {
    title: objTitle ? `${clip(objTitle, 55)}: contrato${amt ? ` de ${amt}` : ""} (Recife${c.ano ? `, ${c.ano}` : ""})` : who ? `Contrato do Recife com ${who}${amt ? `: ${amt}` : ""}${c.ano ? ` (${c.ano})` : ""}` : `Contrato ${ref} do Recife${amt ? `: ${amt}` : ""}${c.ano ? ` (${c.ano})` : ""}`,
    answer: `${c.ano ? `Em ${c.ano}, ` : ""}a Prefeitura do Recife${org ? ` (${org})` : ""} firmou o contrato ${ref}${c.fornecedor ? ` com ${c.fornecedor}` : ""}${amt ? ` no valor de ${amt}` : ""} por ${titleCasePt(c.modalidade).toLowerCase()}${
      obj ? `: ${obj}` : ""
    }. ${c.is_ativo ? "Ainda vigente. " : ""}${src("pt", source)}`,
  };
}

export function lugarAnswer(
  p: {
    nome: string;
    tipo: string | null;
    familia: string;
    bairro: string | null;
    obras_total?: number | null;
    n_obras?: number | null;
    descricao?: string | null;
    descricao_en?: string | null;
  },
  locale: RecifeLocale,
): PageAnswer {
  const kind = (p.tipo || p.familia || "").toLowerCase();
  const where = p.bairro ? (locale === "en" ? ` in ${p.bairro}` : ` no bairro ${p.bairro}`) : "";
  const works =
    p.n_obras && p.n_obras > 0
      ? locale === "en"
        ? `${n("works contract", p.n_obras)}${p.obras_total ? ` worth ${fmtBrlCompact(p.obras_total)}` : ""}`
        : `${n("contrato de obra", p.n_obras, "pt", "contratos de obra")}${p.obras_total ? ` no valor de ${fmtBrlCompact(p.obras_total)}` : ""}`
      : null;
  if (locale === "en") {
    const desc = p.descricao_en || p.descricao;
    return {
      title: `${p.nome}: what the City of Recife spends and decided here`,
      answer: `${desc ? `${desc.trim().replace(/\.$/u, "")}. ` : ""}${p.nome}${kind ? ` (${kind}${where})` : where}: ${works ? `${works}, ` : ""}the city money that reaches it, each figure linked to its source. ${src("en", null)}`,
    };
  }
  return {
    title: `${p.nome}: o que a Prefeitura do Recife gasta e decide aqui`,
    answer: `${p.descricao ? `${p.descricao.trim().replace(/\.$/u, "")}. ` : ""}${p.nome}${kind ? ` (${kind}${where})` : where}: ${works ? `${works}, ` : ""}o dinheiro da Prefeitura que chega até aqui, cada número ligado à sua fonte. ${src("pt", null)}`,
  };
}
