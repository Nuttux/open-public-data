"use client";
import Navbar from "@/components/fusion/Navbar";
import Footer from "@/components/fusion/Footer";
import SectionHead from "@/components/fusion/SectionHead";
import HeroNumber from "@/components/fusion/HeroNumber";
import KPIGrid from "@/components/fusion/KPIGrid";
import TileCard from "@/components/fusion/TileCard";
import YearPicker from "@/components/fusion/YearPicker";
import ExportRow from "@/components/fusion/ExportRow";
import PullQuote from "@/components/fusion/PullQuote";
import BilanBoard from "@/components/fusion/BilanBoard";
import BudgetTimeline from "@/components/fusion/BudgetTimeline";
import DetteStructurePanel from "@/components/fusion/DetteStructurePanel";
import PageTOC from "@/components/fusion/PageTOC";
import PatrimoineDrillList from "@/components/fusion/PatrimoineDrillList";
import { fmtBillions, fmtDec, fmtInt, fmtMillions } from "@/lib/fmt";
import type { PatrimoineData, PatrimoineStructure } from "@/lib/fusion-data";
import { useT } from "@/lib/localeContext";

const fill = (s: string, vars: Record<string, string | number>) => {
  let r = s;
  for (const [k, v] of Object.entries(vars)) r = r.replace(`{${k}}`, String(v));
  return r;
};

