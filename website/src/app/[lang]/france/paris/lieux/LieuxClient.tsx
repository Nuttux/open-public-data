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
import { useFmt, useFmtMoney, useNumLocale, type Currency } from "@/lib/use-fmt";
import { fill, sufOrdinal } from "@/lib/fmt";
import { useLocale, useT } from "@/lib/localeContext";
import { useTrack } from "@/lib/analyticsContext";
import { useDebouncedTrack, hashQuery, queryShape } from "@/lib/analytics-helpers";
import { normSearch } from "@/lib/search-synonyms";
import type { LieuIndexEntry, LieuxSection } from "@/lib/lieux-data";
import type { LieuxDoors } from "@/lib/lieux-doors";

const PlacesMap = dynamic(() => import("@/components/places/PlacesMap"), { ssr: false, loading: () => <div className="fx-sec-map-wait" aria-hidden="true" /> });

const ROWS_CAP = 8;
const ROWS_CAP_FILTERED = 12;
/** A city whose directory holds many places without an amount (Recife :
 *  1 040 of 1 068) does not unfold them all : the fold keeps the places
 *  with money, and the search finds the rest. */
const FOLD_MAX = 60;

/** How a place's money is counted — it picks the words of the page.
 *  Paris : paid when the City publishes it, contract ceilings otherwise, with
 *  the bulletin archive ; grants : to the place's operator (Marseille) ;
 *  signed : the works contracts naming the place (Recife) ; paid : what the
 *  City paid contractors for work at the place (San Francisco). */
export type LieuxMoney = "paris" | "grants" | "signed" | "paid";
/** The second way to cut the city : numbered arrondissements, bairros, owning departments. */
export type LieuxAreaKind = "arr" | "bairro" | "dept";
export type LieuxFamily = { key: string; color: string; i18n: string };
/** What differs from one city to the next on this page (2026-09-17, Marseille
 *  on the same client ; 2026-09-18, Recife and San Francisco) : addresses,
 *  seeds, currency, how the money is counted, the area, the families, the
 *  map framing, the source lines, and who renders the chrome. */
