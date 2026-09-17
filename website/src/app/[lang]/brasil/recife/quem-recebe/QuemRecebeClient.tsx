"use client";

import { useMemo, useState } from "react";
import Link from "@/components/LocalizedLink";
import AnneesRail, { RAIL_MIN } from "@/components/fusion/AnneesRail";
import SectionHero from "@/components/fiche/SectionHero";
import ShareButton from "@/components/fiche/ShareButton";
import { Door, NextDoor } from "@/components/fiche/Doors";
import { V3Amt, V3Fold, V3Foot, V3Row, V3Section } from "@/components/fiche/v3";
import { useT, useLocale } from "@/lib/localeContext";
import { useTrack } from "@/lib/analyticsContext";
import { normSearch } from "@/lib/search-synonyms";
import type { QuemRecebeData } from "@/lib/br/recife-data";
import { fmtBrl, fmtBrlCompact, fmtBrlCompactNum, brlMagnitude, fmtInt, fmtShare, fill, slugTema, mesRange, titleCasePt, fmtCnpj } from "@/lib/br/format";

/**
 * Who receives, on the section grammar (2026-09-17), the same page as
 * Paris's Subventions : the number (what City Hall paid to organisations,
 * 2024 to 2026) and its year rail ; the themes as the scene, each opening
 * its drawer ; the organisations paid the most, each opening its page ; a
 * search by name or CNPJ ; Understand ; See also ; the next section.
 * Individuals (CPF) are never listed nor searchable.
 */

const CITY = "/brasil/recife";
const BASE = `${CITY}/quem-recebe`;
const ROWS = 8;
const ROWS_Q = 12;

export type RecifeQrDoors = {
  budget?: { total: number; year: number } | null;
  contratos?: { ativos: number; valor: number } | null;
  lugares?: { n: number; total: number } | null;
};

