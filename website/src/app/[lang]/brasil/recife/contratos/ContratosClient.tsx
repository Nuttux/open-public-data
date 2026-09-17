"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "@/components/LocalizedLink";
import AnneesRail, { RAIL_MIN } from "@/components/fusion/AnneesRail";
import SectionHero from "@/components/fiche/SectionHero";
import ShareButton from "@/components/fiche/ShareButton";
import { Door, NextDoor } from "@/components/fiche/Doors";
import { V3Amt, V3Fold, V3Foot, V3Row, V3Section } from "@/components/fiche/v3";
import { useT, useLocale } from "@/lib/localeContext";
import { useTrack } from "@/lib/analyticsContext";
import { normSearch } from "@/lib/search-synonyms";
import type { ContratosData, ContratoItem } from "@/lib/br/recife-data";
import { fmtBrlCompact, fmtBrlCompactNum, brlMagnitude, fmtInt, fill, modalidadeLabel, slugModalidade, titleCasePt } from "@/lib/br/format";

/**
 * Contracts, on the section grammar (2026-09-17), the same page as Paris's
 * Marchés publics : the number (what the contracts in force today are worth)
 * and the rail of what was signed year by year ; the modalities as the
 * scene, each opening its drawer ; the largest contracts in rows, each
 * opening its page ; a search over the whole register ; Understand ; See
 * also ; the next section.
 */

const CITY = "/brasil/recife";
const BASE = `${CITY}/contratos`;
const ROWS = 8;
const ROWS_Q = 12;

export type RecifeCtDoors = {
  budget?: { total: number; year: number } | null;
  quem?: { total: number; n: number; y0: number; y1: number } | null;
  lugares?: { n: number; total: number } | null;
};

const hasValue = (c: ContratoItem) => c.valor != null && c.valor > 0 && !c.valor_suspeito;
const objetoText = (c: ContratoItem) => {
  const o = (c.objeto ?? "").trim();
  if (!o) return c.numero ?? c.contrato_id;
  const s = o.charAt(0).toUpperCase() + o.slice(1).toLowerCase();
  return s.length > 110 ? `${s.slice(0, 108).replace(/\s+\S*$/, "")}…` : s;
};

