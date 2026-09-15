"use client";
import { useState } from "react";
import dynamic from "next/dynamic";
import Link from "@/components/LocalizedLink";
import { usePathname } from "@/lib/navigation";
import { citySlugFromPathname } from "@/lib/methodology";
import { cityDataUrl } from "@/lib/city-paths";
import Navbar from "@/components/fusion/Navbar";
import Footer from "@/components/fusion/Footer";
import AnneesRail, { RAIL_MIN } from "@/components/fusion/AnneesRail";
import SectionHero from "@/components/fiche/SectionHero";
import ShareButton from "@/components/fiche/ShareButton";
import Bars, { type BarRow } from "@/components/fiche/Bars";
import { Door, NextDoor } from "@/components/fiche/Doors";
import { V3Fold, V3Foot, V3Row, V3Section } from "@/components/fiche/v3";
import SubventionsSearch from "./SubventionsSearch";
import { useFmt, useFmtEur } from "@/lib/use-fmt";
import { fill } from "@/lib/fmt";
import { useLocale, useT } from "@/lib/localeContext";
import { useTrack } from "@/lib/analyticsContext";
import { trLabel } from "@/lib/label-translate";
import { slugifyLabel } from "@/lib/projet-utils";
import { assocSlug } from "@/lib/assoc-slug";
import { displayOrgName } from "@/lib/fournisseur-display";
import type { BlogPostMeta } from "@/lib/blog";
import type { QuiRecoitData } from "@/lib/fusion-data";

// The beeswarm only when someone asks for it: a third way to cut the same
// number, measured before it earns the first screen back.
const SubventionsBeeswarm = dynamic(() => import("@/components/fusion/SubventionsBeeswarm"), { ssr: false, loading: () => <div className="fx-sec-map-wait" aria-hidden="true" /> });

/** The three ways the scene cuts the year's grants. One chart, one switch. */
type Group = "theme" | "benef" | "nuee";
const GROUPS: Group[] = ["theme", "benef", "nuee"];
type QuiRecoitIndex = { availableYears: number[]; previewYears?: number[] };

const CITY_NAMES: Record<string, string> = { paris: "Paris", marseille: "Marseille" };
// Five themes face the number and its rail (the columns end together); the
// sixteen are one fold away.
const THEMES_CAP = 5;

/**
 * La section « Subventions » sur la grammaire des fiches (2026-09-15) : le
 * chiffre (les subventions versées dans l'année) avec sa phrase, le mouvement
 * en ocre qui nomme qui l'explique, le rail 2010-2024 (années votées
 * hachurées) et les trois bénéficiaires en photo dessous ; UNE scène qui fait
 * la somme du chiffre — par thème vers les fiches thème, par bénéficiaire (dix
 * lignes et « les autres » : la concentration sans échelle log), la nuée en
 * troisième lentille chargée à la demande — ; la recherche en bande ; « Ce qui
 * a bougé » (hausses et baisses, le delta en ocre) face à « Voir aussi » ;
 * « Comprendre » en replis ; la section suivante. Marseille partage la page :
 * sans thèmes ni photos, la scène reste par bénéficiaire.
 */
