"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useT, useLocale } from "@/lib/localeContext";
import { normSearch, expandQuery, matchExpanded } from "@/lib/search-synonyms";
import type { ContratoItem } from "@/lib/br/recife-data";
import { fmtBrlCompact, fill, hasValor, titleCasePt, modalidadeLabel } from "@/lib/br/format";

const href = (id: string) => `/br/city/recife/contratos/${id}`;
const INITIAL = 12;
const STEP = 24;
type Sort = "valor-desc" | "valor-asc" | "recente";

export default function RecifeContratosExplorer({
  seed, modalidades, orgaos, anos, nTotal,
}: {
  seed: ContratoItem[];
  modalidades: string[];
  orgaos: string[];
  anos: number[];
  nTotal: number;
}) {
  const t = useT();
  const { locale } = useLocale();
  const params = useSearchParams();
  // Deep-links: ?mod=LICITAÇÃO from the modality bars; ?orgao=<name> from a
  // contract fiche's contracting agency; both pre-select the matching filter.
  const modParam = params.get("mod") ?? "";
  const orgaoParam = params.get("orgao") ?? "";
  const [query, setQuery] = useState("");
  const [mod, setMod] = useState(modParam && modalidades.includes(modParam) ? modParam : "");
  const [orgao, setOrgao] = useState(orgaoParam && orgaos.includes(orgaoParam) ? orgaoParam : "");
  const [ano, setAno] = useState("");
  const [ativo, setAtivo] = useState(false);
  const [sort, setSort] = useState<Sort>("valor-desc");
  const [visible, setVisible] = useState(INITIAL);
  const [full, setFull] = useState<ContratoItem[] | null>(null);
  const searchRef = useRef<HTMLDivElement>(null);

  const hasFilter = query.trim().length >= 2 || mod !== "" || orgao !== "" || ano !== "" || ativo;

  // Sync filters when arriving via a deep-link (modality bar → ?mod=, contract
  // fiche agency → ?orgao=) AND scroll to the results — useState's initializer
  // only runs on the first mount, so a client-side nav that changes the param
  // needs this effect both to re-apply the filter and to bring the (far-below)
  // list into view.
  useEffect(() => {
    const okMod = modParam && modalidades.includes(modParam);
    const okOrgao = orgaoParam && orgaos.includes(orgaoParam);
    if (!okMod && !okOrgao) return;
    if (okMod) setMod(modParam);
    if (okOrgao) setOrgao(orgaoParam);
    searchRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [modParam, orgaoParam, modalidades, orgaos]);

  useEffect(() => {
    if (hasFilter && full === null) {
      fetch("/data/br/recife/contratos.json")
        .then((r) => r.json())
        .then((j) => setFull(j.contratos as ContratoItem[]))
        .catch(() => setFull(seed));
    }
  }, [hasFilter, full, seed]);

  useEffect(() => { setVisible(INITIAL); }, [query, mod, orgao, ano, ativo, sort]);

  const results = useMemo(() => {
    const src = full ?? seed;
    const q = query.trim();
    const exp = q.length >= 2 ? expandQuery(q) : null;
    const anoNum = ano ? Number(ano) : null;
    const out = src.filter((c) => {
      if (mod && c.modalidade !== mod) return false;
      if (orgao && c.orgao !== orgao) return false;
      if (anoNum && c.ano !== anoNum) return false;
      if (ativo && !c.is_ativo) return false;
      if (!exp) return true;
      const hay = normSearch(`${c.objeto ?? ""} ${c.fornecedor ?? ""} ${c.orgao ?? ""}`);
      return matchExpanded(hay, exp).match;
    });
    out.sort((a, b) =>
      sort === "recente" ? (b.ano ?? 0) - (a.ano ?? 0)
        : sort === "valor-asc" ? (a.valor ?? 0) - (b.valor ?? 0)
          : (b.valor ?? 0) - (a.valor ?? 0));
    return out;
  }, [full, seed, query, mod, orgao, ano, ativo, sort]);

  const reset = () => { setQuery(""); setMod(""); setOrgao(""); setAno(""); setAtivo(false); };

  return (
    <section className="fx-section" id="sec-contratos">
      <div className="fx-wrap">
        <div ref={searchRef} className="fx-search-wrap" style={{ scrollMarginTop: 80 }}>
          <div className="fx-search-label">{t("br.recife.ct.list_h")}</div>
          <div className="fx-search-inner">
            <div className="fx-search-input-wrap">
              <input className="fx-search-input" type="search" placeholder={t("br.recife.ct.search_ph")}
                value={query} onChange={(e) => setQuery(e.target.value)} />
              {query && <button type="button" className="fx-search-clear" onClick={() => setQuery("")} aria-label="×">×</button>}
            </div>
            <div className="fx-search-filters">
              <label className="fx-search-filter-label">
                {t("br.recife.ct.col_modalidade")}
                <select value={mod} onChange={(e) => setMod(e.target.value)}>
                  <option value="">{t("br.recife.ct.mod_all")}</option>
                  {modalidades.map((m) => (<option key={m} value={m}>{modalidadeLabel(m, locale)}</option>))}
                </select>
              </label>
              <label className="fx-search-filter-label">
                {t("br.recife.ct.col_orgao")}
                <select value={orgao} onChange={(e) => setOrgao(e.target.value)}>
                  <option value="">{t("br.recife.ct.orgao_all")}</option>
                  {orgaos.map((o) => (<option key={o} value={o}>{titleCasePt(o)}</option>))}
                </select>
              </label>
              <label className="fx-search-filter-label">
                {t("br.recife.ct.ano")}
                <select value={ano} onChange={(e) => setAno(e.target.value)}>
                  <option value="">{t("br.recife.ct.ano_all")}</option>
                  {anos.map((a) => (<option key={a} value={String(a)}>{a}</option>))}
                </select>
              </label>
              <label className="fx-search-filter-label" style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                <input type="checkbox" checked={ativo} onChange={(e) => setAtivo(e.target.checked)} />
                {t("br.recife.ct.only_ativos")}
              </label>
              <label className="fx-search-filter-label">
                {t("br.recife.qr.ordenar")}
                <select value={sort} onChange={(e) => setSort(e.target.value as Sort)}>
                  <option value="valor-desc">{t("br.recife.qr.sort_pago_desc")}</option>
                  <option value="valor-asc">{t("br.recife.qr.sort_pago_asc")}</option>
                  <option value="recente">{t("br.recife.ct.sort_recente")}</option>
                </select>
              </label>
              {hasFilter && <button type="button" className="fx-search-clear" onClick={reset}>{t("br.recife.qr.reset")}</button>}
            </div>
          </div>
          <p className="fx-search-meta">{fill(t("br.recife.ct.results"), { n: hasFilter ? results.length : nTotal })}</p>

          <div className="fx-results-grid">
            {results.slice(0, visible).map((c) => (
              <Link key={c.contrato_id} href={href(c.contrato_id)} scroll={false} className="fx-result-card">
                <div className="fx-result-card-top">
                  <span className="fx-result-card-type">{modalidadeLabel(c.modalidade, locale)}</span>
                  {c.is_ativo && <span className="fx-sm-tag">{t("br.recife.ct.badge_ativo")}</span>}
                </div>
                <div className="fx-result-card-cta">{c.objeto ? titleCasePt(c.objeto) : c.numero}</div>
                <div className="fx-result-card-meta">
                  {c.is_org ? titleCasePt(c.fornecedor) : t("br.recife.ct.pessoa_fisica")}{c.orgao ? ` · ${c.orgao}` : ""}
                </div>
                <div className="fx-result-card-amount tnum">
                  {hasValor(c.valor) ? fmtBrlCompact(c.valor) : <span style={{ color: "var(--muted)", fontStyle: "italic", fontWeight: 400 }}>{t("br.recife.contrato.sem_valor")}</span>}
                </div>
              </Link>
            ))}
          </div>
          {visible < results.length && (
            <button type="button" className="fx-results-more" onClick={() => setVisible((v) => v + STEP)}>
              {fill(t("br.recife.qr.ver_mais"), { n: Math.min(STEP, results.length - visible) })}
            </button>
          )}
        </div>
      </div>
    </section>
  );
}