export default function ContratosClient({ d, series, doors }: {
  /** The register's headline, modalities and the largest contracts (the page ships a slice ; the search fetches the whole file on first use). */
  d: ContratosData;
  /** What was signed each year, for the contracts that carry a value and a year (computed on the server). */
  series: { year: number; amount: number }[];
  doors?: RecifeCtDoors;
}) {
  const t = useT();
  const { locale } = useLocale();
  const track = useTrack();
  const brl = (n: number) => ({ v: fmtBrlCompactNum(n), u: brlMagnitude(n) });
  const Amt = ({ n }: { n: number }) => <V3Amt {...brl(n)} />;
  const h = d.headline;
  const now = new Date().getFullYear();
  const total = brl(h.valor_ativo_total);

  const y0 = series[0]?.year ?? d.anos[d.anos.length - 1];
  const withValue = h.n_contratos - (d.cobertura?.n_sem_valor ?? 0) - (d.cobertura?.n_valor_suspeito ?? 0);
  const shareTitle = fill(t("br.recife.ct3.share_title"), { total: fmtBrlCompact(h.valor_ativo_total), n: fmtInt(h.n_ativos) });

  // The scene : the modalities, all years.
  const mods = d.modalidade_mix.filter((m) => m.valor > 0).slice().sort((a, b) => b.valor - a.valor);
  const modTotal = mods.reduce((s, m) => s + m.valor, 0);
  const modMax = mods[0]?.valor ?? 1;

  // The largest contracts of the register, and a search over all of them.
  const [query, setQuery] = useState("");
  const q = query.trim();
  const active = q.length >= 2;
  const qNorm = normSearch(q);
  const largest = d.contratos;
  // The whole register (7 900 contracts, a few MB) only comes when someone searches.
  const [all, setAll] = useState<ContratoItem[] | null>(null);
  useEffect(() => {
    if (!active || all) return;
    let cancelled = false;
    fetch("/data/br/recife/contratos.json")
      .then((r) => r.json())
      .then((f: ContratosData) => { if (!cancelled) setAll(f.contratos); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [active, all]);
  const pool = all ?? largest;
  const filtered = useMemo(
    () => (active ? pool.filter((c) => normSearch(`${c.objeto ?? ""} ${c.fornecedor ?? ""} ${c.orgao ?? ""} ${c.numero ?? ""}`).includes(qNorm)).sort((a, b) => (b.valor ?? 0) - (a.valor ?? 0)) : largest),
    [pool, largest, active, qNorm],
  );
  const cap = active ? ROWS_Q : ROWS;
  const shown = filtered.slice(0, cap);
  const rest = filtered.length - cap >= 2 ? filtered.slice(cap, cap + 40) : [];
  const shownAll = rest.length ? shown : filtered.slice(0, cap);
  const seeds = ["obras", "limpeza", "saúde"];
  const Row = (c: ContratoItem) => (
    <V3Row
      key={c.contrato_id}
      href={`${BASE}/${c.contrato_id}`}
      label={objetoText(c)}
      subText={[c.fornecedor ? titleCasePt(c.fornecedor) : null, c.orgao ? titleCasePt(c.orgao) : null, c.ano ?? null, c.is_ativo ? t("br.recife.ct.badge_ativo") : null].filter(Boolean).join(" · ")}
      amount={hasValue(c) ? <Amt n={c.valor as number} /> : <span className="fx-v3-amt tnum muted">—</span>}
      onClick={active ? () => track("search_result_click", { page: "contratos", entity_name: c.contrato_id }) : undefined}
    />
  );
  const rowsTitle = active ? fill(t("br.recife.ct3.h.rows_q"), { n: fmtInt(filtered.length), q }) : t("br.recife.ct3.h.rows");

  return (
    <main id="main-content" tabIndex={-1}>
      <div className="fx-sec fx-v3">
        <div className="fx-sec-kicker fx-page-kicker fx-page-kicker--links"><Link href={CITY}>Recife</Link> › {t("br.recife.ct.kicker")}</div>
        <div className="fx-sec-grid" data-layout="subventions">
          <div className="fx-sec-a-hero">
            <SectionHero
              title={t("br.recife.ct3.title")}
              value={total.v}
              unit={total.u}
              captionBefore={t("br.recife.ct3.cap_before")}
              captionAfter={fill(t("br.recife.ct3.cap_after"), { n: fmtInt(h.n_ativos) })}
              years={[now]}
              year={now}
              basePath={BASE}
              meta={fill(t("br.recife.ct3.meta"), { n: fmtInt(h.n_contratos), y0, v: fmtInt(withValue) })}
              shareTitle={shareTitle}
            />
            {series.length >= RAIL_MIN ? (
              <div className="fx-sec-years" data-section="years">
                <div className="fx-page-kicker">{t("br.recife.ct3.years_kicker")}</div>
                <AnneesRail rows={series} current={series[series.length - 1].year} format={fmtBrlCompact} />
                <p className="fx-v3-note">{t("br.recife.ct3.years_note")}</p>
              </div>
            ) : null}
          </div>

          <div className="fx-sec-a-scene">
            <V3Section id="scene" title={t("br.recife.ct.mix_h")} sub={t("br.recife.ct3.scene_sub")} hint={t("br.recife.ct3.scene_hint")}>
              <div id="ct-scene" className="fx-bud-cols fx-bud-cols--one">
                <div className="fx-bud-col">
                  <h3>
                    <span>{t("br.recife.ct3.col_mod")}</span>
                    <span className="tnum">{fmtBrlCompact(modTotal)}</span>
                  </h3>
                  {mods.map((m) => (
                    <Link key={m.modalidade} href={`${CITY}/modalidade/${slugModalidade(m.modalidade)}`} scroll={false} className="fx-bud-row">
                      <span className="n">
                        {modalidadeLabel(m.modalidade, locale)}
                        <i className="bar" style={{ width: `${Math.max(2, Math.round((m.valor / modMax) * 100))}%` }} aria-hidden="true" />
                      </span>
                      <span className="sp" />
                      <Amt n={m.valor} />
                      <span className="p tnum">{Math.round((m.valor / modTotal) * 100)} %</span>
                      <span className="c" aria-hidden="true">›</span>
                    </Link>
                  ))}
                </div>
              </div>
              <ShareButton label={t("fx.sec.share_chart")} done={t("fx.sec.shared")} title={shareTitle} object="scene_modalidade" anchor="ct-scene" />
            </V3Section>
          </div>

          <div className="fx-sec-a-search">
            <V3Section id="rows" title={rowsTitle} sub={active ? undefined : t("br.recife.ct3.rows_sub")}>
              {shownAll.length === 0 ? <p className="fx-v3-sentence">{fill(t("br.recife.ct3.search_none"), { q })}</p> : shownAll.map(Row)}
              {rest.length > 0 ? <V3Fold id="more-rows" text label={fill(t("br.recife.ct3.rows_more"), { n: fmtInt(rest.length) })}>{rest.map(Row)}</V3Fold> : null}
            </V3Section>
            <V3Section id="find" title={t("br.recife.ct3.h.find")} sub={fill(t("br.recife.ct3.find_sub"), { n: fmtInt(h.n_contratos) })}>
              <div className="fx-search-wrap fx-search-wrap--fiche fx-sec-lieux-search">
                <div className="fx-search-inner">
                  <div className="fx-search-input-wrap">
                    <span className="fx-search-icon" aria-hidden="true">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><circle cx="11" cy="11" r="7" /><path d="M20 20l-4-4" /></svg>
                    </span>
                    <input className="fx-search-input" type="search" placeholder={t("br.recife.ct.search_ph")} value={query} onChange={(e) => setQuery(e.target.value)} aria-label={t("br.recife.ct3.h.find")} />
                    {query.length > 0 && (
                      <button type="button" className="fx-search-x" aria-label={t("br.recife.qr.reset")} onClick={() => setQuery("")}>×</button>
                    )}
                  </div>
                  {!active && (
                    <div className="fx-search-seeds">
                      {seeds.map((s) => (
                        <button key={s} type="button" className="fx-search-seed" onClick={() => { track("search_seed_click", { page: "contratos", seed: s }); setQuery(s); }}>{s}</button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </V3Section>
          </div>

          <div className="fx-sec-a-understand">
            <V3Section id="understand" title={t("fx.sec.understand")}>
              <V3Fold id="ativo" label={t("br.recife.ct3.u.ativo")}><p className="fx-v3-sentence">{fill(t("br.recife.ct3.u.ativo_body"), { y0 })}</p></V3Fold>
              {d.cobertura ? <V3Fold id="valor" label={t("br.recife.ct3.u.valor")}><p className="fx-v3-sentence">{d.cobertura.nota}</p></V3Fold> : null}
              <V3Fold id="sources" label={t("br.recife.ct3.u.fonte")}>
                <p className="fx-v3-sentence">{t("br.recife.ct3.u.fonte_body")}</p>
                <p className="fx-v3-sentence">
                  {d.source.source_url ? <><a href={d.source.source_url} target="_blank" rel="noopener noreferrer">{d.source.name ?? t("br.recife.portal")} ↗</a>{" · "}</> : null}
                  <a href="/data/br/recife/contratos.json" target="_blank" rel="noopener noreferrer">JSON ↗</a>
                </p>
              </V3Fold>
            </V3Section>
          </div>

          <div className="fx-sec-a-related">
            <V3Section id="related" title={t("fx.sec.see_also")}>
              {doors?.budget ? (
                <Door href={`${CITY}/budget?year=${doors.budget.year}`} hard title={t("br.recife.qr3.r.budget")} sub={fill(t("br.recife.qr3.r.budget_sub"), { y: doors.budget.year })} value={brl(doors.budget.total).v} unit={brl(doors.budget.total).u} />
              ) : (
                <Door href={`${CITY}/budget`} hard title={t("br.recife.qr3.r.budget")} sub={t("br.recife.qr3.r.budget_sub_n")} />
              )}
              {doors?.quem ? (
                <Door href={`${CITY}/quem-recebe`} hard title={t("br.recife.bud3.r.quem")} sub={fill(t("br.recife.bud3.r.quem_sub"), { n: fmtInt(doors.quem.n), y0: doors.quem.y0, y1: doors.quem.y1 })} value={brl(doors.quem.total).v} unit={brl(doors.quem.total).u} />
              ) : (
                <Door href={`${CITY}/quem-recebe`} hard title={t("br.recife.bud3.r.quem")} sub={t("br.recife.bud3.r.quem_sub_n")} />
              )}
            </V3Section>
          </div>

          <div className="fx-sec-a-next">
            <NextDoor
              href={`${CITY}/lugares`}
              kicker={t("fx.sec.next")}
              title={t("br.recife.bud3.r.lugares")}
              sub={doors?.lugares ? fill(t("br.recife.bud3.r.lugares_sub"), { n: fmtInt(doors.lugares.n) }) : t("br.recife.bud3.r.lugares_sub_n")}
              value={doors?.lugares ? brl(doors.lugares.total).v : undefined}
              unit={doors?.lugares ? brl(doors.lugares.total).u : undefined}
            />
          </div>

          <div className="fx-sec-a-foot">
            <V3Foot>{t("br.recife.ct3.foot")}</V3Foot>
          </div>
        </div>
      </div>
    </main>
  );
}
