"use client";

import { useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import NextImage from "next/image";
import Link from "@/components/LocalizedLink";
import Navbar from "@/components/fusion/Navbar";
import Footer from "@/components/fusion/Footer";
import AnneesRail, { RAIL_MIN } from "@/components/fusion/AnneesRail";
import SectionHero from "@/components/fiche/SectionHero";
import ShareButton from "@/components/fiche/ShareButton";
import { Door, NextDoor } from "@/components/fiche/Doors";
import { V3Amt, V3Fold, V3Foot, V3Section } from "@/components/fiche/v3";
import DataAlert, { DATA_ALERTS_ON } from "@/components/fusion/DataAlert";
import { FAMILLES, buildPlaceEntries, buildPlacesConfig } from "@/components/fusion/LieuxExplorer";
import { clearDrawerStack } from "@/components/fusion/DetailDrawer";
import { useRouter } from "@/lib/navigation";
import { useFmt, useFmtEur, useNumLocale } from "@/lib/use-fmt";
import { fill, sufOrdinal } from "@/lib/fmt";
import { useLocale, useT } from "@/lib/localeContext";
import { useTrack } from "@/lib/analyticsContext";
import { useDebouncedTrack, hashQuery, queryShape } from "@/lib/analytics-helpers";
import { normSearch } from "@/lib/search-synonyms";
import type { LieuIndexEntry, LieuxSection } from "@/lib/lieux-data";

const PlacesMap = dynamic(() => import("@/components/places/PlacesMap"), { ssr: false, loading: () => <div className="fx-sec-map-wait" aria-hidden="true" /> });

const ROWS_CAP = 8;
const ROWS_CAP_FILTERED = 12;
const SEEDS = ["Châtelet", "Parc Monceau", "Piscine Pontoise", "Halle Pajol"];
const VIEWS = ["liste", "carte"] as const;
type View = (typeof VIEWS)[number];

export type LieuxDoors = {
  invest?: { year: number; total: number } | null;
  subventions?: { year: number; total: number; count: number } | null;
  next?: { year: number; total: number; voted: boolean } | null;
};

/**
 * The Lieux section on the fiche grammar (2026-09-16). The number (what the
 * City paid or signed for 225 places since 2010) and the year rail of what
 * was really paid; then the way in — a name, a family, an arrondissement;
 * then the places where the City paid the most, with their photo, the map
 * behind a switch; Comprendre, Voir aussi, the next section.
 *
 * No ranking by family or by arrondissement: the 225 places are our own
 * selection, and a sum over a selection ranks the selection, not Paris
 * (Daniel, 2026-09-16). Families and arrondissements are filters.
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
  const router = useRouter();
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
  const hrefWith = (next: { famille?: string | null; arr?: number | null }) => {
    const f = next.famille === undefined ? famille : next.famille;
    const a = next.arr === undefined ? arr : next.arr;
    const sp = new URLSearchParams();
    if (f) sp.set("famille", f);
    if (a) sp.set("arrondissement", String(a));
    const s = sp.toString();
    return `${base}${s ? `?${s}` : ""}#lieux`;
  };

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

  // ── Families and arrondissements: filters, with how many places each holds ──
  const famCount = (key: string) => section.families.find((f) => f.key === key)?.count ?? 0;
  const arrs = section.arrondissements.slice().sort((a, b) => a.arr - b.arr);

  // ── The list, or the map ──
  const [view, setView] = useState<View>("liste");
  const pickView = (v: View) => {
    if (v === view) return;
    track("filter_change", { page: "lieux", field: "where_view", value: v });
    setView(v);
  };
  const [hovered, setHovered] = useState<string | null>(null);
  const entries = useMemo(() => buildPlaceEntries(lieux, t, nl), [lieux, t, nl]);
  const config = useMemo(() => buildPlacesConfig(t, nl), [t, nl]);
  const visibleSlugs = useMemo(() => new Set(filtered.map((l) => l.slug)), [filtered]);

  const cap = isFiltered ? ROWS_CAP_FILTERED : ROWS_CAP;
  const shown = filtered.slice(0, cap);
  const rest = filtered.length - shown.length >= 2 ? filtered.slice(cap) : [];
  const shownAll = rest.length === 0 ? filtered : shown;
  const noMoney = section.count - section.withMoney;
  const rowsTitle = active
    ? fill(t("fx.sec.lieux.h.rows_q"), { n: fmtInt(filtered.length), q })
    : famille && arr
      ? fill(t("fx.sec.lieux.h.rows_fam_arr"), { fam: famLabel(famille), arr: arrTxt(arr), n: fmtInt(filtered.length) })
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

            {/* The way in: a name, a family, an arrondissement. Filters, never rankings. */}
            <div className="fx-sec-a-scene">
              <V3Section id="find" title={t("fx.sec.lieux.h.find")} sub={t("fx.sec.lieux.find_sub")}>
                <div className="fx-search-wrap fx-search-wrap--fiche fx-sec-lieux-search">
                  <div className="fx-search-inner">
                    <div className="fx-search-input-wrap">
                      <span className="fx-search-icon" aria-hidden="true">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><circle cx="11" cy="11" r="7" /><path d="M20 20l-4-4" /></svg>
                      </span>
                      <input className="fx-search-input" type="search" placeholder={t("fx.sec.lieux.search_placeholder")} value={query} onChange={(e) => setQuery(e.target.value)} aria-label={t("fx.sec.lieux.h.find")} />
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
                <div className="fx-sec-lieux-filters">
                  <div>
                    <div className="fx-page-kicker">{t("fx.sec.lieux.by_family")}</div>
                    <div className="fx-sec-lieux-chips" role="group" aria-label={t("fx.sec.lieux.by_family")}>
                      {FAMILLES.map((f) => (
                        <Link key={f.key} href={hrefWith({ famille: famille === f.key ? null : f.key })} className={famille === f.key ? "is-on" : ""} aria-pressed={famille === f.key}>
                          {t(f.i18n)} <b className="tnum">{fmtInt(famCount(f.key))}</b>
                        </Link>
                      ))}
                    </div>
                  </div>
                  <label className="fx-sec-lieux-arr">
                    <span className="fx-page-kicker">{t("fx.sec.lieux.by_arr")}</span>
                    <select value={arr ?? ""} onChange={(e) => { const v = e.target.value ? Number(e.target.value) : null; track("filter_change", { page: "lieux", field: "arrondissement", value: v ?? "all" }); router.push(hrefWith({ arr: v }), { scroll: false }); }}>
                      <option value="">{t("fx.sec.lieux.arr_all")}</option>
                      {arrs.map((a) => <option key={a.arr} value={a.arr}>{fill(t("fx.sec.lieux.arr_label"), { arr: arrTxt(a.arr) })} · {fmtInt(a.count)}</option>)}
                    </select>
                  </label>
                </div>
              </V3Section>
            </div>

            <div className="fx-sec-a-rows">
              <V3Section id="rows" title={rowsTitle} sub={isFiltered ? undefined : fill(t("fx.sec.lieux.rows_sub"), { since: sinceTxt })}>
                <div className="fx-sec-switch" role="group" aria-label={t("fx.sec.lieux.g.aria")}>
                  {VIEWS.map((v) => (
                    <button key={v} type="button" aria-pressed={view === v} onClick={() => pickView(v)}>{t(`fx.sec.lieux.g.${v}`)}</button>
                  ))}
                </div>
                <div id="lieux">
                  {view === "carte" ? (
                    <div className="fx-sec-lieux-map">
                      <PlacesMap entries={entries} config={config} visibleSlugs={visibleSlugs} hovered={hovered} onHover={setHovered} />
                    </div>
                  ) : (
                    <>
                      <div className="fx-sec-thumbrows">
                        {shownAll.length === 0 ? <p className="fx-v3-sentence">{fill(t("fx.sec.lieux.search_none"), { q })}</p> : shownAll.map(Row)}
                      </div>
                      {rest.length > 0 ? (
                        <V3Fold id="more-lieux" label={fill(t("fx.sec.lieux.rows_more"), { n: fmtInt(rest.length) })}>
                          <div className="fx-sec-thumbrows">{rest.map(Row)}</div>
                        </V3Fold>
                      ) : null}
                    </>
                  )}
                </div>
                {isFiltered ? (
                  <p className="fx-v3-note"><Link href={base}>{t("fx.sec.lieux.rows_all")}</Link></p>
                ) : noMoney > 0 ? (
                  <p className="fx-v3-note">{fill(t("fx.sec.lieux.no_money_note"), { n: fmtInt(noMoney) })}</p>
                ) : null}
                <ShareButton label={t("fx.sec.share_chart")} done={t("fx.sec.shared")} title={shareTitle} object={`lieux_${view}`} anchor="lieux" />
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