export type LieuxCity = {
  slug: string;
  name: string;
  /** The city's hub, the section, the prefix of a place's fiche. */
  hub: string;
  section: string;
  fiche: string;
  seeds: string[];
  currency: Currency;
  money: LieuxMoney;
  /** `param` is the name in the address (?arrondissement=18, ?bairro=boa-viagem) ; `max` the highest arrondissement. */
  area: { kind: LieuxAreaKind; param: string; max?: number };
  familyParam: string;
  families?: LieuxFamily[];
  bounds?: [[number, number], [number, number]];
  clampToBounds?: boolean;
  sources: { label: string; href: string }[];
  json: string;
  /** France renders the site bar and the footer here ; San Francisco and Recife get theirs from the registry layout. */
  chrome: "site" | "registry";
};
export const PARIS_LIEUX: LieuxCity = {
  slug: "paris",
  name: "Paris",
  hub: "/france/paris",
  section: "/france/paris/lieux",
  fiche: "/france/paris/lieu",
  seeds: ["Châtelet", "Parc Monceau", "Piscine Pontoise", "Halle Pajol"],
  currency: "EUR",
  money: "paris",
  area: { kind: "arr", param: "arrondissement", max: 20 },
  familyParam: "famille",
  sources: [
    { label: "opendata.paris.fr", href: "https://opendata.paris.fr/explore/dataset/subventions-versees-annexe-compte-administratif-a-partir-de-2018/" },
  ],
  json: "/data/lieux/index.json",
  chrome: "site",
};
/** The i18n suffix of the words that depend on how the money is counted. */
const COPY_SUFFIX: Record<LieuxMoney, string> = { paris: "", grants: "_city", signed: "_signed", paid: "_paid" };
const VIEWS = ["liste", "carte"] as const;
type View = (typeof VIEWS)[number];

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
export default function LieuxClient({ lieux, section, doors, initial, city = PARIS_LIEUX }: {
  lieux: LieuIndexEntry[];
  section: LieuxSection;
  doors?: LieuxDoors;
  city?: LieuxCity;
  /** From the address: ?famille=culture, ?arrondissement=18 (the fiche kickers link here). */
  initial?: { famille?: string | null; area?: string | null };
}) {
  const t = useT();
  const { locale } = useLocale();
  const en = locale === "en";
  const { fmtInt } = useFmt();
  const money = useFmtMoney(city.currency);
  const nl = useNumLocale();
  const track = useTrack();
  const trackDebounced = useDebouncedTrack(700);
  const router = useRouter();
  const families = city.families ?? FAMILLES;
  const arrTxt = (n: number) => `${n}${sufOrdinal(n, locale)}`;
  const famLabel = (key: string) => t(families.find((f) => f.key === key)?.i18n ?? key);
  const base = city.section;
  const isArr = city.area.kind === "arr";
  // The words that depend on how the money is counted : the variant when it
  // exists (`_city`, `_signed`, `_paid`), the Paris line otherwise.
  const sfx = COPY_SUFFIX[city.money];
  const k = (key: string) => {
    if (!sfx) return t(key);
    const v = t(`${key}${sfx}`);
    return v === `${key}${sfx}` ? t(key) : v;
  };
  // « Par arrondissement », « Tous les bairros », « By department »… : one word per kind of area.
  const areaK = (key: string) => t(key === "all" ? `fx.sec.lieux.${city.area.kind}_all` : `fx.sec.lieux.${key}_${city.area.kind}`);

  // On the list: no drill-down chain in progress.
  useEffect(() => { clearDrawerStack(); }, []);

  // ── The areas of the city : arrondissements in order, or the bairros / departments of the section. ──
  const areas = useMemo(() =>
    isArr
      ? section.arrondissements.slice().sort((a, b) => a.arr - b.arr).map((a) => ({ key: String(a.arr), label: arrTxt(a.arr), count: a.count }))
      : (section.areas ?? []).map((a) => ({ key: a.key, label: a.label, count: a.count })),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- arrTxt only reads the locale.
    [section, isArr, locale]);
  const areaLabels = useMemo(() => new Map(areas.map((a) => [a.key, a.label])), [areas]);
  const areaOf = (l: LieuIndexEntry) =>
    isArr
      ? (l.arrondissement > 0 ? { key: String(l.arrondissement), label: arrTxt(l.arrondissement) } : null)
      : (l.areaKey ? { key: l.areaKey, label: l.areaLabel ?? areaLabels.get(l.areaKey) ?? l.areaKey } : null);

  // ── Filters: a family or an area from the address, a name typed. ──
  const famille = initial?.famille && families.some((f) => f.key === initial.famille) ? initial.famille : null;
  const area = initial?.area && areas.some((a) => a.key === initial.area) ? initial.area : null;
  const areaLabel = area ? areas.find((a) => a.key === area)?.label ?? area : null;
  const [query, setQuery] = useState("");
  const q = query.trim();
  const active = q.length >= 2;
  const qNorm = normSearch(q);
  const hrefWith = (next: { famille?: string | null; area?: string | null }) => {
    const f = next.famille === undefined ? famille : next.famille;
    const a = next.area === undefined ? area : next.area;
    const sp = new URLSearchParams();
    if (f) sp.set(city.familyParam, f);
    if (a) sp.set(city.area.param, a);
    const s = sp.toString();
    return `${base}${s ? `?${s}` : ""}#lieux`;
  };

  const byAmount = (a: LieuIndexEntry, b: LieuIndexEntry) => (b.argent_total_eur ?? 0) - (a.argent_total_eur ?? 0) || a.name.localeCompare(b.name, nl);
  const filtered = useMemo(() => {
    let list = lieux;
    if (famille) list = list.filter((l) => l.famille === famille);
    if (area) list = list.filter((l) => areaOf(l)?.key === area);
    if (active) list = list.filter((l) => normSearch(`${l.name} ${l.kind_fr} ${areaOf(l)?.label ?? ""}`).includes(qNorm));
    return list.slice().sort(byAmount);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- areaOf and byAmount only read props and the locale.
  }, [lieux, famille, area, active, qNorm]);
  const isFiltered = !!famille || !!area || active;

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
  const total = money.amt(section.total);
  const sinceTxt = String(section.since);
  const heroVars = { total: money.txt(section.total), n: fmtInt(section.count), m: fmtInt(section.withMoney), f: fmtInt(section.families.length), since: sinceTxt, last: String(section.lastYear), y: section.oldestArchive ? String(section.oldestArchive) : "1882", city: city.name };
  const shareTitle = fill(k("fx.sec.lieux.share_title"), heroVars);
  const series = section.series.map((s) => ({ year: s.year, amount: s.amount }));
  // San Francisco's contract payments carry no year : the number stands without one.
  const hasYears = series.length > 0;

  // ── Families and areas: filters, with how many places each holds ──
  const famCount = (key: string) => section.families.find((f) => f.key === key)?.count ?? 0;

  // ── The list, or the map ──
  const [view, setView] = useState<View>("liste");
  const pickView = (v: View) => {
    if (v === view) return;
    track("filter_change", { page: "lieux", field: "where_view", value: v });
    setView(v);
  };
  const [hovered, setHovered] = useState<string | null>(null);
  const entries = useMemo(() => buildPlaceEntries(lieux.map((l) => (l.areaKey && !l.areaLabel ? { ...l, areaLabel: areaLabels.get(l.areaKey) ?? l.areaKey } : l)), t, nl, { fmtMoney: money.txt }), [lieux, t, nl, money, areaLabels]);
  const config = useMemo(() => buildPlacesConfig(t, nl, {
    bounds: city.bounds ?? [[48.8156, 2.2241], [48.9022, 2.4699]],
    hrefFor: (slug) => `${city.fiche}/${slug}`,
    families: city.families,
    areaLabel: isArr ? undefined : areaK("by"),
    areaSort: isArr ? "numeric" : "alpha",
    clampToBounds: city.clampToBounds,
    minZoom: city.clampToBounds === false ? 10 : undefined,
    // eslint-disable-next-line react-hooks/exhaustive-deps -- areaK only reads t and the city.
  }), [t, nl, city, isArr]);
  const visibleSlugs = useMemo(() => new Set(filtered.map((l) => l.slug)), [filtered]);

  // A small selection with few amounts (Marseille : 3 of 12) shows the places
  // with money, and folds the rest ; the heading says « where the City paid most ».
  const cap = isFiltered ? ROWS_CAP_FILTERED : section.withMoney > 0 && section.withMoney < ROWS_CAP ? Math.max(section.withMoney, 3) : ROWS_CAP;
  const noMoney = section.count - section.withMoney;
  const big = noMoney > FOLD_MAX;
  const shown = filtered.slice(0, cap);
  let rest = filtered.length - shown.length >= 2 ? filtered.slice(cap) : [];
  // A big directory : unfiltered, the fold keeps the places with an amount ;
  // filtered, it stops at FOLD_MAX and the note points to the search.
  if (big && !isFiltered) rest = rest.filter((l) => (l.argent_total_eur ?? 0) > 0);
  const beyondFold = big && isFiltered ? Math.max(0, rest.length - FOLD_MAX) : 0;
  if (beyondFold > 0) rest = rest.slice(0, FOLD_MAX);
  const shownAll = rest.length === 0 && beyondFold === 0 ? filtered : shown;
  const rowsTitle = active
    ? fill(t("fx.sec.lieux.h.rows_q"), { n: fmtInt(filtered.length), q })
    : famille && area
      ? fill(t(isArr ? "fx.sec.lieux.h.rows_fam_arr" : "fx.sec.lieux.h.rows_fam_area"), { fam: famLabel(famille), arr: areaLabel ?? "", area: areaLabel ?? "", n: fmtInt(filtered.length) })
      : famille
        ? fill(t("fx.sec.lieux.h.rows_fam"), { fam: famLabel(famille), n: fmtInt(filtered.length) })
        : area
          ? fill(t(isArr ? "fx.sec.lieux.h.rows_arr" : "fx.sec.lieux.h.rows_area"), { arr: areaLabel ?? "", area: areaLabel ?? "", n: fmtInt(filtered.length) })
          : k("fx.sec.lieux.h.rows");
  const Row = (l: LieuIndexEntry) => {
    const amount = l.argent_total_eur ?? 0;
    const where = areaOf(l);
    return (
      <Link key={l.slug} href={`${city.fiche}/${l.slug}`} scroll={false} className="fx-fiche-thumbrow" onClick={active ? () => track("search_result_click", { page: "lieux", entity_name: l.name }) : undefined}>
        <span className="im">
          {l.photo ? <NextImage src={l.photo} alt="" fill sizes="88px" style={{ objectFit: "cover" }} /> : <span className="fx-sec-thumb-empty" aria-hidden="true" />}
        </span>
        <span className="tx">
          <span className="t">{l.name} <span aria-hidden="true" className="muted">›</span></span>
          <span className="s">{[l.kind_fr, where?.label ?? null].filter(Boolean).join(" · ")}</span>
        </span>
        {amount > 0 ? <V3Amt {...money.amt(amount)} /> : <span className="fx-v3-amt tnum muted" title={k("fx.sec.lieux.no_money_amt")}>—</span>}
      </Link>
    );
  };
  const doorAmt = (n: number | null | undefined) => (n != null ? money.amt(n) : { v: undefined, u: undefined });

  const body = (
    <main id="main-content" tabIndex={-1}>
      <div className="fx-sec fx-v3">
        <div className="fx-sec-kicker fx-page-kicker fx-page-kicker--links"><Link href={city.hub}>{city.name}</Link> › {t("fx.sec.lieux.kicker")}</div>
        <div className="fx-sec-grid" data-layout="lieux">
          <div className="fx-sec-a-hero">
            <SectionHero
              title={t("fx.sec.lieux.title")}
              value={total.v}
              unit={total.u}
              captionBefore={fill(k("fx.sec.lieux.cap_before"), heroVars)}
              years={hasYears ? [section.lastYear] : []}
              year={section.lastYear}
              basePath={base}
              meta={fill(k("fx.sec.lieux.meta"), heroVars)}
              shareTitle={shareTitle}
            />
            {series.length >= RAIL_MIN ? (
              <div className="fx-sec-years" data-section="years">
                <div className="fx-page-kicker">{k("fx.sec.lieux.years_kicker")}</div>
                <AnneesRail rows={series} current={section.lastYear} format={money.txt} />
                <p className="fx-v3-note">{k("fx.sec.lieux.years_note")}</p>
              </div>
            ) : null}
          </div>

          <div className="fx-sec-a-rows">
            <V3Section id="rows" title={rowsTitle} sub={isFiltered ? undefined : fill(k("fx.sec.lieux.rows_sub"), heroVars)}>
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
                        {beyondFold > 0 ? <p className="fx-v3-note">{fill(areaK("rows_more_search"), { n: fmtInt(beyondFold) })}</p> : null}
                      </V3Fold>
                    ) : null}
                  </>
                )}
              </div>
              {isFiltered ? (
                <p className="fx-v3-note"><Link href={base}>{t("fx.sec.lieux.rows_all")}</Link></p>
              ) : noMoney > 0 ? (
                <p className="fx-v3-note">{fill(k("fx.sec.lieux.no_money_note"), { n: fmtInt(noMoney) })}</p>
              ) : null}
              <ShareButton label={t("fx.sec.share_chart")} done={t("fx.sec.shared")} title={shareTitle} object={`lieux_${view}`} anchor="lieux" />
            </V3Section>
          </div>

          {/* The way in, under the list (Daniel, 16/09): a name, a family, an area. Filters, never rankings. */}
          <div className="fx-sec-a-find">
            <V3Section id="find" title={t("fx.sec.lieux.h.find")} sub={areaK("find_sub")}>
              <div className="fx-search-wrap fx-search-wrap--fiche fx-sec-lieux-search">
                <div className="fx-search-inner">
                  <div className="fx-search-input-wrap">
                    <span className="fx-search-icon" aria-hidden="true">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><circle cx="11" cy="11" r="7" /><path d="M20 20l-4-4" /></svg>
                    </span>
                    <input className="fx-search-input" type="search" placeholder={k("fx.sec.lieux.search_placeholder")} value={query} onChange={(e) => setQuery(e.target.value)} aria-label={t("fx.sec.lieux.h.find")} />
                    {query.length > 0 && (
                      <button type="button" className="fx-search-x" aria-label={t("fx.sec.mp.search_clear")} onClick={() => setQuery("")}>×</button>
                    )}
                  </div>
                  {!active && (
                    <div className="fx-search-seeds">
                      {city.seeds.filter((s) => lieux.some((l) => normSearch(l.name).includes(normSearch(s)))).slice(0, 3).map((s) => (
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
                    {families.map((f) => (
                      <Link key={f.key} href={hrefWith({ famille: famille === f.key ? null : f.key })} className={famille === f.key ? "is-on" : ""} aria-pressed={famille === f.key}>
                        {t(f.i18n)} <b className="tnum">{fmtInt(famCount(f.key))}</b>
                      </Link>
                    ))}
                  </div>
                </div>
                {areas.length > 0 ? (
                  <label className="fx-sec-lieux-arr">
                    <span className="fx-page-kicker">{areaK("by")}</span>
                    <select value={area ?? ""} onChange={(e) => { const v = e.target.value || null; track("filter_change", { page: "lieux", field: city.area.kind, value: v ?? "all" }); router.push(hrefWith({ area: v }), { scroll: false }); }}>
                      <option value="">{areaK("all")}</option>
                      {areas.map((a) => <option key={a.key} value={a.key}>{isArr ? fill(t("fx.sec.lieux.arr_label"), { arr: a.label }) : a.label} · {fmtInt(a.count)}</option>)}
                    </select>
                  </label>
                ) : null}
              </div>
            </V3Section>
          </div>

          <div className="fx-sec-a-understand">
            <V3Section id="understand" title={t("fx.sec.understand")}>
              <V3Fold id="what" label={k("fx.sec.lieux.u.what")}>
                <p className="fx-v3-sentence">{fill(k("fx.sec.lieux.u.what_body"), heroVars)}</p>
              </V3Fold>
              <V3Fold id="paid" label={k("fx.sec.lieux.u.paid")}>
                <p className="fx-v3-sentence">{fill(k("fx.sec.lieux.u.paid_body"), { ...heroVars, n: fmtInt(noMoney) })}</p>
              </V3Fold>
              <V3Fold id="sources" label={t("fx.sec.lieux.u.source")}>
                <p className="fx-v3-sentence">{fill(k("fx.sec.lieux.u.source_body"), heroVars)}</p>
                <p className="fx-v3-sentence">
                  {city.sources.map((src) => (
                    <span key={src.href}><a href={src.href} target="_blank" rel="noopener noreferrer">{src.label} ↗</a>{" · "}</span>
                  ))}
                  {city.money === "paris" ? (
                    <><a href="https://gallica.bnf.fr/services/engine/search/sru?operation=searchRetrieve&version=1.2&query=arkPress%20all%20%22cb343512457_date%22" target="_blank" rel="noopener noreferrer">{en ? "Municipal bulletin (Gallica) ↗" : "Bulletin municipal (Gallica) ↗"}</a>{" · "}</>
                  ) : null}
                  <a href={city.json} target="_blank" rel="noopener noreferrer">JSON ↗</a>
                  {" · "}
                  <Link href="/methode#outils">{t("fx.s.methode_complete")}</Link>
                </p>
              </V3Fold>
            </V3Section>
          </div>

          {doors && doors.related.length > 0 ? (
            <div className="fx-sec-a-related">
              <V3Section id="related" title={t("fx.sec.see_also")}>
                {doors.related.map((d) => (
                  <Door key={d.href} href={d.href} hard title={t(d.title)} sub={fill(t(d.sub), d.vars ?? {})} value={doorAmt(d.amount).v} unit={doorAmt(d.amount).u} />
                ))}
              </V3Section>
            </div>
          ) : null}

          {doors?.next ? (
            <div className="fx-sec-a-next">
              <NextDoor
                href={doors.next.href}
                kicker={t("fx.sec.next")}
                title={t(doors.next.title)}
                sub={fill(t(doors.next.sub), doors.next.vars ?? {})}
                value={doorAmt(doors.next.amount).v}
                unit={doorAmt(doors.next.amount).u}
              />
            </div>
          ) : null}

          <div className="fx-sec-a-foot">
            {DATA_ALERTS_ON && city.slug === "paris" ? <DataAlert section="lieux" /> : null}
            <V3Foot>{fill(k("fx.sec.lieux.foot"), heroVars)}</V3Foot>
          </div>
        </div>
      </div>
    </main>
  );
  if (city.chrome === "registry") return body;
  return (
    <div className="theme-fusion">
      <Navbar />
      {body}
      <Footer />
    </div>
  );
}
