"use client";

import type { ReactNode } from "react";
import type { LieuFicheData } from "@/lib/lieux-data";
import Link from "next/link";
import { useT, useLocale } from "@/lib/localeContext";
import { cap, fill, numLocale, seanceEn } from "@/lib/fmt";
import { normalizeObjet } from "@/lib/objet-normalizer";
import { useCity } from "./CityContext";

/**
 * Fiche « lieu » v3 (2026-09-03) — un chiffre, deux blocs.
 *
 * L'ancienne fiche empilait neuf sections (Wikipédia sur deux paragraphes,
 * deux KPI, une barre, trois sections d'argent avec trois grammaires et trois
 * encadrés, les moments, le Bulletin, les sources) et trois lignes du temps
 * qui ne se croisaient jamais. Audit + maquette avant/après validés avec
 * Daniel : une phrase de description, UN chiffre, puis
 *
 *   1. « Où va l'argent » — deux lignes au plus, qui FONT le total : faire
 *      tourner le lieu (subventions versées à l'exploitant) et les travaux
 *      (chantiers réglés dans les comptes). Les contrats signés sont une
 *      sous-ligne des travaux avec le mot « plafond » : ils ne s'additionnent
 *      pas au versé et ne s'affichent plus comme un troisième montant.
 *   2. « Ce que le Conseil de Paris en a dit » — les moments jugés marquants,
 *      les plus récents d'abord, titre = le « pourquoi », détail = le fait ;
 *      le reste replié ; le Bulletin municipal tient en une ligne d'années.
 *
 * Plus de section Sources : chaque ligne porte son lien. Le récit BMO et la
 * synthèse longue restent dans l'export (chat, réutilisation).
 */

const MOIS_NUM: Record<string, number> = {
  JANVIER: 1, FEVRIER: 2, FÉVRIER: 2, MARS: 3, AVRIL: 4, MAI: 5, JUIN: 6, JUILLET: 7,
  AOUT: 8, AOÛT: 8, SEPTEMBRE: 9, OCTOBRE: 10, NOVEMBRE: 11, DECEMBRE: 12, DÉCEMBRE: 12,
};
/** « OCTOBRE 2020 » → 202010, pour trier les séances sans les traduire. */
function seanceKey(seance: string): number {
  const m = seance.match(/^([A-ZÉÛ]+)\s+(\d{4})$/);
  if (!m) return 0;
  return parseInt(m[2], 10) * 100 + (MOIS_NUM[m[1]] ?? 0);
}

/** « Faire tourner le théâtre » : l'article dépend du type de lieu. Repli
 *  neutre (« le lieu ») pour un type hors liste. */
const KIND_ARTICLE: Record<string, { fr: string; en: string }> = {
  "Théâtre": { fr: "le théâtre", en: "the theatre" },
  "Piscine": { fr: "la piscine", en: "the pool" },
  "Musée": { fr: "le musée", en: "the museum" },
  "Bibliothèque": { fr: "la bibliothèque", en: "the library" },
  "Médiathèque": { fr: "la médiathèque", en: "the library" },
  "Conservatoire": { fr: "le conservatoire", en: "the conservatoire" },
  "Salle de concert": { fr: "la salle", en: "the hall" },
  "Salle sportive": { fr: "la salle", en: "the hall" },
  "Gymnase": { fr: "le gymnase", en: "the gym" },
  "Stade": { fr: "le stade", en: "the stadium" },
  "Vélodrome": { fr: "le vélodrome", en: "the velodrome" },
  "Marché": { fr: "le marché", en: "the market" },
  "Marché couvert": { fr: "le marché", en: "the market" },
  "Parc": { fr: "le parc", en: "the park" },
  "Jardin": { fr: "le jardin", en: "the garden" },
  "Cimetière": { fr: "le cimetière", en: "the cemetery" },
  "Mairie": { fr: "la mairie", en: "the town hall" },
};

/** Première phrase d'un fait : une phrase entière, jamais une coupe au milieu
 *  d'un mot. Le point doit suivre un mot ordinaire (pas « M. » ni un sigle)
 *  et précéder une majuscule. */
function firstSentence(s: string): string {
  const m = s.match(/^[\s\S]*?[a-zà-ÿ0-9)»%][.!?](?=\s+[A-ZÀ-Ý«])/);
  return m ? m[0] : s;
}

