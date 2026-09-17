"use client";

import Link from "@/components/LocalizedLink";
import AnneesRail, { RAIL_MIN } from "@/components/fusion/AnneesRail";
import SectionHero from "@/components/fiche/SectionHero";
import ShareButton from "@/components/fiche/ShareButton";
import { Door, NextDoor } from "@/components/fiche/Doors";
import { V3Amt, V3Fold, V3Foot, V3Row, V3Section } from "@/components/fiche/v3";
import MunicipioSearch from "@/components/br/MunicipioSearch";
import { useT, useLocale } from "@/lib/localeContext";
import type { BudgetData } from "@/lib/br/recife-data";
import { fmtBrl, fmtBrlCompact, fmtBrlCompactNum, brlMagnitude, fill, funcaoSlug, mesRange, titleCasePt, fmtInt } from "@/lib/br/format";

/**
 * Recife's budget on the section grammar (2026-09-17), the same page as
 * Paris's Budget : the number and its year rail, the scene (spending by
 * function, each opening its drawer), the heaviest sub-functions in rows,
 * Understand, See also with the figures of the other sections, the next
 * section, the source. Portuguese first, English through the toggle.
 */

const RECIFE = "/brasil/recife";
const LINES = 5;

/** Another município on the same page (2026-09-18, the Brazilian long tail) :
 *  its addresses, no drawers (SICONFI has no per-function page yet), and the
 *  municípios of the same size in its state as the peers block. */
export type BudgetCity = {
  slug: string;
  name: string;
  shortName: string;
  base: string;
  hub: string;
  drawers: boolean;
  peers?: { slug: string; nome: string; uf: string; pop: number; hab: number; ano: number }[];
};

export type RecifeBudgetDoors = {
  quem?: { total: number; n: number; y0: number; y1: number } | null;
  contratos?: { ativos: number; valor: number } | null;
  lugares?: { n: number; total: number } | null;
};

