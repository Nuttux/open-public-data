/**
 * Server-side loaders + types for Recife (br/recife) pipeline exports.
 * Reads public/data/br/recife/*.json through the shared readDataJson entry
 * point (memoized). Mirror of lib/us/sf-*-data.ts, namespace br/recife/.
 */
import { readDataJson, readDataJsonOrNull } from "@/lib/data/read";
import { funcaoSlug } from "@/lib/br/format";

const NS = "br/recife";

export { funcaoSlug };

// ---- shared -----------------------------------------------------------------
export type SourceBlock = {
  name: string | null;
  portal: string | null;
  license: string | null;
  source_url: string | null;
  as_of: string | null;
};

// ---- budget -----------------------------------------------------------------
export type BudgetSubfuncao = { subfuncao: string; pago: number };
export type BudgetFuncao = {
  funcao: string;
  codigo: string | null;
  pago: number;
  empenhado: number;
  subfuncoes: BudgetSubfuncao[];
};
export type BudgetAno = {
  ano: number;
  total_pago: number;
  total_empenhado: number;
  funcoes: BudgetFuncao[];
};
export type Populacao = { populacao: number; ano: number; source: string; source_url: string };
export type BudgetData = {
  generated_at: string;
  source: SourceBlock;
  as_of: string | null;
  perimeter: string;
  populacao: Populacao | null;
  anos_disponiveis: number[];
  ano_mais_recente: number;
  anos: BudgetAno[];
  curva_mensal: { ano: number; mes: number; pago: number; empenhado: number }[];
};

export function loadBudget(): BudgetData {
  return readDataJson<BudgetData>(`${NS}/budget.json`);
}

export type FuncaoDetail = {
  funcao: string;
  codigo: string | null;
  ano: number;
  total_pago: number;
  total_empenhado: number;
  share_of_year: number;
  delta_pct: number | null;
  subfuncoes: BudgetSubfuncao[];
  by_year: { ano: number; pago: number }[];
  source: SourceBlock;
};

/** Función detail for the budget drilldown drawer — computed from budget.json. */
export function loadFuncao(slug: string, ano?: number): FuncaoDetail | null {
  const d = loadBudget();
  const year = ano ?? d.ano_mais_recente;
  const anoData = d.anos.find((a) => a.ano === year) ?? d.anos[d.anos.length - 1];
  if (!anoData) return null;
  const f = anoData.funcoes.find((x) => funcaoSlug(x.funcao) === slug);
  if (!f) return null;
  const by_year = d.anos
    .map((a) => ({ ano: a.ano, pago: a.funcoes.find((x) => funcaoSlug(x.funcao) === slug)?.pago ?? 0 }))
    .filter((x) => x.pago > 0);
  const idx = by_year.findIndex((x) => x.ano === anoData.ano);
  const prev = idx > 0 ? by_year[idx - 1].pago : null;
  const delta_pct = prev && prev > 0 ? (f.pago - prev) / prev : null;
  return {
    funcao: f.funcao, codigo: f.codigo, ano: anoData.ano,
    total_pago: f.pago, total_empenhado: f.empenhado,
    share_of_year: anoData.total_pago ? f.pago / anoData.total_pago : 0,
    delta_pct, subfuncoes: f.subfuncoes, by_year, source: d.source,
  };
}

