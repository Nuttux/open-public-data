"use client";

import type { ReactNode } from "react";
import type { LieuFicheData } from "@/lib/lieux-data";
import Link from "next/link";
import { useT, useLocale } from "@/lib/localeContext";
import { normalizeObjet } from "@/lib/objet-normalizer";

const fill = (s: string, vars: Record<string, string | number>) => {
  let r = s;
  for (const [k, v] of Object.entries(vars)) r = r.split(`{${k}}`).join(String(v));
  return r;
};

const BMO_SHOWN = 5;

/** Met en relief les montants dans une phrase (« 117 167 610 € », « 3,2 M€ »,
 *  « 240 000 euros ») — l'audit UX : une timeline financière doit se scanner
 *  de montant en montant. */
const MONEY_RE = /(\d[\d\u202f\s.,]*(?:\s?(?:M€|€|millions? d[’']euros|euros|francs)|\s?%))/g;
function Money({ text }: { text: string }) {
  const parts = text.split(MONEY_RE);
  return (
    <>
      {parts.map((p, i) =>
        i % 2 === 1 ? (
          <b key={i} className="tnum" style={{ fontFamily: "var(--f-mono)", fontSize: "0.95em", fontWeight: 600 }}>
            {p}
          </b>
        ) : (
          p
        ),
      )}
    </>
  );
}

/** Montant en typo display (Inter Tight 700) + unité petite et muette : la
 *  grammaire d'argent partagée par toutes les fiches (Projet, Association).
 *  Remplace l'ancien rendu mono qui trahissait « une autre main » (audit). */
function Eur({ v, u, size = 13.5 }: { v: string; u: string; size?: number }) {
  return (
    <span
      className="tnum"
      style={{ fontFamily: "var(--f-disp)", fontWeight: 700, letterSpacing: "-0.01em", whiteSpace: "nowrap", fontSize: size }}
    >
      {v}
      <span style={{ fontSize: ".7em", color: "var(--muted)", fontWeight: 500 }}> {u}</span>
    </span>
  );
}

/**
 * Fiche « lieu » v0 — un objet physique de la ville : ce que le Conseil de
 * Paris en a dit (moments, montants — chaque ligne liée à son document),
 * les investissements des annexes CA, et les extraits vérifiés du BMO
 * (Gallica/BnF). La synthèse longue reste dans l'export (chat,
 * réutilisation) ; la fiche montre la donnée. Voir docs/paris-lieux/PLAN.md.
 */
export default function LieuFiche({ lieu }: { lieu: LieuFicheData }) {
  const t = useT();
  const { locale } = useLocale();
  const locStr = locale === "en" ? "en-GB" : "fr-FR";

  const fmtEur = (n: number): { v: string; u: string } => {
    if (n >= 1e9) return { v: new Intl.NumberFormat(locStr, { maximumFractionDigits: 2 }).format(n / 1e9), u: t("fx.s.md_eur") };
    if (n >= 1e6) return { v: new Intl.NumberFormat(locStr, { maximumFractionDigits: 1 }).format(n / 1e6), u: t("fx.s.m_eur") };
    return { v: new Intl.NumberFormat(locStr, { maximumFractionDigits: 0 }).format(n / 1000), u: "k €" };
  };

  const s = lieu.stats;
  const bmo = lieu.bmo_extraits.slice(0, BMO_SHOWN);

  // Bandeau KPI — l'argent d'abord, puis la profondeur d'archive : ce qu'un
  // visiteur veut lire en 5 s. (Audit UX : « 32 délibs / 1899 » en tête ne dit
  // rien à un profane.) On garde les 2 signaux les plus forts → grille sans
  // cellule vide. La priorité argent respecte l'attribution honnête (le total
  // exploitant peut couvrir plusieurs lieux — la note publique le précise plus bas).
  const investTotal = lieu.invest.reduce((a, r) => a + r.montant_eur, 0);
  const subv = lieu.subventions_exploitant;
  // Le diptyque payé/engagé : « Dépensé » = versé (subventions) + mandaté (CA,
  // opérations 2009-2017 + projets d'annexes 2019-2024) ; « Engagé » = plafonds
  // de marchés notifiés. Deux grandeurs, jamais sommées.
  const reelTotal = (subv?.total_eur ?? 0) + investTotal + (lieu.mandate?.total_eur ?? 0);
  const engageTotal = (lieu.marches ?? []).reduce((a, m) => a + (m.montant_max || 0), 0);
  const kpiItems: { label: ReactNode; value: ReactNode; href?: string }[] = [];
  if (lieu.kpi_montant) {
    kpiItems.push({
      label: locale === "en" ? lieu.kpi_montant.label_en : lieu.kpi_montant.label_fr,
      value: lieu.kpi_montant.valeur,
      href: lieu.kpi_montant.source_url ?? undefined,
    });
  }
  if (reelTotal > 0) {
    const f = fmtEur(reelTotal);
    kpiItems.push({ label: t("fx.lieu.kpi.reel"), value: <>{f.v}<span className="u">{f.u}</span></> });
  }
  if (engageTotal > 0) {
    const f = fmtEur(engageTotal);
    kpiItems.push({ label: t("fx.lieu.kpi.engage"), value: <>{f.v}<span className="u">{f.u}</span></> });
  }
  if (bmo.length > 0) {
    kpiItems.push({ label: t("fx.lieu.kpi.bmo_since"), value: bmo[0].date.slice(0, 4) });
  }
  if (s.n_lieu != null) {
    kpiItems.push({
      label: `${t("fx.lieu.kpi.delibs")}${s.delibs_span ? ` ${s.delibs_span[0]}–${s.delibs_span[1]}` : ""}`,
      value: s.n_lieu,
    });
  }
  const kpis = kpiItems.slice(0, 2);

  const SRC = { color: "var(--bleu)", borderBottom: "1px solid var(--bleu)" } as const;
  // Lead = extrait Wikipédia, coupé à la première phrase / le reste en sub.
  const extract = lieu.wiki.extract ?? "";
  const cut = extract.indexOf(". ");
  const leadMain = cut > 0 ? extract.slice(0, cut + 1) : extract;
  const leadSub = cut > 0 ? extract.slice(cut + 2) : null;

  return (
    <div>
      {lieu.photo && (
        <div className="fx-fiche-thumb-wrap" style={{ position: "relative" }}>
          <img
            src={lieu.photo}
            alt={lieu.name}
            className="fx-fiche-thumb"
            style={{ aspectRatio: "16 / 9", width: "100%", objectFit: "cover", display: "block" }}
          />
          {lieu.photo_credit?.url && (
            <a
              href={lieu.photo_credit.url}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                position: "absolute", right: 8, bottom: 8, background: "rgba(10,10,10,.72)",
                color: "#fff", fontFamily: "var(--f-mono)", fontSize: 9, padding: "3px 7px",
                textDecoration: "none",
              }}
            >
              {lieu.photo_credit.licence ? `© ${lieu.photo_credit.licence} · ` : ""}
              {lieu.photo_credit.source}
            </a>
          )}
        </div>
      )}

      {extract && (
        <div className="fx-fiche-lead">
          <p className="fx-fiche-lead-main">{leadMain}</p>
          {(leadSub || lieu.wiki.url) && (
            <p className="fx-fiche-lead-sub">
              {leadSub}{leadSub ? " " : ""}
              {lieu.wiki.url && (
                <a
                  href={lieu.wiki.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ fontFamily: "var(--f-mono)", fontSize: 11, color: "var(--muted)" }}
                >
                  Wikipédia ↗
                </a>
              )}
            </p>
          )}
        </div>
      )}

      {kpis.length > 0 && (
        <div className="fx-fiche-kpis" style={kpis.length === 1 ? { gridTemplateColumns: "1fr" } : undefined}>
          {kpis.map((k, i) => {
            const val = <div className="fx-fiche-kpi-value tnum">{k.value}</div>;
            return (
              <div className="fx-fiche-kpi" key={i}>
                <div className="fx-fiche-kpi-label">{k.label}</div>
                {k.href
                  ? k.href.startsWith("/")
                    ? <Link href={k.href} style={{ textDecoration: "none", color: "inherit" }}>{val}</Link>
                    : <a href={k.href} target="_blank" rel="noopener noreferrer" style={{ textDecoration: "none", color: "inherit" }}>{val}</a>
                  : val}
              </div>
            );
          })}
        </div>
      )}

      {/* Décomposition du Dépensé : béton ou exploitation ? Une barre empilée
       *  d'une ligne suffit pour 2 catégories — un graphe serait du bruit.
       *  Le fonctionnement en régie n'apparaît pas : non publié par lieu. */}
      {(() => {
        const travaux = investTotal + (lieu.mandate?.total_eur ?? 0);
        const subvT = subv?.total_eur ?? 0;
        if (travaux <= 0 || subvT <= 0) return null;
        const tot = travaux + subvT;
        const ft = fmtEur(travaux); const fs = fmtEur(subvT);
        const SEG = [
          { k: "travaux", v: travaux, f: ft, c: "#1e45e4", label: t("fx.lieu.split.travaux") },
          { k: "subv", v: subvT, f: fs, c: "#4a3aa7", label: t("fx.lieu.split.subv") },
        ];
        return (
          <div style={{ margin: "-12px 0 24px" }}>
            <div style={{ display: "flex", gap: 2, height: 10 }}>
              {SEG.map((g) => (
                <div key={g.k} title={`${g.label} — ${g.f.v} ${g.f.u}`}
                     style={{ width: `${(g.v / tot) * 100}%`, background: g.c, minWidth: 6 }} />
              ))}
            </div>
            <div style={{ display: "flex", gap: 18, marginTop: 6, flexWrap: "wrap" }}>
              {SEG.map((g) => (
                <span key={g.k} style={{ fontFamily: "var(--f-mono)", fontSize: 10, letterSpacing: ".04em", color: "var(--muted)", display: "inline-flex", alignItems: "center", gap: 5 }}>
                  <span style={{ width: 7, height: 7, borderRadius: 2, background: g.c, display: "inline-block" }} />
                  {g.label} <b className="tnum" style={{ color: "var(--ink)", fontWeight: 600 }}>{g.f.v} {g.f.u}</b>
                </span>
              ))}
            </div>
          </div>
        );
      })()}

      {/* Absence d'argent rattachable ≠ lieu gratuit. Le fonctionnement courant
       *  (entretien, personnel) n'est pas ventilé par lieu dans l'open data : on
       *  le dit, sinon le vide se lit comme « ne coûte rien ». */}
      {!lieu.subventions_exploitant && lieu.residents.length === 0 && lieu.invest.length === 0 && !(lieu.marches?.length) && (
        <p className="fx-fiche-note">{t("fx.lieu.argent_absent")}</p>
      )}

      {lieu.subventions_exploitant && (() => {
        const sub = lieu.subventions_exploitant;
        // Total sur la période par défaut ; le détail annuel est à un clic.
        // Un seul exercice → la ligne annuelle serait redondante avec le total.
        const multi = sub.rows.length > 1;
        const Row = (r: (typeof sub.rows)[number]) => (
          <div key={r.annee} style={{ display: "flex", justifyContent: "space-between", gap: 12, padding: "11px 6px", borderBottom: "1px solid var(--rule)", alignItems: "baseline" }}>
            <span style={{ fontFamily: "var(--f-mono)", fontSize: 10.5, color: "var(--muted)" }}>{r.annee}</span>
            <Eur {...fmtEur(r.montant_eur)} size={13} />
          </div>
        );
        return (
          <section className="fx-fiche-section">
            <div className="fx-fiche-h fx-fiche-h--money" style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12 }}>
              <span style={{ flex: 1, textAlign: "left" }}>{t("fx.lieu.h.subv")}</span>
              <Eur {...fmtEur(sub.total_eur)} size={14} />
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12, padding: "6px 6px 14px", borderBottom: "1px solid var(--rule)" }}>
              <Link
                href={`/fr/city/paris/subventions/association/${encodeURIComponent(sub.nom_fiche)}`}
                className="fx-row-link"
                style={{ fontSize: 13.5, fontWeight: 600 }}
              >
                {sub.nom_fiche} →
              </Link>
              <span style={{ display: "inline-flex", alignItems: "baseline", gap: 6, whiteSpace: "nowrap" }}>
                <span style={{ fontFamily: "var(--f-mono)", fontWeight: 400, color: "var(--muted)", fontSize: 10.5 }}>
                  {multi
                    ? fill(t("fx.lieu.subv_periode"), { n: sub.rows.length, a: `${sub.annees[0]}–${sub.annees[1]}` })
                    : sub.annees[0]}
                </span>
              </span>
            </div>
            {multi && (
              <details>
                <summary style={{ fontFamily: "var(--f-mono)", fontSize: 10, letterSpacing: ".07em", textTransform: "uppercase", color: "var(--bleu)", cursor: "pointer", padding: "10px 6px" }}>
                  {fill(t("fx.lieu.subv_deplier"), { n: sub.rows.length })}
                </summary>
                {sub.rows.map(Row)}
              </details>
            )}
            {/* Attribution honnête : un exploitant multi-lieu ne dépense pas tout ici. */}
            {sub.note_publique && <p className="fx-fiche-note">{sub.note_publique}</p>}
          </section>
        );
      })()}

      {lieu.residents.length > 0 && (
        <section className="fx-fiche-section">
          <div className="fx-fiche-h">{t("fx.lieu.h.residents")}</div>
          <p style={{ fontSize: 12.5, color: "var(--muted)", margin: "0 0 8px", lineHeight: 1.5 }}>
            {t("fx.lieu.residents_intro")}
          </p>
          {lieu.residents.map((r, i) => (
            <Link
              key={i}
              href={`/fr/city/paris/subventions/association/${encodeURIComponent(r.beneficiaire)}`}
              className="fx-row-link"
              style={{ display: "flex", justifyContent: "space-between", gap: 12, padding: "10px 6px", borderBottom: "1px solid var(--rule)", alignItems: "baseline" }}
            >
              <span style={{ fontSize: 13, color: "var(--ink-2)" }}>{r.beneficiaire} →</span>
              {r.montant_total > 0 && <Eur {...fmtEur(r.montant_total)} size={12.5} />}
            </Link>
          ))}
        </section>
      )}

      {(lieu.invest.length > 0 || lieu.mandate) && (
        <section className="fx-fiche-section">
          <div className="fx-fiche-h fx-fiche-h--money" style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12 }}>
            <span style={{ flex: 1, textAlign: "left" }}>{t("fx.lieu.h.invest")}</span>
            <Eur {...fmtEur(investTotal + (lieu.mandate?.total_eur ?? 0))} size={14} />
          </div>
          {lieu.mandate && (() => {
            // Série annuelle fusionnée : opérations AP (2009-2017) + projets
            // d'annexes (2019-2024). Le trou 2018 est réel (non publié) et
            // laissé visible. Barres fines, une teinte, libellé direct sur le pic.
            const serie: Record<string, number> = { ...lieu.mandate!.par_annee };
            for (const r of lieu.invest) {
              const a = String(r.annee);
              serie[a] = (serie[a] ?? 0) + r.montant_eur;
            }
            const presentes = Object.keys(serie).sort();
            const a0 = parseInt(presentes[0], 10);
            const a1 = parseInt(presentes[presentes.length - 1], 10);
            // Axe du temps CONTINU : les années sans donnée (dont le trou 2018,
            // non publié) restent des colonnes vides — compresser l'axe fausserait
            // la lecture (2014 collé à 2022).
            const annees = Array.from({ length: a1 - a0 + 1 }, (_, i) => String(a0 + i));
            const max = Math.max(...presentes.map((a) => serie[a]));
            const pic = presentes.find((a) => serie[a] === max)!;
            return (
              <div style={{ padding: "4px 6px 0" }}>
                <div style={{ display: "flex", alignItems: "flex-end", gap: 3, height: 74 }}>
                  {annees.map((a) => {
                    const v = serie[a] ?? 0;
                    const f = fmtEur(v);
                    return (
                      <div key={a} title={v ? `${a} — ${f.v} ${f.u}` : `${a} — ${t("fx.lieu.mandate_vide")}`}
                           style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 3 }}>
                        {a === pic && (
                          <span className="tnum" style={{ fontFamily: "var(--f-mono)", fontSize: 9, color: "var(--ink-2)", whiteSpace: "nowrap" }}>
                            {f.v} {f.u}
                          </span>
                        )}
                        <div style={{ width: "100%", maxWidth: 26, height: v ? Math.max(3, Math.round((v / max) * 52)) : 1, background: v ? "var(--bleu)" : "var(--rule)" }} />
                        <span className="tnum" style={{ fontFamily: "var(--f-mono)", fontSize: 8.5, color: "var(--muted)" }}>{a.slice(2)}</span>
                      </div>
                    );
                  })}
                </div>
                <details>
                  <summary style={{ fontFamily: "var(--f-mono)", fontSize: 10, letterSpacing: ".07em", textTransform: "uppercase", color: "var(--bleu)", cursor: "pointer", padding: "10px 0" }}>
                    {fill(t(lieu.mandate!.operations.length === 1 ? "fx.lieu.mandate_op1" : "fx.lieu.mandate_ops"), { n: lieu.mandate!.operations.length, a: `${lieu.mandate!.periode[0]}–${lieu.mandate!.periode[1]}` })}
                  </summary>
                  {lieu.mandate!.operations.map((o) => (
                    <a key={o.ap_cle ?? o.ap_texte} className="fx-row-link" href={o.source_url} target="_blank" rel="noopener noreferrer"
                       style={{ display: "flex", justifyContent: "space-between", gap: 12, padding: "10px 6px", borderBottom: "1px solid var(--rule)", alignItems: "baseline" }}>
                      <span style={{ fontSize: 12.5, color: "var(--ink-2)", flex: 1 }}>
                        {o.ap_texte}
                        <span aria-hidden="true" style={{ fontFamily: "var(--f-mono)", fontSize: 11, color: "var(--muted)" }}> ↗</span>
                      </span>
                      <Eur {...fmtEur(o.total_mandate)} size={12.5} />
                    </a>
                  ))}
                </details>
                <p className="fx-fiche-note" style={{ marginTop: 2 }}>{t("fx.lieu.mandate_note")}</p>
              </div>
            );
          })()}
          {lieu.invest.map((r, i) => {
            const rowStyle = { display: "flex", justifyContent: "space-between", gap: 12, padding: "11px 6px", borderBottom: "1px solid var(--rule)", alignItems: "baseline" } as const;
            const body = (
              <>
                <span style={{ fontSize: 13, color: "var(--ink-2)" }}>
                  {r.nom_projet}
                  {r.id && <span aria-hidden="true" style={{ color: "var(--muted)" }}> →</span>}
                  <span style={{ fontFamily: "var(--f-mono)", fontSize: 10.5, color: "var(--muted)", marginLeft: 8 }}>{r.annee}</span>
                </span>
                <Eur {...fmtEur(r.montant_eur)} size={13} />
              </>
            );
            // Le projet a été rattaché au lieu par le juge : on le rend cliquable
            // vers sa fiche quand on a retrouvé son id (lien lieu → projet).
            return r.id ? (
              <Link key={i} href={`/fr/city/paris/investissements/projet/${encodeURIComponent(r.id)}`} className="fx-row-link" style={rowStyle}>
                {body}
              </Link>
            ) : (
              <div key={i} style={rowStyle}>{body}</div>
            );
          })}
        </section>
      )}

      {/* Marchés publics du lieu — troisième source d'argent public, à côté des
       *  subventions et des investissements. Chaque ligne mène à sa fiche
       *  contrat (donc au fournisseur), ce qui referme la boucle lieu → marché
       *  → fournisseur. Rattachement jugé « au-lieu » en amont. */}
      {(lieu.marches?.length ?? 0) > 0 && (() => {
        // Résumé + dépliant, comme les deux autres sections d'argent : le
        // résumé d'une liste de contrats, ce sont ses plus gros — top 3
        // visibles (tri par plafond), le reste replié à l'identique.
        const marches = [...lieu.marches!].sort((a, b) => (b.montant_max || 0) - (a.montant_max || 0));
        const MRow = (m: (typeof marches)[number]) => (
          <Link
            key={m.numero_marche}
            href={`/fr/city/paris/marches/contrat/${encodeURIComponent(m.numero_marche)}`}
            className="fx-row-link"
            style={{ display: "flex", justifyContent: "space-between", gap: 12, padding: "11px 6px", borderBottom: "1px solid var(--rule)", alignItems: "baseline" }}
          >
            <span style={{ fontSize: 13, color: "var(--ink-2)", flex: 1 }}>
              {m.objet_clair || normalizeObjet(m.objet)}
              <span aria-hidden="true" style={{ color: "var(--muted)" }}> →</span>
              {m.fournisseur && (
                <span style={{ display: "block", fontFamily: "var(--f-mono)", fontSize: 10, letterSpacing: ".04em", textTransform: "uppercase", color: "var(--muted)", marginTop: 2 }}>
                  {m.fournisseur}
                  {m.date_notification ? ` · ${m.date_notification.slice(0, 4)}` : ""}
                </span>
              )}
            </span>
            <Eur {...fmtEur(m.montant_max)} size={13} />
          </Link>
        );
        return (
          <section className="fx-fiche-section">
            <div className="fx-fiche-h fx-fiche-h--money" style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12 }}>
              <span style={{ flex: 1, textAlign: "left" }}>{t("fx.lieu.h.marches")}</span>
              <Eur {...fmtEur(engageTotal)} size={14} />
            </div>
            {marches.slice(0, 3).map(MRow)}
            {marches.length > 3 && (
              <details>
                <summary style={{ fontFamily: "var(--f-mono)", fontSize: 10, letterSpacing: ".07em", textTransform: "uppercase", color: "var(--bleu)", cursor: "pointer", padding: "10px 6px" }}>
                  {fill(t(marches.length - 3 === 1 ? "fx.lieu.marches_more1" : "fx.lieu.marches_more"), { n: marches.length - 3 })}
                </summary>
                {marches.slice(3).map(MRow)}
              </details>
            )}
            <p className="fx-fiche-note">{t("fx.lieu.marches_note")}</p>
          </section>
        );
      })()}

      {/* Décisions — après l'argent (les gens viennent voir combien). On met en
       *  avant les moments JUGÉS MARQUANTS (saillance, nombre variable 3-6 selon
       *  le lieu), pas les plus anciens ; le reste est replié. Sans jugement de
       *  saillance, repli chronologique sur les 4 premiers. */}
      {lieu.moments.length > 0 && (() => {
        const Moment = (m: LieuFicheData["moments"][number]) => (
          <a
            key={m.id}
            className="fx-row-link"
            href={m.source_url ?? undefined}
            target="_blank"
            rel="noopener noreferrer"
            style={{ display: "block", padding: "12px 6px", borderBottom: "1px solid var(--rule)" }}
          >
            <div style={{ display: "flex", gap: 12, alignItems: "baseline" }}>
              <span className="tnum" style={{ fontFamily: "var(--f-mono)", fontSize: 10.5, color: "var(--rouge)", fontWeight: 600, whiteSpace: "nowrap", minWidth: 86 }}>
                {m.seance}
              </span>
              <span style={{ fontSize: 13.5, lineHeight: 1.45, flex: 1 }}>
                {m.pourquoi && (
                  <span style={{ display: "block", fontFamily: "var(--f-mono)", fontSize: 10, letterSpacing: ".04em", textTransform: "uppercase", color: "var(--ocre)", marginBottom: 3 }}>
                    {m.pourquoi}
                  </span>
                )}
                <Money text={m.fait} />
              </span>
              <span aria-hidden="true" style={{ fontFamily: "var(--f-mono)", fontSize: 12, color: "var(--muted)" }}>→</span>
            </div>
          </a>
        );
        // Saillance jugée : au moins un moment marqué non-vedette → on affiche les
        // vedettes (ordre chronologique conservé) et on replie le reste. Sinon
        // repli chronologique sur 4.
        const hasRanking = lieu.moments.some((m) => m.vedette === false);
        const shown = hasRanking ? lieu.moments.filter((m) => m.vedette !== false) : lieu.moments.slice(0, 4);
        const rest = hasRanking ? lieu.moments.filter((m) => m.vedette === false) : lieu.moments.slice(4);
        return (
          <section className="fx-fiche-section">
            <div className="fx-fiche-h fx-fiche-h--moments">{t("fx.lieu.h.moments")}</div>
            {shown.map(Moment)}
            {rest.length > 0 && (
              <details>
                <summary style={{ fontFamily: "var(--f-mono)", fontSize: 10, letterSpacing: ".07em", textTransform: "uppercase", color: "var(--bleu)", cursor: "pointer", padding: "12px 6px" }}>
                  {fill(t(rest.length === 1 ? "fx.lieu.moments_more1" : "fx.lieu.moments_more"), { n: rest.length })}
                </summary>
                {rest.map(Moment)}
              </details>
            )}
            <p className="fx-fiche-note">
              {fill(t("fx.lieu.moments_note"), { lus: s.n_lus ?? 0, trouves: s.n_delibs ?? s.n_lus ?? 0 })}
            </p>
          </section>
        );
      })()}

      {/* Archive : un RÉCIT d'abord, les citations dessous en preuve. Jeter des
       *  extraits océrisés de 1926 tels quels, c'était un vidage de données que
       *  le lecteur devait interpréter seul. La section n'apparaît que si
       *  l'archive raconte vraiment quelque chose (seuil à l'export). */}
      {bmo.length > 0 && (() => {
        // Récit visible ; les citations TOUTES repliées derrière « Lire les
        // citations… » (choix user 2026-07-20) : l'OCR de 1900 en texture nuisait
        // à la lecture, mais chaque citation reste la preuve du récit — dépliable
        // sur place, chaque ligne renvoie à la page numérisée du fascicule.
        const BRow = (b: (typeof bmo)[number], i: number) => (
          <a
            key={i}
            className="fx-row-link"
            href={b.source_url}
            target="_blank"
            rel="noopener noreferrer"
            style={{ display: "block", padding: "11px 6px", borderBottom: "1px solid var(--rule)" }}
          >
            <div style={{ display: "flex", gap: 12, alignItems: "baseline" }}>
              <span className="tnum" style={{ fontFamily: "var(--f-mono)", fontSize: 10.5, color: "var(--rouge)", fontWeight: 600, whiteSpace: "nowrap", minWidth: 40 }}>
                {b.date.slice(0, 4)}
              </span>
              <span style={{ fontSize: 13, lineHeight: 1.45, color: "var(--ink-2)", flex: 1 }}>« {b.extrait.slice(0, 160)}{b.extrait.length > 160 ? "…" : ""} »</span>
              <span aria-hidden="true" style={{ fontFamily: "var(--f-mono)", fontSize: 12, color: "var(--muted)" }}>→</span>
            </div>
          </a>
        );
        return (
          <section className="fx-fiche-section">
            <div className="fx-fiche-h fx-fiche-h--moments">{t("fx.lieu.h.bmo")}</div>
            {lieu.bmo_recit && (
              <p style={{ fontSize: 14.5, lineHeight: 1.6, color: "var(--ink)", margin: "0 0 6px", padding: "0 6px" }}>
                <Money text={lieu.bmo_recit} />
              </p>
            )}
            <details>
              <summary style={{ fontFamily: "var(--f-mono)", fontSize: 10, letterSpacing: ".07em", textTransform: "uppercase", color: "var(--bleu)", cursor: "pointer", padding: "10px 6px" }}>
                {fill(t(bmo.length === 1 ? "fx.lieu.bmo_read1" : "fx.lieu.bmo_read"), { n: bmo.length })}
              </summary>
              {bmo.map(BRow)}
            </details>
            <p className="fx-fiche-note">{t("fx.lieu.bmo_note")}</p>
          </section>
        );
      })()}

      <section className="fx-fiche-section">
        <div className="fx-fiche-h">{t("fx.lieu.sources_h")}</div>
        <p className="fx-fiche-note" style={{ marginTop: 0 }}>
          <a href={lieu.sources.delibs.url} target="_blank" rel="noopener noreferrer" style={SRC}>Conseil de Paris (Débat-Délibs) ↗</a>
          {" · "}
          <a href={lieu.sources.bmo.url} target="_blank" rel="noopener noreferrer" style={SRC}>Bulletin municipal officiel (Gallica/BnF) ↗</a>
          {" · "}
          {t("fx.lieu.src_invest")}
          {lieu.wiki.url && (
            <>
              {" · "}
              <a href={lieu.wiki.url} target="_blank" rel="noopener noreferrer" style={SRC}>Wikipédia ↗</a>
            </>
          )}
        </p>
      </section>
    </div>
  );
}
