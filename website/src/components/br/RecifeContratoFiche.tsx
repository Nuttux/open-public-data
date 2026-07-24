"use client";

import Link from "next/link";
import { useT, useLocale } from "@/lib/localeContext";
import FicheKpis from "@/components/fusion/FicheKpis";
import Tip from "@/components/fusion/Tip";
import type { ContratoItem, SourceBlock } from "@/lib/br/recife-data";
import { fmtBrlCompact, fmtDate, fmtCnpj, hasValor, titleCasePt, modalidadeLabel, slugModalidade } from "@/lib/br/format";

/**
 * Contract fiche — thin br-municipal ADAPTER composing the shared fiche
 * primitives (FicheKpis + fx-fiche-lead + fx-fiche-table + source footer),
 * mirroring fusion/ContratFiche. Adds two Paris-parity blocks that Recife's
 * open data genuinely supports:
 *   - a "Vida do contrato" timeline (vigência início → hoje → fim), and
 *   - a "Concorrência" section built on the *modalidade* (Brazil's real
 *     competition signal: LICITAÇÃO vs INEXIGIBILIDADE/DISPENSA), with an
 *     honest note that per-contract bid counts are not published.
 * CPF suppliers masked. No bespoke CSS.
 */

/** Classify the Brazilian contracting modality into a competition posture.
 *  `tone` drives the accent colour: ocre = no competitive process (the
 *  transparency-relevant case), ink = competitive, muted = neutral/derived. */
function classifyModalidade(m: string): {
  labelKey: string;
  descKey: string;
  glossKey: string;
  tone: "ocre" | "ink" | "muted";
} | null {
  switch ((m || "").toUpperCase()) {
    case "LICITAÇÃO":
      return { labelKey: "br.recife.contrato.conc.com", descKey: "br.recife.contrato.conc.com_d", glossKey: "br.recife.contrato.mod_gloss.licitacao", tone: "ink" };
    case "SARP":
      return { labelKey: "br.recife.contrato.conc.registro", descKey: "br.recife.contrato.conc.registro_d", glossKey: "br.recife.contrato.mod_gloss.sarp", tone: "muted" };
    case "INEXIGIBILIDADE":
      return { labelKey: "br.recife.contrato.conc.inexig", descKey: "br.recife.contrato.conc.direta_d", glossKey: "br.recife.contrato.mod_gloss.inexig", tone: "ocre" };
    case "DISPENSA":
      return { labelKey: "br.recife.contrato.conc.dispensa", descKey: "br.recife.contrato.conc.direta_d", glossKey: "br.recife.contrato.mod_gloss.dispensa", tone: "ocre" };
    case "COMPRA DIRETA":
      return { labelKey: "br.recife.contrato.conc.compra", descKey: "br.recife.contrato.conc.direta_d", glossKey: "br.recife.contrato.mod_gloss.compra", tone: "ocre" };
    default:
      return null;
  }
}

