"use client";

import Link from "next/link";
import SectionHead from "@/components/fusion/SectionHead";
import PageTOC from "@/components/fusion/PageTOC";
import PageIntro, { IntroStat } from "@/components/fusion/PageIntro";
import AnimatedNumber from "@/components/fusion/AnimatedNumber";
import BarRow from "@/components/fusion/BarRow";
import SoleSourceTrend from "./SoleSourceTrend";
import ExpandableList from "@/components/fusion/ExpandableList";
import Tip from "@/components/fusion/Tip";
import { useT } from "@/lib/localeContext";
import { fmtUsdCompact, fmtShare } from "@/lib/us/format";
import SfContractsSearch from "./SfContractsSearch";
import { FAMILY_LABELS, typeLabel } from "./us-sf-contracts-types";
import type { SfContractsActive, SfContractsOverview } from "./us-sf-contracts-types";

/**
 * /us/city/sf/contracts — EN-only (ADR-0010 D3): every string goes through
 * `us.sf.contracts.*` keys whose EN and FR values are identical English.
 * Every number comes from the two exports; the only client arithmetic is
 * shares already present in the files or min/max over exported rows.
 */

const fill = (s: string, vars: Record<string, string | number>) => {
  let r = s;
  for (const [k, v] of Object.entries(vars)) r = r.split(`{${k}}`).join(String(v));
  return r;
};

const nfInt = new Intl.NumberFormat("en-US");

/** Per-section visible source line — local copy of the /us/national helper
 *  (2nd use; promote to a shared module on the 3rd, rule of three). */
function SourceLine({
  label,
  links,
  dataWord,
}: {
  label: string;
  links: Array<{ name: string; href: string }>;
  dataWord: string;
}) {
  return (
    <figcaption className="fx-chart-source">
      <b>{label}:</b>{" "}
      {links.map((l, i) => (
        <span key={l.href}>
          {i > 0 && <span className="sep">·</span>}
          {l.name}{" "}
          <a href={l.href} target="_blank" rel="noopener noreferrer">
            {dataWord} ↗
          </a>
        </span>
      ))}
    </figcaption>
  );
}

