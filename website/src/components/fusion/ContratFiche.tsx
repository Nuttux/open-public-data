"use client";

import Link from "@/components/LocalizedLink";
import type { ContratFiche as ContratFicheType, ContratProjetLink, ContratRanking, MarcheVulgarization, SireneCompany } from "@/lib/fusion-data";
import { normalizeObjet, rowObjet } from "@/lib/objet-normalizer";
import { useT, useLocale } from "@/lib/localeContext";
import { cap, fill, numLocale } from "@/lib/fmt";
import { useFmtEur } from "@/lib/use-fmt";
import { trLabel } from "@/lib/label-translate";
import { V3Foot, V3Hero, V3Lead, V3Row, V3Section } from "@/components/fiche/v3";
import { useCity } from "./CityContext";
import Tip from "./Tip";
import { displayOrgName } from "@/lib/fournisseur-display";

/**
 * Fiche contrat v3 (2026-09-03) — sur le kit `fiche/v3` : la phrase « quoi
 * concrètement », UN chiffre (le plafond, dit comme tel) avec la frise de vie
 * du contrat en dessous, puis « À quoi il sert » (le chantier, lien vers le
 * projet), « Qui l'a remporté » (une rangée qui ouvre la fiche fournisseur),
 * « La concurrence » (offres, procédure, repère) et un pied de source. Le
 * bloc titulaire en fiche d'identité à six rangées et les tags en petites
 * capitales disparaissent ; tout ce qui menait quelque part y mène encore.
 */
