"use client";

import { useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import NextImage from "next/image";
import Link from "@/components/LocalizedLink";
import Navbar from "@/components/fusion/Navbar";
import Footer from "@/components/fusion/Footer";
import AnneesRail, { RAIL_MIN } from "@/components/fusion/AnneesRail";
import ParisChoropleth from "@/components/fusion/ParisChoropleth";
import SectionHero from "@/components/fiche/SectionHero";
import ShareButton from "@/components/fiche/ShareButton";
import Bars, { type BarRow } from "@/components/fiche/Bars";
import { Door, NextDoor } from "@/components/fiche/Doors";
import { V3Amt, V3Fold, V3Foot, V3Section } from "@/components/fiche/v3";
import DataAlert, { DATA_ALERTS_ON } from "@/components/fusion/DataAlert";
import { FAMILLES, buildPlaceEntries, buildPlacesConfig } from "@/components/fusion/LieuxExplorer";
import { clearDrawerStack } from "@/components/fusion/DetailDrawer";
import { useFmt, useFmtEur, useNumLocale } from "@/lib/use-fmt";
import { fill, sufOrdinal } from "@/lib/fmt";
import { useLocale, useT } from "@/lib/localeContext";
import { useTrack } from "@/lib/analyticsContext";
import { useDebouncedTrack, hashQuery, queryShape } from "@/lib/analytics-helpers";
import { normSearch } from "@/lib/search-synonyms";
import type { LieuIndexEntry, LieuxSection } from "@/lib/lieux-data";

const PlacesMap = dynamic(() => import("@/components/places/PlacesMap"), { ssr: false, loading: () => <div className="fx-sec-map-wait" aria-hidden="true" /> });

/** Blue ramp of the choropleth: on a section page the bars are blue, ocre is the movement only. */
const CHORO_BLUE = ["#e6e9f4", "#bcc3e2", "#8b96c7", "#5262a5", "#2a3680"];
const ROWS_CAP = 8;
const ROWS_CAP_FILTERED = 12;
const ARR_CAP = 5;
const SEEDS = ["Châtelet", "Parc Monceau", "Piscine Pontoise", "Halle Pajol"];
const WHERE_VIEWS = ["arrondissements", "carte"] as const;
type WhereView = (typeof WHERE_VIEWS)[number];

export type LieuxDoors = {
  invest?: { year: number; total: number } | null;
  subventions?: { year: number; total: number; count: number } | null;
  next?: { year: number; total: number; voted: boolean } | null;
};

/**
 * The Lieux section on the fiche grammar (2026-09-16). The number (what the
 * City paid or signed for 225 places since 2010), the year rail of what was
 * really paid, one scene (the five families), the search band, the places
 * where the City paid the most (rows with their photo, the rest folded), where
 * in Paris (arrondissements, the map behind the switch), Comprendre, Voir
 * aussi, the next section. The explorer of before (map first, 225 cards) is
 * what the phone paid 28 screens and 18 Mo for.
 */
export default function LieuxClient({ lieux, section, doors, initial }: {
  lieux: LieuIndexEntry[];
  section: LieuxSection;
  doors?: LieuxDoors;
  /** From the address: ?famille=culture, ?arrondissement=18 (the fiche kickers link here). */
  initial?: { famille?: string | null; arr?: number | null };
}) {
  const t = useT();
  const { locale } = useLocale();
  const en = locale === "en";
  const { fmtInt } = useFmt();
  const fmtEur = useFmtEur();
  const nl = useNumLocale();
  const track = useTrack();
  const trackDebounced = useDebouncedTrack(700);
  const eurTxt = (n: number) => { const f = fmtEur(n); return `${f.v} ${f.u}`; };
  const arrTxt = (n: number) => `${n}${sufOrdinal(n, locale)}`;
  const famLabel = (key: string) => t(FAMILLES.find((f) => f.key === key)?.i18n ?? key);
  const cityBase = "/france/paris";
  const base = `${cityBase}/lieux`;

  // On the list: no drill-down chain in progress.
  useEffect(() => { clearDrawerStack(); }, []);

  // ── Filters: a family or an arrondissement from the address, a name typed. ──
  const famille = initial?.famille && FAMILLES.some((f) => f.key === initial.famille) ? initial.famille : null;
  const arr = initial?.arr && initial.arr > 0 && initial.arr <= 20 ? initial.arr : null;
  const [query, setQuery] = useState("");
  const q = query.trim();
  const active = q.length >= 2;
  const qNorm = normSearch(q);

  const byAmount = (a: LieuIndexEntry, b: LieuIndexEntry) => (b.argent_total_eur ?? 0) - (a.argent_total_eur ?? 0) || a.name.localeCompare(b.name, "fr");
  const filtered = useMemo(() => {
    let list = lieux;
    if (famille) list = list.filter((l) => l.famille === famille);
    if (arr) list = list.filter((l) => l.arrondissement === arr);
    if (active) list = list.filter((l) => normSearch(`${l.name} ${l.kind_fr}`).includes(qNorm));
    return list.slice().sort(byAmount);
  }, [lieux, famille, arr, active, qNorm]);
  const isFiltered = !!famille || !!arr || active;

  // Zero-result searches guide the synonyms: counted once typed.
  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    (async () => {
      const h = await hashQuery(q);
      if (cancelled) return;
      trackDebounced("search_submit", { page: "lieux", q_hash: h, ...queryShape(q), results_count: filtered.length });
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- filtered is fresh in the closure; fire on the query only.
  }, [q, active]);

  // ── The number and its sentence ──
  const total = fmtEur(section.total);
  const shareTitle = fill(t("fx.sec.lieux.share_title"), { total: eurTxt(section.total), n: fmtInt(section.count) });
  const series = section.series.map((s) => ({ year: s.year, amount: s.amount }));

  // ── The scene: the five families, each a hard link to the list filtered ──
  const famRows: BarRow[] = section.families
    .slice()
    .sort((a, b) => b.amount - a.amount)
    .map((f) => ({
      key: f.key,
      label: famLabel(f.key),
      value: f.amount,
      text: eurTxt(f.amount),
      sub: fill(t("fx.sec.lieux.fam_n"), { n: fmtInt(f.count) }),
      href: `${base}?famille=${f.key}#lieux`,
      tone: famille === f.key ? "ink" : undefined,
    }));

  // ── Where: the arrondissements (choropleth + bars), the map behind the switch ──
  const [where, setWhere] = useState<WhereView>("arrondissements");
  const pickWhere = (v: WhereView) => {
    if (v === where) return;
    track("filter_change", { page: "lieux", field: "where_view", value: v });
    setWhere(v);
  };
  const arrSorted = section.arrondissements.slice().sort((a, b) => b.amount - a.amount);
  const arrRows: BarRow[] = arrSorted.map((a) => ({
    key: String(a.arr),
    label: fill(t("fx.sec.lieux.arr_label"), { arr: arrTxt(a.arr) }),
    value: a.amount,
    text: eurTxt(a.amount),
    sub: fill(t("fx.sec.lieux.fam_n"), { n: fmtInt(a.count) }),
    href: `${base}?arrondissement=${a.arr}#lieux`,
    tone: arr === a.arr ? "ink" : undefined,
  }));
  const nLoc = section.arrondissements.reduce((s, a) => s + a.count, 0);
  const amountLoc = section.arrondissements.reduce((s, a) => s + a.amount, 0);
  const [hovered, setHovered] = useState<string | null>(null);
  const entries = useMemo(() => buildPlaceEntries(lieux, t, nl), [lieux, t, nl]);
  const config = useMemo(() => buildPlacesConfig(t, nl), [t, nl]);
  const visibleSlugs = useMemo(() => new Set(filtered.map((l) => l.slug)), [filtered]);

  // ── The rows: the places where the City paid the most, photo first ──
  const cap = isFiltered ? ROWS_CAP_FILTERED : ROWS_CAP;
  const shown = filtered.slice(0, cap);
  const rest = filtered.length - shown.length >= 2 ? filtered.slice(cap) : [];
  const shownAll = rest.length === 0 ? filtered : shown;
  const noMoney = section.count - section.withMoney;
  const rowsTitle = active
    ? fill(t("fx.sec.lieux.h.rows_q"), { n: fmtInt(filtered.length), q })
    : famille
      ? fill(t("fx.sec.lieux.h.rows_fam"), { fam: famLabel(famille), n: fmtInt(filtered.length) })
      : arr
        ? fill(t("fx.sec.lieux.h.rows_arr"), { arr: arrTxt(arr), n: fmtInt(filtered.length) })
        : t("fx.sec.lieux.h.rows");
  const Row = (l: LieuIndexEntry) => {
    const amount = l.argent_total_eur ?? 0;
    return (
      <Link key={l.slug} href={`${cityBase}/lieu/${l.slug}`} scroll={false} className="fx-fiche-thumbrow" onClick={active ? () => track("search_result_click", { page: "lieux", entity_name: l.name }) : undefined}>
        <span className="im">
          {l.photo ? <NextImage src={l.photo} alt="" fill sizes="88px" style={{ objectFit: "cover" }} /> : <span className="fx-sec-thumb-empty" aria-hidden="true" />}
        </span>
        <span className="tx">
          <span className="t">{l.name} <span aria-hidden="true" className="muted">›</span></span>
          <span className="s">{[l.kind_fr, l.arrondissement > 0 ? arrTxt(l.arrondissement) : null].filter(Boolean).join(" · ")}</span>
        </span>
        {amount > 0 ? <V3Amt {...fmtEur(amount)} /> : <span className="fx-v3-amt tnum muted" title={t("fx.sec.lieux.no_money_amt")}>—</span>}
      </Link>
    );
  };

  const sinceTxt = String(section.since);
  return (
    <div className="theme-fusion">
      <Navbar />
      <main id="main-content" tabIndex={-1}>
        <div className="fx-sec fx-v3">
          <div className="fx-sec-kicker fx-page-kicker fx-page-kicker--links"><Link href={cityBase}>Paris</Link> › {t("fx.sec.lieux.kicker")}</div>
          <div className="fx-sec-grid" data-layout="lieux">
            <div className="fx-sec-a-hero">
              <SectionHero
                title={t("fx.sec.lieux.title")}
                value={total.v}
                unit={total.u}
                captionBefore={fill(t("fx.sec.lieux.cap_before"), { n: fmtInt(section.count), since: sinceTxt })}
                years={[section.lastYear]}
                year={section.lastYear}
                basePath={base}
                meta={fill(t("fx.sec.lieux.meta"), { m: fmtInt(section.withMoney), y: section.oldestArchive ? String(section.oldestArchive) : "1882" })}
                shareTitle={shareTitle}
              />
              {series.length >= RAIL_MIN ? (
                <div className="fx-sec-years" data-section="years">
                  <div className="fx-page-kicker">{t("fx.sec.lieux.years_kicker")}</div>
                  <AnneesRail rows={series} current={section.lastYear} format={eurTxt} />
                  <p className="fx-v3-note">{t("fx.sec.lieux.years_note")}</p>
                </div>
              ) : null}
            </div>

            <div className="fx-sec-a-scene">
              <V3Section id="scene" title={t("fx.sec.lieux.h.scene")} sub={t("fx.sec.lieux.scene_sub")}>
                <div className="fx-sec-scene-body" id="familles">
                  <Bars rows={famRows} />
                </div>
                <ShareButton label={t("fx.sec.share_chart")} done={t("fx.sec.shared")} title={shareTitle} object="familles" anchor="familles" />
              </V3Section>
            </div>

            <div className="fx-sec-a-search" data-section="search">
              <div className="fx-page-kicker">{t("fx.sec.lieux.search_kicker")}</div>
              <div className="fx-search-wrap fx-search-wrap--fiche">
                <div className="fx-search-inner">
                  <div className="fx-search-input-wrap">
                    <span className="fx-search-icon" aria-hidden="true">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><circle cx="11" cy="11" r="7" /><path d="M20 20l-4-4" /></svg>
                    </span>
                    <input className="fx-search-input" type="search" placeholder={t("fx.sec.lieux.search_placeholder")} value={query} onChange={(e) => setQuery(e.target.value)} aria-label={t("fx.sec.lieux.search_kicker")} />
                    {query.length > 0 && (
                      <button type="button" className="fx-search-x" aria-label={t("fx.sec.mp.search_clear")} onClick={() => setQuery("")}>×</button>
                    )}
                  </div>
                  {!active && (
                    <div className="fx-search-seeds">
                      {SEEDS.filter((s) => lieux.some((l) => normSearch(l.name).includes(normSearch(s)))).slice(0, 3).map((s) => (
                        <button key={s} type="button" className="fx-search-seed" onClick={() => { track("search_seed_click", { page: "lieux", seed: s }); setQuery(s); }}>{s}</button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="fx-sec-a-rows">
              <V3Section id="rows" title={rowsTitle} sub={isFiltered ? undefined : fill(t("fx.sec.lieux.rows_sub"), { since: sinceTxt })}>
                <div id="lieux" className="fx-sec-thumbrows">
                  {shownAll.length === 0 ? <p className="fx-v3-sentence">{fill(t("fx.sec.lieux.search_none"), { q })}</p> : shownAll.map(Row)}
                </div>
                {rest.length > 0 ? (
                  <V3Fold id="more-lieux" label={fill(t("fx.sec.lieux.rows_more"), { n: fmtInt(rest.length) })}>
                    <div className="fx-sec-thumbrows">{rest.map(Row)}</div>
                  </V3Fold>
                ) : null}
                {isFiltered ? (
                  <p className="fx-v3-note"><Link href={base}>{t("fx.sec.lieux.rows_all")}</Link></p>
                ) : noMoney > 0 ? (
                  <p className="fx-v3-note">{fill(t("fx.sec.lieux.no_money_note"), { n: fmtInt(noMoney) })}</p>
                ) : null}
              </V3Section>
            </div>

            <div className="fx-sec-a-where">
              <V3Section id="where" title={t("fx.sec.lieux.h.where")} sub={fill(t("fx.sec.lieux.where_sub"), { n: fmtInt(nLoc), amount: eurTxt(amountLoc) })}>
                <div className="fx-sec-switch" role="group" aria-label={t("fx.sec.lieux.g.aria")}>
                  {WHERE_VIEWS.map((v) => (
                    <button key={v} type="button" aria-pressed={where === v} onClick={() => pickWhere(v)}>{t(`fx.sec.lieux.g.${v}`)}</button>
                  ))}
                </div>
                <div id="ou">
                  {where === "carte" ? (
                    <div className="fx-sec-lieux-map">
                      <PlacesMap entries={entries} config={config} visibleSlugs={visibleSlugs} hovered={hovered} onHover={setHovered} />
                    </div>
                  ) : (
                    <>
                      <div className="fx-sec-choro">
                        <ParisChoropleth
                          items={section.arrondissements.map((a) => ({ arr: a.arr, amount: a.amount, count: a.count }))}
                          height={290}
                          showRanking={false}
                          palette={CHORO_BLUE}
                          hrefFor={(n) => `${base}?arrondissement=${n === 0 ? 1 : n}#lieux`}
                        />
                      </div>
                      <Bars rows={arrRows} cap={ARR_CAP} foldId="more-arr" foldLabel={fill(t("fx.sec.lieux.arr_more"), { n: fmtInt(arrRows.length) })} />
                    </>
                  )}
                </div>
                <ShareButton label={t("fx.sec.share_chart")} done={t("fx.sec.shared")} title={shareTitle} object={`where_${where}`} anchor="ou" />
              </V3Section>
            </div>

            <div className="fx-sec-a-understand">
              <V3Section id="understand" title={t("fx.sec.understand")}>
                <V3Fold id="what" label={t("fx.sec.lieux.u.what")}>
                  <p className="fx-v3-sentence">{fill(t("fx.sec.lieux.u.what_body"), { n: fmtInt(section.count) })}</p>
                </V3Fold>
                <V3Fold id="paid" label={t("fx.sec.lieux.u.paid")}>
                  <p className="fx-v3-sentence">{fill(t("fx.sec.lieux.u.paid_body"), { n: fmtInt(noMoney) })}</p>
                </V3Fold>
                <V3Fold id="sources" label={t("fx.sec.lieux.u.source")}>
                  <p className="fx-v3-sentence">{fill(t("fx.sec.lieux.u.source_body"), { y: section.oldestArchive ? String(section.oldestArchive) : "1882" })}</p>
                  <p className="fx-v3-sentence">
                    <a href="https://opendata.paris.fr/explore/dataset/subventions-versees-annexe-compte-administratif-a-partir-de-2018/" target="_blank" rel="noopener noreferrer">opendata.paris.fr ↗</a>
                    {" · "}
                    <a href="https://gallica.bnf.fr/services/engine/search/sru?operation=searchRetrieve&version=1.2&query=arkPress%20all%20%22cb343512457_date%22" target="_blank" rel="noopener noreferrer">{en ? "Municipal bulletin (Gallica)" : "Bulletin municipal (Gallica)"} ↗</a>
                    {" · "}
                    <a href="/data/lieux/index.json" target="_blank" rel="noopener noreferrer">JSON ↗</a>
                    {" · "}
                    <Link href="/methode#outils">{t("fx.s.methode_complete")}</Link>
                  </p>
                </V3Fold>
              </V3Section>
            </div>

            <div className="fx-sec-a-related">
              <V3Section id="related" title={t("fx.sec.see_also")}>
                {doors?.invest ? (
                  <Door href={`${cityBase}/investissements?year=${doors.invest.year}`} hard title={t("fx.sec.lieux.r.invest")} sub={fill(t("fx.sec.lieux.r.invest_sub"), { year: doors.invest.year })} value={fmtEur(doors.invest.total).v} unit={fmtEur(doors.invest.total).u} />
                ) : (
                  <Door href={`${cityBase}/investissements`} hard title={t("fx.sec.lieux.r.invest")} sub={t("fx.sec.lieux.r.invest_sub_noyear")} />
                )}
                {doors?.subventions ? (
                  <Door href={`${cityBase}/subventions?year=${doors.subventions.year}`} hard title={t("fx.sec.lieux.r.subv")} sub={fill(t("fx.sec.lieux.r.subv_sub"), { n: fmtInt(doors.subventions.count), year: doors.subventions.year })} value={fmtEur(doors.subventions.total).v} unit={fmtEur(doors.subventions.total).u} />
                ) : (
                  <Door href={`${cityBase}/subventions`} hard title={t("fx.sec.lieux.r.subv")} sub={t("fx.sec.lieux.r.subv_sub_noyear")} />
                )}
              </V3Section>
            </div>

            <div className="fx-sec-a-next">
              <NextDoor
                href={doors?.next ? `${cityBase}/budget?year=${doors.next.year}` : `${cityBase}/budget`}
                kicker={t("fx.sec.next")}
                title={t("fx.sec.lieux.next")}
                sub={doors?.next ? fill(t(doors.next.voted ? "fx.sec.lieux.next_sub_vote" : "fx.sec.lieux.next_sub_n"), { year: doors.next.year }) : t("fx.sec.lieux.next_sub")}
                value={doors?.next ? fmtEur(doors.next.total).v : undefined}
                unit={doors?.next ? fmtEur(doors.next.total).u : undefined}
              />
            </div>

            <div className="fx-sec-a-foot">
              {DATA_ALERTS_ON ? <DataAlert section="lieux" /> : null}
              <V3Foot>{fill(t("fx.sec.lieux.foot"), { since: sinceTxt })}</V3Foot>
            </div>
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
}
