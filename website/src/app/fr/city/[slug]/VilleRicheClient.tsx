"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import Navbar from "@/components/fusion/Navbar";
import Footer from "@/components/fusion/Footer";
import ChartSource from "@/components/fusion/ChartSource";
import RelatedLinks from "@/components/fiche/RelatedLinks";
import { V3Amt, V3Row } from "@/components/fiche/v3";
import { useT, useLocale } from "@/lib/localeContext";
import { fmtDec } from "@/lib/fmt";
import { trLabel } from "@/lib/label-translate";
import { displayNomElu } from "@/lib/commune-maires";
import type { PageVilleRicheProps, LinkRow } from "./page-ville-riche-data";

/**
 * La page ville de Paris et Marseille (bloc 5) : le même squelette que les
 * 35 000 communes, alimenté par les données propres de la ville. Chaque
 * section est un résumé de quelques lignes qui ouvrent les fiches, puis un
 * lien vers l'explorateur.
 */

const COMPARE_KEYS = ["impots_locaux", "encours_dette", "epargne_brute"] as const;

export default function VilleRicheClient(p: PageVilleRicheProps) {
  const { commune, budget, subventions, achats, construit, dette, lieux, chantiers, maire, peers, compare, related } = p;
  const t = useT();
  const { locale } = useLocale();
  const en = locale === "en";
  const tag = en ? "en-GB" : "fr-FR";
  const int = new Intl.NumberFormat(tag, { maximumFractionDigits: 0 });
  const nf = (o: Intl.NumberFormatOptions) => new Intl.NumberFormat(tag, o);
  const fill = (key: string, vars: Record<string, string | number>) => {
    let s = t(key);
    for (const [k, v] of Object.entries(vars)) s = s.split(`{${k}}`).join(String(v));
    return s;
  };
  const split = (eur: number): { v: string; u: string } => {
    const a = Math.abs(eur);
    if (a >= 1e9) return { v: nf({ maximumFractionDigits: 2 }).format(eur / 1e9), u: "Md€" };
    if (a >= 1e6) return { v: nf({ maximumFractionDigits: a >= 1e8 ? 0 : 1 }).format(eur / 1e6), u: "M€" };
    if (a >= 1e3) return { v: int.format(eur / 1e3), u: "k€" };
    return { v: int.format(eur), u: "€" };
  };
  const euro = (eur: number, signed = false) => {
    const { v, u } = split(eur);
    return `${signed && eur > 0 ? "+" : ""}${v} ${u}`;
  };
  const signedPct = (x: number) => `${x >= 0 ? "+" : "−"}${fmtDec(Math.abs(x), 1)} %`;
  const router = useRouter();
  const lbl = (s: string) => trLabel(s, locale);

  const { data, availableYears, year } = budget;
  const perHab = commune.pop > 0 ? data.depenses / commune.pop : 0;
  const years = data.yearsSummary;
  const prevYear = years.filter((y) => y.year < year).sort((a, b) => b.year - a.year)[0];
  const deltaYear = prevYear && prevYear.depenses > 0 ? ((data.depenses - prevYear.depenses) / prevYear.depenses) * 100 : null;
  const first = years[0];
  const sinceFirst = first && first.year !== year && first.year !== prevYear?.year && first.depenses > 0 ? ((data.depenses - first.depenses) / first.depenses) * 100 : null;
  const isVoted = years.find((y) => y.year === year)?.type === "vote";

  const position = useMemo(() => {
    if (!peers) return null;
    const above: string[] = [];
    const below: string[] = [];
    for (const k of COMPARE_KEYS) {
      const r = peers.rows.find((x) => x.key === k);
      if (!r || r.deltaPct == null) continue;
      const lab = t(`fx.pv.kpi.${k}`);
      if (r.deltaPct > 15) above.push(lab);
      else if (r.deltaPct < -15) below.push(lab);
    }
    const list = (xs: string[]) => (xs.length <= 1 ? xs.join("") : `${xs.slice(0, -1).join(", ")} ${t("fx.pv.and")} ${xs[xs.length - 1]}`);
    if (above.length && below.length) return fill("fx.pv.pos_mixed", { above: list(above), below: list(below) });
    if (above.length) return fill("fx.pv.pos_above", { list: list(above) });
    if (below.length) return fill("fx.pv.pos_below", { list: list(below) });
    return t("fx.pv.pos_avg");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [peers, locale]);

  const Bars = ({ points, now, height = 50 }: { points: { year: number; value: number; type?: "vote" | "execute" }[]; now: number; height?: number }) => {
    const max = Math.max(...points.map((x) => x.value), 1);
    return (
      <div className="bars" aria-hidden="true">
        {points.map((x) => (
          <div key={x.year} className={x.year === now ? "now" : x.type === "vote" ? "vote" : ""} title={`${x.year} · ${euro(x.value)}`}>
            <b style={{ height: Math.max(3, Math.round((x.value / max) * height)) }} />
            <span>{x.year}</span>
          </div>
        ))}
      </div>
    );
  };
  const Spark = ({ label }: { label: string }) => {
    const pts = (data.series[label] ?? []).filter((x) => x.year <= year);
    if (pts.length < 2) return <span />;
    const m = Math.max(...pts.map((x) => x.value), 1);
    return (
      <span className="fx-bud-spark" aria-hidden="true" title={pts.map((x) => `${x.year} : ${euro(x.value)}`).join(" · ")}>
        {pts.map((x) => <i key={x.year} className={x.year === year ? "now" : x.type === "vote" ? "vote" : ""} style={{ height: Math.max(2, Math.round((x.value / m) * 18)) }} />)}
      </span>
    );
  };
  const Rows = ({ rows }: { rows: LinkRow[] }) => (
    <>
      {rows.map((r, i) => (
        <V3Row key={i} href={r.href} label={r.label} sub={r.sub ? lbl(r.sub) : undefined} amount={<V3Amt {...split(r.value)} />} />
      ))}
    </>
  );
  const [share, setShare] = useState(false);
  const doShare = async () => {
    const url = window.location.href;
    try {
      if (navigator.share) await navigator.share({ title: fill("fx.pv.share_title", { nom: commune.nom, year, n: euro(data.depenses) }), url });
      else { await navigator.clipboard.writeText(url); setShare(true); setTimeout(() => setShare(false), 2000); }
    } catch { /* annulé */ }
  };
  const [otherSlug, setOtherSlug] = useState(compare?.other?.slug ?? "");
  const other = compare?.other ?? null;
  const dep = data.topDepenses.filter((x) => x.value / data.depenses >= 0.005);
  const rec = data.recettesBreakdown.filter((x) => x.value / data.recettes >= 0.005);
  const spanYears = years.filter((y) => y.year <= year).map((y) => y.year);
  const span = spanYears.length > 1 ? `${spanYears[0]}–${spanYears[spanYears.length - 1]}` : String(year);
  const H2 = ({ id, children, sub }: { id: string; children: React.ReactNode; sub?: React.ReactNode }) => (
    <>
      <h2 id={id} className="fx-v3-h2 fx-pv-h2">{children}</h2>
      {sub ? <p className="fx-v3-h2sub">{sub}</p> : null}
    </>
  );
  const toc = [
    { id: "depenses", label: t("fx.pv.toc.depenses") },
    ...(construit ? [{ id: "construit", label: t("fx.pv.toc.construit") }] : []),
    ...(dette ? [{ id: "dette", label: t("fx.pv.toc.dette") }] : []),
    ...(subventions ? [{ id: "associations", label: t("fx.pv.toc.associations") }] : []),
    ...(achats ? [{ id: "achats", label: t("fx.pv.toc.achats") }] : []),
    ...(lieux ? [{ id: "lieux", label: t("fx.pv.toc.lieux") }] : []),
    ...(compare ? [{ id: "comparer", label: t("fx.pv.toc.comparer") }] : []),
  ];
  const yearsDette = dette?.series ?? [];
  const detteFirst = yearsDette[0];
  const detteLast = yearsDette[yearsDette.length - 1];
  const detteDelta = detteFirst && detteLast && detteFirst.year !== detteLast.year && detteFirst.value > 0 ? ((detteLast.value - detteFirst.value) / detteFirst.value) * 100 : null;

  return (
    <div className="theme-fusion">
      <Navbar />
      <main id="main-content" tabIndex={-1}>
        <div className="fx-wrap fx-v3 fx-bud-v3 fx-pv" style={{ padding: "48px 0" }}>
          <p className="fx-pv-kicker">{commune.dep_name} · {commune.reg_name} · {int.format(commune.pop)} {t("fx.natbud.hab")}</p>
          <h1 className="fx-pv-title">{fill("fx.pv.title", { nom: commune.nom })}</h1>
          {maire?.nom ? (
            <p className="fx-pv-maire">
              {fill("fx.pv.maire", { nom: `${maire.prenom ?? ""} ${displayNomElu(maire.nom)}`.trim() })}
              {maire.depuis ? ` ${fill("fx.pv.maire_depuis", { date: new Date(maire.depuis).toLocaleDateString(tag, { month: "long", year: "numeric" }) })}` : ""}
              {maire.conseillers ? ` · ${fill("fx.pv.conseillers", { n: maire.conseillers })}` : ""}
            </p>
          ) : null}
          {availableYears.length > 1 && (
            <nav className="fx-yearpicker" aria-label={t("fx.natbud.year_label")}>
              {availableYears.map((y) => (
                <Link key={y} href={`/fr/city/${commune.slug}?year=${y}`} className={y === year ? "is-active" : ""} aria-current={y === year ? "page" : undefined} scroll={false}>{y}</Link>
              ))}
            </nav>
          )}
          <nav className="fx-pv-toc" aria-label={t("fx.pv.toc_aria")}>{toc.map((s) => <a key={s.id} href={`#${s.id}`}>{s.label}</a>)}</nav>

          {/* 1. Le chiffre */}
          <div className="fx-v3-herogrid">
            <div>
              <div className="fx-v3-hero-num tnum">{split(data.depenses).v}<span className="u">{split(data.depenses).u}</span></div>
              <div className="fx-v3-hero-cap">{fill(isVoted ? "fx.bud.v3.cap_vote" : "fx.bud.v3.cap_exec", { year })}</div>
              <div className="fx-v3-hero-meta">
                {perHab > 0 ? `${fill("fx.bud.v3.par_hab", { n: int.format(perHab) })} · ` : ""}
                {fill(isVoted ? "fx.bud.v3.recettes_vote" : "fx.bud.v3.recettes_exec", { rec: euro(data.recettes) })}
              </div>
              {position ? <p className="fx-pv-position">{position}</p> : null}
              <button type="button" className="fx-pv-share" onClick={doShare}><i aria-hidden="true" />{share ? t("fx.pv.share_done") : t("fx.pv.share_num")}</button>
            </div>
            {years.length > 1 && (
              <div className="fx-v3-trend">
                <div className="t">
                  {deltaYear != null && <b>{signedPct(deltaYear)} {fill("fx.bud.v3.vs", { y: prevYear.year })}</b>}
                  {sinceFirst != null && <span> · {signedPct(sinceFirst)} {fill("fx.bud.v3.depuis", { y: first.year })}</span>}
                </div>
                <Bars points={years.map((y) => ({ year: y.year, value: y.depenses, type: y.type }))} now={year} />
              </div>
            )}
          </div>

          {/* 2. Dépenses et recettes, par politique publique */}
          <H2 id="depenses" sub={`${t("fx.pv.riche.h2sub")} ${fill("fx.natbud.v3.span", { span })}`}>{t("fx.bud.v3.h2")}</H2>
          <div className="fx-bud-cols">
            <div className="fx-bud-col">
              <h3><span>{t("fx.bud.v3.col_dep")}</span><span className="tnum">{euro(data.depenses)}</span></h3>
              {dep.map((x) => (
                <Link key={x.label} href={budget.posteHref[x.label] ?? budget.explorerHref} scroll={false} className="fx-bud-row">
                  <span className="n">{lbl(x.label)}</span>
                  <Spark label={x.label} />
                  <V3Amt {...split(x.value)} />
                  <span className="p tnum">{Math.round((x.value / data.depenses) * 100)} %</span>
                </Link>
              ))}
            </div>
            <div className="fx-bud-col">
              <h3><span>{t("fx.bud.v3.col_rec")}</span><span className="tnum">{euro(data.recettes)}</span></h3>
              {rec.map((x) => (
                <div key={x.label} className="fx-bud-row fx-bud-row--static">
                  <span className="n">{lbl(x.label)}</span>
                  <Spark label={x.label} />
                  <V3Amt {...split(x.value)} />
                  <span className="p tnum">{Math.round((x.value / data.recettes) * 100)} %</span>
                </div>
              ))}
            </div>
          </div>
          <p className="fx-v3-sentence"><Link className="fx-pv-link" href={budget.explorerHref}>{t("fx.pv.riche.budget_link")} →</Link></p>

          {/* 3. Ce que la Ville construit */}
          {construit && (
            <section className="fx-pv-section">
              <H2 id="construit">{t("fx.pv.riche.construit")}</H2>
              <p className="fx-v3-lead fx-pv-lead">{fill("fx.pv.riche.construit_lead", { nom: commune.nom, year: construit.year, total: euro(construit.total), hab: int.format(commune.pop > 0 ? construit.total / commune.pop : 0) })}</p>
              <div className="fx-pv-two">
                <div>
                  <div className="fx-pv-colhead"><span>{t("fx.pv.riche.projets")}</span><span className="tnum">{construit.year}</span></div>
                  <Rows rows={construit.rows} />
                  <p className="fx-v3-sentence"><Link className="fx-pv-link" href={construit.explorerHref}>{t("fx.pv.riche.projets_link")} →</Link></p>
                </div>
                <div>
                  {chantiers && chantiers.chantiers.length > 0 ? (
                    <>
                      <div className="fx-pv-colhead"><span>{t("fx.pv.chantiers_etat")}</span><span className="tnum">{t("fx.pv.fonds_vert")}</span></div>
                      {chantiers.chantiers.slice(0, 5).map((c, i) => (
                        c.resume ? (
                          <details key={i} className="fx-pv-chantier">
                            <summary className="fx-pv-line"><span>{c.nom}<span className="fx-pv-sub2">{[fill("fx.pv.etat_annee", { y: c.annee ?? "" }), c.demarche].filter(Boolean).join(" · ")}</span></span><V3Amt {...split(c.montant)} /></summary>
                            <p className="fx-pv-resume">{c.resume}</p>
                          </details>
                        ) : (
                          <div key={i} className="fx-pv-line"><span>{c.nom}<span className="fx-pv-sub2">{[fill("fx.pv.etat_annee", { y: c.annee ?? "" }), c.demarche].filter(Boolean).join(" · ")}</span></span><V3Amt {...split(c.montant)} /></div>
                        )
                      ))}
                      {chantiers.chantiers.length > 5 ? <p className="fx-v3-sentence">{fill("fx.pv.chantiers_plus", { n: chantiers.chantiers.length - 5 })}</p> : null}
                    </>
                  ) : null}
                </div>
              </div>
            </section>
          )}

          {/* 4. La dette */}
          {dette && (
            <section className="fx-pv-section">
              <H2 id="dette">{t("fx.pv.dette")}</H2>
              <div className="fx-pv-dettegrid">
                <p className="fx-v3-lead fx-pv-lead">
                  {fill("fx.pv.dette_lead", { nom: commune.nom, year: dette.year, n: euro(dette.total), hab: int.format(commune.pop > 0 ? dette.total / commune.pop : 0) })}
                  {dette.capacite > 0 ? ` ${fill("fx.pv.dette_cap", { years: fill("fx.pv.cap_years", { n: (Math.round(dette.capacite * 2) / 2).toLocaleString(tag, { maximumFractionDigits: 1 }) }) })}` : ""}
                </p>
                {yearsDette.length > 1 && (
                  <div className="fx-v3-trend">
                    <div className="t">{detteDelta != null && detteFirst ? <b>{signedPct(detteDelta)} {fill("fx.bud.v3.depuis", { y: detteFirst.year })}</b> : null}</div>
                    <Bars points={yearsDette} now={detteLast?.year ?? dette.year} />
                  </div>
                )}
              </div>
              <p className="fx-v3-sentence"><Link className="fx-pv-link" href={dette.explorerHref}>{t("fx.pv.riche.dette_link")} →</Link></p>
            </section>
          )}

          {/* 5. Les associations soutenues */}
          {subventions && (
            <section className="fx-pv-section">
              <H2 id="associations">{t("fx.pv.riche.associations")}</H2>
              <p className="fx-v3-lead fx-pv-lead">{fill("fx.pv.riche.associations_lead", { nom: commune.nom, year: subventions.year, total: euro(subventions.total), nb: int.format(subventions.nb) })}</p>
              <Rows rows={subventions.rows} />
              <p className="fx-v3-sentence"><Link className="fx-pv-link" href={subventions.explorerHref}>{t("fx.pv.riche.associations_link")} →</Link></p>
            </section>
          )}

          {/* 6. Ce que la Ville achète */}
          {achats && (
            <section className="fx-pv-section">
              <H2 id="achats">{t("fx.pv.riche.achats")}</H2>
              <p className="fx-v3-lead fx-pv-lead">{fill("fx.pv.riche.achats_lead", { nom: commune.nom, y0: achats.years[0] ?? "", y1: achats.years[achats.years.length - 1] ?? "", total: euro(achats.total) })}</p>
              <Rows rows={achats.rows} />
              <p className="fx-v3-sentence"><Link className="fx-pv-link" href={achats.explorerHref}>{t("fx.pv.riche.achats_link")} →</Link></p>
            </section>
          )}

          {/* 7. Les lieux */}
          {lieux && lieux.rows.length > 0 && (
            <section className="fx-pv-section">
              <H2 id="lieux">{t("fx.pv.riche.lieux")}</H2>
              <p className="fx-v3-lead fx-pv-lead">{fill("fx.pv.riche.lieux_lead", { nom: commune.nom, n: int.format(lieux.n) })}</p>
              <Rows rows={lieux.rows} />
              <p className="fx-v3-sentence"><Link className="fx-pv-link" href={lieux.explorerHref}>{t("fx.pv.riche.lieux_link")} →</Link></p>
            </section>
          )}

          {/* 8. Comparer */}
          {compare && (
            <section className="fx-pv-section">
              <H2 id="comparer">{t("fx.pv.comparer")}</H2>
              <div className="fx-pv-pick">
                <span>{fill("fx.pv.face_a", { nom: commune.nom })}</span>
                <select aria-label={t("fx.pv.changer")} value={otherSlug} onChange={(e) => { setOtherSlug(e.target.value); if (e.target.value) router.push(`/fr/compare/${commune.slug}/${e.target.value}`); }}>
                  {!other ? <option value="">{t("fx.pv.changer")}</option> : null}
                  {compare.options.map((o) => <option key={o.slug} value={o.slug}>{o.nom} · {int.format(o.pop)} {t("fx.natbud.hab")}</option>)}
                </select>
              </div>
              {other ? (
                <div className="fx-pv-vs">
                  <div className="legend"><span><i className="a" />{commune.nom}</span><span><i className="b" />{other.nom}</span></div>
                  {COMPARE_KEYS.map((k) => {
                    const a = compare.me.kpis[k];
                    const b = other.kpis[k];
                    const max = Math.max(Math.abs(a ?? 0), Math.abs(b ?? 0), 1);
                    return (
                      <div key={k} className="row">
                        <span className="lab">{t(`fx.cmp2.kpi.${k}`)}</span>
                        <div className="track"><span className="a" style={{ width: `${(Math.abs(a ?? 0) / max) * 100}%` }} /><span className="b" style={{ width: `${(Math.abs(b ?? 0) / max) * 100}%` }} /></div>
                        <span className="val tnum"><b>{a != null ? int.format(Math.round(a)) : "—"} €</b> · {b != null ? int.format(Math.round(b)) : "—"} € {t("fx.pv.par_hab")}</span>
                      </div>
                    );
                  })}
                  {compare.me.taux?.tfb != null && other.taux?.tfb != null ? (
                    <div className="row">
                      <span className="lab">{t("fx.pv.kpi_tfb")}</span>
                      <div className="track"><span className="a" style={{ width: `${(compare.me.taux.tfb / Math.max(compare.me.taux.tfb, other.taux.tfb, 0.01)) * 100}%` }} /><span className="b" style={{ width: `${(other.taux.tfb / Math.max(compare.me.taux.tfb, other.taux.tfb, 0.01)) * 100}%` }} /></div>
                      <span className="val tnum"><b>{compare.me.taux.tfb.toLocaleString(tag, { maximumFractionDigits: 2 })} %</b> · {other.taux.tfb.toLocaleString(tag, { maximumFractionDigits: 2 })} % {fill("fx.pv.taux_annee", { y: compare.me.taux.annee })}</span>
                    </div>
                  ) : null}
                  <p className="fx-v3-sentence"><Link className="fx-pv-link" href={`/fr/compare/${commune.slug}/${other.slug}`}>{t("fx.pv.comparaison_complete")} →</Link></p>
                </div>
              ) : null}
              <p className="fx-v3-foot">{fill("fx.pv.riche.comparer_note", { year: compare.year })}{compare.me.taux ? ` ${t("fx.pv.taux_note")}` : ""}</p>
            </section>
          )}

          <ChartSource source={`${t("fx.pv.riche.sources")} · ${year}`} methodAnchor="c-villes" />
          <RelatedLinks block={related} />
        </div>
      </main>
      <Footer />
    </div>
  );
}