export default function DettePatrimoineClient({
  d,
  structure,
}: {
  d: PatrimoineData;
  structure: PatrimoineStructure | null;
}) {
  const t = useT();
  const net = d.fondsPropres;
  const detteParHab = d.detteFinanciere / 2_133_111;

  const hbRows = [
    { eKey: "fx.det.hb.r1.e", entKey: "fx.det.hb.r1.ent", vKey: "fx.det.hb.r1.v", risk: "faible" },
    { eKey: "fx.det.hb.r2.e", entKey: "fx.det.hb.r2.ent", vKey: "fx.det.hb.r2.v", risk: "moyen" },
    { eKey: "fx.det.hb.r3.e", entKey: "fx.det.hb.r3.ent", vKey: "fx.det.hb.r3.v", risk: "moyen" },
    { eKey: "fx.det.hb.r4.e", entKey: "fx.det.hb.r4.ent", vKey: "fx.det.hb.r4.v", risk: "faible" },
    { eKey: "fx.det.hb.r5.e", entKey: "fx.det.hb.r5.ent", vKey: "fx.det.hb.r5.v", risk: "moyen" },
  ];

  return (
    <div className="theme-fusion">
      <Navbar />

      <PageTOC
        items={[
          { id: "sec-regles", label: t("fx.det.toc.regles") },
          { id: "sec-overview", label: t("fx.det.toc.overview") },
          { id: "sec-bilan", label: t("fx.det.toc.bilan") },
          { id: "sec-trajectoire", label: t("fx.det.toc.trajectoire") },
          { id: "sec-actifs", label: t("fx.det.toc.actifs") },
          { id: "sec-dette", label: t("fx.det.toc.dette") },
          { id: "sec-hors-bilan", label: t("fx.det.toc.hors_bilan") },
          { id: "sec-sources", label: t("fx.det.toc.sources") },
        ]}
      />

      <section className="fx-page-header">
        <div className="fx-wrap">
          <div className="fx-page-kicker">{t("fx.det.kicker")}</div>
          <h1 className="fx-page-title">
            {t("fx.det.title.before")}
            <em>{t("fx.det.title.em")}</em>
            {t("fx.det.title.mid")}
            <br />
            {t("fx.det.title.b")}
            <b>{t("fx.det.title.b_b")}</b>
            {t("fx.det.title.b_after")}
          </h1>
          <p className="fx-page-lede">{fill(t("fx.det.lede"), { year: d.year })}</p>
          <div className="fx-page-actions">
            <YearPicker
              years={d.availableYears}
              current={d.year}
              basePath="/dette-patrimoine"
              label={t("fx.s.year_label")}
            />
          </div>
        </div>
      </section>

      <section className="fx-section" id="sec-regles">
        <div className="fx-wrap">
          <SectionHead
            number="01"
            kind={t("fx.det.s01.kind")}
            title={
              <>
                {t("fx.det.s01.title.before")}
                <em>{t("fx.det.s01.title.em")}</em>
              </>
            }
            subtitle={t("fx.det.s01.sub")}
          />
          <div className="fx-sources fx-sources-2">
            <div>
              <div className="n">{t("fx.det.s01.r1.n")}</div>
              <h3>{t("fx.det.s01.r1.h")}</h3>
              <p>{t("fx.det.s01.r1.p")}</p>
              <span className="fx-rule-ref">Article L.1612-4 CGCT</span>
            </div>
            <div>
              <div className="n">{t("fx.det.s01.r2.n")}</div>
              <h3>{t("fx.det.s01.r2.h")}</h3>
              <p>{t("fx.det.s01.r2.p")}</p>
              <span className="fx-rule-ref">Article L.1612-4 CGCT</span>
            </div>
            <div>
              <div className="n">{t("fx.det.s01.r3.n")}</div>
              <h3>{t("fx.det.s01.r3.h")}</h3>
              <p>{t("fx.det.s01.r3.p")}</p>
              <span className="fx-rule-ref">Article L.1612-4 CGCT · circulaire DGCL</span>
            </div>
            <div>
              <div className="n">{t("fx.det.s01.r4.n")}</div>
              <h3>{t("fx.det.s01.r4.h")}</h3>
              <p>{t("fx.det.s01.r4.p")}</p>
              <span className="fx-rule-ref">Loi de programmation des finances publiques 2023-2027</span>
            </div>
          </div>

          <div className="fx-faillite-box">
            <h4>
              {t("fx.det.s01.note.b").split(" ").slice(0, -1).join(" ")}{" "}
              <span className="rouge">
                {t("fx.det.s01.note.b").split(" ").slice(-1)[0]}
              </span>{" "}
              ?
            </h4>
            <p>{t("fx.det.s01.note.text")}</p>
          </div>

          <PullQuote cite={<>Source · CGCT art. L.1612-14 · rapports CRC Île-de-France</>}>
            {t("fx.det.s01.note.text")}
          </PullQuote>
        </div>
      </section>

      <section className="fx-section" id="sec-overview">
        <div className="fx-wrap">
          <SectionHead
            number="02"
            kind={t("fx.det.s02.kind")}
            title={
              <>
                {t("fx.det.s02.title.before")}
                <em>{t("fx.det.s02.title.em")}</em>
              </>
            }
          />
          <div className="fx-overview">
            <HeroNumber
              label={fill(t("fx.det.s02.hero_label"), { year: d.year })}
              value={fmtBillions(net)}
              unit={t("fx.s.md_eur")}
              caption={
                <>
                  {t("fx.det.s02.hero_cap.eq")}
                  <b>
                    {fmtBillions(d.actif)} {t("fx.s.md_eur")} − {fmtBillions(d.detteTotale + d.provisions)}{" "}
                    {t("fx.s.md_eur")} = {fmtBillions(net)} {t("fx.s.md_eur")}
                  </b>
                  {". "}
                  {t("fx.det.s02.hero_cap.per_hab").replace("{n}", fmtInt(net / 2_133_111))}
                </>
              }
            />
            <KPIGrid
              cols={3}
              items={[
                {
                  label: t("fx.det.s02.kpi.per_hab"),
                  value: fmtInt(detteParHab),
                  unit: "€",
                  delta: t("fx.det.s02.kpi.per_hab_delta"),
                },
                {
                  label: t("fx.det.s02.kpi.actif"),
                  value: fmtBillions(d.actif),
                  unit: t("fx.s.md_eur"),
                  delta: t("fx.det.s02.kpi.actif_delta"),
                },
                {
                  label: t("fx.det.s02.kpi.dette_fin"),
                  value: fmtBillions(d.detteFinanciere),
                  unit: t("fx.s.md_eur"),
                  delta: fill(t("fx.det.s02.kpi.dette_fin_delta"), { n: fmtInt(detteParHab) }),
                },
                {
                  label: t("fx.det.s02.kpi.cap_desen"),
                  value: fmtDec(d.capaciteDesendettement, 1),
                  unit: t("fx.det.s02.kpi.ans"),
                  delta: t("fx.det.s02.kpi.cap_desen_delta"),
                },
                {
                  label: t("fx.det.s02.kpi.provisions"),
                  value:
                    d.provisions >= 1e9
                      ? fmtBillions(d.provisions)
                      : fmtMillions(d.provisions, 0),
                  unit: d.provisions >= 1e9 ? t("fx.s.md_eur") : t("fx.s.m_eur"),
                  delta: t("fx.det.s02.kpi.provisions_delta"),
                },
                {
                  label: t("fx.det.s02.kpi.ratio"),
                  value: fmtDec((d.detteFinanciere / d.actif) * 100, 0),
                  unit: "%",
                  delta: t("fx.det.s02.kpi.ratio_delta"),
                },
              ]}
            />
          </div>
        </div>
      </section>

      <section className="fx-section" id="sec-bilan">
        <div className="fx-wrap">
          <SectionHead
            number="03"
            kind={t("fx.det.s03.kind")}
            title={
              <>
                <em>{t("fx.det.s03.title.em_a")}</em>
                {t("fx.det.s03.title.and")}
                <b>{t("fx.det.s03.title.b_b")}</b>
              </>
            }
            subtitle={t("fx.det.s03.sub")}
          />
          {structure ? (
            <BilanBoard
              year={d.year}
              actif={structure.masses_actif}
              passif={structure.masses_passif}
              totals={{ actif: d.actif, passif: d.passif }}
            />
          ) : (
            <p className="fx-note">{t("fx.det.s03.actif")} — indisponible.</p>
          )}
        </div>
      </section>

      <section className="fx-section" id="sec-trajectoire">
        <div className="fx-wrap">
          <SectionHead
            number="04"
            kind={t("fx.det.s04d.kind")}
            title={
              <>
                {t("fx.det.s04d.title.before")}
                <em>{fill(t("fx.det.s04d.title.em"), { year: d.year })}</em>
                {t("fx.det.s04d.title.after")}
              </>
            }
            subtitle={t("fx.det.s04d.sub")}
          />
          {d.yearsSummary.length >= 2 && (() => {
            const first = d.yearsSummary[0];
            const last = d.yearsSummary[d.yearsSummary.length - 1];
            const ratio = (last.dette / last.actif) * 100;
            const ratio0 = (first.dette / first.actif) * 100;
            return (
              <>
                <BudgetTimeline
                  points={d.yearsSummary.map((y) => ({
                    year: y.year,
                    value: y.dette / 1_000_000_000,
                    type: "execute" as const,
                  }))}
                  activeYear={d.year}
                  annotations={[
                    { year: 2020, label: "Covid-19" },
                    { year: 2024, label: "JO" },
                  ]}
                />
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(3, 1fr)",
                    gap: 1,
                    background: "var(--ink)",
                    border: "1px solid var(--ink)",
                    marginTop: 28,
                  }}
                >
                  {([
                    { k: "actif", val: last.actif, val0: first.actif, labelKey: "fx.det.s04d.legend.actif" },
                    { k: "fp", val: last.fondsPropres, val0: first.fondsPropres, labelKey: "fx.det.s04d.legend.fp" },
                    { k: "dette", val: last.dette, val0: first.dette, labelKey: "fx.det.s04d.legend.dette" },
                  ] as const).map((r) => {
                    const delta = ((r.val - r.val0) / r.val0) * 100;
                    return (
                      <div key={r.k} style={{ background: "var(--bg)", padding: "18px 20px" }}>
                        <div style={{ fontFamily: "var(--f-mono)", fontSize: 10.5, letterSpacing: ".08em", textTransform: "uppercase", color: "var(--muted)", marginBottom: 6 }}>
                          {t(r.labelKey)}
                        </div>
                        <div className="tnum" style={{ fontFamily: "var(--f-disp)", fontWeight: 700, fontSize: 24, letterSpacing: "-0.02em", lineHeight: 1 }}>
                          {fmtBillions(r.val)}
                          <span style={{ fontSize: ".5em", color: "var(--muted)", fontWeight: 500, marginLeft: 4 }}>{t("fx.s.md_eur")}</span>
                        </div>
                        <div style={{ fontFamily: "var(--f-mono)", fontSize: 12, color: "var(--ink-2)", marginTop: 8, letterSpacing: ".02em" }}>
                          {delta >= 0 ? "+" : "−"} {fmtDec(Math.abs(delta), 0)} % vs {first.year}
                        </div>
                      </div>
                    );
                  })}
                </div>
                <p className="fx-note" style={{ marginTop: 18 }}>
                  {fill(t("fx.det.s04d.note"), { ratio: fmtDec(ratio, 0), year: d.year, ratio0: fmtDec(ratio0, 0), y0: first.year })}
                </p>
              </>
            );
          })()}
        </div>
      </section>

      <section className="fx-section" id="sec-actifs">
        <div className="fx-wrap">
          <SectionHead
            number="05"
            kind={t("fx.det.s04b.kind")}
            title={
              <>
                {t("fx.det.s04b.title.before")}
                <em>{t("fx.det.s04b.title.em")}</em>
              </>
            }
            subtitle={t("fx.det.s04b.sub")}
          />
          {structure && structure.masses_actif.length > 0 ? (
            <PatrimoineDrillList masses={structure.masses_actif} year={d.year} />
          ) : (
            <p className="fx-note">Indisponible.</p>
          )}
          <p className="fx-note">{t("fx.det.s04b.note")}</p>
        </div>
      </section>

      <section className="fx-section" id="sec-dette">
        <div className="fx-wrap">
          <SectionHead
            number="06"
            kind={t("fx.det.s04.kind")}
            title={
              <>
                {t("fx.det.s04.title.before")}
                <em>{t("fx.det.s04.title.em")}</em>
                {t("fx.det.s04.title.after")}
              </>
            }
            subtitle={t("fx.det.s04.sub")}
          />
          {structure ? (
            <DetteStructurePanel structure={structure.structure_dette} year={d.year} />
          ) : (
            <p className="fx-note">Indisponible.</p>
          )}
          <p className="fx-note">{t("fx.det.s04.note")}</p>
        </div>
      </section>

      <section className="fx-section" id="sec-hors-bilan">
        <div className="fx-wrap">
          <SectionHead
            number="07"
            kind={t("fx.det.s04c.kind")}
            title={
              <>
                {t("fx.det.s04c.title.before")}
                <em>{t("fx.det.s04c.title.em")}</em>
              </>
            }
            subtitle={t("fx.det.s04c.sub")}
          />
          <table className="fx-table">
            <thead>
              <tr>
                <th>{t("fx.det.s04c.col.engagement")}</th>
                <th>{t("fx.det.s04c.col.entite")}</th>
                <th style={{ textAlign: "right" }}>{t("fx.det.s04c.col.amount")}</th>
                <th>{t("fx.det.s04c.col.risk")}</th>
              </tr>
            </thead>
            <tbody>
              {hbRows.map((row, i) => (
                <tr key={i}>
                  <td style={{ fontWeight: 500 }}>{t(row.eKey)}</td>
                  <td className="muted">{t(row.entKey)}</td>
                  <td className="num">{t(row.vKey)}</td>
                  <td>
                    <span
                      style={{
                        fontFamily: "var(--f-mono)",
                        fontSize: 11,
                        letterSpacing: ".04em",
                        color:
                          row.risk === "faible"
                            ? "var(--bleu)"
                            : row.risk === "moyen"
                            ? "var(--ocre)"
                            : "var(--rouge)",
                      }}
                    >
                      {row.risk === "faible"
                        ? t("fx.det.s04c.risk.faible").toUpperCase()
                        : t("fx.det.s04c.risk.moyen").toUpperCase()}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="fx-note">{t("fx.det.s04c.note")}</p>
        </div>
      </section>

      <section className="fx-section" id="sec-sources">
        <div className="fx-wrap">
          <SectionHead
            number="08"
            kind={t("fx.det.src.kind")}
            title={
              <>
                {t("fx.s.verifiable")} <em>{t("fx.s.line_by_line")}</em>
              </>
            }
          />
          <div className="fx-sources">
            <div>
              <div className="n">{t("fx.det.src.c1.n")}</div>
              <h3>{fill(t("fx.det.src.c1.h"), { year: d.year })}</h3>
              <p>{t("fx.det.src.c1.p")}</p>
              <a href="https://opendata.paris.fr" target="_blank" rel="noopener noreferrer">
                {t("fx.s.opendata")}
              </a>
            </div>
            <div>
              <div className="n">{t("fx.det.src.c2.n")}</div>
              <h3>{t("fx.det.src.c2.h")}</h3>
              <p>{t("fx.det.src.c2.p")}</p>
              <a href="/methode#dette-patrimoine">{t("fx.s.methode_lien")}</a>
            </div>
            <div>
              <div className="n">{t("fx.det.src.c3.n")}</div>
              <h3>{t("fx.det.src.c3.h")}</h3>
              <p>{t("fx.det.src.c3.p")}</p>
              <a href="https://github.com/AbstractsMachine" target="_blank" rel="noopener noreferrer">
                {t("fx.s.github")}
              </a>
            </div>
          </div>
          <ExportRow
            items={[
              {
                label: fill(t("fx.det.src.export.csv"), { year: d.year }),
                primary: true,
                href: `/data/bilan_sankey_${d.year}.json`,
              },
              { label: t("fx.det.src.export.json"), href: `/data/bilan_sankey_${d.year}.json` },
              { label: t("fx.det.src.export.index"), href: "/data/bilan_index.json" },
              { label: t("fx.det.src.export.method"), href: "/methode#dette-patrimoine" },
            ]}
          />
        </div>
      </section>

      <section className="fx-section">
        <div className="fx-wrap">
          <SectionHead number="09" kind={t("fx.det.s07.kind")} title={t("fx.det.s07.title")} />
          <div className="fx-grid-tiles">
            <TileCard
              href="/budget"
              number={t("fx.det.s07.t1.n")}
              kind={t("fx.det.s07.t1.kind")}
              title={t("fx.det.s07.t1.title")}
              description={t("fx.det.s07.t1.desc")}
              preview={
                <svg viewBox="0 0 200 100">
                  <path d="M 6 30 C 70 30 90 46 94 46" stroke="#0a0a0a" strokeWidth="8" fill="none" />
                  <path d="M 6 60 C 70 60 90 54 94 54" stroke="#0a0a0a" strokeWidth="6" fill="none" />
                  <rect x="92" y="38" width="16" height="24" fill="#0a0a0a" />
                  <path d="M 108 46 C 140 46 160 32 194 32" stroke="#0a0a0a" strokeWidth="8" fill="none" />
                  <path d="M 108 58 C 140 58 160 74 194 74" stroke="#e11d1d" strokeWidth="6" fill="none" />
                </svg>
              }
              kpi="11,7"
              kpiUnit={t("fx.s.md_eur")}
              kpiDelta={t("fx.det.s07.t1.delta")}
            />
            <TileCard
              href="/investissements"
              number={t("fx.det.s07.t2.n")}
              kind={t("fx.det.s07.t2.kind")}
              title={t("fx.det.s07.t2.title")}
              description={t("fx.det.s07.t2.desc")}
              preview={
                <svg viewBox="0 0 200 100">
                  <path
                    d="M 28 30 Q 36 14 70 12 Q 110 10 140 18 Q 172 26 184 48 Q 188 72 168 86 Q 130 94 90 92 Q 50 90 28 72 Q 18 52 28 30 Z"
                    fill="none"
                    stroke="#0a0a0a"
                    strokeWidth="1.5"
                  />
                  {[
                    [60, 34],
                    [110, 30],
                    [140, 36],
                    [72, 70],
                    [158, 68],
                  ].map(([x, y]) => (
                    <circle key={`${x}-${y}`} cx={x} cy={y} r="2.5" fill="#0a0a0a" />
                  ))}
                  <circle cx="118" cy="54" r="4" fill="#e11d1d" />
                </svg>
              }
              kpi="2,1"
              kpiUnit={t("fx.s.md_eur")}
              kpiDelta="2024"
            />
            <TileCard
              href="/logement-social"
              number={t("fx.det.s07.t3.n")}
              kind={t("fx.det.s07.t3.kind")}
              title={t("fx.det.s07.t3.title")}
              description={t("fx.det.s07.t3.desc")}
              preview={
                <svg viewBox="0 0 200 100">
                  <rect x="16" y="40" width="28" height="48" fill="#0a0a0a" />
                  <rect x="52" y="28" width="28" height="60" fill="#0a0a0a" />
                  <rect x="88" y="50" width="28" height="38" fill="#e11d1d" />
                  <rect x="124" y="20" width="28" height="68" fill="#0a0a0a" />
                  <rect x="160" y="36" width="28" height="52" fill="#0a0a0a" />
                </svg>
              }
              kpi="258"
              kpiUnit="k logements"
              kpiDelta={t("fx.det.s07.t3.delta")}
            />
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
}
