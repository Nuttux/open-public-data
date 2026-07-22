"use client";

import Link from "next/link";
import { useT } from "@/lib/localeContext";
import FicheKpis from "@/components/fusion/FicheKpis";
import type { ContratoItem, SourceBlock } from "@/lib/br/recife-data";
import { fmtBrlCompact, fmtDate, fmtCnpj } from "@/lib/br/format";

/**
 * Contract fiche — thin br-municipal ADAPTER composing the shared fiche
 * primitives (FicheKpis + fx-fiche-lead + fx-fiche-table + source footer),
 * mirroring fusion/FournisseurFiche. CPF suppliers masked. No bespoke CSS.
 */
export default function RecifeContratoFiche({
  c,
  source,
}: {
  c: ContratoItem;
  source: SourceBlock;
}) {
  const t = useT();
  return (
    <div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 14 }}>
        {c.modalidade && c.modalidade !== "—" && <span className="fx-sm-tag">{c.modalidade}</span>}
        {c.is_ativo && <span className="fx-sm-tag">{t("br.recife.ct.badge_ativo")}</span>}
      </div>

      {c.objeto && (
        <div className="fx-fiche-lead">
          <p className="fx-fiche-lead-main">{c.objeto}</p>
        </div>
      )}

      <FicheKpis
        items={[
          { label: t("br.recife.contrato.valor"), value: fmtBrlCompact(c.valor ?? 0) },
          {
            label: t("br.recife.contrato.fornecedor"),
            value: c.is_org
              ? (c.fornecedor_cnpj
                  ? <Link href={`/br/city/recife/quem-recebe/${c.fornecedor_cnpj}`}>{c.fornecedor}</Link>
                  : c.fornecedor)
              : t("br.recife.ct.pessoa_fisica"),
          },
          { label: t("br.recife.contrato.situacao"), value: c.situacao ?? "—" },
        ]}
      />

      <section className="fx-fiche-section">
        <div className="fx-fiche-h">{t("br.recife.contrato.detalhes")}</div>
        <table className="fx-fiche-table">
          <tbody>
            <tr><td>{t("br.recife.contrato.orgao")}</td><td>{c.orgao ?? "—"}</td></tr>
            <tr><td>{t("br.recife.contrato.modalidade")}</td><td>{c.modalidade ?? "—"}</td></tr>
            <tr><td>{t("br.recife.contrato.vigencia")}</td><td>{fmtDate(c.vigencia_inicio)} — {fmtDate(c.vigencia_fim)}</td></tr>
            {c.is_org && c.fornecedor_cnpj && (
              <tr><td>CNPJ</td><td className="mono">{fmtCnpj(c.fornecedor_cnpj)}</td></tr>
            )}
          </tbody>
        </table>
      </section>

      <footer className="fx-fiche-sources">
        <p className="fx-footer-sources-meta">
          {t("br.recife.contrato.source")}{" "}
          {source.source_url && (
            <a href={source.source_url} target="_blank" rel="noopener noreferrer">{t("br.recife.source")} ↗</a>
          )}
        </p>
      </footer>
    </div>
  );
}