export default function ContratFiche({
  contrat,
  vulgarization,
  fournisseurSirene,
  ranking,
  projet,
  fournisseurHref: fournisseurHrefProp,
  lieu,
}: {
  contrat: ContratFicheType;
  vulgarization?: MarcheVulgarization | null;
  fournisseurSirene?: SireneCompany | null;
  ranking?: ContratRanking | null;
  projet?: ContratProjetLink | null;
  /** Lien vers la fiche du titulaire quand elle ne suit pas le schéma des villes
   *  (communes : /fr/city/<slug>/fournisseur/<siren>) ; null = pas de fiche. */
  fournisseurHref?: string | null;
  /** Carte du lieu concerné, posée sous le chiffre. */
  lieu?: React.ReactNode;
}) {
  const t = useT();
  const { locale } = useLocale();
  const { basePath, slug } = useCity();
  const locStr = numLocale(locale);
  const en = locale === "en";
  const fmtEur = useFmtEur();
  const fmtDate = (iso: string, long = true) => {
    if (!iso) return "—";
    try { return new Intl.DateTimeFormat(locStr, { day: "numeric", month: long ? "long" : "short", year: "numeric" }).format(new Date(iso)); } catch { return iso; }
  };
  const fmtMonth = (d: Date) => { try { return new Intl.DateTimeFormat(locStr, { month: "long", year: "numeric" }).format(d); } catch { return d.toISOString().slice(0, 7); } };

  const { v: vMax, u: uMax } = fmtEur(contrat.montantMax);
  const hasFournisseurFiche = fournisseurHrefProp !== undefined
    ? Boolean(fournisseurHrefProp)
    : Boolean(contrat.fournisseurSiret && contrat.fournisseurSiret !== "#");
  const fournisseurHref = fournisseurHrefProp ?? `${basePath}/marches/fournisseur/${(contrat.fournisseurSiret ?? "").replace(/\s/g, "")}`;
  const dureeAnnees = contrat.dureeJours > 0 ? (contrat.dureeJours / 365).toFixed(1).replace(".", en ? "." : ",") : null;

  // Frise de vie : notifié → aujourd'hui → fin contractuelle. Précision au
  // JOUR UTC pour que serveur et client calculent la même largeur.
  const timeline = (() => {
    if (!contrat.dateNotification || !(contrat.dureeJours > 0)) return null;
    const startMs = Date.parse(contrat.dateNotification);
    if (Number.isNaN(startMs)) return null;
    const DAY = 86400000;
    const endMs = startMs + contrat.dureeJours * DAY;
    const nowMs = Math.floor(Date.now() / DAY) * DAY;
    const total = endMs - startMs;
    const pct = total > 0 ? Math.round(Math.min(Math.max(((nowMs - startMs) / total) * 100, 0), 100) * 100) / 100 : 100;
    return { end: new Date(endMs), pct, enCours: nowMs < endMs };
  })();

  const decp = contrat.decp;
  const showNotifie = Boolean(decp?.afficherDeuxMontants && decp?.montantNotifie != null && decp.montantNotifie > 0);
  const notifie = showNotifie ? fmtEur(decp!.montantNotifie!) : null;
  const notifiePct = showNotifie && contrat.montantMax > 0 ? Math.round(Math.min(decp!.montantNotifie! / contrat.montantMax, 1) * 100) : null;

  /* ── La ligne de contexte sous la phrase : nature, catégorie, CCAG, CPV,
   *    lieu d'exécution, clauses — en texte gris, pas en petites capitales. */
  const ctx: string[] = [];
  const natureLabel = trLabel(contrat.nature, locale);
  if (natureLabel) ctx.push(natureLabel);
  if (contrat.categorie && contrat.categorie !== "—" && contrat.categorie.toLowerCase() !== contrat.nature.toLowerCase()) ctx.push(trLabel(contrat.categorie, locale));
  if (decp?.ccag && decp.ccag !== contrat.categorie) ctx.push(decp.ccag);
  if (decp?.cpvFamille && decp.cpvFamille !== decp.ccag && !ctx.some((c) => c.toLowerCase() === decp.cpvFamille!.toLowerCase())) ctx.push(decp.cpvFamille);
  if (decp?.lieuExecution) ctx.push(`${t("fx.fiche.contrat.ctx.lieu")} ${decp.lieuExecution}`);
  if (decp?.hasConsiderationSociale) ctx.push(t("fx.fiche.contrat.tag.clauses_sociales").toLowerCase());
  if (decp?.hasConsiderationEnvironnementale) ctx.push(t("fx.fiche.contrat.tag.clauses_env").toLowerCase());
  // « Travaux · Travaux construction » : un intitulé qu'un autre prolonge est retiré.
  for (let i = ctx.length - 1; i >= 0; i--) {
    const c = ctx[i].toLowerCase();
    if (ctx.some((o, j) => j !== i && o.toLowerCase() !== c && o.toLowerCase().startsWith(c))) ctx.splice(i, 1);
  }

  const quoi = vulgarization ? cap(en && vulgarization.quoi_concretement_en ? vulgarization.quoi_concretement_en : vulgarization.quoi_concretement) : null;
  // Le titre du tiroir montre déjà le libellé clair ; le libellé de la source
  // n'est redit dessous que s'il dit autre chose (il répétait souvent le titre mot pour mot).
  // Without a clear title, the object is cut at a clause (never mid-word) and
  // the lot goes in the grey line; the raw object is shown below when it says more.
  const rowT = rowObjet(contrat.objet, 140);
  const shownTitle = (en ? vulgarization?.objet_clair_en : null) || vulgarization?.objet_clair || [rowT.title, rowT.detail].filter(Boolean).join(" · ");
  // Comparaison à plat : casse, apostrophes et espaces ignorés. Le libellé brut
  // qui ne fait qu'ajouter une précision en fin de titre (« … à Paris 8ème »)
  // redit encore le titre : on ne le montre pas non plus.
  // Accents retirés aussi : le libellé clair écrit « 8e » là où la source écrit « 8ème ».
  const flat = (x: string) => x.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[’`´]/g, "'").replace(/\s+/g, " ").replace(/[\s.,;:–-]+$/u, "").trim().toLowerCase();
  const brut = flat(contrat.objet);
  const titre = flat(shownTitle ?? "");
  const redit = titre.length > 0 && (brut.startsWith(titre) || titre.startsWith(brut));
  const libelleBrut = (normalizeObjet(contrat.objet) !== contrat.objet || vulgarization?.objet_clair) && !redit ? contrat.objet : null;

  /* ── Concurrence ─────────────────────────────────────────────────────── */
  const offres = decp?.offresRecues ?? null;
  const repere = ranking?.medianOffresProcedure != null && ranking.totalOffresProcedure >= 5 ? ranking : null;

  const sourceHref = contrat.numero.startsWith("decp-") || slug !== "paris"
    ? "https://www.data.gouv.fr/fr/datasets/donnees-essentielles-de-la-commande-publique-fichiers-consolides/"
    : `https://opendata.paris.fr/explore/dataset/liste-des-marches-de-la-collectivite-parisienne/table/?refine.num_marche=${encodeURIComponent(contrat.numero)}`;
  const sourceLabel = contrat.numero.startsWith("decp-") || slug !== "paris" ? t("fx.fiche.contrat.decp_link") : t("fx.fiche.contrat.opendata_link");

  return (
    <div className="fx-v3">
      {(quoi || libelleBrut || ctx.length > 0) && (
        quoi ? (
          <V3Lead src={<>{libelleBrut && <>{t("fx.fiche.contrat.libelle_original_tag")} : « {libelleBrut} »{ctx.length ? " · " : ""}</>}{ctx.join(" · ")}</>}>
            {quoi}
          </V3Lead>
        ) : (
          <p className="fx-v3-lead-src">{libelleBrut && <>{t("fx.fiche.contrat.libelle_original_tag")} : « {libelleBrut} »{ctx.length ? " · " : ""}</>}{ctx.join(" · ")}</p>
        )
      )}

      <V3Hero
        v={vMax} u={uMax}
        caption={showNotifie ? <Tip label={t("fx.fiche.contrat.kpi.plafond_tip")}>{t("fx.fiche.contrat.hero_cap_v3")}</Tip> : t("fx.fiche.contrat.hero_cap_v3")}
        meta={
          contrat.dateNotification ? (
            <>
              {t("fx.fiche.contrat.signe_le")} {fmtDate(contrat.dateNotification)}
              {timeline && (timeline.enCours
                ? <> · {fill(t("fx.fiche.contrat.tl.encours_jusqua"), { m: fmtMonth(timeline.end) })}</>
                : <> · {fill(t("fx.fiche.contrat.tl.termine_vers"), { m: fmtMonth(timeline.end) })}</>)}
              {dureeAnnees && <> · {dureeAnnees} {t("fx.fiche.contrat.duree_unit")}</>}
            </>
          ) : undefined
        }
      />

      {/* La frise et la part notifiée : deux traits fins, comme les traits des
       *  lignes d'argent de la fiche lieu. */}
      {(timeline || (showNotifie && notifie && notifiePct != null)) && (
        <div style={{ margin: "-28px 0 44px", display: "grid", gap: 14 }}>
          {timeline && (
            <div aria-label={t(timeline.enCours ? "fx.fiche.contrat.tl.aria_encours" : "fx.fiche.contrat.tl.aria_termine").replace("{start}", fmtDate(contrat.dateNotification)).replace("{end}", fmtDate(timeline.end.toISOString()))} title={t("fx.fiche.contrat.tl.hedge")}>
              <div style={{ position: "relative", height: 3, background: "#ecedf0" }} aria-hidden="true">
                <div style={{ position: "absolute", top: 0, bottom: 0, left: 0, width: `${timeline.pct}%`, background: timeline.enCours ? "var(--bleu)" : "var(--ink-2)" }} />
                {timeline.enCours && <span style={{ position: "absolute", left: `${timeline.pct}%`, top: "50%", transform: "translate(-50%, -50%)", width: 9, height: 9, borderRadius: "50%", background: "var(--bleu)", boxShadow: "0 0 0 2px var(--bg)" }} />}
              </div>
              <div className="fx-v3-hero-meta" style={{ marginTop: 6, display: "flex", justifyContent: "space-between", fontSize: 12.5 }}>
                <span style={{ color: timeline.enCours ? "var(--bleu)" : "var(--muted)", fontWeight: 600 }}>{timeline.enCours ? t("fx.fiche.contrat.tl.en_cours") : t("fx.fiche.contrat.tl.termine")}</span>
                <span>{fmtDate(timeline.end.toISOString(), false)}</span>
              </div>
            </div>
          )}
          {showNotifie && notifie && notifiePct != null && (
            <div title={t("fx.fiche.contrat.kpi.notifie_tip")}>
              <div style={{ position: "relative", height: 3, background: "#ecedf0" }} aria-hidden="true">
                <div style={{ position: "absolute", top: 0, bottom: 0, left: 0, width: `${notifiePct}%`, background: "var(--bleu)" }} />
              </div>
              <div className="fx-v3-hero-meta" style={{ marginTop: 6, fontSize: 12.5 }}>
                {fill(t("fx.fiche.contrat.notifie_v3"), { m: `${notifie.v} ${notifie.u}`, pct: String(notifiePct) })}
              </div>
            </div>
          )}
        </div>
      )}

      {lieu ? <div className="fx-v3-lieu-slot">{lieu}</div> : null}

      {projet && (
        <V3Section title={t("fx.fiche.contrat.h.sert")} sub={t("fx.fiche.contrat.chantier.hedge_v3")}>
          <Link href={`${basePath}/investissements/projet/${projet.id}`} scroll={false} className="fx-v3-row fx-row-link" style={{ alignItems: "center", gap: 14 }}>
            {projet.photoUrl && <img src={projet.photoUrl} alt="" width={104} height={70} loading="lazy" style={{ width: 104, height: 70, objectFit: "cover", flexShrink: 0 }} />}
            <span className="lbl">
              <span style={{ fontWeight: 600, color: "var(--ink)" }}>{en && projet.nomEn ? projet.nomEn : projet.nom}</span>
              <span aria-hidden="true" className="muted"> →</span>
              <span className="subtext">{projet.arrondissement ? `${projet.arrondissement}ᵉ · ` : ""}{t("fx.fiche.contrat.chantier.nb").replace("{n}", String(projet.nbMarches))}</span>
            </span>
          </Link>
        </V3Section>
      )}

      <V3Section title={t("fx.fiche.contrat.h.qui")}>
        {contrat.multiAttributaire ? (
          <p className="fx-v3-sentence"><b>{t("fx.fiche.contrat.multi_badge")}.</b> {t("fx.fiche.contrat.multi_desc")}</p>
        ) : (
          <V3Row
            href={hasFournisseurFiche ? fournisseurHref : null}
            label={<span style={{ fontWeight: 600, color: "var(--ink)" }}>{displayOrgName(contrat.fournisseur)}</span>}
            subText={[
              fournisseurSirene?.libelle_activite ? cap(fournisseurSirene.libelle_activite) : null,
              fournisseurSirene?.commune ? `${t("fx.fiche.contrat.siege").toLowerCase()} ${fournisseurSirene.commune}${fournisseurSirene.code_postal ? ` (${fournisseurSirene.code_postal})` : ""}` : null,
              fournisseurSirene?.tranche_effectifs ? `${t("fx.fiche.contrat.effectif").toLowerCase()} ${fournisseurSirene.tranche_effectifs.toLowerCase()}` : null,
              hasFournisseurFiche && contrat.fournisseurSiret ? `${contrat.fournisseurSiret.replace(/\s/g, "").length === 9 ? "SIREN" : "SIRET"} ${contrat.fournisseurSiret}` : null,
            ].filter(Boolean).join(" · ")}
          />
        )}
      </V3Section>

      {(offres != null || decp?.procedure) && (
        <V3Section title={t("fx.fiche.contrat.h.conc")}>
          {offres != null && offres > 0 ? (
            <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", padding: "16px 0 4px" }}>
              <div aria-hidden="true" style={{ display: "flex", gap: 5, alignItems: "center" }}>
                {Array.from({ length: Math.min(offres, 12) }).map((_, i) => (
                  <span key={i} style={{ width: 9, height: 9, borderRadius: "50%", background: offres === 1 ? "var(--ocre)" : "var(--ink-2)" }} />
                ))}
                {offres > 12 && <span className="mono" style={{ fontSize: 11, color: "var(--muted)", marginLeft: 2 }}>+</span>}
              </div>
              <div style={{ fontSize: 16, fontWeight: 600, color: offres === 1 ? "var(--ocre)" : "var(--ink)" }}>
                {offres === 1 ? t("fx.fiche.contrat.conc.offre_one") : t("fx.fiche.contrat.conc.offres_n").replace("{n}", String(offres))}
              </div>
            </div>
          ) : (
            <p className="fx-v3-sentence" style={{ color: "var(--muted)" }}>{t("fx.fiche.contrat.conc.non_publie_v3")}</p>
          )}
          <p className="fx-v3-sentence" style={{ marginTop: 8 }}>
            {repere && <>{t("fx.fiche.contrat.conc.repere").replace("{n}", String(repere.medianOffresProcedure)).replace("{total}", String(repere.totalOffresProcedure)).replace("{year}", String(contrat.year))} </>}
            {decp?.procedure && <>{trLabel(decp.procedure, locale)}</>}
            {decp?.titulairesCount != null && decp.titulairesCount > 0 && (
              <>{decp?.procedure ? " · " : ""}{t("fx.fiche.contrat.conc.attribue").toLowerCase()} {decp.titulairesCount === 1 ? t("fx.fiche.contrat.conc.attribue_one") : t("fx.fiche.contrat.conc.attribue_n").replace("{n}", String(decp.titulairesCount))}</>
            )}
          </p>
          <V3Foot>{t("fx.fiche.contrat.conc.note")}</V3Foot>
        </V3Section>
      )}

      <V3Foot>
        {contrat.numero ? <>{t("fx.fiche.contrat.num_marche")} <span className="mono">{contrat.numero}</span></> : null}
        {contrat.perimetre && contrat.perimetre !== "—" ? <>{contrat.numero ? " · " : ""}{t("fx.fiche.contrat.perimetre").toLowerCase()} {contrat.perimetre}</> : null}
        {contrat.numero || (contrat.perimetre && contrat.perimetre !== "—") ? " · " : ""}
        <a href={sourceHref} target="_blank" rel="noopener noreferrer">{sourceLabel}</a>
      </V3Foot>
    </div>
  );
}
