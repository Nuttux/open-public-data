"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useT, useLocale } from "@/lib/localeContext";
import { FicheYearBars } from "@/components/fiche";
import type { FicheYearPoint } from "@/components/fiche";
import FicheKpis from "@/components/fusion/FicheKpis";
import type { OrgaoDetail, SourceBlock } from "@/lib/br/recife-data";
import { fmtBrlCompact, fmtInt, hasValor, titleCasePt, fill, mesRange } from "@/lib/br/format";

/**
 * Órgão (contracting department) fiche — a payments-anchored entity view:
 * total paid, spend by year, top suppliers (paid) and top contracts. Payments
 * come straight from the despesa dataset; contracts are best-effort joined
 * (different órgão taxonomies), so the contracts section is conditional.
 */
export default function RecifeOrgaoFiche({
  o, source,
}: {
  o: OrgaoDetail;
  source: SourceBlock;
}) {
  const t = useT();
  const { locale } = useLocale();
  const router = useRouter();
  // Show every year; the incomplete current year renders as provisional
  // (hatched) rather than being dropped — consistent across all fiches.
  const pj = o.partial_year;
  const years: FicheYearPoint[] = o.by_year.map((y) => ({ year: y.ano, value: y.pago, provisional: !!pj && pj.ano === y.ano }));
  const provisionalNote = pj ? fill(t("br.recife.partial_note"), { ano: pj.ano, mes: mesRange(pj.ate_mes, locale) }) : undefined;
  const anos = o.by_year.map((y) => y.ano);
  const first = anos.length ? Math.min(...anos) : undefined;
  const last = anos.length ? Math.max(...anos) : undefined;

  return (
    <div>
      <FicheKpis
        items={[
          { label: t("br.recife.orgao.total_pago"), value: fmtBrlCompact(o.total_pago) },
          { label: t("br.recife.orgao.fornecedores"), value: fmtInt(o.n_suppliers) },
          { label: t("br.recife.orgao.contratos"), value: fmtInt(o.n_contratos) },
          { label: t("br.recife.rec.periodo"), value: first && last && first !== last ? `${first}–${last}` : (last ?? "—") },
        ]}
      />

      {years.length > 0 && (
        <section className="fx-fiche-section">
          <div className="fx-fiche-h">{t("br.recife.orgao.by_year")}</div>
          <FicheYearBars points={years} format={fmtBrlCompact} provisionalNote={provisionalNote} />
        </section>
      )}

      {o.top_suppliers.length > 0 && (
        <section className="fx-fiche-section">
          <div className="fx-fiche-h">{t("br.recife.orgao.top_suppliers")}</div>
          <table className="fx-fiche-table">
            <tbody>
              {o.top_suppliers.map((s) => (
                <tr
                  key={s.cnpj}
                  className="fx-row-link"
                  onClick={() => router.push(`/br/city/recife/quem-recebe/${s.cnpj}`)}
                >
                  <td>
                    <Link href={`/br/city/recife/quem-recebe/${s.cnpj}`} onClick={(e) => e.stopPropagation()}>
                      {titleCasePt(s.nome)}
                    </Link>
                  </td>
                  <td className="num mono">{fmtBrlCompact(s.pago)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {o.top_contracts.length > 0 && (
        <section className="fx-fiche-section">
          <div className="fx-fiche-h">{t("br.recife.orgao.top_contracts")}</div>
          <table className="fx-fiche-table">
            <tbody>
              {o.top_contracts.map((c) => (
                <tr
                  key={c.contrato_id}
                  className="fx-row-link"
                  onClick={() => router.push(`/br/city/recife/contratos/${c.contrato_id}`)}
                >
                  <td>
                    <Link href={`/br/city/recife/contratos/${c.contrato_id}`} onClick={(e) => e.stopPropagation()}>
                      {c.numero}
                    </Link>
                    <div className="fx-fiche-sub">{titleCasePt(c.objeto)}</div>
                  </td>
                  <td className="num mono">
                    {hasValor(c.valor) ? fmtBrlCompact(c.valor) : <span style={{ color: "var(--muted)", fontStyle: "italic" }}>{t("br.recife.contrato.sem_valor")}</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      <footer className="fx-fiche-sources">
        <p className="fx-footer-sources-meta">
          {t("br.recife.orgao.source")}{" "}
          {source.source_url && (
            <a href={source.source_url} target="_blank" rel="noopener noreferrer">{t("br.recife.source")} ↗</a>
          )}
        </p>
      </footer>
    </div>
  );
}