export default function BudgetClient({ d, ano, doors, city }: { d: BudgetData; ano?: number; doors?: RecifeBudgetDoors; city?: BudgetCity }) {
  const t = useT();
  const { locale } = useLocale();
  const CITY = city?.hub ?? RECIFE;
  const BASE = city?.base ?? `${RECIFE}/budget`;
  const drawers = city ? city.drawers : true;
  const funcaoHref = (slug: string, y: number) => (drawers ? `${BASE}/funcao/${slug}?year=${y}` : null);
  const brl = (n: number) => ({ v: fmtBrlCompactNum(n), u: brlMagnitude(n) });
  const Amt = ({ n }: { n: number }) => <V3Amt {...brl(n)} />;

  // Only complete (12-month) years can be the page's year : a partial current
  // year would crater the comparison. The rail still shows it, hatched.
  const completeYears = d.anos_disponiveis.filter((y) => d.curva_mensal.some((c) => c.ano === y && c.mes === 12));
  const shownYears = (completeYears.length ? completeYears : d.anos_disponiveis).slice().sort((a, b) => a - b);
  const year = ano && shownYears.includes(ano) ? ano : Math.max(...shownYears);
  const anoData = d.anos.find((a) => a.ano === year) ?? d.anos[d.anos.length - 1];
  const funcoes = anoData.funcoes.filter((f) => f.pago > 0).slice().sort((a, b) => b.pago - a.pago);
  const prev = d.anos.find((a) => a.ano === year - 1);
  const movePct = prev && prev.total_pago > 0 ? (anoData.total_pago / prev.total_pago - 1) * 100 : null;
  const pop = d.populacao?.populacao;
  const perCap = pop ? anoData.total_pago / pop : null;
  const restos = anoData.total_empenhado - anoData.total_pago;
  const pj = d.partial_year;
  // The unfinished year shows what was voted (dotação inicial, the LOA),
  // hatched, instead of a few months of payments (Daniel, 18/09) ; the note
  // under the rail says both. Closed years show what was paid.
  const votedYear = pj ? d.anos.find((a) => a.ano === pj.ano && (a.dotacao_inicial ?? 0) > 0) ?? null : null;
  const series = d.anos.map((a) => ({ year: a.ano, amount: votedYear && a.ano === votedYear.ano ? votedYear.dotacao_inicial! : a.total_pago })).sort((a, b) => a.year - b.year);
  const total = brl(anoData.total_pago);
  const shareTitle = fill(t("br.recife.bud3.share_title"), { total: fmtBrlCompact(anoData.total_pago), y: year });
  // The revenue side (municípios, SICONFI Anexo I-C) : the origens of the
  // year, net of the deductions, face to face with the functions.
  const rec = city ? d.receitas?.find((r) => r.ano === year) ?? null : null;
  const recOrigens = rec ? rec.origens.filter((o) => o.liquida > 0) : [];
  const recMax = recOrigens[0]?.liquida ?? 1;
  const recRest = rec ? Math.max(0, rec.liquida - recOrigens.reduce((s, o) => s + o.liquida, 0)) : 0;
  const max = funcoes[0]?.pago ?? 1;
  const movePctTxt = movePct == null ? null : `${movePct > 0 ? "+" : movePct < 0 ? "−" : ""}${Math.abs(movePct).toLocaleString(locale === "en" ? "en-US" : "pt-BR", { maximumFractionDigits: 1 })} %`;

  // The heaviest sub-functions of the year, inside the functions above.
  const sub = funcoes
    .flatMap((f) => f.subfuncoes.map((s) => ({ key: `${f.funcao}|${s.subfuncao}`, name: titleCasePt(s.subfuncao), funcao: titleCasePt(f.funcao), value: s.pago, slug: funcaoSlug(f.funcao) })))
    .filter((x) => x.value > 0)
    .sort((a, b) => b.value - a.value)
    .slice(0, LINES + 3);
  const shown = sub.slice(0, LINES);
  const rest = sub.length - LINES >= 2 ? sub.slice(LINES) : [];
  const shownAll = rest.length ? shown : sub;
  const Line = (l: (typeof sub)[number]) => (
    <V3Row key={l.key} href={funcaoHref(l.slug, year)} label={l.name} subText={l.funcao} amount={<Amt n={l.value} />} />
  );
  const int = new Intl.NumberFormat(locale === "en" ? "en-US" : "pt-BR", { maximumFractionDigits: 0 });

  return (
    <main id="main-content" tabIndex={-1}>
      <div className="fx-sec fx-v3">
        <div className="fx-sec-kicker fx-page-kicker fx-page-kicker--links">
          {city ? <><Link href={CITY}>{t("br.mun.kicker_root")}</Link> › {city.name}</> : <><Link href={CITY}>Recife</Link> › {t("br.recife.budget.kicker")}</>}
        </div>
        <div className="fx-sec-grid" data-layout="budget">
          <div className="fx-sec-a-hero">
            <SectionHero
              title={city ? fill(t("br.mun.title"), { nome: city.shortName }) : t("br.recife.bud3.title")}
              value={total.v}
              unit={total.u}
              captionBefore={t("br.recife.bud3.cap_before")}
              captionAfter={t("br.recife.bud3.cap_after")}
              years={shownYears}
              year={year}
              basePath={BASE}
              meta={[perCap != null ? fill(t("br.recife.bud3.meta_hab"), { v: fmtBrl(Math.round(perCap)) }) : null, rec ? fill(t("br.mun.meta_rec"), { v: fmtBrlCompact(rec.liquida) }) : fill(t("br.recife.bud3.meta_emp"), { v: fmtBrlCompact(anoData.total_empenhado) }), restos > 0 && !rec ? fill(t("br.recife.bud3.meta_restos"), { v: fmtBrlCompact(restos) }) : null].filter(Boolean).join(" · ")}
              move={movePctTxt && prev ? fill(t("br.recife.bud3.move"), { pct: movePctTxt, y: prev.ano }) : undefined}
              shareTitle={shareTitle}
            />
          </div>

          <div className="fx-sec-a-rail">
            {series.length >= RAIL_MIN ? (
              <div className="fx-sec-years" data-section="years">
                <div className="fx-page-kicker">{t("fx.sec.years")}</div>
                <AnneesRail rows={series} current={year} provisional={pj ? [pj.ano] : undefined} format={fmtBrlCompact} />
                {pj ? (
                  <p className="fx-v3-note">
                    {votedYear
                      ? fill(t("br.recife.partial_note_voted"), { ano: pj.ano, dot: fmtBrlCompact(votedYear.dotacao_inicial!), pago: fmtBrlCompact(votedYear.total_pago), mes: mesRange(pj.ate_mes, locale) })
                      : fill(t("br.recife.partial_note"), { ano: pj.ano, mes: mesRange(pj.ate_mes, locale) })}
                  </p>
                ) : null}
              </div>
            ) : null}
          </div>

          <div className="fx-sec-a-table">
            <V3Section id="scene" title={rec ? fill(t("br.mun.h.table"), { y: year }) : t("br.recife.budget.funcao_h")} sub={fill(t("br.recife.bud3.scene_sub"), { y: year, n: fmtInt(funcoes.length) })} hint={drawers ? t("br.recife.bud3.scene_hint") : undefined}>
              <div id="budget-scene" className={rec ? "fx-bud-cols" : "fx-bud-cols fx-bud-cols--one"}>
                <div className="fx-bud-col">
                  <h3>
                    <span>{t("br.recife.bud3.col_pago")}</span>
                    <span className="tnum">{fmtBrlCompact(anoData.total_pago)}</span>
                  </h3>
                  {funcoes.map((f) => {
                    const body = (
                      <>
                        <span className="n">
                          {titleCasePt(f.funcao)}
                          <i className="bar" style={{ width: `${Math.max(2, Math.round((f.pago / max) * 100))}%` }} aria-hidden="true" />
                        </span>
                        <span className="sp" />
                        <Amt n={f.pago} />
                        <span className="p tnum">{Math.round((f.pago / anoData.total_pago) * 100)} %</span>
                        <span className="c" aria-hidden="true">{drawers ? "›" : ""}</span>
                      </>
                    );
                    const href = funcaoHref(funcaoSlug(f.funcao), year);
                    return href ? (
                      <Link key={f.funcao} href={href} scroll={false} className="fx-bud-row">{body}</Link>
                    ) : (
                      <div key={f.funcao} className="fx-bud-row fx-bud-row--static">{body}</div>
                    );
                  })}
                </div>
                {rec ? (
                  <div className="fx-bud-col">
                    <h3>
                      <span>{t("br.mun.col_rec")}</span>
                      <span className="tnum">{fmtBrlCompact(rec.liquida)}</span>
                    </h3>
                    {recOrigens.map((o) => (
                      <div key={o.codigo} className="fx-bud-row fx-bud-row--static" data-peek={o.detalhes.length ? o.detalhes.slice(0, 4).map((x) => `${titleCasePt(x.detalhe)} ${fmtBrlCompact(x.liquida)}`).join(" · ") : undefined}>
                        <span className="n">
                          {titleCasePt(o.origem)}
                          <i className="bar" style={{ width: `${Math.max(2, Math.round((o.liquida / recMax) * 100))}%` }} aria-hidden="true" />
                        </span>
                        <span className="sp" />
                        <Amt n={o.liquida} />
                        <span className="p tnum">{Math.round((o.liquida / rec.liquida) * 100)} %</span>
                        <span className="c" />
                      </div>
                    ))}
                    {recRest > rec.liquida * 0.005 ? (
                      <div className="fx-bud-row fx-bud-row--static">
                        <span className="n">{t("br.mun.rec_other")}</span>
                        <span className="sp" /><Amt n={recRest} /><span className="p tnum">{Math.round((recRest / rec.liquida) * 100)} %</span><span className="c" />
                      </div>
                    ) : null}
                    <p className="fx-v3-note">{fill(t("br.mun.rec_note"), { ded: fmtBrlCompact(rec.deducoes), fundeb: fmtBrlCompact(rec.fundeb), bruta: fmtBrlCompact(rec.bruta) })}</p>
                  </div>
                ) : null}
              </div>
              <ShareButton label={t("fx.sec.share_chart")} done={t("fx.sec.shared")} title={shareTitle} object="scene_funcao" anchor="budget-scene" />
            </V3Section>
          </div>

          <div className="fx-sec-a-rows">
            {shownAll.length > 0 ? (
              <V3Section id="lines" title={fill(t("br.recife.bud3.h.lines"), { y: year })} sub={t(drawers ? "br.recife.bud3.lines_sub" : "br.mun.lines_sub")}>
                {shownAll.map(Line)}
                {rest.length > 0 ? <V3Fold id="more-lines" text label={t("fx.v3.voir_plus")}>{rest.map(Line)}</V3Fold> : null}
              </V3Section>
            ) : null}
          </div>

          <div className="fx-sec-a-related">
            {city ? (
              city.peers && city.peers.length > 0 ? (
                <V3Section id="related" title={fill(t("br.mun.peers_h"), { uf: city.peers[0].uf })} sub={t("br.mun.peers_sub")}>
                  {city.peers.map((p) => (
                    <V3Row key={p.slug} href={`/brasil/comparar?a=${city.slug}&b=${p.slug}`} label={p.nome} subText={fill(t("br.mun.peers_hab"), { pop: int.format(p.pop), y: p.ano })} amount={<span className="fx-v3-amt tnum" style={{ fontSize: 14 }}>{fmtBrl(Math.round(p.hab))}<span className="u">{t("br.mun.per_hab")}</span></span>} />
                  ))}
                  <p className="fx-v3-note">{t("br.mun.peers_compare_note")}</p>
                  <div className="fx-sec-lieux-search" style={{ marginTop: 14 }}>
                    <MunicipioSearch placeholder={t("br.mun.compare_ph")} label={t("br.mun.compare_h")} hrefFor={(slug) => `/brasil/comparar?a=${city.slug}&b=${slug}`} />
                  </div>
                </V3Section>
              ) : null
            ) : (
            <V3Section id="related" title={t("fx.sec.see_also")}>
              {doors?.quem ? (
                <Door href={`${CITY}/quem-recebe`} hard title={t("br.recife.bud3.r.quem")} sub={fill(t("br.recife.bud3.r.quem_sub"), { n: fmtInt(doors.quem.n), y0: doors.quem.y0, y1: doors.quem.y1 })} value={brl(doors.quem.total).v} unit={brl(doors.quem.total).u} />
              ) : (
                <Door href={`${CITY}/quem-recebe`} hard title={t("br.recife.bud3.r.quem")} sub={t("br.recife.bud3.r.quem_sub_n")} />
              )}
              {doors?.contratos ? (
                <Door href={`${CITY}/contratos`} hard title={t("br.recife.bud3.r.contratos")} sub={fill(t("br.recife.bud3.r.contratos_sub"), { n: fmtInt(doors.contratos.ativos) })} value={brl(doors.contratos.valor).v} unit={brl(doors.contratos.valor).u} />
              ) : (
                <Door href={`${CITY}/contratos`} hard title={t("br.recife.bud3.r.contratos")} sub={t("br.recife.bud3.r.contratos_sub_n")} />
              )}
              {doors?.lugares ? (
                <Door href={`${CITY}/lugares`} hard title={t("br.recife.bud3.r.lugares")} sub={fill(t("br.recife.bud3.r.lugares_sub"), { n: fmtInt(doors.lugares.n) })} value={brl(doors.lugares.total).v} unit={brl(doors.lugares.total).u} />
              ) : (
                <Door href={`${CITY}/lugares`} hard title={t("br.recife.bud3.r.lugares")} sub={t("br.recife.bud3.r.lugares_sub_n")} />
              )}
            </V3Section>
            )}
          </div>

          <div className="fx-sec-a-understand">
            <V3Section id="understand" title={t("fx.sec.understand")}>
              <V3Fold id="pago" label={t("br.recife.bud3.u.pago")}><p className="fx-v3-sentence">{t("br.recife.bud3.u.pago_body")}</p></V3Fold>
              {pj ? (
                <V3Fold id="parcial" label={t("br.recife.bud3.u.parcial")}><p className="fx-v3-sentence">{fill(t("br.recife.bud3.u.parcial_body"), { ano: pj.ano, mes: mesRange(pj.ate_mes, locale) })}</p></V3Fold>
              ) : null}
              {rec ? (
                <V3Fold id="receita" label={t("br.mun.u.rec")}><p className="fx-v3-sentence">{fill(t("br.mun.u.rec_body"), { y: year, rec: fmtBrlCompact(rec.liquida), pago: fmtBrlCompact(anoData.total_pago), fundeb: fmtBrlCompact(rec.fundeb) })}</p></V3Fold>
              ) : null}
              <V3Fold id="sources" label={t("br.recife.bud3.u.fonte")}>
                <p className="fx-v3-sentence">{fill(t(city ? "br.mun.u.fonte_body" : "br.recife.bud3.u.fonte_body"), { pop: d.populacao?.source ?? "IBGE" })}</p>
                <p className="fx-v3-sentence">
                  {d.source.source_url ? <><a href={d.source.source_url} target="_blank" rel="noopener noreferrer">{d.source.name ?? t("br.recife.portal")} ↗</a>{" · "}</> : null}
                  {city ? null : <a href="/data/br/recife/budget.json" target="_blank" rel="noopener noreferrer">JSON ↗</a>}
                </p>
              </V3Fold>
            </V3Section>
          </div>

          <div className="fx-sec-a-next">
            {city ? (
              <NextDoor href={RECIFE} kicker={t("fx.pv.next.kicker")} title={t("br.mun.next_title")} sub={t("br.mun.next_sub")} />
            ) : (
            <NextDoor
              href={`${CITY}/quem-recebe`}
              kicker={t("fx.sec.next")}
              title={t("br.recife.bud3.r.quem")}
              sub={doors?.quem ? fill(t("br.recife.bud3.next_sub"), { n: fmtInt(doors.quem.n), y0: doors.quem.y0, y1: doors.quem.y1 }) : t("br.recife.bud3.r.quem_sub_n")}
              value={doors?.quem ? brl(doors.quem.total).v : undefined}
              unit={doors?.quem ? brl(doors.quem.total).u : undefined}
            />
            )}
          </div>

          <div className="fx-sec-a-foot">
            <V3Foot>{fill(t(city ? "br.mun.foot" : "br.recife.bud3.foot"), { pop: d.populacao?.source ?? "IBGE" })}</V3Foot>
          </div>
        </div>
      </div>
    </main>
  );
}
