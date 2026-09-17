"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "@/components/LocalizedLink";
import AnneesRail, { RAIL_MIN } from "@/components/fusion/AnneesRail";
import SectionHero from "@/components/fiche/SectionHero";
import ShareButton from "@/components/fiche/ShareButton";
import { Door, NextDoor } from "@/components/fiche/Doors";
import { V3Fold, V3Foot, V3Row, V3Section } from "@/components/fiche/v3";
import { useT } from "@/lib/localeContext";
import { useTrack } from "@/lib/analyticsContext";
import { useDebouncedTrack, hashQuery, queryShape } from "@/lib/analytics-helpers";
import { normSearch, expandQuery, matchExpanded } from "@/lib/search-synonyms";
import { fill } from "@/lib/fmt";
import { fmtUsdAmt, fmtUsdCompact, fmtShare } from "@/lib/us/format";
import { deptSlug } from "@/lib/us/sf-budget-slugs";
import { FAMILY_LABELS, contractLabel, deptDisplayName, typeLabel, typeSlug } from "./us-sf-contracts-types";
import type { SfActiveRow, SfContractsOverview } from "./us-sf-contracts-types";
import type { SfActiveDigest } from "./page";
import type { SfDeptBar, SfPrimesData } from "./data";

/**
 * San Francisco's contracts on the section grammar (2026-09-18), the same
 * page as Paris's Marchés publics and Recife's Contratos : the number (what
 * the contracts running today commit) with the rail of when they were
 * signed ; the scene (where the money goes : by category, department,
 * supplier, legal basis of the award, each line opening its fiche) ; the
 * biggest contracts, each opening its page, with a search over the whole
 * active register fetched on the first keystroke ; Understand ; See also ;
 * the next section ; the source. EN-only (ADR-0010 D3) : `us.sf.ct3.*`.
 *
 * Every number comes from the exports or from a server-side sum over their
 * rows (page.tsx digest) ; the only client arithmetic is shares of those.
 */

const BASE = "/usa/san-francisco";
const CT = `${BASE}/contracts`;
const SLICES = 8;
const ROWS = 8;
const ROWS_Q = 12;
const ROWS_MAX = 40;

type Lens = "type" | "dept" | "supplier" | "authority";
const LENSES: Lens[] = ["type", "dept", "supplier", "authority"];

export type SfContractsDoors = {
  payees: { fy: number; total: number } | null;
  budget: { fy: number; total: number } | null;
  payroll: { fy: number; total: number; n: number } | null;
};