const spanTxt = (a: number, b: number) => (a === b ? String(a) : `${a}–${b}`);
const minMax = (ys: number[]): [number, number] | null => {
  const v = ys.filter((y) => !Number.isNaN(y));
  return v.length ? [Math.min(...v), Math.max(...v)] : null;
};

function Eur({ v, u, size = 22 }: { v: string; u: string; size?: number }) {
  return (
    <span className="fx-v3-amt tnum" style={{ fontSize: size }}>
      {v}
      <span className="u">{u}</span>
    </span>
  );
}

function Fold({ label, children }: { label: string; children: ReactNode }) {
  return (
    <details className="fx-v3-fold">
      <summary>{label}</summary>
      {children}
    </details>
  );
}

export default function LieuFiche({ lieu }: { lieu: LieuFicheData }) {
  const t = useT();
  const { locale } = useLocale();
  const { basePath } = useCity();
  const locStr = numLocale(locale);
  const en = locale === "en";

  const fmtEur = (n: number): { v: string; u: string } => {
    if (n >= 1e9) return { v: new Intl.NumberFormat(locStr, { maximumFractionDigits: 2 }).format(n / 1e9), u: t("fx.s.md_eur") };
    if (n >= 1e6) return { v: new Intl.NumberFormat(locStr, { maximumFractionDigits: 1 }).format(n / 1e6), u: t("fx.s.m_eur") };
    return { v: new Intl.NumberFormat(locStr, { maximumFractionDigits: 0 }).format(n / 1000), u: "k €" };
  };
  const eurTxt = (n: number) => { const f = fmtEur(n); return `${f.v} ${f.u}`; };

  /* ── L'argent : versé/payé d'un côté, plafonds de contrats de l'autre ── */
  const subv = lieu.subventions_exploitant;
  const subvTotal = subv?.total_eur ?? 0;
  const investTotal = lieu.invest.reduce((a, r) => a + r.montant_eur, 0);
  const travauxTotal = investTotal + (lieu.mandate?.total_eur ?? 0);
  const reelTotal = subvTotal + travauxTotal;
  const marches = [...(lieu.marches ?? [])].sort((a, b) => (b.montant_max || 0) - (a.montant_max || 0));
  const plafond = marches.reduce((a, m) => a + (m.montant_max || 0), 0);
  const nChantiers = (lieu.mandate?.operations.length ?? 0) + lieu.invest.length;

  const travauxSpan = minMax([
    ...(lieu.mandate ? [parseInt(lieu.mandate.periode[0], 10), parseInt(lieu.mandate.periode[1], 10)] : []),
    ...lieu.invest.map((r) => parseInt(String(r.annee), 10)),
  ]);
  const verseSpan = minMax([
    ...(subv ? [parseInt(subv.annees[0], 10), parseInt(subv.annees[1], 10)] : []),
    ...(travauxSpan ?? []),
  ]);
  const marcheSpan = minMax(marches.map((m) => parseInt((m.date_notification ?? "").slice(0, 4), 10)));
  const fournisseurs = [...new Set(marches.map((m) => m.fournisseur).filter(Boolean) as string[])];
  const fournTxt = (() => {
    const head = fournisseurs.slice(0, 2);
    const rest = fournisseurs.length - head.length;
    if (!head.length) return "";
    if (rest <= 0) return head.join(en ? " and " : " et ");
    return `${head.join(", ")} ${fill(t(rest === 1 ? "fx.lieu.contrats_autres1" : "fx.lieu.contrats_autres"), { n: rest })}`;
  })();
  const kindArt = KIND_ARTICLE[lieu.kind_fr];
  const kindTxt = kindArt ? (en ? kindArt.en : kindArt.fr) : t("fx.lieu.line.lieu_generique");
  const barMax = Math.max(subvTotal, travauxTotal);
  const showBars = subvTotal > 0 && travauxTotal > 0;

  /* ── Les décisions : vedettes d'abord, récentes d'abord ──────────────── */
  type Moment = LieuFicheData["moments"][number];
  const hasRanking = lieu.moments.some((m) => m.vedette === false);
  const sorted = [...lieu.moments].sort((a, b) => seanceKey(b.seance) - seanceKey(a.seance));
  const shown = hasRanking ? sorted.filter((m) => m.vedette !== false) : sorted.slice(0, 4);
  const rest = hasRanking ? sorted.filter((m) => m.vedette === false) : sorted.slice(4);
  const restSpan = minMax(rest.map((m) => Math.floor(seanceKey(m.seance) / 100)).filter((y) => y > 0));
  const bmo = [...lieu.bmo_extraits].sort((a, b) => b.date.localeCompare(a.date));

  /* ── Lead : première phrase de Wikipédia, le reste à un clic ─────────── */
  const extract = (en ? lieu.wiki.extract_en : null) || lieu.wiki.extract || "";
  const cut = extract.indexOf(". ");
  const leadMain = cut > 0 ? extract.slice(0, cut + 1) : extract;

  const MomentRow = (m: Moment) => (
    <a key={m.id} className="fx-v3-mom fx-row-link" href={m.source_url ?? undefined} target="_blank" rel="noopener noreferrer">
      <span className="d tnum">{seanceEn(m.seance, locale)}</span>
      <span className="t">{cap((en && m.pourquoi_en) || m.pourquoi || m.fait)}</span>
      <span className="c" aria-hidden="true">→</span>
      {m.pourquoi && <span className="s">{firstSentence((en && m.fait_en) || m.fait)}</span>}
    </a>
  );

  const MarcheRow = (m: (typeof marches)[number]) => (
    <Link key={m.numero_marche} href={`${basePath}/marches/contrat/${encodeURIComponent(m.numero_marche)}`} scroll={false} className="fx-v3-row fx-row-link">
      <span className="lbl">
        {m.objet_clair || normalizeObjet(m.objet)}
        <span aria-hidden="true" className="muted"> →</span>
        {m.fournisseur && <span className="sub">{m.fournisseur}{m.date_notification ? ` · ${m.date_notification.slice(0, 4)}` : ""}</span>}
      </span>
      <Eur {...fmtEur(m.montant_max)} size={14} />
    </Link>
  );

  return (
    <div className="fx-v3">
      {lieu.photo && (
        <div className="fx-fiche-thumb-wrap" style={{ position: "relative" }}>
          <img src={lieu.photo} alt={lieu.name} className="fx-fiche-thumb fx-v3-photo" />
          {lieu.photo_credit?.url && (
            <a href={lieu.photo_credit.url} target="_blank" rel="noopener noreferrer" className="fx-v3-credit">
              {lieu.photo_credit.licence ? `© ${lieu.photo_credit.licence} · ` : ""}
              {lieu.photo_credit.source}
            </a>
          )}
        </div>
      )}

      {leadMain && (
        <p className="fx-v3-lead">
          {leadMain}{" "}
          {lieu.wiki.url && (
            <a href={lieu.wiki.url} target="_blank" rel="noopener noreferrer" className="fx-v3-lead-link">
              {en ? "Wikipedia ↗" : "Wikipédia ↗"}
            </a>
          )}
        </p>
      )}

      {/* ── Le chiffre — versé si on en a, sinon le plafond, sinon rien ── */}
      {reelTotal > 0 ? (
        <div className="fx-v3-hero">
          <div className="fx-v3-hero-num tnum">{fmtEur(reelTotal).v}<span className="u">{fmtEur(reelTotal).u}</span></div>
          <div className="fx-v3-hero-cap">
            {verseSpan && verseSpan[0] !== verseSpan[1]
              ? fill(t("fx.lieu.hero.verse"), { y: verseSpan[0] })
              : fill(t("fx.lieu.hero.verse_one"), { y: verseSpan?.[1] ?? "" })}
          </div>
        </div>
      ) : plafond > 0 ? (
        <div className="fx-v3-hero">
          <div className="fx-v3-hero-num tnum">{fmtEur(plafond).v}<span className="u">{fmtEur(plafond).u}</span></div>
          <div className="fx-v3-hero-cap">{t("fx.lieu.hero.engage")}</div>
        </div>
      ) : (
        lieu.residents.length === 0 && <p className="fx-v3-foot" style={{ margin: "20px 0 32px" }}>{t("fx.lieu.argent_absent")}</p>
      )}

      {/* ── Où va l'argent ─────────────────────────────────────────────── */}
      {(subv || travauxTotal > 0 || marches.length > 0 || lieu.residents.length > 0) && (
        <section className="fx-v3-section">
          <h2 className="fx-v3-h2">{t("fx.lieu.h.argent")}</h2>
          <div className="fx-v3-rule" />

          {subv && (
            <div className="fx-v3-line">
              <div className="t">{cap(fill(t("fx.lieu.line.exploitant"), { k: kindTxt }))}</div>
              <div className="a">
                <Eur {...fmtEur(subvTotal)} />
                <div className="q">{t("fx.lieu.q.verses")} · {subv.rows.length > 1 ? spanTxt(parseInt(subv.annees[0], 10), parseInt(subv.annees[1], 10)) : subv.annees[0]}</div>
              </div>
              <div className="s">
                {t("fx.lieu.line.exploitant_sub")}{" "}
                <Link href={`${basePath}/subventions/association/${encodeURIComponent(subv.nom_fiche)}`} scroll={false}>{subv.nom_fiche} →</Link>
                {subv.note_publique && <> {(en && subv.note_publique_en) || subv.note_publique}</>}
              </div>
              {showBars && <div className="bar"><span style={{ width: `${(subvTotal / barMax) * 100}%` }} /></div>}
              {subv.rows.length > 1 && (
                <div className="fold-wrap">
                  <Fold label={fill(t("fx.lieu.subv_deplier"), { n: subv.rows.length })}>
                    {subv.rows.map((r) => (
                      <div key={r.annee} className="fx-v3-row">
                        <span className="lbl mono">{r.annee}</span>
                        <Eur {...fmtEur(r.montant_eur)} size={14} />
                      </div>
                    ))}
                  </Fold>
                </div>
              )}
            </div>
          )}

          {(travauxTotal > 0 || marches.length > 0) && (() => {
            const paye = travauxTotal > 0;
            return (
              <div className="fx-v3-line">
                <div className="t">{t("fx.lieu.line.travaux")}</div>
                <div className="a">
                  <Eur {...fmtEur(paye ? travauxTotal : plafond)} />
                  <div className="q">
                    {paye
                      ? <>{t("fx.lieu.q.payes")}{travauxSpan ? ` · ${spanTxt(...travauxSpan)}` : ""}</>
                      : <>{t("fx.lieu.q.plafond")}{marcheSpan ? ` · ${spanTxt(...marcheSpan)}` : ""}</>}
                  </div>
                </div>
                {paye && (
                  <div className="s">{fill(t(nChantiers === 1 ? "fx.lieu.line.travaux_sub1" : "fx.lieu.line.travaux_sub"), { n: nChantiers })}{lieu.mandate ? ` ${t("fx.lieu.line.travaux_caveat")}` : ""}</div>
                )}
                {marches.length > 0 && (
                  <div className="s">
                    {paye ? t("fx.lieu.line.contrats_et") : ""}
                    {cap(fill(t(marches.length === 1 ? "fx.lieu.line.contrats1" : "fx.lieu.line.contrats"), {
                      n: marches.length,
                      a: marcheSpan ? spanTxt(...marcheSpan) : "",
                      f: fournTxt,
                    }))}
                    {" "}
                    {paye ? fill(t("fx.lieu.line.contrats_plafond"), { m: eurTxt(plafond) }) : t("fx.lieu.line.contrats_plafond_seul")}
                  </div>
                )}
                {showBars && <div className="bar"><span style={{ width: `${(travauxTotal / barMax) * 100}%` }} /></div>}
                <div className="fold-wrap">
                  {paye && nChantiers > 0 && (
                    <Fold label={fill(t(nChantiers === 1 ? "fx.lieu.fold_chantier1" : "fx.lieu.fold_chantiers"), { n: nChantiers })}>
                      {lieu.mandate?.operations.map((o) => {
                        const ys = minMax(Object.keys(o.mandate_par_annee).map(Number));
                        return (
                          <a key={o.ap_cle ?? o.ap_texte} className="fx-v3-row fx-row-link" href={o.source_url} target="_blank" rel="noopener noreferrer">
                            <span className="lbl">
                              {o.ap_texte}
                              <span aria-hidden="true" className="muted"> ↗</span>
                              <span className="sub">{ys ? `${spanTxt(...ys)} · ` : ""}{t("fx.lieu.src_ca")}</span>
                            </span>
                            <Eur {...fmtEur(o.total_mandate)} size={14} />
                          </a>
                        );
                      })}
                      {lieu.invest.map((r, i) => {
                        const body = (
                          <>
                            <span className="lbl">
                              {r.nom_projet}
                              {r.id && <span aria-hidden="true" className="muted"> →</span>}
                              <span className="sub">{r.annee} · {t("fx.lieu.src_ca")}</span>
                            </span>
                            <Eur {...fmtEur(r.montant_eur)} size={14} />
                          </>
                        );
                        return r.id ? (
                          <Link key={i} href={`${basePath}/investissements/projet/${encodeURIComponent(r.id)}`} scroll={false} className="fx-v3-row fx-row-link">{body}</Link>
                        ) : (
                          <div key={i} className="fx-v3-row">{body}</div>
                        );
                      })}
                    </Fold>
                  )}
                  {marches.length > 0 && (
                    <Fold label={fill(t(marches.length === 1 ? "fx.lieu.fold_contrat1" : "fx.lieu.fold_contrats"), { n: marches.length })}>
                      {marches.map(MarcheRow)}
                    </Fold>
                  )}
                </div>
              </div>
            );
          })()}

          {lieu.residents.length > 0 && (
            <div className="fx-v3-line">
              <div className="t">{t("fx.lieu.h.residents")}</div>
              <div className="a" />
              <div className="s">{t("fx.lieu.residents_intro")}</div>
              <div className="fold-wrap" style={{ marginTop: 4 }}>
                {lieu.residents.map((r, i) => (
                  <Link key={i} href={`${basePath}/subventions/association/${encodeURIComponent(r.beneficiaire)}`} scroll={false} className="fx-v3-row fx-row-link">
                    <span className="lbl">{r.beneficiaire} <span aria-hidden="true" className="muted">→</span></span>
                    {r.montant_total > 0 && <Eur {...fmtEur(r.montant_total)} size={14} />}
                  </Link>
                ))}
              </div>
            </div>
          )}

          {marches.length > 0 && (
            <p className="fx-v3-foot">
              {reelTotal > 0 ? fill(t("fx.lieu.note.total"), { t: eurTxt(reelTotal) }) : t("fx.lieu.note.plafond_seul")}
            </p>
          )}
        </section>
      )}

      {/* ── Ce que le Conseil de Paris en a dit ────────────────────────── */}
      {(lieu.moments.length > 0 || bmo.length > 0) && (
        <section className="fx-v3-section">
          <h2 className="fx-v3-h2">{t("fx.lieu.h.conseil")}</h2>
          {lieu.moments.length > 0 && (
            <p className="fx-v3-h2sub">
              {(() => {
                const lus = lieu.stats.n_lus ?? lieu.moments.length;
                const n = shown.length;
                const key = n === 1 && lus === 1 ? "fx.lieu.conseil_sub_11"
                  : n === 1 ? (hasRanking ? "fx.lieu.conseil_sub_1" : "fx.lieu.conseil_sub_all_1")
                  : lus === 1 ? "fx.lieu.conseil_sub_lus1"
                  : hasRanking ? "fx.lieu.conseil_sub" : "fx.lieu.conseil_sub_all";
                return fill(t(key), { n, lus });
              })()}
            </p>
          )}
          <div className="fx-v3-rule" />
          {shown.map(MomentRow)}
          <div className="fx-v3-more">
            {rest.length > 0 && (
              <Fold label={fill(t(rest.length === 1 ? "fx.lieu.more_moments1" : "fx.lieu.more_moments"), { n: rest.length, a: restSpan ? spanTxt(...restSpan) : "" })}>
                {rest.map(MomentRow)}
              </Fold>
            )}
            {bmo.length > 0 && (
              <p>
                {t("fx.lieu.bmo_line")}{" "}
                {bmo.map((b, i) => (
                  <span key={i}>
                    {i > 0 ? " · " : ""}
                    <a href={b.source_url} target="_blank" rel="noopener noreferrer" title={((en && b.extrait_en) || b.extrait).slice(0, 160)}>{b.date.slice(0, 4)}</a>
                  </span>
                ))}
              </p>
            )}
            {lieu.moments.length > 0 && (
              <p><a href={lieu.sources.delibs.url} target="_blank" rel="noopener noreferrer">{t("fx.lieu.delibs_all")}</a></p>
            )}
          </div>
        </section>
      )}
    </div>
  );
}