// ---- quem recebe ------------------------------------------------------------
export type RecebedorSlim = {
  cnpj: string;
  nome: string;
  total_pago: number;
  subvencao_pago: number;
  is_subvencao: boolean;
  principal_orgao: string | null;
  n_contratos: number;
  tema?: string | null;
  resumo?: string | null;
};
export type TemaSlice = { tema: string; n_organizacoes: number; pago: number };
export type QuemRecebeData = {
  generated_at: string;
  source: SourceBlock;
  as_of: string | null;
  perimeter: string;
  anos_disponiveis: number[];
  anos_series: { ano: number; total_pago: number; n_orgs: number; subvencao: number }[];
  headline: {
    n_organizacoes: number;
    total_pago: number;
    subvencao_total: number;
    n_organizacoes_subvencionadas: number;
    mediana: number;
    concentracao_top10: number;
  };
  top_recebedores: RecebedorSlim[];
  top_subvencoes: RecebedorSlim[];
  temas: TemaSlice[];
  enrichment: {
    n_com_perfil: number;
    n_com_resumo: number;
    perfil_source: string;
    tema_method: string;
    resumo_model: string;
  };
};

export function loadQuemRecebe(): QuemRecebeData {
  return readDataJson<QuemRecebeData>(`${NS}/quem_recebe.json`);
}

// ---- recipient fiche --------------------------------------------------------
export type RecipientContrato = {
  contrato_id: string; numero: string; objeto: string | null;
  orgao: string | null; valor: number | null; situacao: string | null; ano: number | null;
};
export type RecipientPerfil = {
  cnae: string | null; setor: string | null; porte: string | null;
  natureza: string | null; situacao: string | null; razao_social: string | null;
};
export type RecipientDetail = {
  cnpj: string; nome: string;
  total_pago: number; total_empenhado: number; subvencao_pago: number;
  is_subvencao: boolean; principal_orgao: string | null;
  n_contratos: number;
  by_year: { ano: number; pago: number; n_empenhos: number; principal_orgao: string | null }[];
  contratos: RecipientContrato[];
  tema?: string | null;
  perfil?: RecipientPerfil | null;
  resumo?: string | null;
  o_que_financia?: string | null;
};
type RecipientsFile = {
  source: SourceBlock;
  items: Record<string, RecipientDetail>;
};

export function loadRecipient(cnpj: string): (RecipientDetail & { source: SourceBlock }) | null {
  const file = readDataJsonOrNull<RecipientsFile>(`${NS}/recipients.json`);
  const rec = file?.items?.[cnpj];
  return rec ? { ...rec, source: file!.source } : null;
}

// ---- contratos --------------------------------------------------------------
export type ContratoItem = {
  contrato_id: string; numero: string; ano: number | null;
  orgao: string | null; objeto: string | null; modalidade: string;
  fornecedor: string | null; fornecedor_cnpj: string | null; is_org: boolean;
  valor: number | null; situacao: string | null;
  vigencia_inicio: string | null; vigencia_fim: string | null; is_ativo: boolean;
};
export type ContratosData = {
  generated_at: string;
  source: SourceBlock;
  as_of: string | null;
  perimeter: string;
  headline: { n_contratos: number; n_ativos: number; valor_ativo_total: number };
  modalidade_mix: { modalidade: string; n: number; valor: number }[];
  contratos: ContratoItem[];
};

export function loadContratos(): ContratosData {
  return readDataJson<ContratosData>(`${NS}/contratos.json`);
}

export function loadContrato(id: string): { contrato: ContratoItem; source: SourceBlock } | null {
  const data = loadContratos();
  const contrato = data.contratos.find((c) => c.contrato_id === id);
  return contrato ? { contrato, source: data.source } : null;
}

// ---- licitações -------------------------------------------------------------
export type LicitacaoConcluida = {
  processo: string | null; ano: number | null; modalidade: string;
  orgao: string | null; objeto: string | null; fornecedor: string | null;
  valor_estimado: number | null; valor_homologado: number | null;
  economia: number | null; data: string | null;
};
export type LicitacoesData = {
  source: SourceBlock;
  headline: { n_concluidas: number; n_andamento: number; homologado_total: number };
  modalidade_mix: { modalidade: string; n: number; homologado: number }[];
  concluidas: LicitacaoConcluida[];
};

export function loadLicitacoes(): LicitacoesData {
  return readDataJson<LicitacoesData>(`${NS}/licitacoes.json`);
}