const int = new Intl.NumberFormat("en-US");
const fmtEnd = (iso: string | null) => (iso ? new Intl.DateTimeFormat("en-US", { month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(iso)) : null);
const short = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1).replace(/\s+\S*$/, "")}…` : s);

const BRAND_SEEDS = ["McKesson", "Turner", "Siemens", "HealthRight 360", "Alstom", "Recology", "Hensel Phelps"];
const THEME_SEEDS = ["housing", "mental health", "pharmacy", "shelter", "food", "security"];

type RowLite = { contract_no: string; label: string; prime: string | null; department: string | null; agreed_usd: number; paid_usd: number; sole_source: boolean; paid_exceeds_agreed: boolean; end: string | null };

export default function SfContractsClient({ overview, active, primes, deptBars, doors }: {
  overview: SfContractsOverview;
  active: SfActiveDigest;
  primes: SfPrimesData;
  deptBars: SfDeptBar[];
  doors: SfContractsDoors;
}) {
  const t = useT();
  const track = useTrack();
  const trackDebounced = useDebouncedTrack(700);
  const hero = overview.hero;
  const dq = overview.data_quality;
  const sole = overview.sole_source;
  const Amt = ({ n }: { n: number }) => { const f = fmtUsdAmt(n); return <span className="fx-v3-amt tnum" style={{ fontSize: 14 }}>{f.v}<span className="u">{f.u}</span></span>; };

  /* ── The number : what the contracts running today commit ── */
  const agreed = primes.active_agreed_usd;
  const total = fmtUsdAmt(agreed);
  const shareTitle = fill(t("us.sf.ct3.share_title"), { total: fmtUsdCompact(agreed), n: int.format(hero.active.n_contracts) });
  const rail = active.byStartYear;
  const railLast = rail[rail.length - 1]?.year ?? new Date().getFullYear();

  /* ── The scene : where the money goes, four readings ── */
  const [lens, setLens] = useState<Lens>("type");
  const pickLens = (l: Lens) => {
    if (l === lens) return;
    track("filter_change", { page: "us-sf-contracts", field: "scene_lens", value: l });
    setLens(l);
  };
  type Slice = { key: string; label: string; amount: number; count: number; href: string | null };
  const slices: Slice[] = useMemo(() => {
    const list: Slice[] = lens === "type"
      ? active.types.map((v) => ({ key: v.raw, label: typeLabel(v.raw), amount: v.amount, count: v.count, href: `${CT}/type/${typeSlug(v.raw)}` }))
      : lens === "dept"
        ? deptBars.map((x) => ({ key: x.code, label: deptDisplayName(x.name), amount: x.agreed_usd, count: x.n_contracts, href: `${CT}/dept/${deptSlug(x.code)}` }))
        : lens === "supplier"
          ? primes.rows.map((p) => ({ key: p.name, label: p.name, amount: p.agreed_usd, count: p.n_contracts, href: p.payee_slug ? `${BASE}/who-gets-paid/payee/${p.payee_slug}` : `${CT}/contract/${p.top_contract_no}` }))
          : active.authorities.map((v) => ({ key: v.raw, label: FAMILY_LABELS[v.raw] ?? v.raw, amount: v.amount, count: v.count, href: `${CT}/authority/${v.raw}` }));
    return list.filter((s) => s.amount > 0).sort((a, b) => b.amount - a.amount).slice(0, SLICES);
  }, [lens, active, deptBars, primes]);
  const sliceMax = slices[0]?.amount ?? 1;
  const otherAmount = Math.max(0, agreed - slices.reduce((s, x) => s + x.amount, 0));
  const otherCount = lens === "dept" ? Math.max(0, overview.departments.length - slices.length) : lens === "supplier" ? Math.max(0, primes.n_primes - slices.length) : 0;
  const otherLabel = lens === "dept" ? fill(t("us.sf.ct3.other_dept"), { n: int.format(otherCount) }) : lens === "supplier" ? fill(t("us.sf.ct3.other_supplier"), { n: int.format(otherCount) }) : t(`us.sf.ct3.other_${lens}`);
  const sceneNote = lens === "type"
    ? fill(t("us.sf.ct3.scene_note_type"), { lbe: fmtUsdCompact(overview.lbe.prime.agreed_usd), np: int.format(overview.non_profit.n_contracts) })
    : lens === "supplier"
      ? fill(t("us.sf.ct3.scene_note_supplier"), { share: fmtShare(primes.top10_share), total: int.format(primes.n_primes) })
      : lens === "dept"
        ? t("us.sf.ct3.scene_note_dept")
        : t("us.sf.ct3.scene_note_authority");

  /* ── The biggest contracts, the filters, and the search over the whole active register ── */
  const [query, setQuery] = useState("");
  const [dept, setDept] = useState("");
  const [ctype, setCtype] = useState("");
  const [soleOnly, setSoleOnly] = useState(false);
  const q = query.trim();
  const hasText = q.length >= 2;
  const filtersOn = hasText || Boolean(dept) || Boolean(ctype) || soleOnly;
  // The 5 000 rows (3.3 MB) only come when someone searches or filters, once.
  const [rows, setRows] = useState<SfActiveRow[] | null>(null);
  const [loading, setLoading] = useState(false);
  const fetchedRef = useRef(false);
  useEffect(() => {
    if (!filtersOn || fetchedRef.current) return;
    fetchedRef.current = true;
    setLoading(true);
    fetch(active.rowsUrl)
      .then((r) => r.json())
      .then((f: { rows?: SfActiveRow[] }) => setRows(f.rows ?? []))
      .catch(() => setRows([]))
      .finally(() => setLoading(false));
  }, [filtersOn, active.rowsUrl]);
  const hay = useMemo(() => (rows ?? []).map((r) => normSearch(`${r.title} ${r.title_plain || ""} ${r.title_clear || ""} ${r.what_concretely || ""} ${r.prime || ""} ${r.department || ""}`)), [rows]);
  const filtered: RowLite[] = useMemo(() => {
    if (!filtersOn) return active.top;
    if (!rows) return [];
    const exp = expandQuery(query);
    const out: RowLite[] = [];
    rows.forEach((r, i) => {
      if (dept && r.department_code !== dept) return;
      if (ctype && r.contract_type !== ctype) return;
      if (soleOnly && !r.sole_source) return;
      if (hasText && !matchExpanded(hay[i], exp).match) return;
      out.push({ contract_no: r.contract_no, label: contractLabel(r), prime: r.prime ?? null, department: r.department ?? null, agreed_usd: r.agreed_usd, paid_usd: r.paid_usd, sole_source: r.sole_source, paid_exceeds_agreed: r.paid_exceeds_agreed, end: r.end ?? null });
    });
    return out.sort((a, b) => b.agreed_usd - a.agreed_usd);
  }, [filtersOn, rows, hay, query, dept, ctype, soleOnly, hasText, active.top]);
  useEffect(() => {
    if (!hasText || loading) return;
    let cancelled = false;
    (async () => {
      const h = await hashQuery(q);
      if (cancelled) return;
      trackDebounced("search_submit", { page: "us-sf-contracts", q_hash: h, ...queryShape(q), results_count: filtered.length });
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- filtered is fresh in the closure ; fire on the query only.
  }, [q, hasText, loading]);
  const cap = filtersOn ? ROWS_Q : ROWS;
  const shown = filtered.slice(0, cap);
  const rest = filtered.length - cap >= 2 ? filtered.slice(cap, ROWS_MAX) : [];
  const shownAll = rest.length ? shown : filtered.slice(0, cap);
  const beyond = Math.max(0, filtered.length - shown.length - rest.length);
  // No dead chips : a seed shows only when the ranking or the loaded rows answer it.
  const seeds = useMemo(() => {
    const pool = rows ?? null;
    const alive = (s: string) => {
      if (!pool) return active.top.some((r) => normSearch(`${r.label} ${r.prime ?? ""}`).includes(normSearch(s)));
      const exp = expandQuery(s);
      return pool.some((_, i) => matchExpanded(hay[i], exp).match);
    };
    const brands = BRAND_SEEDS.filter(alive).slice(0, 3);
    const themes = pool ? THEME_SEEDS.filter(alive).slice(0, 3) : [];
    return [...brands, ...themes];
  }, [rows, hay, active.top]);
  const reset = () => { setQuery(""); setDept(""); setCtype(""); setSoleOnly(false); };
  const Row = (r: RowLite) => {
    const ratio = r.agreed_usd > 0 ? r.paid_usd / r.agreed_usd : null;
    const paidTxt = r.paid_exceeds_agreed ? t("us.sf.ct3.row_paid_over") : ratio != null ? fill(t("us.sf.ct3.row_paid"), { pct: `${Math.round(ratio * 100)}%` }) : null;
    const end = fmtEnd(r.end);
    return (
      <V3Row
        key={r.contract_no}
        href={`${CT}/contract/${r.contract_no}`}
        label={short(r.label, 96)}
        subText={[r.prime ? short(r.prime, 44) : null, r.department ? deptDisplayName(r.department) : null, paidTxt, r.sole_source ? t("us.sf.contracts.search.badge_sole") : null, end ? fill(t("us.sf.ct3.row_ends"), { d: end }) : null].filter(Boolean).join(" · ")}
        amount={<Amt n={r.agreed_usd} />}
        onClick={hasText ? () => track("search_result_click", { page: "us-sf-contracts", entity_id: r.contract_no }) : undefined}
      />
    );
  };
  const rowsTitle = hasText ? fill(t("us.sf.ct3.h.rows_q"), { n: int.format(filtered.length), q }) : filtersOn ? fill(t("us.sf.ct3.h.rows_f"), { n: int.format(filtered.length) }) : t("us.sf.ct3.h.rows");

  /* ── Understand ── */
  const stability = sole.stability ? `Between ${fmtShare(sole.stability.share_min)} and ${fmtShare(sole.stability.share_max)} of the contracts started each year since ${sole.stability.year_from} carry the flag.` : "";
  const grants = overview.landscape.grants;

  return (
    <main id="main-content" tabIndex={-1}>
      <div className="fx-sec fx-v3">
        <div className="fx-sec-kicker fx-page-kicker fx-page-kicker--links"><Link href={BASE}>San Francisco</Link> › {t("us.sf.ct3.kicker")}</div>
        <div className="fx-sec-grid" data-layout="subventions">
          <div className="fx-sec-a-hero">
            <SectionHero
              title={t("us.sf.ct3.title")}
              value={total.v}
              unit={total.u}
              captionBefore={fill(t("us.sf.ct3.cap_before"), { n: int.format(hero.active.n_contracts) })}
              years={[]}
              year={railLast}
              basePath={CT}
              meta={fill(t("us.sf.ct3.meta"), { paid: fmtUsdCompact(hero.active.paid_usd), register: int.format(hero.register.n_contracts), primes: int.format(primes.n_primes) })}
              shareTitle={shareTitle}
            />
            {rail.length >= RAIL_MIN ? (
              <div className="fx-sec-years" data-section="years">
                <div className="fx-page-kicker">{t("us.sf.ct3.years_kicker")}</div>
                <AnneesRail rows={rail} current={railLast} format={fmtUsdCompact} />
                <p className="fx-v3-note">{t("us.sf.ct3.years_note")}{active.beforeRail ? ` ${fmtUsdCompact(active.beforeRail.amount)} started before ${rail[0].year}.` : ""}</p>
              </div>
            ) : null}
          </div>

          <div className="fx-sec-a-scene">
            <V3Section id="scene" title={t("us.sf.ct3.h.scene")} sub={fill(t("us.sf.ct3.scene_sub"), { agreed: fmtUsdCompact(agreed), n: int.format(hero.active.n_contracts) })} hint={t("us.sf.ct3.scene_hint")}>
              <div id="ct-scene" className="fx-bud-cols fx-bud-cols--one">
                <div className="fx-bud-col">
                  <h3>
                    <span className="fx-sec-switch" role="group" aria-label={t("us.sf.ct3.g.aria")}>
                      {LENSES.map((l) => (
                        <button key={l} type="button" aria-pressed={lens === l} onClick={() => pickLens(l)}>{t(`us.sf.ct3.g.${l}`)}</button>
                      ))}
                    </span>
                    <span className="tnum">{fmtUsdCompact(agreed)}</span>
                  </h3>
                  {slices.map((s) => {
                    const body = (
                      <>
                        <span className="n">
                          {s.label}
                          <i className="bar" style={{ width: `${Math.max(2, Math.round((s.amount / sliceMax) * 100))}%` }} aria-hidden="true" />
                        </span>
                        <span className="sp" />
                        <Amt n={s.amount} />
                        <span className="p tnum">{Math.round((s.amount / agreed) * 100)} %</span>
                        <span className="c" aria-hidden="true">{s.href ? "›" : ""}</span>
                      </>
                    );
                    return s.href ? <Link key={s.key} href={s.href} scroll={false} className="fx-bud-row" data-peek={`${int.format(s.count)} contracts`}>{body}</Link> : <div key={s.key} className="fx-bud-row fx-bud-row--static">{body}</div>;
                  })}
                  {otherAmount > agreed * 0.005 ? (
                    <div className="fx-bud-row fx-bud-row--static">
                      <span className="n">{otherLabel}</span>
                      <span className="sp" /><Amt n={otherAmount} /><span className="p tnum">{Math.round((otherAmount / agreed) * 100)} %</span><span className="c" />
                    </div>
                  ) : null}
                </div>
              </div>
              <p className="fx-v3-note">{sceneNote}</p>
              <ShareButton label={t("fx.sec.share_chart")} done={t("fx.sec.shared")} title={shareTitle} object={`scene_${lens}`} anchor="ct-scene" />
            </V3Section>
          </div>

          <div className="fx-sec-a-search">
            <V3Section id="rows" title={rowsTitle} sub={filtersOn ? undefined : fill(t("us.sf.ct3.rows_sub"), { n: int.format(active.n_rows) })} hint={t("fx.v3.rows.aide")}>
              <div className="fx-search-wrap fx-search-wrap--fiche fx-sec-lieux-search">
                <div className="fx-search-inner">
                  <div className="fx-search-input-wrap">
                    <span className="fx-search-icon" aria-hidden="true">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><circle cx="11" cy="11" r="7" /><path d="M20 20l-4-4" /></svg>
                    </span>
                    <input className="fx-search-input" type="search" placeholder={t("us.sf.contracts.search.placeholder")} value={query} onChange={(e) => setQuery(e.target.value)} aria-label={t("us.sf.ct3.find_aria")} />
                    {query.length > 0 && (
                      <button type="button" className="fx-search-x" aria-label={t("fx.sec.mp.search_clear")} onClick={() => setQuery("")}>×</button>
                    )}
                  </div>
                  {!filtersOn && seeds.length > 0 && (
                    <div className="fx-search-seeds">
                      {seeds.map((s) => (
                        <button key={s} type="button" className="fx-search-seed" onClick={() => { track("search_seed_click", { page: "us-sf-contracts", seed: s }); setQuery(s); }}>{s}</button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
              <div className="fx-sec-lieux-filters fx-sec-wgp-filters">
                <label className="fx-sec-lieux-arr">
                  <span className="fx-page-kicker">{t("us.sf.ct3.by_dept")}</span>
                  <select value={dept} onChange={(e) => { track("filter_change", { page: "us-sf-contracts", field: "department", value: e.target.value || "all" }); setDept(e.target.value); }}>
                    <option value="">{t("us.sf.contracts.search.all_depts")}</option>
                    {active.departments.map((x) => <option key={x.code} value={x.code}>{short(deptDisplayName(x.name), 44)}</option>)}
                  </select>
                </label>
                <label className="fx-sec-lieux-arr">
                  <span className="fx-page-kicker">{t("us.sf.ct3.by_type")}</span>
                  <select value={ctype} onChange={(e) => { track("filter_change", { page: "us-sf-contracts", field: "contract_type", value: e.target.value || "all" }); setCtype(e.target.value); }}>
                    <option value="">{t("us.sf.contracts.search.all_types")}</option>
                    {[...active.types].sort((a, b) => b.amount - a.amount).map((x) => <option key={x.raw} value={x.raw}>{short(typeLabel(x.raw), 48)}</option>)}
                  </select>
                </label>
                <label className="fx-sec-wgp-check">
                  <input type="checkbox" checked={soleOnly} onChange={(e) => { track("filter_change", { page: "us-sf-contracts", field: "sole_source_only", value: e.target.checked }); setSoleOnly(e.target.checked); }} />
                  <span>{t("us.sf.ct3.sole_only")}</span>
                </label>
              </div>
              {loading ? <p className="fx-v3-sentence">{fill(t("us.sf.ct3.loading"), { n: int.format(active.n_rows) })}</p> : null}
              {!loading && shownAll.length === 0 ? <p className="fx-v3-sentence">{t("us.sf.ct3.empty")}</p> : shownAll.map(Row)}
              {rest.length > 0 ? (
                <V3Fold id="more-rows" label={fill(t("us.sf.ct3.rows_more"), { n: int.format(rest.length) })}>
                  {rest.map(Row)}
                  {beyond > 0 ? <p className="fx-v3-note">{fill(t("us.sf.ct3.rows_beyond"), { n: int.format(beyond) })}</p> : null}
                </V3Fold>
              ) : null}
              {filtersOn ? <p className="fx-v3-note"><button type="button" className="fx-link-btn" onClick={() => { track("filter_reset", { page: "us-sf-contracts" }); reset(); }}>{t("us.sf.ct3.rows_all")}</button></p> : null}
            </V3Section>
          </div>

          <div className="fx-sec-a-understand">
            <V3Section id="understand" title={t("fx.sec.understand")}>
              <V3Fold id="active" label={t("us.sf.ct3.u.active")}>
                <p className="fx-v3-sentence">{fill(t("us.sf.ct3.u.active_body"), { register: int.format(hero.register.n_contracts), registerAgreed: fmtUsdCompact(hero.register.agreed_usd), expired: int.format(hero.register.n_expired), n: int.format(hero.active.n_contracts), activeDef: hero.active_definition })}</p>
              </V3Fold>
              <V3Fold id="paid" label={t("us.sf.ct3.u.paid")}>
                <p className="fx-v3-sentence">{fill(t("us.sf.ct3.u.paid_body"), { paidDef: hero.paid_definition, nOver: int.format(active.n_paid_exceeds_agreed), dq: dq.notes })}</p>
              </V3Fold>
              <V3Fold id="sole" label={fill(t("us.sf.ct3.u.sole"), { pct: fmtShare(sole.share_of_contracts) })}>
                <p className="fx-v3-sentence">{fill(t("us.sf.ct3.u.sole_body"), { def: sole.flag_definition, n: int.format(sole.n_contracts), agreed: fmtUsdCompact(sole.agreed_usd), active: int.format(sole.active.n_contracts), stability })}</p>
                <p className="fx-v3-sentence"><Link href={`${CT}/authority/sole_source_waiver`}>{FAMILY_LABELS.sole_source_waiver} ›</Link></p>
              </V3Fold>
              {grants ? (
                <V3Fold id="grants" label={t("us.sf.ct3.u.grants")}>
                  <p className="fx-v3-sentence">{fill(t("us.sf.ct3.u.grants_body"), { n: int.format(grants.n_contracts), agreed: fmtUsdCompact(grants.agreed_usd), share: fmtShare(grants.share_of_register_agreed) })}</p>
                </V3Fold>
              ) : null}
              <V3Fold id="sources" label={t("us.sf.ct3.u.source")}>
                <p className="fx-v3-sentence">{fill(t("us.sf.ct3.u.source_body"), { nGen: int.format(active.n_title_clear) })}</p>
                <p className="fx-v3-sentence">
                  <a href={overview.source.source_url} target="_blank" rel="noopener noreferrer">{overview.source.name} · DataSF ↗</a>
                  {" · "}
                  <a href="/data/us/sf/contracts_overview.json" target="_blank" rel="noopener noreferrer">contracts_overview.json ↗</a>
                  {" · "}
                  <a href={active.rowsUrl} target="_blank" rel="noopener noreferrer">contracts_active.json ↗</a>
                  {" · "}
                  <Link href={`${BASE}/sources#sec-contracts`}>{t("us.sf.bud3.u.method")}</Link>
                </p>
              </V3Fold>
            </V3Section>
          </div>

          <div className="fx-sec-a-related">
            <V3Section id="related-doors" title={t("fx.sec.see_also")}>
              {doors.payees ? (
                <Door href={`${BASE}/who-gets-paid?year=${doors.payees.fy}`} hard title={t("us.sf.ct3.r.payees")} sub={fill(t("us.sf.ct3.r.payees_sub"), { y: doors.payees.fy })} value={fmtUsdAmt(doors.payees.total).v} unit={fmtUsdAmt(doors.payees.total).u} />
              ) : (
                <Door href={`${BASE}/who-gets-paid`} hard title={t("us.sf.ct3.r.payees")} sub={t("us.sf.ct3.r.payees_sub_noyear")} />
              )}
              {doors.budget ? (
                <Door href={`${BASE}/budget?year=${doors.budget.fy}`} hard title={t("us.sf.wgp3.r.budget")} sub={fill(t("us.sf.wgp3.r.budget_sub"), { y: doors.budget.fy })} value={fmtUsdAmt(doors.budget.total).v} unit={fmtUsdAmt(doors.budget.total).u} />
              ) : (
                <Door href={`${BASE}/budget`} hard title={t("us.sf.wgp3.r.budget")} sub={t("us.sf.wgp3.r.budget_sub_noyear")} />
              )}
            </V3Section>
          </div>

          <div className="fx-sec-a-next">
            <NextDoor
              href={`${BASE}/payroll`}
              kicker={t("fx.sec.next")}
              title={t("us.sf.ct3.next")}
              sub={doors.payroll ? fill(t("us.sf.ct3.next_sub"), { n: int.format(doors.payroll.n), y: doors.payroll.fy }) : t("us.sf.ct3.next_sub_noyear")}
              value={doors.payroll ? fmtUsdAmt(doors.payroll.total).v : undefined}
              unit={doors.payroll ? fmtUsdAmt(doors.payroll.total).u : undefined}
            />
          </div>

          <div className="fx-sec-a-foot">
            <V3Foot>{fill(t("us.sf.ct3.foot"), { src: overview.source.attribution || "SF Controller’s Office", name: overview.source.name })}</V3Foot>
          </div>
        </div>
      </div>
    </main>
  );
}
