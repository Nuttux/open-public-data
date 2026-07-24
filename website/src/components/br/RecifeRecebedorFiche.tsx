"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useT } from "@/lib/localeContext";
import { FicheYearBars } from "@/components/fiche";
import type { FicheYearPoint } from "@/components/fiche";
import FicheKpis from "@/components/fusion/FicheKpis";
import type { RecipientDetail, SourceBlock } from "@/lib/br/recife-data";
import { fmtBrlCompact, fmtCnpj, fmtInt, hasValor, titleCasePt, fill, slugTema } from "@/lib/br/format";

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
  const router = useRouter();
  const contratosOnly = !!rec.contratos_only;
  const years: FicheYearPoint[] = rec.by_year.map((y) => ({ year: y.ano, value: y.pago }));
  // Period: from payment years normally; from contract years for contract-only
  // suppliers (they have no payment years).
  const contratoAnos = rec.contratos.map((c) => c.ano).filter((a): a is number => a != null);
  const firstYear = contratosOnly ? (contratoAnos.length ? Math.min(...contratoAnos) : undefined) : rec.by_year[0]?.ano;
  const lastYear = contratosOnly ? (contratoAnos.length ? Math.max(...contratoAnos) : undefined) : rec.by_year[rec.by_year.length - 1]?.ano;

  return (
    <div>
      {(rec.tema || rec.perfil?.natureza || contratosOnly) && (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 14 }}>
          {rec.tema && <Link href={`/br/city/recife/tema/${slugTema(rec.tema)}`} className="fx-sm-tag" style={{ textDecoration: "none" }} title={t("br.recife.rec.tema_tip")}>{rec.tema}</Link>}
          {rec.perfil?.natureza && <span className="fx-sm-tag">{rec.perfil.natureza}</span>}
          {rec.is_subvencao && <span className="fx-sm-tag">{t("br.recife.qr.badge_subv")}</span>}
          {contratosOnly && <span className="fx-sm-tag">{t("br.recife.rec.contratos_only_tag")}</span>}
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
          contratosOnly
            ? { label: t("br.recife.rec.contratado_total"), value: fmtBrlCompact(rec.total_contratado ?? 0) }
            : { label: t("br.recife.rec.paid_total"), value: fmtBrlCompact(rec.total_pago) },
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

      {contratosOnly && (
        <div className="fx-fiche-lead" style={{ marginTop: 14 }}>
          <p className="fx-fiche-lead-sub" style={{ margin: 0 }}>{t("br.recife.rec.contratos_only_note")}</p>
        </div>
      )}

      {rec.total_empenhado > 0 && (() => {
        // Empenhado (committed) → pago (actually paid): the Brazilian
        // execution ratio. Answers "expected vs given" at the recipient level
        // (contracts carry a single value; this is where the two numbers live).
        const pct = Math.round(Math.min(rec.total_pago / rec.total_empenhado, 1) * 100);
        return (
          <div style={{ margin: "18px 0 0" }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontFamily: "var(--f-mono)", fontSize: 10.5, letterSpacing: ".06em", textTransform: "uppercase", color: "var(--muted)", marginBottom: 7 }}>
              <span>{t("br.recife.rec.pago")} {fmtBrlCompact(rec.total_pago)}</span>
              <span>{t("br.recife.rec.empenhado")} {fmtBrlCompact(rec.total_empenhado)}</span>
            </div>
            <div style={{ position: "relative", height: 4, background: "var(--rule)", borderRadius: 2 }} aria-hidden="true">
              <div style={{ position: "absolute", top: 0, bottom: 0, left: 0, width: `${pct}%`, background: "var(--bleu)", borderRadius: 2 }} />
            </div>
            <div style={{ marginTop: 7, fontFamily: "var(--f-mono)", fontSize: 10.5, letterSpacing: ".06em", textTransform: "uppercase", color: "var(--muted)", cursor: "help" }} title={t("br.recife.rec.exec_note")}>
              {fill(t("br.recife.rec.execucao"), { pct: String(pct) })}
            </div>
          </div>
        );
      })()}

      {years.length > 0 && (
        <section className="fx-fiche-section">
          <div className="fx-fiche-h">{t("br.recife.rec.by_year")}</div>
          <FicheYearBars points={years} format={fmtBrlCompact} />
          {rec.principal_orgao && (
            <p className="fx-fiche-sub">{t("br.recife.rec.principal_orgao")}: {rec.principal_orgao}</p>
          )}
        </section>
      )}

      {rec.by_orgao && rec.by_orgao.length > 1 && (() => {
        const maxV = Math.max(...rec.by_orgao!.map((o) => o.valor), 1);
        return (
          <section className="fx-fiche-section">
            <div className="fx-fiche-h">{contratosOnly ? t("br.recife.rec.by_orgao_contr") : t("br.recife.rec.by_orgao")}</div>
            {rec.by_orgao!.map((o, i) => {
              // Link only when the pipeline resolved a live órgão-page slug
              // (paid = always; contract-only = when the taxonomies bridge).
              const linkable = !!o.slug;
              const label = (
                <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  <span aria-hidden="true" style={{ position: "relative", display: "inline-block", width: `${(o.valor / maxV) * 100}%`, height: 4, background: o.orgao ? "var(--ink)" : "var(--muted)", verticalAlign: "middle", marginRight: 8, maxWidth: "35%" }} />
                  {o.orgao ? titleCasePt(o.orgao) : t("br.recife.rec.outros")}
                </span>
              );
              const val = (
                <span style={{ textAlign: "right", fontFamily: "var(--f-disp)", fontWeight: 700, fontSize: 13 }}>
                  {fmtBrlCompact(o.valor)}
                </span>
              );
              const style = { display: "grid", gridTemplateColumns: "1fr 96px", gap: 14, padding: "6px 0", borderBottom: "1px solid var(--rule)", fontFamily: "var(--f-ui)", fontSize: 13 } as const;
              return linkable ? (
                <Link key={o.orgao} href={`/br/city/recife/orgao/${o.slug}`} className="fx-row-link" style={{ ...style, color: "inherit", textDecoration: "none" }}>
                  {label}{val}
                </Link>
              ) : (
                <div key={o.orgao ?? `outros-${i}`} style={style}>{label}{val}</div>
              );
            })}
          </section>
        );
      })()}

      {rec.contratos.length > 0 && (
        <section className="fx-fiche-section">
          <div className="fx-fiche-h">{t("br.recife.rec.contratos")} ({rec.n_contratos})</div>
          <table className="fx-fiche-table">
            <tbody>
              {rec.contratos.map((c) => (
                <tr
                  key={c.contrato_id}
                  className="fx-row-link"
                  onClick={() => router.push(`/br/city/recife/contratos/${c.contrato_id}`)}
                >
                  <td>
                    <Link
                      href={`/br/city/recife/contratos/${c.contrato_id}`}
                      onClick={(e) => e.stopPropagation()}
                    >
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
          {rec.n_contratos > rec.contratos.length && (
            <p className="fx-fiche-sub">{fill(t("br.recife.rec.contratos_capped"), { n: fmtInt(rec.contratos.length), total: fmtInt(rec.n_contratos) })}</p>
          )}
        </section>
      )}

      {rec.n_contratos === 0 && (
        <p className="fx-fiche-sub" style={{ marginTop: 14 }}>{t("br.recife.rec.sem_contrato")}</p>
      )}

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
