import "server-only";
import type { FuncaoDetail } from "@/lib/br/recife-data";
import { funcaoSlug } from "@/lib/br/format";
import { fmtBrlCompact, fmtBrlCompactNum, brlMagnitude, fmtShare, titleCasePt } from "@/lib/br/format";
import type { RelatedBlock, RelatedRow } from "@/components/fiche/RelatedLinks";
import type { MunicipioBudget } from "@/lib/br/municipios";

/**
 * A município's função page (2026-09-18) : the title that answers, the
 * sentence under it, the neighbouring funções of the same year. Recife has
 * its own (recife-answers.ts, recife-related.ts) ; every other município
 * reads SICONFI and says so.
 */

export type Loc = "pt" | "en";

const SICONFI = { pt: "Fonte : SICONFI, Tesouro Nacional (DCA, Anexo I-E).", en: "Source: SICONFI, National Treasury (DCA, Anexo I-E)." };

export function municipioFuncaoAnswer(f: FuncaoDetail, m: MunicipioBudget["municipio"], locale: Loc): { title: string; answer: string } {
  const amt = fmtBrlCompact(f.total_pago);
  const nome = `${m.nome} (${m.uf})`;
  const delta =
    f.delta_pct == null
      ? ""
      : locale === "en"
        ? `, ${f.delta_pct >= 0 ? "up" : "down"} ${Math.abs(f.delta_pct * 100).toFixed(1)}% on the previous year`
        : `, ${f.delta_pct >= 0 ? "alta" : "queda"} de ${Math.abs(f.delta_pct * 100).toFixed(1).replace(".", ",")}% em relação ao ano anterior`;
  if (locale === "en") {
    return {
      title: `${titleCasePt(f.funcao)}: ${amt} spent by ${nome} in ${f.ano}`,
      answer: `In ${f.ano}, the município of ${nome} paid ${amt} on ${f.funcao.toLowerCase()}, ${fmtShare(f.share_of_year)} of the year's spending${delta}. ${SICONFI.en}`,
    };
  }
  return {
    title: `${titleCasePt(f.funcao)}: ${amt} gastos por ${nome} em ${f.ano}`,
    answer: `Em ${f.ano}, o município de ${nome} pagou ${amt} com ${f.funcao.toLowerCase()}, ${fmtShare(f.share_of_year)} da despesa do ano${delta}. ${SICONFI.pt}`,
  };
}

export const municipioPerimeter: Record<Loc, string> = {
  pt: "Despesa paga, exceto intraorçamentárias, tal como declarada ao Tesouro Nacional (DCA, Anexo I-E).",
  en: "Spending paid, excluding intra-budget transfers, as filed with the National Treasury (DCA, Anexo I-E).",
};

export function municipioFuncaoRelated(d: MunicipioBudget, f: FuncaoDetail, locale: Loc): RelatedBlock | null {
  const year = d.anos.find((a) => a.ano === f.ano);
  const ranked = (year?.funcoes ?? []).filter((x) => x.pago > 0).sort((a, b) => b.pago - a.pago);
  const i = ranked.findIndex((x) => funcaoSlug(x.funcao) === funcaoSlug(f.funcao));
  const around = ranked.filter((_, j) => j !== i && Math.abs(j - i) <= 3).slice(0, 5);
  const base = `/brasil/${d.municipio.slug}`;
  const rows: RelatedRow[] = around.map((x) => ({
    href: `${base}/funcao/${funcaoSlug(x.funcao)}?year=${f.ano}`,
    label: titleCasePt(x.funcao),
    sub: locale === "en" ? `paid in ${f.ano}` : `pago em ${f.ano}`,
    amount: { v: fmtBrlCompactNum(x.pago), u: brlMagnitude(x.pago) },
  }));
  rows.push({
    href: `${base}?year=${f.ano}`,
    label: locale === "en" ? `${d.municipio.nome}'s budget, ${f.ano}` : `O orçamento de ${d.municipio.nome}, ${f.ano}`,
    sub: locale === "en" ? "Every function of the year, per resident, the years" : "Todas as funções do ano, por habitante, os anos",
  });
  return {
    title: locale === "en" ? "See also" : "Ver também",
    sub: locale === "en" ? `The other functions of ${f.ano}, each with its page.` : `As outras funções de ${f.ano}, cada uma com a sua página.`,
    rows,
  };
}
