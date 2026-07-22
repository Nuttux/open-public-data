"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { useT } from "@/lib/localeContext";
import { normSearch, expandQuery, matchExpanded } from "@/lib/search-synonyms";
import type { RecebedorSlim, TemaSlice } from "@/lib/br/recife-data";
import { fmtBrlCompact, fmtCnpj, fill } from "@/lib/br/format";

type SearchItem = {
  cnpj: string; nome: string; total_pago: number;
  is_subvencao: boolean; tema: string | null; orgao: string | null;
};

const href = (cnpj: string) => `/br/city/recife/quem-recebe/${cnpj}`;
const PAGE = 48;
type Sort = "pago-desc" | "pago-asc" | "nome";

export default function RecifeQuemRecebeExplorer({
  top, temas, concentracao,
}: {
  top: RecebedorSlim[];
  temas: TemaSlice[];
  concentracao: number;
}) {
  const t = useT();
  const sp = useSearchParams();
  const themeParam = sp.get("theme");
  const [query, setQuery] = useState("");
  const [tema, setTema] = useState<string>(themeParam ?? "");
  const [minMi, setMinMi] = useState<string>("");
  const [maxMi, setMaxMi] = useState<string>("");
  const [sort, setSort] = useState<Sort>("pago-desc");
  const [visible, setVisible] = useState(PAGE);
  const [index, setIndex] = useState<SearchItem[] | null>(null);

  useEffect(() => { if (themeParam) setTema(themeParam); }, [themeParam]);

  const minR = minMi ? parseFloat(minMi.replace(",", ".")) * 1e6 : null;
  const maxR = maxMi ? parseFloat(maxMi.replace(",", ".")) * 1e6 : null;
  const hasFilter = query.trim().length >= 2 || tema !== "" || minR != null || maxR != null;

  useEffect(() => {
    if (hasFilter && index === null) {
      fetch("/data/br/recife/quem_recebe_search.json")
        .then((r) => r.json())
        .then((j) => setIndex(j.items as SearchItem[]))
        .catch(() => setIndex([]));
    }
  }, [hasFilter, index]);

  useEffect(() => { setVisible(PAGE); }, [query, tema, minMi, maxMi, sort]);

  const results = useMemo(() => {
    if (!hasFilter || !index) return null;
    const q = query.trim();
    const exp = q.length >= 2 ? expandQuery(q) : null;
    const digits = q.replace(/\D/g, "");
    const out = index.filter((r) => {
      if (tema && (r.tema ?? "Outros") !== tema) return false;
      if (minR != null && r.total_pago < minR) return false;
      if (maxR != null && r.total_pago > maxR) return false;
      if (!exp) return true;
      if (digits.length >= 3 && r.cnpj.includes(digits)) return true;
      return matchExpanded(normSearch(r.nome ?? ""), exp).match;
    });
    out.sort((a, b) =>
      sort === "nome" ? a.nome.localeCompare(b.nome, "pt-BR")
        : sort === "pago-asc" ? a.total_pago - b.total_pago
          : b.total_pago - a.total_pago);
    return out;
  }, [hasFilter, index, query, tema, minR, maxR, sort]);

  const refMax = Math.max(...top.map((r) => r.total_pago), 1);
  const reset = () => { setQuery(""); setTema(""); setMinMi(""); setMaxMi(""); };

  return (
    <section className="fx-section" id="sec-recebedores">
      <div className="fx-wrap">
        {/* top ranked list */}
        <div className="fx-top-list">
          <div className="fx-top-head">
            <span>{t("br.recife.qr.top_h")}</span>
            <span>{t("br.recife.qr.stat_pago")}</span>
          </div>
          {top.slice(0, 15).map((r, i) => (
            <Link key={r.cnpj} href={href(r.cnpj)} scroll={false} className="fx-top-row">
              <span className="r">{String(i + 1).padStart(2, "0")}</span>
              <span className="name">{r.nome}</span>
              <span className="bar" style={{ position: "relative", height: 8, background: "var(--rule)" }}>
                <span className="fill" style={{ width: `${(r.total_pago / refMax) * 100}%`, background: r.is_subvencao ? "#d98324" : "var(--ink)" }} />
              </span>
              <span className="v tnum">{fmtBrlCompact(r.total_pago)}</span>
              <span className="theme">{r.tema ?? "—"}</span>
              <span className="arrow" aria-hidden="true">→</span>
            </Link>
          ))}
        </div>
        <p style={{ fontFamily: "var(--f-mono)", fontSize: 11, color: "var(--muted)", letterSpacing: ".04em", marginTop: 20 }}>
          {fill(t("br.recife.qr.top_footer"), { pct: Math.round(concentracao * 100) })}
        </p>

        {/* filtered search */}
        <div className="fx-search-wrap" style={{ marginTop: 40 }}>
          <div className="fx-search-label">{t("br.recife.qr.search_h")}</div>
          <div className="fx-search-inner">
            <div className="fx-search-input-wrap">
              <input
                className="fx-search-input"
                type="search"
                placeholder={t("br.recife.qr.search_ph")}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
              {query && <button type="button" className="fx-search-clear" onClick={() => setQuery("")} aria-label="×">×</button>}
            </div>
            <div className="fx-search-filters">
              <label className="fx-search-filter-label">
                {t("br.recife.qr.temas_h")}
                <select value={tema} onChange={(e) => setTema(e.target.value)}>
                  <option value="">{t("br.recife.qr.tema_all")}</option>
                  {temas.map((tm) => (<option key={tm.tema} value={tm.tema}>{tm.tema}</option>))}
                </select>
              </label>
              <label className="fx-search-filter-label">
                {t("br.recife.qr.faixa")}
                <span className="fx-search-range">
                  <input type="number" inputMode="decimal" placeholder={t("br.recife.qr.min")} value={minMi} onChange={(e) => setMinMi(e.target.value)} aria-label={t("br.recife.qr.min")} />
                  <span aria-hidden="true">—</span>
                  <input type="number" inputMode="decimal" placeholder={t("br.recife.qr.max")} value={maxMi} onChange={(e) => setMaxMi(e.target.value)} aria-label={t("br.recife.qr.max")} />
                  <span style={{ fontFamily: "var(--f-mono)", fontSize: 11, color: "var(--muted)" }}>mi R$</span>
                </span>
              </label>
              <label className="fx-search-filter-label">
                {t("br.recife.qr.ordenar")}
                <select value={sort} onChange={(e) => setSort(e.target.value as Sort)}>
                  <option value="pago-desc">{t("br.recife.qr.sort_pago_desc")}</option>
                  <option value="pago-asc">{t("br.recife.qr.sort_pago_asc")}</option>
                  <option value="nome">{t("br.recife.qr.sort_nome")}</option>
                </select>
              </label>
              {hasFilter && <button type="button" className="fx-search-clear" onClick={reset}>{t("br.recife.qr.reset")}</button>}
            </div>
          </div>
          <p className="fx-search-meta">{t("br.recife.qr.privacy")}</p>

          {results && (
            <>
              <p className="fx-search-meta">{fill(t("br.recife.qr.results"), { n: results.length })}</p>
              {results.length === 0 ? (
                <p className="fx-search-meta">{t("br.recife.qr.no_results")}</p>
              ) : (
                <>
                  <div className="fx-results-grid">
                    {results.slice(0, visible).map((r) => (
                      <Link key={r.cnpj} href={href(r.cnpj)} scroll={false} className="fx-result-card">
                        <div className="fx-result-card-top">
                          <span className="fx-result-card-type">{r.tema ?? "—"}</span>
                          {r.is_subvencao && <span className="fx-sm-tag">{t("br.recife.qr.badge_subv")}</span>}
                        </div>
                        <div className="fx-result-card-cta">{r.nome}</div>
                        <div className="fx-result-card-meta">{fmtCnpj(r.cnpj)}{r.orgao ? ` · ${r.orgao}` : ""}</div>
                        <div className="fx-result-card-amount tnum">{fmtBrlCompact(r.total_pago)}</div>
                      </Link>
                    ))}
                  </div>
                  {visible < results.length && (
                    <button type="button" className="fx-results-more" onClick={() => setVisible((v) => v + PAGE)}>
                      {fill(t("br.recife.qr.ver_mais"), { n: Math.min(PAGE, results.length - visible) })}
                    </button>
                  )}
                </>
              )}
            </>
          )}
        </div>
      </div>
    </section>
  );
}
