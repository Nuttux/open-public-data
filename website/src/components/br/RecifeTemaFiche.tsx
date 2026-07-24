"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useT, useLocale } from "@/lib/localeContext";
import { FicheYearBars } from "@/components/fiche";
import type { FicheYearPoint } from "@/components/fiche";
import FicheKpis from "@/components/fusion/FicheKpis";
import type { TemaDetail, SourceBlock } from "@/lib/br/recife-data";
import { fmtBrlCompact, fmtInt, titleCasePt, fill, mesRange } from "@/lib/br/format";

/** Labelled money bars for the department (órgão) breakdown, with per-row link. */
function OrgaoBars({ items }: { items: TemaDetail["top_orgaos"] }) {
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

export default function RecifeTemaFiche({ tm, temaMethod, source }: { tm: TemaDetail; temaMethod?: string; source: SourceBlock }) {
  const t = useT();
  const { locale } = useLocale();
  const router = useRouter();

  const pj = tm.partial_year;
  const years: FicheYearPoint[] = tm.by_year.map((y) => ({ year: y.ano, value: y.pago, provisional: !!pj && pj.ano === y.ano }));
  const provisionalNote = pj ? fill(t("br.recife.partial_note"), { ano: pj.ano, mes: mesRange(pj.ate_mes, locale) }) : undefined;
  const anos = tm.by_year.map((y) => y.ano);
  const first = anos.length ? Math.min(...anos) : undefined;
  const last = anos.length ? Math.max(...anos) : undefined;

  return (
    <div>
      <div className="fx-fiche-lead">
        <p className="fx-fiche-lead-sub" style={{ margin: 0 }}>{t("br.recife.tema.provenance")}</p>
      </div>

      <FicheKpis
        items={[
          { label: t("br.recife.tema.total_pago"), value: fmtBrlCompact(tm.total_pago) },
          { label: t("br.recife.tema.n_orgs"), value: fmtInt(tm.n_organizacoes) },
          ...(tm.subvencao_total > 0 ? [{ label: t("br.recife.qr.badge_subv"), value: fmtBrlCompact(tm.subvencao_total) }] : []),
          { label: t("br.recife.rec.periodo"), value: first && last && first !== last ? `${first}–${last}` : (last ?? "—") },
        ]}
      />

      {years.length > 0 && (
        <section className="fx-fiche-section">
          <div className="fx-fiche-h">{t("br.recife.tema.by_year")}</div>
          <FicheYearBars points={years} format={fmtBrlCompact} provisionalNote={provisionalNote} />
        </section>
      )}

      {tm.top_orgaos.length > 0 && (
        <section className="fx-fiche-section">
          <div className="fx-fiche-h">{t("br.recife.tema.by_orgao")}</div>
          <OrgaoBars items={tm.top_orgaos} />
        </section>
      )}

      {tm.top_recebedores.length > 0 && (
        <section className="fx-fiche-section">
          <div className="fx-fiche-h">{t("br.recife.tema.top_recebedores")}</div>
          <table className="fx-fiche-table">
            <tbody>
              {tm.top_recebedores.map((r) => (
                <tr key={r.cnpj} className="fx-row-link" onClick={() => router.push(`/br/city/recife/quem-recebe/${r.cnpj}`)}>
                  <td>
                    <Link href={`/br/city/recife/quem-recebe/${r.cnpj}`} onClick={(e) => e.stopPropagation()}>{titleCasePt(r.nome)}</Link>
                    {r.is_subvencao && <span className="fx-sm-tag" style={{ marginLeft: 8 }}>{t("br.recife.qr.badge_subv")}</span>}
                  </td>
                  <td className="num mono">{fmtBrlCompact(r.total_pago)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      <p style={{ margin: "18px 0 0", fontSize: 14 }}>
        <Link href={`/br/city/recife/quem-recebe?theme=${encodeURIComponent(tm.tema)}#sec-recebedores`} style={{ fontWeight: 600 }}>
          {fill(t("br.recife.tema.ver_todas"), { n: fmtInt(tm.n_organizacoes) })} →
        </Link>
      </p>

      <footer className="fx-fiche-sources">
        <p className="fx-footer-sources-meta">
          {t("br.recife.rec.source")}{" "}
          {source.source_url && (
            <a href={source.source_url} target="_blank" rel="noopener noreferrer">{t("br.recife.source")} ↗</a>
          )}
          {temaMethod && <><br />{t("br.recife.tema.method_label")}: {temaMethod}</>}
        </p>
      </footer>
    </div>
  );
}
