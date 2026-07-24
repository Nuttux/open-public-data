"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useT, useLocale } from "@/lib/localeContext";
import { FicheYearBars } from "@/components/fiche";
import type { FicheYearPoint } from "@/components/fiche";
import FicheKpis from "@/components/fusion/FicheKpis";
import type { ModalidadeDetail, SourceBlock } from "@/lib/br/recife-data";
import { fmtBrlCompact, fmtInt, hasValor, titleCasePt, modalidadeLabel, fill } from "@/lib/br/format";

/** Competition posture per modality → the gloss key + accent tone, mirroring
 *  the contract fiche's classifyModalidade. ocre = no competitive process. */
function classify(m: string): { glossKey: string; tone: "ocre" | "ink" | "muted" } {
  switch ((m || "").toUpperCase()) {
    case "LICITAÇÃO": return { glossKey: "br.recife.contrato.mod_gloss.licitacao", tone: "ink" };
    case "SARP": return { glossKey: "br.recife.contrato.mod_gloss.sarp", tone: "muted" };
    case "INEXIGIBILIDADE": return { glossKey: "br.recife.contrato.mod_gloss.inexig", tone: "ocre" };
    case "DISPENSA": return { glossKey: "br.recife.contrato.mod_gloss.dispensa", tone: "ocre" };
    case "COMPRA DIRETA": return { glossKey: "br.recife.contrato.mod_gloss.compra", tone: "ocre" };
    default: return { glossKey: "", tone: "muted" };
  }
}

/** Labelled money bars with optional per-row link (órgão breakdown). */
function OrgaoBars({ items }: { items: ModalidadeDetail["top_orgaos"] }) {
  const t = useT();
  const maxV = Math.max(...items.map((o) => o.valor), 1);
  return (
    <>
      {items.map((o, i) => {
        const label = (
          <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            <span aria-hidden="true" style={{ position: "relative", display: "inline-block", width: `${(o.valor / maxV) * 100}%`, height: 4, background: o.orgao ? "var(--ink)" : "var(--muted)", verticalAlign: "middle", marginRight: 8, maxWidth: "35%" }} />
            {o.orgao ? titleCasePt(o.orgao) : t("br.recife.rec.outros")}
          </span>
        );
        const val = <span style={{ textAlign: "right", fontFamily: "var(--f-disp)", fontWeight: 700, fontSize: 13 }}>{fmtBrlCompact(o.valor)}</span>;
        const style = { display: "grid", gridTemplateColumns: "1fr 96px", gap: 14, padding: "6px 0", borderBottom: "1px solid var(--rule)", fontFamily: "var(--f-ui)", fontSize: 13 } as const;
        return o.slug ? (
          <Link key={o.orgao} href={`/br/city/recife/orgao/${o.slug}`} className="fx-row-link" style={{ ...style, color: "inherit", textDecoration: "none" }}>{label}{val}</Link>
        ) : (
          <div key={o.orgao ?? `outros-${i}`} style={style}>{label}{val}</div>
        );
      })}
    </>
  );
}

export default function RecifeModalidadeFiche({ m, source }: { m: ModalidadeDetail; source: SourceBlock }) {
  const t = useT();
  const { locale } = useLocale();
  const router = useRouter();
  const { glossKey, tone } = classify(m.modalidade);
  const toneColor = tone === "ocre" ? "var(--ocre)" : tone === "ink" ? "var(--ink)" : "var(--ink-2)";

  // Drop the partial current year from the bars (consistency with other charts).
  const maxYear = Math.max(...m.by_year.map((y) => y.ano), 0);
  const years: FicheYearPoint[] = m.by_year.filter((y) => y.ano < maxYear).map((y) => ({ year: y.ano, value: y.valor }));
  const anos = m.by_year.map((y) => y.ano);
  const first = anos.length ? Math.min(...anos) : undefined;
  const last = anos.length ? Math.max(...anos) : undefined;

  return (
    <div>
      {glossKey && (
        <div className="fx-fiche-lead">
          <p className="fx-fiche-lead-main" style={{ color: toneColor }}>{t(glossKey)}</p>
        </div>
      )}

      <FicheKpis
        items={[
          { label: t("br.recife.mod.valor_total"), value: fmtBrlCompact(m.valor_total) },
          { label: t("br.recife.mod.n_contratos"), value: fmtInt(m.n_contratos) },
          { label: t("br.recife.mod.n_ativos"), value: fmtInt(m.n_ativos) },
          { label: t("br.recife.rec.periodo"), value: first && last && first !== last ? `${first}–${last}` : (last ?? "—") },
        ]}
      />

      {years.length > 0 && (
        <section className="fx-fiche-section">
          <div className="fx-fiche-h">{t("br.recife.mod.by_year")}</div>
          <FicheYearBars points={years} format={fmtBrlCompact} />
        </section>
      )}

      {m.top_orgaos.length > 0 && (
        <section className="fx-fiche-section">
          <div className="fx-fiche-h">{t("br.recife.mod.by_orgao")}</div>
          <OrgaoBars items={m.top_orgaos} />
        </section>
      )}

      {m.top_suppliers.length > 0 && (
        <section className="fx-fiche-section">
          <div className="fx-fiche-h">{t("br.recife.mod.top_suppliers")}</div>
          <table className="fx-fiche-table">
            <tbody>
              {m.top_suppliers.map((s) => (
                <tr key={s.cnpj} className="fx-row-link" onClick={() => router.push(`/br/city/recife/quem-recebe/${s.cnpj}`)}>
                  <td>
                    <Link href={`/br/city/recife/quem-recebe/${s.cnpj}`} onClick={(e) => e.stopPropagation()}>{titleCasePt(s.nome)}</Link>
                    <div className="fx-fiche-sub">{fill(t("br.recife.mod.n_contratos_sup"), { n: fmtInt(s.n) })}</div>
                  </td>
                  <td className="num mono">{fmtBrlCompact(s.valor)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {m.top_contracts.length > 0 && (
        <section className="fx-fiche-section">
          <div className="fx-fiche-h">{t("br.recife.mod.top_contracts")}</div>
          <table className="fx-fiche-table">
            <tbody>
              {m.top_contracts.map((c) => (
                <tr key={c.contrato_id} className="fx-row-link" onClick={() => router.push(`/br/city/recife/contratos/${c.contrato_id}`)}>
                  <td>
                    <Link href={`/br/city/recife/contratos/${c.contrato_id}`} onClick={(e) => e.stopPropagation()}>{c.numero}</Link>
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

      <p style={{ margin: "18px 0 0", fontSize: 14 }}>
        <Link href={`/br/city/recife/contratos?mod=${encodeURIComponent(m.modalidade)}#sec-contratos`} style={{ fontWeight: 600 }}>
          {fill(t("br.recife.mod.ver_todos"), { n: fmtInt(m.n_contratos), mod: modalidadeLabel(m.modalidade, locale) })} →
        </Link>
      </p>

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