export default function SfContractsClient({
  overview,
  active,
}: {
  overview: SfContractsOverview;
  active: SfContractsActive;
}) {
  const t = useT();
  const hero = overview.hero;
  const sole = overview.sole_source;
  const lbe = overview.lbe;
  const dq = overview.data_quality;

  const typesShown = overview.landscape.by_type.slice(0, 10);
  const typesRest = overview.landscape.by_type.slice(10);
  const restAgreed = typesRest.reduce((s, r) => s + r.agreed_usd, 0);
  const restN = typesRest.reduce((s, r) => s + r.n_contracts, 0);


  const polRow = sole.by_department.find((d) => d.department_code === "POL");
  const dphRow = sole.by_department.find((d) => d.department_code === "DPH");

  // Sole-source share over time — only the stability window (start years with
  // enough recorded starts); older years are a thin, biased residue.
  const soleTrendPoints = sole.stability
    ? sole.by_start_year.filter(
        (p) => p.year >= sole.stability!.year_from && p.year <= sole.stability!.year_to,
      )
    : [];

  const heroVars = {
    nActive: nfInt.format(hero.active.n_contracts),
    agreed: fmtUsdCompact(hero.active.agreed_usd),
    paid: fmtUsdCompact(hero.active.paid_usd),
    grants: overview.landscape.grants ? fmtUsdCompact(overview.landscape.grants.agreed_usd) : "",
  };

  return (
    <div>
      <main id="main-content" tabIndex={-1}>
        <PageTOC
          items={[
            { id: "sec-sole-source", label: t("us.sf.contracts.toc.sole") },
            { id: "sec-landscape", label: t("us.sf.contracts.toc.landscape") },
            { id: "sec-lbe", label: t("us.sf.contracts.toc.lbe") },
            { id: "sec-search", label: t("us.sf.contracts.toc.search") },
            { id: "sec-authorities", label: t("us.sf.contracts.toc.authorities") },
          ]}
        />

        {/* ── Opener: folds the former "01 active portfolio" overview ── */}
        <PageIntro
          title={
            <>
              {t("us.sf.contracts.title.before")}
              <em>{t("us.sf.contracts.title.em")}</em>
            </>
          }
          lede={fill(t("us.sf.contracts.lede"), {
            n: nfInt.format(hero.register.n_contracts),
            nActive: heroVars.nActive,
          })}
          stats={
            <>
              <IntroStat
                value={<AnimatedNumber value={hero.active.agreed_usd} format={(n) => fmtUsdCompact(n)} />}
                label={fill(t("us.sf.contracts.s01.hero_label"), { n: heroVars.nActive })}
              />
              <IntroStat
                value={<AnimatedNumber value={hero.active.paid_usd} format={(n) => fmtUsdCompact(n)} />}
                label={t("us.sf.contracts.s01.kpi.paid")}
              />
              {overview.landscape.grants && (
                <IntroStat
                  value={
                    <AnimatedNumber
                      value={overview.landscape.grants.share_of_register_agreed * 100}
                      format={(n) => n.toFixed(1)}
                    />
                  }
                  unit="%"
                  label={t("us.sf.contracts.s01.kpi.grants")}
                />
              )}
              <IntroStat
                value={<AnimatedNumber value={hero.register.n_contracts} format={(n) => nfInt.format(Math.round(n))} />}
                label={
                  <Tip label={t("us.sf.contracts.s01.kpi.register.tip")}>
                    {t("us.sf.contracts.s01.kpi.register")}
                  </Tip>
                }
              />
              <IntroStat
                value={<AnimatedNumber value={sole.share_of_contracts * 100} format={(n) => n.toFixed(1)} />}
                unit="%"
                label={
                  <Tip label={sole.flag_definition}>
                    {t("us.sf.contracts.s01.kpi.sole")}
                  </Tip>
                }
              />
              <IntroStat
                value={<AnimatedNumber value={lbe.prime.agreed_usd} format={(n) => fmtUsdCompact(n)} />}
                label={
                  <Tip label={t("us.sf.contracts.s01.kpi.lbe.tip")}>
                    {t("us.sf.contracts.s01.kpi.lbe")}
                  </Tip>
                }
              />
              <IntroStat
                value={<AnimatedNumber value={overview.non_profit.n_contracts} format={(n) => nfInt.format(Math.round(n))} />}
                label={
                  <Tip label={overview.non_profit.flag_definition}>
                    {t("us.sf.contracts.s01.kpi.np")}
                  </Tip>
                }
              />
            </>
          }
        >
          <SourceLine
            label={t("us.sf.contracts.source_label")}
            dataWord={t("us.sf.contracts.source_data_word")}
            links={[{ name: overview.source.name, href: overview.source.source_url }]}
          />
        </PageIntro>

        {/* Sole-source (hoisted to first section) */}
        <section className="fx-section" id="sec-sole-source">
          <div className="fx-wrap">
            <SectionHead
              title={
                <>
                  <Tip label={t("us.sf.contracts.s03.sub")}>
                    {t("us.sf.contracts.s03.title.before")}
                  </Tip>
                  <em>{t("us.sf.contracts.s03.title.em")}</em>
                </>
              }
              subtitle={t("us.sf.contracts.s03.subtitle")}
            />

            {/* Twin-stat panel (Paris S05 layout) */}
            <div
              style={{
                border: "1px solid var(--ink)",
                padding: "22px 22px 18px",
                background: "var(--bg)",
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
                gap: 28,
                alignItems: "baseline",
              }}
            >
              <div>
                <div style={{ fontFamily: "var(--f-mono)", fontSize: 11, letterSpacing: ".08em", textTransform: "uppercase", color: "var(--muted)", marginBottom: 8 }}>
                  <Tip label={sole.flag_definition}>{t("us.sf.contracts.s03.stat1.label")}</Tip>
                </div>
                <div style={{ fontFamily: "var(--f-disp)", fontSize: 56, fontWeight: 700, letterSpacing: "-0.03em", lineHeight: 1 }}>
                  {(sole.share_of_contracts * 100).toFixed(1)}
                  <span style={{ fontSize: ".45em", fontWeight: 500, marginLeft: 4 }}>%</span>
                </div>
                <div style={{ fontFamily: "var(--f-mono)", fontSize: 11.5, color: "var(--muted)", marginTop: 6 }}>
                  {fill(t("us.sf.contracts.s03.stat1.sub"), { n: nfInt.format(sole.n_contracts) })}
                </div>
              </div>
              <div>
                <div style={{ fontFamily: "var(--f-mono)", fontSize: 11, letterSpacing: ".08em", textTransform: "uppercase", color: "var(--muted)", marginBottom: 8 }}>
                  {t("us.sf.contracts.s03.stat2.label")}
                </div>
                <div style={{ fontFamily: "var(--f-disp)", fontSize: 56, fontWeight: 700, letterSpacing: "-0.03em", lineHeight: 1 }}>
                  {fmtUsdCompact(sole.agreed_usd)}
                </div>
                <div style={{ fontFamily: "var(--f-mono)", fontSize: 11.5, color: "var(--muted)", marginTop: 6 }}>
                  {fill(t("us.sf.contracts.s03.stat2.sub"), {
                    share: fmtShare(sole.share_of_agreed),
                    paid: fmtUsdCompact(sole.paid_usd),
                  })}
                </div>
              </div>
            </div>

            <p className="fx-note" style={{ marginTop: 14 }}>
              {fill(t("us.sf.contracts.s03.neutral_active"), {
                active: nfInt.format(sole.active.n_contracts),
              })}
              {sole.stability && (
                <span title={sole.stability.note}>
                  {" "}
                  {fill(t("us.sf.contracts.s03.neutral_range"), {
                    min: (sole.stability.share_min * 100).toFixed(1),
                    max: (sole.stability.share_max * 100).toFixed(1),
                    y0: sole.stability.year_from,
                    y1: sole.stability.year_to,
                    floor: nfInt.format(sole.stability.min_starts_floor),
                  })}
                </span>
              )}
            </p>

            {(polRow || dphRow) && (
              <p style={{ margin: "18px 0 10px", fontFamily: "var(--f-ui)", fontSize: 14.5, lineHeight: 1.6, color: "var(--ink-2)" }}>
                {polRow && (
                  <>
                    {fill(t("us.sf.contracts.s03.pol"), {
                      share: fmtShare(polRow.share_of_dept_agreed ?? 0),
                    })}{" "}
                  </>
                )}
                {dphRow &&
                  fill(t("us.sf.contracts.s03.dph"), {
                    n: nfInt.format(dphRow.n_sole),
                    share: fmtShare(dphRow.share_of_dept_contracts),
                    agreed: fmtUsdCompact(dphRow.sole_agreed_usd),
                  })}
              </p>
            )}

            {soleTrendPoints.length > 1 && sole.stability && (
              <figure style={{ margin: "8px 0 6px" }}>
                <SoleSourceTrend
                  points={soleTrendPoints}
                  legend={t("us.sf.contracts.s03.trend.legend")}
                  ariaLabel={fill(t("us.sf.contracts.s03.trend.aria"), {
                    y0: sole.stability.year_from,
                    y1: sole.stability.year_to,
                  })}
                />
                <figcaption className="fx-chart-source">
                  {fill(t("us.sf.contracts.s03.trend.note"), {
                    floor: nfInt.format(sole.stability.min_starts_floor),
                  })}
                </figcaption>
              </figure>
            )}

            <BarRow
              reveal
              header={{
                left: t("us.sf.contracts.s03.hist.left"),
                right: t("us.sf.contracts.s03.hist.right"),
              }}
              items={sole.by_department.slice(0, 8).map((d) => ({
                label: d.department,
                value: d.sole_agreed_usd,
                display: fmtUsdCompact(d.sole_agreed_usd),
                sub: fill(t("us.sf.contracts.s03.hist.row_sub"), {
                  n: nfInt.format(d.n_sole),
                  nAll: nfInt.format(d.n_contracts),
                  shareN: fmtShare(d.share_of_dept_contracts),
                  shareA: d.share_of_dept_agreed != null ? fmtShare(d.share_of_dept_agreed) : "—",
                }),
              }))}
            />

            <div style={{ marginTop: 34 }}>
              <ExpandableList
                header={{
                  left: <>{t("us.sf.contracts.s03.top.left")}</>,
                  right: <>{t("us.sf.contracts.s03.top.right")}</>,
                }}
                items={sole.top_contracts.map((c, i) => {
                  const refMax = sole.top_contracts[0].agreed_usd || 1;
                  return {
                    key: c.contract_no,
                    label: (
                      <span>
                        <span style={{ fontFamily: "var(--f-mono)", color: "var(--ocre)", marginRight: 8 }}>
                          {String(i + 1).padStart(2, "0")}
                        </span>
                        {c.title_plain || c.title}
                      </span>
                    ),
                    barPct: (c.agreed_usd / refMax) * 100,
                    meta: (
                      <>
                        {c.department} · {c.prime_contractor}
                      </>
                    ),
                    value: fmtUsdCompact(c.agreed_usd),
                    children: (
                      <div style={{ fontFamily: "var(--f-ui)", fontSize: 14, lineHeight: 1.6 }}>
                        <div
                          style={{
                            padding: "12px 16px",
                            borderLeft: "3px solid var(--ocre)",
                            background: "rgba(166, 118, 56, 0.05)",
                            marginBottom: 12,
                          }}
                        >
                          <div style={{ fontFamily: "var(--f-mono)", fontSize: 10, letterSpacing: ".1em", textTransform: "uppercase", color: "var(--muted)", marginBottom: 6 }}>
                            {t("us.sf.contracts.s03.top.authority_label")}
                          </div>
                          <span style={{ fontFamily: "var(--f-mono)", fontSize: 12.5, color: "var(--ink)" }}>
                            {c.purchasing_authority ?? t("us.sf.contracts.s03.top.authority_none")}
                          </span>
                        </div>
                        <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
                          <span style={{ color: "var(--ink-2)" }}>
                            {fill(t("us.sf.contracts.s03.top.paid"), { paid: fmtUsdCompact(c.paid_usd) })}
                            {c.is_active === true && <> · {t("us.sf.contracts.s03.top.active")}</>}
                          </span>
                          <Link
                            href={`/us/city/sf/contracts/contract/${c.contract_no}`}
                            scroll={false}
                            style={{ fontFamily: "var(--f-mono)", fontSize: 12, color: "var(--bleu)", borderBottom: "1px solid var(--bleu)", paddingBottom: 1 }}
                          >
                            {t("us.sf.contracts.fiche_link")}
                          </Link>
                        </div>
                      </div>
                    ),
                  };
                })}
              />
            </div>
            <SourceLine
              label={t("us.sf.contracts.source_label")}
              dataWord={t("us.sf.contracts.source_data_word")}
              links={[{ name: overview.source.name, href: overview.source.source_url }]}
            />
          </div>
        </section>

        {/* landscape by type */}
        <section className="fx-section" id="sec-landscape">
          <div className="fx-wrap">
            <SectionHead
              title={
                <>
                  {t("us.sf.contracts.s02.title.before")}
                  <em>{t("us.sf.contracts.s02.title.em")}</em>
                </>
              }
              subtitle={t("us.sf.contracts.s02.sub")}
            />
            <BarRow
              reveal
              header={{
                left: t("us.sf.contracts.s02.header.left"),
                right: t("us.sf.contracts.s02.header.right"),
              }}
              items={[
                ...typesShown.map((r) => ({
                  label: (
                    <span title={r.contract_type}>{typeLabel(r.contract_type)}</span>
                  ),
                  value: r.agreed_usd,
                  display: fmtUsdCompact(r.agreed_usd),
                  sub: fill(t("us.sf.contracts.s02.row_sub"), {
                    n: nfInt.format(r.n_contracts),
                    paid: fmtUsdCompact(r.paid_usd),
                    share: fmtShare(r.share_of_register_agreed),
                  }),
                })),
                ...(typesRest.length > 0
                  ? [{
                      label: <span>{fill(t("us.sf.contracts.s02.rest"), { n: typesRest.length })}</span>,
                      value: restAgreed,
                      display: fmtUsdCompact(restAgreed),
                      sub: fill(t("us.sf.contracts.s02.rest_sub"), { n: nfInt.format(restN) }),
                    }]
                  : []),
              ]}
            />
            {overview.landscape.grants && (
              <div
                style={{
                  marginTop: 24,
                  padding: "16px 20px",
                  border: "1px solid var(--ink)",
                  background: "rgba(59, 99, 173, 0.04)",
                  fontFamily: "var(--f-ui)",
                  fontSize: 14,
                  lineHeight: 1.6,
                  color: "var(--ink-2)",
                }}
              >
                <b style={{ color: "var(--ink)" }}>{t("us.sf.contracts.s02.grants.title")}</b>{" "}
                {fill(t("us.sf.contracts.s02.grants.body"), {
                  agreed: fmtUsdCompact(overview.landscape.grants.agreed_usd),
                  n: nfInt.format(overview.landscape.grants.n_contracts),
                  share: fmtShare(overview.landscape.grants.share_of_register_agreed),
                })}{" "}
                <Link
                  href="/us/city/sf/who-gets-paid"
                  style={{ color: "var(--bleu)", borderBottom: "1px solid var(--bleu)" }}
                >
                  {t("us.sf.contracts.s02.grants.link")}
                </Link>
              </div>
            )}
            <div style={{ marginTop: 34 }}>
              <BarRow
                header={{
                  left: t("us.sf.contracts.s02.dept.left"),
                  right: t("us.sf.contracts.s02.dept.right"),
                }}
                items={overview.departments.slice(0, 8).map((d) => ({
                  label: d.department,
                  value: d.agreed_usd,
                  display: fmtUsdCompact(d.agreed_usd),
                  sub: fill(t("us.sf.contracts.s02.dept.row_sub"), {
                    n: nfInt.format(d.n_contracts),
                    paid: fmtUsdCompact(d.paid_usd),
                  }),
                }))}
              />
            </div>
            <SourceLine
              label={t("us.sf.contracts.source_label")}
              dataWord={t("us.sf.contracts.source_data_word")}
              links={[{ name: overview.source.name, href: overview.source.source_url }]}
            />
          </div>
        </section>

        {/* LBE */}
        <section className="fx-section" id="sec-lbe">
          <div className="fx-wrap">
            <SectionHead
              title={
                <>
                  <Tip label={t("us.sf.contracts.s04.sub")}>LBE</Tip>
                  {" (Local Business Enterprise) "}
                  <em>{t("us.sf.contracts.s04.title.em")}</em>
                </>
              }
              subtitle={t("us.sf.contracts.s04.subtitle")}
            />
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 0, border: "1px solid var(--ink)" }}>
              {[
                {
                  key: "prime",
                  label: t("us.sf.contracts.s04.prime.label"),
                  amount: lbe.prime.agreed_usd,
                  sub: fill(t("us.sf.contracts.s04.prime.sub"), { n: nfInt.format(lbe.prime.n_contracts) }),
                  perimeter: lbe.prime.perimeter,
                },
                {
                  key: "team",
                  label: t("us.sf.contracts.s04.team.label"),
                  amount: lbe.team.attached_usd,
                  sub: fill(t("us.sf.contracts.s04.team.sub"), {
                    n: nfInt.format(lbe.team.n_contracts),
                    rows: nfInt.format(lbe.team.n_member_rows),
                  }),
                  perimeter: lbe.team.perimeter,
                },
              ].map((b, i) => (
                <div key={b.key} style={{ padding: "22px 22px 18px", borderLeft: i > 0 ? "1px solid var(--ink)" : "none" }}>
                  <div style={{ fontFamily: "var(--f-mono)", fontSize: 11, letterSpacing: ".08em", textTransform: "uppercase", color: "var(--muted)", marginBottom: 8 }}>
                    <Tip label={b.perimeter}>{b.label}</Tip>
                  </div>
                  <div style={{ fontFamily: "var(--f-disp)", fontSize: 44, fontWeight: 700, letterSpacing: "-0.03em", lineHeight: 1 }}>
                    {fmtUsdCompact(b.amount)}
                  </div>
                  <div style={{ fontFamily: "var(--f-mono)", fontSize: 11.5, color: "var(--muted)", marginTop: 6 }}>
                    {b.sub}
                  </div>
                </div>
              ))}
            </div>
            <p className="fx-note" style={{ marginTop: 14 }}>
              {t("us.sf.contracts.s04.never_sum")}
            </p>
            <SourceLine
              label={t("us.sf.contracts.source_label")}
              dataWord={t("us.sf.contracts.source_data_word")}
              links={[{ name: overview.source.name, href: overview.source.source_url }]}
            />
          </div>
        </section>

        {/* 05 — search + active table */}
        <section className="fx-section" id="sec-search">
          <div className="fx-wrap">
            <SectionHead
              title={
                <>
                  {t("us.sf.contracts.s05.title.before")}
                  <em>{t("us.sf.contracts.s05.title.em")}</em>
                </>
              }
              subtitle={fill(t("us.sf.contracts.s05.sub"), { n: nfInt.format(active.n_rows) })}
            />
            <SfContractsSearch rows={active.rows} />
            <p className="fx-note" style={{ marginTop: 16 }}>
              {fill(t("us.sf.contracts.s05.note"), {
                n: nfInt.format(dq.n_paid_exceeds_agreed),
              })}
            </p>
            <SourceLine
              label={t("us.sf.contracts.source_label")}
              dataWord={t("us.sf.contracts.source_data_word")}
              links={[{ name: overview.source.name, href: overview.source.source_url }]}
            />
          </div>
        </section>

        {/* 06 — purchasing authorities */}
        <section className="fx-section" id="sec-authorities">
          <div className="fx-wrap">
            <SectionHead
              title={
                <>
                  {t("us.sf.contracts.s06.title.before")}
                  <em>{t("us.sf.contracts.s06.title.em")}</em>
                </>
              }
              subtitle={t("us.sf.contracts.s06.sub")}
            />
            <BarRow
              header={{
                left: t("us.sf.contracts.s06.header.left"),
                right: t("us.sf.contracts.s06.header.right"),
              }}
              items={overview.authority_families.families.map((f) => ({
                label: FAMILY_LABELS[f.family] ?? f.family,
                value: f.agreed_usd,
                display: fmtUsdCompact(f.agreed_usd),
                sub: fill(t("us.sf.contracts.s06.row_sub"), {
                  n: nfInt.format(f.n_contracts),
                  sole: nfInt.format(f.n_sole_flagged),
                }),
              }))}
            />
            <p className="fx-note" style={{ marginTop: 14 }}>
              {overview.authority_families.classification.note}
            </p>
            <SourceLine
              label={t("us.sf.contracts.source_label")}
              dataWord={t("us.sf.contracts.source_data_word")}
              links={[{ name: overview.source.name, href: overview.source.source_url }]}
            />
          </div>
        </section>

      </main>
    </div>
  );
}