export default function QuemRecebeClient({ d, doors }: { d: QuemRecebeData; doors?: RecifeQrDoors }) {
  const t = useT();
  const { locale } = useLocale();
  const track = useTrack();
  const brl = (n: number) => ({ v: fmtBrlCompactNum(n), u: brlMagnitude(n) });
  const Amt = ({ n }: { n: number }) => <V3Amt {...brl(n)} />;
  const h = d.headline;
  const years = d.anos_disponiveis.slice().sort((a, b) => a - b);
  const y0 = years[0];
  const y1 = years[years.length - 1];
  const pj = d.partial_year;
  const series = d.anos_series.map((a) => ({ year: a.ano, amount: a.total_pago })).sort((a, b) => a.year - b.year);
  const total = brl(h.total_pago);
  const shareTitle = fill(t("br.recife.qr3.share_title"), { total: fmtBrlCompact(h.total_pago), n: fmtInt(h.n_organizacoes), y0, y1 });

  // The themes : our own classification, each opening its drawer.
  const temas = d.temas.filter((x) => x.pago > 0).slice().sort((a, b) => b.pago - a.pago);
  const temaMax = temas[0]?.pago ?? 1;

  // The organisations paid the most, and a search among the 200 the file carries.
  const [query, setQuery] = useState("");
  const q = query.trim();
  const active = q.length >= 2;
  const qNorm = normSearch(q);
  const digits = q.replace(/[^0-9]/g, "");
  const top = useMemo(() => d.top_recebedores.slice().sort((a, b) => b.total_pago - a.total_pago), [d.top_recebedores]);
  const filtered = useMemo(
    () => (active ? top.filter((r) => normSearch(r.nome).includes(qNorm) || (digits.length >= 4 && r.cnpj.includes(digits))) : top),
    [top, active, qNorm, digits],
  );
  const cap = active ? ROWS_Q : ROWS;
  const shown = filtered.slice(0, cap);
  const rest = filtered.length - cap >= 2 ? filtered.slice(cap) : [];
  const shownAll = rest.length ? shown : filtered;
  const seeds = top.slice(0, 3).map((r) => titleCasePt(r.nome).split(" ").slice(0, 3).join(" "));
  const Row = (r: (typeof top)[number]) => (
    <V3Row
      key={r.cnpj}
      href={`${BASE}/${r.cnpj}`}
      label={titleCasePt(r.nome)}
      subText={[r.tema ?? null, r.is_subvencao ? t("br.recife.qr.badge_subv") : null, fmtCnpj(r.cnpj)].filter(Boolean).join(" · ")}
      amount={<Amt n={r.total_pago} />}
      onClick={active ? () => track("search_result_click", { page: "quem-recebe", entity_name: r.nome }) : undefined}
    />
  );
  const rowsTitle = active ? fill(t("br.recife.qr3.h.rows_q"), { n: fmtInt(filtered.length), q }) : fill(t("br.recife.qr3.h.rows"), { y0, y1 });

  return (
    <main id="main-content" tabIndex={-1}>
      <div className="fx-sec fx-v3">
        <div className="fx-sec-kicker fx-page-kicker fx-page-kicker--links"><Link href={CITY}>Recife</Link> › {t("br.recife.qr.kicker")}</div>
        <div className="fx-sec-grid" data-layout="subventions">
          <div className="fx-sec-a-hero">
            <SectionHero
              title={t("br.recife.qr.title")}
              value={total.v}
              unit={total.u}
              captionBefore={fill(t("br.recife.qr3.cap_before"), { n: fmtInt(h.n_organizacoes), y0 })}
              years={[y1]}
              year={y1}
              basePath={BASE}
              meta={[fill(t("br.recife.qr3.meta_mediana"), { v: fmtBrl(Math.round(h.mediana)) }), fill(t("br.recife.qr3.meta_top10"), { pct: fmtShare(h.concentracao_top10) }), fill(t("br.recife.qr3.meta_subv"), { v: fmtBrlCompact(h.subvencao_total), n: fmtInt(h.n_organizacoes_subvencionadas) })].join(" · ")}
              shareTitle={shareTitle}
            />
            {series.length >= RAIL_MIN ? (
              <div className="fx-sec-years" data-section="years">
                <div className="fx-page-kicker">{t("fx.sec.years")}</div>
                <AnneesRail rows={series} current={y1} provisional={pj ? [pj.ano] : undefined} format={fmtBrlCompact} />
                {pj ? <p className="fx-v3-note">{fill(t("br.recife.partial_note"), { ano: pj.ano, mes: mesRange(pj.ate_mes, locale) })}</p> : null}
              </div>
            ) : null}
          </div>

          <div className="fx-sec-a-scene">
            <V3Section id="scene" title={t("br.recife.qr.temas_h")} sub={fill(t("br.recife.qr3.scene_sub"), { y0, y1 })} hint={t("br.recife.qr3.scene_hint")}>
              <div id="qr-scene" className="fx-bud-cols fx-bud-cols--one">
                <div className="fx-bud-col">
                  <h3>
                    <span>{t("br.recife.qr3.col_tema")}</span>
                    <span className="tnum">{fmtBrlCompact(h.total_pago)}</span>
                  </h3>
                  {temas.map((x) => (
                    <Link key={x.tema} href={`${CITY}/tema/${x.slug ?? slugTema(x.tema)}`} scroll={false} className="fx-bud-row">
                      <span className="n">
                        {x.tema}
                        <i className="bar" style={{ width: `${Math.max(2, Math.round((x.pago / temaMax) * 100))}%` }} aria-hidden="true" />
                      </span>
                      <span className="sp" />
                      <Amt n={x.pago} />
                      <span className="p tnum">{Math.round((x.pago / h.total_pago) * 100)} %</span>
                      <span className="c" aria-hidden="true">›</span>
                    </Link>
                  ))}
                </div>
              </div>
              <p className="fx-v3-note">{t("br.recife.qr.tema_provenance")}</p>
              <ShareButton label={t("fx.sec.share_chart")} done={t("fx.sec.shared")} title={shareTitle} object="scene_tema" anchor="qr-scene" />
            </V3Section>
          </div>

          <div className="fx-sec-a-search">
            <V3Section id="rows" title={rowsTitle} sub={active ? undefined : t("br.recife.qr3.rows_sub")} hint={t("fx.v3.rows.aide")}>
              {shownAll.length === 0 ? <p className="fx-v3-sentence">{t("br.recife.qr.no_results")}</p> : shownAll.map(Row)}
              {rest.length > 0 ? <V3Fold id="more-rows" text label={fill(t("br.recife.qr3.rows_more"), { n: fmtInt(rest.length) })}>{rest.map(Row)}</V3Fold> : null}
              {!active ? <p className="fx-v3-note">{fill(t("br.recife.qr.top_footer"), { pct: Math.round(h.concentracao_top10 * 100) })}</p> : null}
            </V3Section>
            <V3Section id="find" title={t("br.recife.qr.search_h")} sub={t("br.recife.qr3.find_sub")}>
              <div className="fx-search-wrap fx-search-wrap--fiche fx-sec-lieux-search">
                <div className="fx-search-inner">
                  <div className="fx-search-input-wrap">
                    <span className="fx-search-icon" aria-hidden="true">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><circle cx="11" cy="11" r="7" /><path d="M20 20l-4-4" /></svg>
                    </span>
                    <input className="fx-search-input" type="search" placeholder={t("br.recife.qr.search_ph")} value={query} onChange={(e) => setQuery(e.target.value)} aria-label={t("br.recife.qr.search_h")} />
                    {query.length > 0 && (
                      <button type="button" className="fx-search-x" aria-label={t("br.recife.qr.reset")} onClick={() => setQuery("")}>×</button>
                    )}
                  </div>
                  {!active && (
                    <div className="fx-search-seeds">
                      {seeds.map((s) => (
                        <button key={s} type="button" className="fx-search-seed" onClick={() => { track("search_seed_click", { page: "quem-recebe", seed: s }); setQuery(s); }}>{s}</button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
              <p className="fx-v3-note">{t("br.recife.qr.privacy")}</p>
            </V3Section>
          </div>

          <div className="fx-sec-a-understand">
            <V3Section id="understand" title={t("fx.sec.understand")}>
              <V3Fold id="quem" label={t("br.recife.qr3.u.quem")}><p className="fx-v3-sentence">{d.perimeter}</p></V3Fold>
              <V3Fold id="subv" label={t("br.recife.qr3.u.subv")}><p className="fx-v3-sentence">{fill(t("br.recife.qr3.u.subv_body"), { v: fmtBrlCompact(h.subvencao_total), n: fmtInt(h.n_organizacoes_subvencionadas) })}</p></V3Fold>
              <V3Fold id="tema" label={t("br.recife.qr3.u.tema")}><p className="fx-v3-sentence">{t("br.recife.qr.tema_provenance")}</p></V3Fold>
              <V3Fold id="sources" label={t("br.recife.qr3.u.fonte")}>
                <p className="fx-v3-sentence">{t("br.recife.qr3.u.fonte_body")}</p>
                <p className="fx-v3-sentence">
                  {d.source.source_url ? <><a href={d.source.source_url} target="_blank" rel="noopener noreferrer">{d.source.name ?? t("br.recife.portal")} ↗</a>{" · "}</> : null}
                  <a href="/data/br/recife/quem_recebe.json" target="_blank" rel="noopener noreferrer">JSON ↗</a>
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
              {doors?.lugares ? (
                <Door href={`${CITY}/lugares`} hard title={t("br.recife.bud3.r.lugares")} sub={fill(t("br.recife.bud3.r.lugares_sub"), { n: fmtInt(doors.lugares.n) })} value={brl(doors.lugares.total).v} unit={brl(doors.lugares.total).u} />
              ) : (
                <Door href={`${CITY}/lugares`} hard title={t("br.recife.bud3.r.lugares")} sub={t("br.recife.bud3.r.lugares_sub_n")} />
              )}
            </V3Section>
          </div>

          <div className="fx-sec-a-next">
            <NextDoor
              href={`${CITY}/contratos`}
              kicker={t("fx.sec.next")}
              title={t("br.recife.bud3.r.contratos")}
              sub={doors?.contratos ? fill(t("br.recife.bud3.r.contratos_sub"), { n: fmtInt(doors.contratos.ativos) }) : t("br.recife.bud3.r.contratos_sub_n")}
              value={doors?.contratos ? brl(doors.contratos.valor).v : undefined}
              unit={doors?.contratos ? brl(doors.contratos.valor).u : undefined}
            />
          </div>

          <div className="fx-sec-a-foot">
            <V3Foot>{fill(t("br.recife.qr3.foot"), { y0, y1 })}</V3Foot>
          </div>
        </div>
      </div>
    </main>
  );
}