export default function SubventionsClient({ idx, d, posts, doors }: {
  idx: QuiRecoitIndex;
  d: QuiRecoitData;
  posts: BlogPostMeta[];
  /** Numbers for the doors, loaded by the page (absent on cities without them). */
  doors?: {
    budget?: { year: number; total: number; voted: boolean } | null;
    marches?: { year: number; total: number } | null;
    next?: { year: number; total: number } | null;
  };
}) {
  const t = useT();
  const { locale } = useLocale();
  const track = useTrack();
  const fmt = useFmt();
  const { fmtDec, fmtCompactEur } = fmt;
  // Inter draws the narrow no-break space of « 5 977 » as almost nothing.
  const fmtInt = (n: number) => fmt.fmtInt(n).replace(/ /g, " ");
  const fmtEur = useFmtEur();
  const citySlug = citySlugFromPathname(usePathname());
  const cityName = CITY_NAMES[citySlug] ?? citySlug.charAt(0).toUpperCase() + citySlug.slice(1);
  const cityBase = `/france/${citySlug}`;
  const base = `${cityBase}/subventions`;
  const isParis = citySlug === "paris";
  const total = fmtCompactEur(d.total);
  const eurTxt = (n: number) => { const f = fmtEur(n); return `${f.v} ${f.u}`; };
  const Amt = ({ n }: { n: number }) => { const f = fmtEur(n); return <span className="fx-v3-amt tnum" style={{ fontSize: 14 }}>{f.v}<span className="u">{f.u}</span></span>; };
  const nSubv = (n: number) => fill(t(n === 1 ? "fx.sec.subv.n_subv_one" : "fx.sec.subv.n_subv"), { n: fmtInt(n) });
  const years = idx.availableYears.slice().sort((a, b) => a - b);
  const preview = new Set(idx.previewYears ?? d.yearsSummary.filter((y) => y.preview).map((y) => y.year));

  // The number's grey line, and the movement under it: the year against the
  // one before (consolidated years only), naming the recipient whose own
  // change is a part of it — same sign, a third to all of it.
  const meta = fill(t("fx.sec.subv.meta"), { n: fmtInt(d.nbSubventions), b: fmtInt(d.nbBeneficiaires) });
  const prev = d.yearsSummary.find((y) => y.year === d.previousYear && !y.preview && y.total > 0);
  const move = !d.isPreview && prev
    ? (() => {
        const pct = ((d.total - prev.total) / prev.total) * 100;
        if (Math.abs(pct) < 0.5) return fill(t("fx.sec.mp.move_flat"), { year: prev.year });
        const base0 = fill(t(pct > 0 ? "fx.sec.mp.move_up" : "fx.sec.mp.move_down"), { pct: fmtDec(Math.abs(pct), 1), year: prev.year });
        const change = d.total - prev.total;
        const top = [...d.movers.hausses, ...d.movers.baisses]
          .filter((m) => m.delta !== 999)
          .map((m) => ({ name: m.name, dAmt: m.amount - m.amount / (1 + m.delta / 100) }))
          .filter((x) => Math.sign(x.dAmt) === Math.sign(change))
          .sort((a, b) => Math.abs(b.dAmt) - Math.abs(a.dAmt))[0];
        const part = top && Math.abs(top.dAmt) >= Math.abs(change) / 3 && Math.abs(top.dAmt) <= Math.abs(change);
        return part
          ? base0 + fill(t("fx.sec.subv.move_of_which"), { sign: top.dAmt > 0 ? "+" : "−", amount: eurTxt(Math.abs(top.dAmt)), name: displayOrgName(top.name) })
          : base0;
      })()
    : undefined;
  const series = d.yearsSummary.filter((y) => y.total > 0).map((y) => ({ year: y.year, amount: y.total }));
  const provisional = d.yearsSummary.filter((y) => y.preview).map((y) => y.year);
  const shareTitle = fill(t("fx.sec.subv.share_title"), { city: cityName, total: `${total.value} ${total.unit}`, year: d.year });

  // The scene: three cuts of the same euros. Every cut sums to the number.
  const hasThemes = d.byTheme.filter((th) => th.theme !== "Autres").length >= 2;
  const [group, setGroup] = useState<Group>(hasThemes ? "theme" : "benef");
  const groups = hasThemes ? GROUPS : GROUPS.filter((g) => g !== "theme");
  const themeRows: BarRow[] = d.byTheme.map((th) => ({
    key: th.theme,
    label: trLabel(th.theme, locale),
    value: th.amount,
    text: eurTxt(th.amount),
    sub: th.count > 0 ? nSubv(th.count) : undefined,
    href: isParis && th.theme !== "Autres" ? `${base}/theme/${slugifyLabel(th.theme)}?year=${d.year}` : null,
  }));
  const top10Sum = d.top10.reduce((s, b) => s + b.amount, 0);
  const restBenef = Math.max(0, d.total - top10Sum);
  const restRow: BarRow | undefined = restBenef > d.total * 0.005
    ? { key: "__rest", label: fill(t("fx.sec.subv.rest_benef"), { n: fmtInt(Math.max(0, d.nbBeneficiaires - d.top10.length)) }), value: restBenef, text: eurTxt(restBenef), tone: "soft" }
    : undefined;
  const benefRows: BarRow[] = d.top10.map((b) => ({
    key: b.name,
    label: displayOrgName(b.name),
    value: b.amount,
    text: eurTxt(b.amount),
    sub: [b.theme ? trLabel(b.theme, locale) : null, nSubv(b.nb)].filter(Boolean).join(" · "),
    href: `${base}/association/${assocSlug(b.name)}`,
  }));
  const pickGroup = (g: Group) => {
    if (g === group) return;
    track("filter_change", { page: "subventions", field: "scene_group", value: g });
    setGroup(g);
  };

  // Three real recipients with a real photo, chosen by rule: the material of
  // this section, under the years rail.
  // One card alone is thinner than none: the block needs two real photos.
  const realPhotos = d.exemples.filter((e) => e.photoUrl && e.photoKind === "reelle");
  const exemples = realPhotos.length >= 2 ? realPhotos : [];
  const exKicker = (e: QuiRecoitData["exemples"][number]) =>
    e.kind === "fidele" ? fill(t("fx.sec.subv.ex.fidele"), { since: e.sinceYear ?? years[0] }) : t(`fx.sec.subv.ex.${e.kind}`);

  // What moved: recipients above the noise thresholds, up and down.
  const showMovers = !d.isPreview && d.movers.hausses.length + d.movers.baisses.length > 0;
  const MoverRow = (m: QuiRecoitData["movers"]["hausses"][number]) => (
    <V3Row key={m.name} href={`${base}/association/${assocSlug(m.name)}`}
      label={displayOrgName(m.name)}
      subText={<span className="fx-delta">{m.delta === 999 ? fill(t("fx.sec.subv.movers_new"), { prev: d.previousYear }) : fill(t(m.delta > 0 ? "fx.sec.mp.move_up" : "fx.sec.mp.move_down"), { pct: fmtDec(Math.abs(m.delta), 0), year: d.previousYear })}</span>}
      amount={<Amt n={m.amount} />} />
  );

  const pp = d.personnesPhysiques;

  return (
    <div className="theme-fusion">
      <Navbar />
      <main id="main-content" tabIndex={-1}>
        <div className="fx-sec fx-v3">
          <div className="fx-sec-kicker fx-page-kicker fx-page-kicker--links"><Link href={cityBase}>{cityName}</Link> › {t("fx.sec.subv.kicker")}</div>
          {/* Bands: « Ce qui a bougé » (ten rows) faces « Voir aussi » and « Comprendre »
              stacked; without movers (a voted year), « Comprendre » faces « Voir aussi ». */}
          <div className="fx-sec-grid" data-layout={showMovers ? "subventions" : "subventions-lite"}>
            <div className="fx-sec-a-hero">
              <SectionHero
                title={t("fx.sec.subv.title")}
                value={total.value}
                unit={total.unit}
                captionBefore={t(d.isPreview ? "fx.sec.subv.cap_before_preview" : "fx.sec.subv.cap_before")}
                years={years}
                year={d.year}
                basePath={base}
                meta={meta}
                move={move}
                shareTitle={shareTitle}
                yearLabel={(y) => (preview.has(y) ? `${y} · ${t("fx.sec.subv.preview_short")}` : String(y))}
              />
              {series.length >= RAIL_MIN ? (
                <div className="fx-sec-years" data-section="years">
                  <div className="fx-page-kicker">{t("fx.sec.years")}</div>
                  <AnneesRail rows={series} current={d.year} provisional={provisional} />
                </div>
              ) : null}
              {exemples.length > 0 ? (
                <V3Section id="examples" title={fill(t("fx.sec.subv.h.examples"), { year: d.year })}>
                  <div className="fx-sec-ex">
                    {exemples.map((e) => {
                      const href = `${base}/association/${assocSlug(e.name)}`;
                      return (
                        <figure key={e.name} className="fx-sec-ex-card" data-block="photo">
                          <Link href={href} scroll={false} className="fx-sec-ex-img" aria-hidden="true" tabIndex={-1}>
                            <img src={e.photoUrl!} alt="" loading="lazy" />
                          </Link>
                          <figcaption>
                            <span className="k">{exKicker(e)}</span>
                            <Link href={href} scroll={false} className="t">{displayOrgName(e.name)} ›</Link>
                            <span className="s">{[e.theme ? trLabel(e.theme, locale) : null, eurTxt(e.amount)].filter(Boolean).join(" · ")}</span>
                            {e.photoCredit ? <span className="c">{fill(t("fx.sec.mp.photo_credit"), { credit: e.photoCredit })}</span> : null}
                          </figcaption>
                        </figure>
                      );
                    })}
                  </div>
                </V3Section>
              ) : null}
            </div>

            <div className="fx-sec-a-scene">
              <V3Section id="scene" title={fill(t("fx.sec.subv.h.scene"), { year: d.year })} sub={t("fx.sec.subv.scene_sub")}>
                <div className="fx-sec-switch" role="group" aria-label={t("fx.sec.subv.g.aria")}>
                  {groups.map((g) => (
                    <button key={g} type="button" aria-pressed={group === g} onClick={() => pickGroup(g)}>{t(`fx.sec.subv.g.${g}`)}</button>
                  ))}
                </div>
                <div className="fx-sec-scene-body" id="repartition">
                  {group === "theme" ? (
                    <Bars key="theme" rows={themeRows} cap={THEMES_CAP} foldId="more-themes" foldLabel={fill(t("fx.sec.subv.themes_more"), { n: fmtInt(themeRows.length) })} />
                  ) : group === "benef" ? (
                    <Bars key="benef" rows={benefRows} footRow={restRow} />
                  ) : (
                    <div className="fx-sec-nuee">
                      <p className="fx-v3-h2sub">{t("fx.sec.subv.nuee_sub")}</p>
                      <SubventionsBeeswarm year={d.year} swarmUrl={cityDataUrl(citySlug, `subventions/swarm_${d.year}.json`)} ficheBase={base} />
                    </div>
                  )}
                </div>
                <ShareButton label={t("fx.sec.share_chart")} done={t("fx.sec.shared")} title={shareTitle} object={`scene_${group}`} anchor="repartition" />
              </V3Section>
            </div>

            {/* Right after the first screen, as a band: for whoever came with a name in mind. */}
            <div className="fx-sec-a-search">
              <section className="fx-v3-section fx-sec-searchblk" data-section="search">
                <div className="fx-page-kicker">{t("fx.sec.subv.h.search")}</div>
                <SubventionsSearch citySlug={citySlug} year={d.year} />
              </section>
            </div>

            <div className="fx-sec-a-rows">
              {showMovers ? (
                <V3Section id="movers" title={fill(t("fx.sec.subv.h.movers"), { prev: d.previousYear })} sub={t("fx.sec.subv.movers_sub")}>
                  {d.movers.hausses.length > 0 ? <div className="fx-page-kicker fx-sec-movers-k">{t("fx.sec.subv.movers_up")}</div> : null}
                  {d.movers.hausses.map(MoverRow)}
                  {d.movers.baisses.length > 0 ? <div className="fx-page-kicker fx-sec-movers-k">{t("fx.sec.subv.movers_down")}</div> : null}
                  {d.movers.baisses.map(MoverRow)}
                </V3Section>
              ) : null}
            </div>

            <div className="fx-sec-a-related">
              <V3Section id="related" title={t("fx.sec.see_also")}>
                {/* Doors are named like the sections in the menu; the year and the number sit in the grey line and at the right. */}
                {doors?.budget ? (
                  <Door href={`${cityBase}/budget?year=${doors.budget.year}`} hard title={t("fx.sec.subv.r.budget")} sub={fill(t(doors.budget.voted ? "fx.sec.subv.r.budget_sub_vote" : "fx.sec.subv.r.budget_sub"), { year: doors.budget.year })} value={fmtCompactEur(doors.budget.total).value} unit={fmtCompactEur(doors.budget.total).unit} />
                ) : (
                  <Door href={`${cityBase}/budget`} hard title={t("fx.sec.subv.r.budget")} sub={t("fx.sec.subv.r.budget_sub_noyear")} />
                )}
                {doors?.marches ? (
                  <Door href={`${cityBase}/marches?year=${doors.marches.year}`} hard title={t("fx.sec.subv.r.marches")} sub={fill(t("fx.sec.subv.r.marches_sub"), { year: doors.marches.year })} value={fmtCompactEur(doors.marches.total).value} unit={fmtCompactEur(doors.marches.total).unit} />
                ) : (
                  <Door href={`${cityBase}/marches`} hard title={t("fx.sec.subv.r.marches")} sub={t("fx.sec.subv.r.marches_sub_noyear")} />
                )}
                <Door href={`${base}/associations`} hard title={t("fx.sec.subv.r.index")} sub={t("fx.sec.subv.r.index_sub")} value={fmtInt(d.nbBeneficiaires)} unit={t("fx.sec.subv.n_benef").replace("{n} ", "")} />
                {posts.map((p) => (
                  <V3Row key={p.slug} href={`/analyses/${p.slug}`} label={p.title} subText={t("fx.sec.subv.r.read")} />
                ))}
              </V3Section>
            </div>

            <div className="fx-sec-a-understand">
              <V3Section id="understand" title={t("fx.sec.understand")}>
                <V3Fold id="measure" label={t("fx.sec.subv.u.measure")}>
                  <p className="fx-v3-sentence">{t("fx.sec.subv.u.measure_body")}</p>
                  {d.isPreview ? <p className="fx-v3-sentence">{fill(t("fx.sec.subv.u.measure_preview"), { year: d.year })}</p> : null}
                </V3Fold>
                {d.concentrationTop10Pct >= 30 ? (
                  <V3Fold id="concentration" label={fill(t("fx.sec.subv.u.conc"), { pct: fmtDec(d.concentrationTop10Pct, 0) })}>
                    <p className="fx-v3-sentence">{fill(t("fx.sec.subv.u.conc_body"), { median: eurTxt(d.medianSubvention) })}</p>
                  </V3Fold>
                ) : null}
                {pp.amount > 0 ? (
                  <V3Fold id="people" label={t("fx.sec.subv.u.people")}>
                    <p className="fx-v3-sentence">
                      {pp.count != null && pp.count > 0
                        ? fill(t("fx.sec.subv.u.people_body"), { year: d.year, amount: eurTxt(pp.amount), n: fmtInt(pp.count) })
                        : fill(t("fx.sec.subv.u.people_body_nocount"), { year: d.year, amount: eurTxt(pp.amount) })}
                    </p>
                  </V3Fold>
                ) : null}
                <V3Fold id="sources" label={t("fx.sec.subv.u.source")}>
                  <p className="fx-v3-sentence">{t(isParis ? "fx.sec.subv.u.source_body" : "fx.sec.subv.u.source_body_city")}</p>
                  <p className="fx-v3-sentence">
                    {isParis ? (
                      <>
                        <a href="https://opendata.paris.fr/explore/dataset/subventions-versees-annexe-compte-administratif-a-partir-de-2018/" target="_blank" rel="noopener noreferrer">opendata.paris.fr ↗</a>
                        {" · "}
                      </>
                    ) : null}
                    <a href={cityDataUrl(citySlug, `subventions/beneficiaires_${d.year}.json`)} target="_blank" rel="noopener noreferrer">JSON {d.year} ↗</a>
                    {" · "}
                    <Link href="/methode?tool=subventions#outils">{t("fx.s.methode_complete")}</Link>
                  </p>
                </V3Fold>
              </V3Section>
            </div>

            <div className="fx-sec-a-next">
              <NextDoor
                href={`${cityBase}/logement`}
                kicker={t("fx.sec.next")}
                title={t("fx.sec.subv.next")}
                sub={doors?.next ? fill(t("fx.sec.subv.next_sub_n"), { year: doors.next.year }) : t("fx.sec.subv.next_sub")}
                value={doors?.next ? fmtInt(doors.next.total) : undefined}
                unit={doors?.next ? t("fx.sec.subv.next_unit") : undefined}
              />
            </div>

            <div className="fx-sec-a-foot">
              <V3Foot>{t(isParis ? "fx.sec.subv.foot" : "fx.sec.subv.foot_city")}</V3Foot>
            </div>
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
}