export default function RecifeContratoFiche({
  c,
  source,
}: {
  c: ContratoItem;
  source: SourceBlock;
}) {
  const t = useT();
  const { locale } = useLocale();

  // Frise « vida do contrato » : vigência início → hoje → fim. On a les deux
  // dates directement (≠ Paris qui reconstruit fim depuis notif+durée).
  // Précision au JOUR pour éviter tout mismatch SSR/hydratation sur la barre.
  const timeline = (() => {
    if (!c.vigencia_inicio || !c.vigencia_fim) return null;
    const startMs = Date.parse(c.vigencia_inicio);
    const endMs = Date.parse(c.vigencia_fim);
    if (Number.isNaN(startMs) || Number.isNaN(endMs) || endMs <= startMs) return null;
    const DAY = 86400000;
    const nowMs = Math.floor(Date.now() / DAY) * DAY;
    const total = endMs - startMs;
    const pct = Math.round(Math.min(Math.max(((nowMs - startMs) / total) * 100, 0), 100) * 100) / 100;
    return { pct, enCurso: nowMs < endMs };
  })();

  const conc = classifyModalidade(c.modalidade);
  const toneColor =
    conc?.tone === "ocre" ? "var(--ocre)" : conc?.tone === "ink" ? "var(--ink)" : "var(--ink-2)";

  // Soft data-quality flag: a single municipal contract above R$1 bi is
  // extraordinary (Recife's whole active-contract portfolio ≈ R$15 bi, and the
  // 2nd-largest single contract is R$0.73 bi). Values this size are almost
  // always a source artifact — a decimal shift or a registro-de-preços ceiling.
  // We keep the value visible (per user) but flag it as "to verify".
  const VALOR_CEIL = 1_000_000_000;
  const valorSuspeito = hasValor(c.valor) && (c.valor as number) > VALOR_CEIL;

  return (
    <div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 14 }}>
        {c.modalidade && c.modalidade !== "—" && (
          <Link href={`/br/city/recife/modalidade/${slugModalidade(c.modalidade)}`} className="fx-sm-tag" style={{ textDecoration: "none" }}>{modalidadeLabel(c.modalidade, locale)}</Link>
        )}
        {c.is_ativo && <span className="fx-sm-tag">{t("br.recife.ct.badge_ativo")}</span>}
      </div>

      {c.objeto && (
        <div className="fx-fiche-lead">
          <p className="fx-fiche-lead-main">{titleCasePt(c.objeto)}</p>
        </div>
      )}

      {valorSuspeito && (
        <div
          style={{
            display: "flex",
            gap: 10,
            alignItems: "flex-start",
            margin: "0 0 4px",
            padding: "10px 14px",
            border: "1px solid var(--ocre)",
            background: "rgba(166, 118, 56, 0.06)",
            fontSize: 13,
            lineHeight: 1.5,
            color: "var(--ink-2)",
          }}
        >
          <span aria-hidden="true" style={{ color: "var(--ocre)", fontWeight: 700 }}>⚠</span>
          <span>{t("br.recife.contrato.valor_alerta")}</span>
        </div>
      )}

      <FicheKpis
        items={[
          { label: t("br.recife.contrato.valor"), value: hasValor(c.valor) ? fmtBrlCompact(c.valor) : t("br.recife.contrato.sem_valor") },
          {
            label: t("br.recife.contrato.fornecedor"),
            value: c.is_org
              ? (c.fornecedor_cnpj
                  ? <Link href={`/br/city/recife/quem-recebe/${c.fornecedor_cnpj}`}>{titleCasePt(c.fornecedor)}</Link>
                  : titleCasePt(c.fornecedor))
              : t("br.recife.ct.pessoa_fisica"),
          },
          { label: t("br.recife.contrato.situacao"), value: c.situacao ?? "—" },
        ]}
      />

      {timeline && (
        <div style={{ margin: "16px 0 0" }}>
          <div style={{ display: "flex", justifyContent: "space-between", fontFamily: "var(--f-mono)", fontSize: 10.5, letterSpacing: ".06em", textTransform: "uppercase", color: "var(--muted)", marginBottom: 7 }}>
            <span>{t("br.recife.contrato.tl.inicio")} {fmtDate(c.vigencia_inicio)}</span>
            <span>~ {fmtDate(c.vigencia_fim)}</span>
          </div>
          <div style={{ position: "relative", height: 4, background: "var(--rule)", borderRadius: 2 }} aria-hidden="true">
            <div
              style={{
                position: "absolute",
                top: 0,
                bottom: 0,
                left: 0,
                width: `${timeline.pct}%`,
                background: timeline.enCurso ? "var(--bleu)" : "var(--ink-2)",
                borderRadius: 2,
              }}
            />
            {timeline.enCurso && (
              <span
                style={{
                  position: "absolute",
                  left: `${timeline.pct}%`,
                  top: "50%",
                  transform: "translate(-50%, -50%)",
                  width: 9,
                  height: 9,
                  borderRadius: "50%",
                  background: "var(--bleu)",
                  boxShadow: "0 0 0 2px var(--bg)",
                }}
              />
            )}
          </div>
          <div style={{ marginTop: 7, fontFamily: "var(--f-mono)", fontSize: 10.5, letterSpacing: ".06em", textTransform: "uppercase" }}>
            <span style={{ color: timeline.enCurso ? "var(--bleu)" : "var(--muted)", fontWeight: 600 }}>
              {timeline.enCurso ? t("br.recife.contrato.tl.vigente") : t("br.recife.contrato.tl.encerrado")}
            </span>
          </div>
        </div>
      )}

      {/* Concorrência — o que o Recife publica é a MODALIDADE, não o número de
       * propostas por licitação. A modalidade é o sinal real de concorrência:
       * LICITAÇÃO (com disputa) vs INEXIGIBILIDADE/DISPENSA (contratação
       * direta). Espelha a seção « Concurrence » de Paris: diz o que os dados
       * abertos trazem e o que não trazem, em vez de deixar procurar um dado
       * que não existe. */}
      <section className="fx-fiche-section">
        <div className="fx-fiche-h">{t("br.recife.contrato.conc.h")}</div>

        {conc ? (
          <div style={{ margin: "0 0 14px" }}>
            <div style={{ fontFamily: "var(--f-ui)", fontSize: 15, fontWeight: 600, color: toneColor }}>
              {c.modalidade && c.modalidade !== "—" ? (
                <Link href={`/br/city/recife/modalidade/${slugModalidade(c.modalidade)}`} style={{ color: "inherit", textDecorationColor: "var(--rule)" }}>
                  <Tip label={`${c.modalidade} — ${t(conc.glossKey)}`}>{t(conc.labelKey)}</Tip>
                </Link>
              ) : (
                <Tip label={`${c.modalidade} — ${t(conc.glossKey)}`}>{t(conc.labelKey)}</Tip>
              )}
            </div>
            <p style={{ margin: "6px 0 0", fontSize: 13, color: "var(--ink-2)", lineHeight: 1.5 }}>
              {t(conc.descKey)}
            </p>
          </div>
        ) : (
          <dl>
            <div className="fx-fiche-prop">
              <dt>{t("br.recife.contrato.modalidade")}</dt>
              <dd>{c.modalidade ?? "—"}</dd>
            </div>
          </dl>
        )}

        <p style={{ margin: "0", fontSize: 12, color: "var(--muted)", fontStyle: "italic", lineHeight: 1.5 }}>
          {t("br.recife.contrato.conc.note")}
        </p>
      </section>

      <section className="fx-fiche-section">
        <div className="fx-fiche-h">{t("br.recife.contrato.detalhes")}</div>
        <table className="fx-fiche-table">
          <tbody>
            <tr>
              <td>{t("br.recife.contrato.orgao")}</td>
              <td>
                {c.orgao_slug ? (
                  // Taxonomy bridged → the payments-anchored órgão fiche.
                  <Link href={`/br/city/recife/orgao/${c.orgao_slug}`}>{titleCasePt(c.orgao)}</Link>
                ) : c.orgao ? (
                  // No payments fiche for this contratante → all of the agency's
                  // contracts. Keeps every department name clickable.
                  <Link href={`/br/city/recife/contratos?orgao=${encodeURIComponent(c.orgao)}#sec-contratos`}>{titleCasePt(c.orgao)}</Link>
                ) : "—"}
              </td>
            </tr>
            <tr>
              <td>{t("br.recife.contrato.modalidade")}</td>
              <td>
                {c.modalidade && c.modalidade !== "—" ? (
                  <Link href={`/br/city/recife/modalidade/${slugModalidade(c.modalidade)}`}>
                    {modalidadeLabel(c.modalidade, locale)}
                  </Link>
                ) : "—"}
              </td>
            </tr>
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
