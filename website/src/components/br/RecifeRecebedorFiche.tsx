"use client";

import Link from "next/link";
import { useT } from "@/lib/localeContext";
import { FicheYearBars } from "@/components/fiche";
import type { FicheYearPoint } from "@/components/fiche";
import FicheKpis from "@/components/fusion/FicheKpis";
import type { RecipientDetail, SourceBlock } from "@/lib/br/recife-data";
import { fmtBrlCompact, fmtCnpj, fmtInt, hasValor, titleCasePt, fill } from "@/lib/br/format";

/**
 * Recipient (organisation / CNPJ) fiche — a thin br-municipal ADAPTER that
 * composes the shared fiche primitives (mirrors fusion/AssociationFiche):
 * nature tag · fx-fiche-lead (plain-language) · FicheKpis · year bars ·
 * fx-fiche-section/fx-fiche-table blocks · source footer. No bespoke CSS.
 * Orgs only; CPF individuals never reach this component.
 */
export default function RecifeRecebedorFiche({
  rec,
  source,
}: {
  rec: RecipientDetail;
  source: SourceBlock;
}) {
  const t = useT();
  const years: FicheYearPoint[] = rec.by_year.map((y) => ({ year: y.ano, value: y.pago }));
  const firstYear = rec.by_year[0]?.ano;
  const lastYear = rec.by_year[rec.by_year.length - 1]?.ano;

  return (
    <div>
      {(rec.tema || rec.perfil?.natureza) && (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 14 }}>
          {rec.tema && <span className="fx-sm-tag">{rec.tema}</span>}
          {rec.perfil?.natureza && <span className="fx-sm-tag">{rec.perfil.natureza}</span>}
          {rec.is_subvencao && <span className="fx-sm-tag">{t("br.recife.qr.badge_subv")}</span>}
        </div>
      )}

      {(rec.resumo || rec.o_que_financia) && (
        <div className="fx-fiche-lead">
          {rec.resumo && <p className="fx-fiche-lead-main">{rec.resumo}</p>}
          {rec.o_que_financia && <p className="fx-fiche-lead-sub">{rec.o_que_financia}</p>}
        </div>
      )}

      <FicheKpis
        items={[
          { label: t("br.recife.rec.paid_total"), value: fmtBrlCompact(rec.total_pago) },
          ...(rec.is_subvencao
            ? [{ label: t("br.recife.qr.badge_subv"), value: fmtBrlCompact(rec.subvencao_pago) }]
            : []),
          { label: t("br.recife.rec.contratos"), value: rec.n_contratos },
          {
            label: t("br.recife.rec.periodo"),
            value: firstYear && lastYear && firstYear !== lastYear ? `${firstYear}–${lastYear}` : (lastYear ?? "—"),
          },
        ]}
      />

      <section className="fx-fiche-section">
        <div className="fx-fiche-h">{t("br.recife.rec.by_year")}</div>
        <FicheYearBars points={years} format={fmtBrlCompact} />
        {rec.principal_orgao && (
          <p className="fx-fiche-sub">{t("br.recife.rec.principal_orgao")}: {rec.principal_orgao}</p>
        )}
      </section>

      {rec.perfil && (
        <section className="fx-fiche-section">
          <div className="fx-fiche-h">{t("br.recife.rec.perfil")}</div>
          <table className="fx-fiche-table">
            <tbody>
              {rec.perfil.cnae && (<tr><td>CNAE</td><td>{rec.perfil.cnae}</td></tr>)}
              {rec.perfil.setor && (<tr><td>{t("br.recife.rec.setor")}</td><td>{rec.perfil.setor}</td></tr>)}
              {rec.perfil.porte && (<tr><td>{t("br.recife.rec.porte")}</td><td>{rec.perfil.porte}</td></tr>)}
              {rec.perfil.situacao && (<tr><td>{t("br.recife.rec.situacao")}</td><td>{rec.perfil.situacao}</td></tr>)}
              <tr><td>{t("br.recife.rec.cnpj")}</td><td className="mono">{fmtCnpj(rec.cnpj)}</td></tr>
            </tbody>
          </table>
        </section>
      )}

      {rec.contratos.length > 0 && (
        <section className="fx-fiche-section">
          <div className="fx-fiche-h">{t("br.recife.rec.contratos")} ({rec.n_contratos})</div>
          <table className="fx-fiche-table">
            <tbody>
              {rec.contratos.map((c) => (
                <tr key={c.contrato_id}>
                  <td>
                    <Link href={`/br/city/recife/contratos/${c.contrato_id}`}>{c.numero}</Link>
                    <div className="fx-fiche-sub">{titleCasePt(c.objeto)}</div>
                  </td>
                  <td className="num mono">
                    {hasValor(c.valor) ? fmtBrlCompact(c.valor) : <span style={{ color: "var(--muted)", fontStyle: "italic" }}>{t("br.recife.contrato.sem_valor")}</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {rec.n_contratos > rec.contratos.length && (
            <p className="fx-fiche-sub">{fill(t("br.recife.rec.contratos_capped"), { n: fmtInt(rec.contratos.length), total: fmtInt(rec.n_contratos) })}</p>
          )}
        </section>
      )}

      {rec.n_contratos === 0 && (
        <p className="fx-fiche-sub" style={{ marginTop: 14 }}>{t("br.recife.rec.sem_contrato")}</p>
      )}

      <footer className="fx-fiche-sources">
        <p className="fx-footer-sources-meta">
          {t("br.recife.rec.source")}{" "}
          {source.source_url && (
            <a href={source.source_url} target="_blank" rel="noopener noreferrer">{t("br.recife.source")} ↗</a>
          )}
          {(rec.perfil || rec.resumo) && <><br />{t("br.recife.rec.perfil_fonte")}</>}
        </p>
      </footer>
    </div>
  );
}
