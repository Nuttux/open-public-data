"use client";

import Link from "next/link";
import type { ContratFiche as ContratFicheType, ContratProjetLink, ContratRanking, MarcheVulgarization, SireneCompany } from "@/lib/fusion-data";
import { normalizeObjet } from "@/lib/objet-normalizer";
import { useT, useLocale } from "@/lib/localeContext";
import { trLabel } from "@/lib/label-translate";
import Tip from "./Tip";

export default function ContratFiche({
  contrat,
  vulgarization,
  fournisseurSirene,
  ranking,
  projet,
}: {
  contrat: ContratFicheType;
  vulgarization?: MarcheVulgarization | null;
  fournisseurSirene?: SireneCompany | null;
  ranking?: ContratRanking | null;
  projet?: ContratProjetLink | null;
}) {
  const t = useT();
  const { locale } = useLocale();
  const locStr = locale === "en" ? "en-GB" : "fr-FR";

  const fmtEur = (n: number) => {
    if (n >= 1e9) return { v: new Intl.NumberFormat(locStr, { maximumFractionDigits: 2 }).format(n / 1e9), u: t("fx.s.md_eur") };
    if (n >= 1e6) return { v: new Intl.NumberFormat(locStr, { maximumFractionDigits: 1 }).format(n / 1e6), u: t("fx.s.m_eur") };
    if (n >= 1e3) return { v: new Intl.NumberFormat(locStr, { maximumFractionDigits: 0 }).format(n / 1e3), u: "k €" };
    return { v: new Intl.NumberFormat(locStr).format(n), u: "€" };
  };

  const fmtDate = (iso: string) => {
    if (!iso) return "—";
    try {
      return new Intl.DateTimeFormat(locStr, { day: "2-digit", month: "long", year: "numeric" }).format(new Date(iso));
    } catch {
      return iso;
    }
  };

  // Capitalise la première lettre de chaque phrase (sortie LLM en lowercase).
  const cap = (s?: string | null) =>
    s ? s.replace(/(^|[.!?]\s+)([a-zà-ÿ])/g, (_, sep, c) => sep + c.toUpperCase()) : s;

  const { v: vMax, u: uMax } = fmtEur(contrat.montantMax);
  const dureeAnnees = contrat.dureeJours > 0
    ? (contrat.dureeJours / 365).toFixed(1).replace(".", locale === "en" ? "." : ",")
    : "—";

  // Frise de vie du contrat : notifié → aujourd'hui → fin contractuelle.
  // Remplace les tuiles « Durée » + « Notifié le » (mêmes données, en
  // graphique) ; ~2 995 contrats du corpus courent encore aujourd'hui.
  const timeline = (() => {
    if (!contrat.dateNotification || !(contrat.dureeJours > 0)) return null;
    const startMs = Date.parse(contrat.dateNotification);
    if (Number.isNaN(startMs)) return null;
    const DAY = 86400000;
    const endMs = startMs + contrat.dureeJours * DAY;
    // Précision au JOUR UTC : un `new Date()` à la milliseconde diffère entre
    // le rendu serveur et l'hydratation client → mismatch React sur la
    // largeur de la barre. Le jour suffit pour une frise de contrat.
    const nowMs = Math.floor(Date.now() / DAY) * DAY;
    const total = endMs - startMs;
    const pct = total > 0
      ? Math.round(Math.min(Math.max(((nowMs - startMs) / total) * 100, 0), 100) * 100) / 100
      : 100;
    return { end: new Date(endMs), pct, enCours: nowMs < endMs };
  })();

  // Enrichissement DECP — affichage conditionnel.
  const decp = contrat.decp;
  const showNotifie = Boolean(decp?.afficherDeuxMontants && decp?.montantNotifie != null && decp.montantNotifie > 0);
  const notifie = showNotifie ? fmtEur(decp!.montantNotifie!) : null;

  // Tags DECP (affichés en ligne sous l'objet, uniquement si ≠ null/vide).
  type Tag = { label: string; title?: string };
  const decpTags: Tag[] = [];
  // Catégorie en tag (l'ex-section Classification) — seulement quand elle
  // apporte plus que la nature déjà affichée en KPI.
  if (contrat.categorie && contrat.categorie !== "—" && contrat.categorie.toLowerCase() !== contrat.nature.toLowerCase()) {
    decpTags.push({ label: trLabel(contrat.categorie, locale), title: t("fx.fiche.contrat.categorie") });
  }
  if (decp?.ccag && decp.ccag !== contrat.categorie) {
    decpTags.push({ label: decp.ccag, title: t("fx.fiche.contrat.tag.ccag_title") });
  }
  if (decp?.cpvFamille && decp.cpvFamille !== decp.ccag) {
    decpTags.push({ label: decp.cpvFamille, title: t("fx.fiche.contrat.tag.cpv_title") });
  }
  if (decp?.lieuExecution) {
    decpTags.push({ label: `📍 ${decp.lieuExecution}`, title: t("fx.fiche.contrat.tag.lieu_title") });
  }
  // `offresRecues` ne figure plus ici : promu en section « Concurrence », où
  // il y a la place pour le repère de comparaison et pour dire ce que
  // l'open data ne publie pas.
  if (decp?.hasConsiderationSociale) {
    decpTags.push({
      label: t("fx.fiche.contrat.tag.clauses_sociales"),
      title: t("fx.fiche.contrat.tag.clauses_sociales_title"),
    });
  }
  if (decp?.hasConsiderationEnvironnementale) {
    decpTags.push({
      label: t("fx.fiche.contrat.tag.clauses_env"),
      title: t("fx.fiche.contrat.tag.clauses_env_title"),
    });
  }

  return (
    <div>
      {vulgarization ? (() => {
        // Drop `pourquoi_ca_compte` (promo-y, cohérence avec ProjetFiche/AssoFiche).
        const objet = cap(locale === "en" && vulgarization.objet_clair_en ? vulgarization.objet_clair_en : vulgarization.objet_clair);
        const quoi = cap(locale === "en" && vulgarization.quoi_concretement_en ? vulgarization.quoi_concretement_en : vulgarization.quoi_concretement);
        return (
          <div className="fx-fiche-lead">
            {objet && (
              <p style={{ margin: 0, fontWeight: 600, color: "var(--ink)", fontSize: 17, lineHeight: 1.45 }}>
                {objet}
              </p>
            )}
            {quoi && (
              <p style={{ margin: "10px 0 0", fontSize: 14.5, color: "var(--ink-2)" }}>
                {quoi}
              </p>
            )}
          </div>
        );
      })() : (
        <div className="fx-fiche-lead">
          <p style={{ margin: 0, fontWeight: 600, color: "var(--ink)", fontSize: 17, lineHeight: 1.45 }}>
            {normalizeObjet(contrat.objet)}
          </p>
          {/* Phrase italique → tag discret : même info, moins de texte. */}
          <p
            style={{ margin: "8px 0 0", fontFamily: "var(--f-mono)", fontSize: 10, letterSpacing: ".08em", textTransform: "uppercase", color: "var(--muted)", cursor: "help" }}
            title={t("fx.fiche.contrat.libelle_reformat")}
          >
            {t("fx.fiche.contrat.libelle_reformat_tag")} ⓘ
          </p>
        </div>
      )}

      <div className="fx-fiche-kpis">
        <div className="fx-fiche-kpi">
          <div className="fx-fiche-kpi-label">
            {showNotifie ? (
              <Tip label={t("fx.fiche.contrat.kpi.plafond_tip")}>
                {t("fx.fiche.contrat.kpi.plafond")}
              </Tip>
            ) : (
              t("fx.fiche.contrat.enveloppe")
            )}
          </div>
          <div className="fx-fiche-kpi-value tnum">
            {vMax}
            <span className="u">{uMax}</span>
          </div>
        </div>
        {showNotifie && notifie && (
          <div className="fx-fiche-kpi">
            <div className="fx-fiche-kpi-label">
              <Tip label={t("fx.fiche.contrat.kpi.notifie_tip")}>
                {t("fx.fiche.contrat.kpi.notifie")}
              </Tip>
            </div>
            <div className="fx-fiche-kpi-value tnum" style={{ color: "var(--bleu)" }}>
              {notifie.v}
              <span className="u">{notifie.u}</span>
            </div>
          </div>
        )}
        {!timeline && (
          <div className="fx-fiche-kpi">
            <div className="fx-fiche-kpi-label">{t("fx.fiche.contrat.duree")}</div>
            <div className="fx-fiche-kpi-value tnum">
              {dureeAnnees}
              <span className="u">{dureeAnnees !== "—" ? t("fx.fiche.contrat.duree_unit") : ""}</span>
            </div>
          </div>
        )}
        <div className="fx-fiche-kpi">
          <div className="fx-fiche-kpi-label">{t("fx.fiche.shared.nature")}</div>
          <div className="fx-fiche-kpi-value" style={{ fontSize: 15 }}>
            {trLabel(contrat.nature, locale)}
          </div>
        </div>
        {!timeline && (
          <div className="fx-fiche-kpi">
            <div className="fx-fiche-kpi-label">{t("fx.fiche.contrat.notifie")}</div>
            <div className="fx-fiche-kpi-value" style={{ fontSize: 15 }}>
              {fmtDate(contrat.dateNotification)}
            </div>
          </div>
        )}
      </div>

      {timeline && (
        <div
          style={{ margin: "16px 0 0" }}
          aria-label={t(timeline.enCours ? "fx.fiche.contrat.tl.aria_encours" : "fx.fiche.contrat.tl.aria_termine")
            .replace("{start}", fmtDate(contrat.dateNotification))
            .replace("{end}", fmtDate(timeline.end.toISOString()))}
        >
          <div style={{ display: "flex", justifyContent: "space-between", fontFamily: "var(--f-mono)", fontSize: 10.5, letterSpacing: ".06em", textTransform: "uppercase", color: "var(--muted)", marginBottom: 7 }}>
            <span>{t("fx.fiche.contrat.tl.notifie")} {fmtDate(contrat.dateNotification)}</span>
            <span>~ {fmtDate(timeline.end.toISOString())}</span>
          </div>
          <div style={{ position: "relative", height: 4, background: "var(--rule)", borderRadius: 2 }} aria-hidden="true">
            <div
              style={{
                position: "absolute",
                top: 0,
                bottom: 0,
                left: 0,
                width: `${timeline.pct}%`,
                background: timeline.enCours ? "var(--bleu)" : "var(--ink-2)",
                borderRadius: 2,
              }}
            />
            {timeline.enCours && (
              <span
                style={{
                  position: "absolute",
                  left: `${timeline.pct}%`,
                  top: "50%",
                  transform: "translate(-50%, -50%)",
                  width: 9,
                  height: 9,
                  borderRadius: "50%",
                  background: "var(--bleu)",
                  boxShadow: "0 0 0 2px var(--bg)",
                }}
              />
            )}
          </div>
          <div
            style={{ marginTop: 7, fontFamily: "var(--f-mono)", fontSize: 10.5, letterSpacing: ".06em", textTransform: "uppercase", cursor: "help" }}
            title={t("fx.fiche.contrat.tl.hedge")}
          >
            <span style={{ color: timeline.enCours ? "var(--bleu)" : "var(--muted)", fontWeight: 600 }}>
              {timeline.enCours ? t("fx.fiche.contrat.tl.en_cours") : t("fx.fiche.contrat.tl.termine")}
            </span>
            <span style={{ color: "var(--muted)" }}> · {dureeAnnees} {t("fx.fiche.contrat.duree_unit")}</span>
          </div>
        </div>
      )}

      {decpTags.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 14, margin: "14px 0 0", fontFamily: "var(--f-mono)", fontSize: 10.5, letterSpacing: ".08em", textTransform: "uppercase", color: "var(--muted)" }}>
          {decpTags.map((tg) => (
            <span key={tg.label} title={tg.title} style={{ cursor: tg.title ? "help" : "default" }}>
              {tg.label}
            </span>
          ))}
        </div>
      )}

      {/* Chantier — quand le marché est rapproché d'un projet d'investissement,
       * la fiche gagne une photo et un contexte : à quoi sert cet argent.
       * Rapprochement automatique (même hedge que la fiche projet, en tooltip). */}
      {projet && (
        <Link
          href={`/ville/paris/investissements/projet/${projet.id}`}
          scroll={false}
          title={t("fx.fiche.contrat.chantier.hedge")}
          style={{
            display: "flex",
            gap: 14,
            alignItems: "center",
            margin: "18px 0 0",
            padding: "12px 14px",
            border: "1px solid var(--rule)",
            background: "var(--bg)",
            textDecoration: "none",
          }}
        >
          {projet.photoUrl && (
            <img
              src={projet.photoUrl}
              alt=""
              width={104}
              height={70}
              loading="lazy"
              style={{ width: 104, height: 70, objectFit: "cover", flexShrink: 0 }}
            />
          )}
          <div style={{ minWidth: 0 }}>
            <div style={{ fontFamily: "var(--f-mono)", fontSize: 10, letterSpacing: ".1em", textTransform: "uppercase", color: "var(--muted)", marginBottom: 4 }}>
              {t("fx.fiche.contrat.chantier.kicker")}
            </div>
            <div style={{ fontFamily: "var(--f-ui)", fontSize: 14.5, fontWeight: 600, color: "var(--ink)", lineHeight: 1.35 }}>
              {locale === "en" && projet.nomEn ? projet.nomEn : projet.nom}
            </div>
            <div style={{ fontFamily: "var(--f-mono)", fontSize: 10.5, letterSpacing: ".06em", textTransform: "uppercase", color: "var(--bleu)", marginTop: 4 }}>
              {projet.arrondissement ? `${projet.arrondissement}ᵉ · ` : ""}
              {t("fx.fiche.contrat.chantier.nb").replace("{n}", String(projet.nbMarches))}
              {" · "}{t("fx.fiche.contrat.chantier.cta")} →
            </div>
          </div>
        </Link>
      )}

      {/* Concurrence — répond à « combien d'entreprises ont candidaté ? », la
       * question que pose n'importe quel lecteur devant un contrat attribué.
       *
       * Ce que les DECP publient : le titulaire, le nombre d'offres reçues, la
       * procédure. Ce qu'elles ne publient PAS : l'identité des candidats non
       * retenus — aucun champ du standard ne la porte. On l'écrit dans la fiche
       * plutôt que de laisser chercher une donnée qui n'existe pas.
       *
       * `offresRecues` n'est renseigné de façon systématique qu'à partir du
       * millésime 2024 ; avant, on n'a que la procédure (elle, toujours
       * présente). La section s'adapte au lieu de disparaître. */}
      {(decp?.offresRecues != null || decp?.procedure) && (() => {
        const offres = decp?.offresRecues ?? null;
        const seul = offres === 1;
        // Repère : la médiane des offres chez les contrats de MÊME procédure.
        // « 1 offre » est la norme sur un marché sans mise en concurrence et
        // notable sur un appel d'offres ouvert — comparer à l'ensemble de
        // l'année mélangerait ces deux cas. Masqué sous 5 pairs : une médiane
        // sur 3 contrats ne vaut pas un repère.
        const repere =
          ranking?.medianOffresProcedure != null && ranking.totalOffresProcedure >= 5
            ? ranking
            : null;
        const dots = offres != null ? Math.min(offres, 12) : 0;

        return (
          <section className="fx-fiche-section">
            <div className="fx-fiche-h">{t("fx.fiche.contrat.conc")}</div>

            {offres != null && offres > 0 ? (
              <div style={{ margin: "0 0 18px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                  <div aria-hidden="true" style={{ display: "flex", gap: 5, alignItems: "center" }}>
                    {Array.from({ length: dots }).map((_, i) => (
                      <span
                        key={i}
                        style={{
                          width: 9,
                          height: 9,
                          borderRadius: "50%",
                          background: seul ? "var(--ocre)" : "var(--ink-2)",
                        }}
                      />
                    ))}
                    {offres > 12 && (
                      <span style={{ fontFamily: "var(--f-mono)", fontSize: 11, color: "var(--muted)", marginLeft: 2 }}>+</span>
                    )}
                  </div>
                  <div
                    style={{
                      fontFamily: "var(--f-ui)",
                      fontSize: 15,
                      fontWeight: 600,
                      color: seul ? "var(--ocre)" : "var(--ink)",
                    }}
                  >
                    {offres === 1
                      ? t("fx.fiche.contrat.conc.offre_one")
                      : t("fx.fiche.contrat.conc.offres_n").replace("{n}", String(offres))}
                  </div>
                </div>
                {repere && (
                  <p style={{ margin: "8px 0 0", fontSize: 13, color: "var(--ink-2)" }}>
                    {t("fx.fiche.contrat.conc.repere")
                      .replace("{n}", String(repere.medianOffresProcedure))
                      .replace("{total}", String(repere.totalOffresProcedure))
                      .replace("{year}", String(contrat.year))}
                  </p>
                )}
              </div>
            ) : (
              <p style={{ margin: "0 0 18px", fontSize: 13, color: "var(--muted)" }}>
                {t("fx.fiche.contrat.conc.non_publie")}
              </p>
            )}

            <dl>
              {decp?.procedure && (
                <div className="fx-fiche-prop">
                  <dt>{t("fx.fiche.contrat.conc.procedure")}</dt>
                  <dd>{trLabel(decp.procedure, locale)}</dd>
                </div>
              )}
              {decp?.titulairesCount != null && decp.titulairesCount > 0 && (
                <div className="fx-fiche-prop">
                  <dt>{t("fx.fiche.contrat.conc.attribue")}</dt>
                  <dd>
                    {decp.titulairesCount === 1
                      ? t("fx.fiche.contrat.conc.attribue_one")
                      : t("fx.fiche.contrat.conc.attribue_n").replace("{n}", String(decp.titulairesCount))}
                  </dd>
                </div>
              )}
            </dl>

            <p style={{ margin: "14px 0 0", fontSize: 12, color: "var(--muted)", fontStyle: "italic", lineHeight: 1.5 }}>
              {t("fx.fiche.contrat.conc.note")}
            </p>
          </section>
        );
      })()}

      {/* Titulaire promu en position 1 après KPIs+tags — c'est THE différentiateur
       * FOD (qui touche combien chez la Ville) vs simple liste DECP brute.
       *
       * Section Objet droppée : redondante avec le lead vulg (objet_clair) qui est
       * déjà la version vulgarisée du libellé. Le libellé brut DECP reste dispo
       * via le lien data.gouv.fr dans la section Sources si besoin d'audit. */}
      <section className="fx-fiche-section">
        <div className="fx-fiche-h">{t("fx.fiche.contrat.titulaire")}</div>
        {contrat.multiAttributaire ? (
          <div
            style={{
              padding: "14px 16px",
              background: "rgba(166, 118, 56, 0.06)",
              border: "1px solid var(--ocre)",
              fontFamily: "var(--f-ui)",
              fontSize: 14,
              lineHeight: 1.55,
              color: "var(--ink-2)",
            }}
          >
            <div style={{ fontFamily: "var(--f-mono)", fontSize: 10.5, color: "var(--ocre)", letterSpacing: ".1em", textTransform: "uppercase", marginBottom: 6 }}>
              {t("fx.fiche.contrat.multi_badge")}
            </div>
            {t("fx.fiche.contrat.multi_desc")}
          </div>
        ) : (
          <dl>
            <div className="fx-fiche-prop">
              <dt>{t("fx.fiche.shared.nom")}</dt>
              <dd>{contrat.fournisseur}</dd>
            </div>
            {fournisseurSirene?.libelle_activite && (
              <div className="fx-fiche-prop">
                <dt>{t("fx.fiche.contrat.activite")}</dt>
                <dd>{fournisseurSirene.libelle_activite}</dd>
              </div>
            )}
            {fournisseurSirene?.commune && (
              <div className="fx-fiche-prop">
                <dt>{t("fx.fiche.contrat.siege")}</dt>
                <dd>{fournisseurSirene.commune} · {fournisseurSirene.code_postal ?? ""}</dd>
              </div>
            )}
            {fournisseurSirene?.tranche_effectifs && (
              <div className="fx-fiche-prop">
                <dt>{t("fx.fiche.contrat.effectif")}</dt>
                <dd>{fournisseurSirene.tranche_effectifs}</dd>
              </div>
            )}
            {contrat.fournisseurSiret && contrat.fournisseurSiret !== "#" && (
              <div className="fx-fiche-prop">
                <dt><Tip label={t("fx.fiche.siret.tip")}>SIRET</Tip></dt>
                <dd style={{ fontFamily: "var(--f-mono)" }}>{contrat.fournisseurSiret}</dd>
              </div>
            )}
            {contrat.fournisseurSiret && contrat.fournisseurSiret !== "#" && (
              <div className="fx-fiche-prop">
                <dt>{t("fx.fiche.contrat.voir")}</dt>
                <dd>
                  <Link
                    href={`/fr/city/paris/marches/fournisseur/${contrat.fournisseurSiret.replace(/\s/g, "")}`}
                    style={{ fontFamily: "var(--f-mono)", fontSize: 12, color: "var(--bleu)", borderBottom: "1px solid var(--bleu)", paddingBottom: 1 }}
                    scroll={false}
                  >
                    {t("fx.fiche.contrat.fiche_fourn")}
                  </Link>
                </dd>
              </div>
            )}
          </dl>
        )}
      </section>

      {/* Section « Classification » dissoute (régime anti-mur-de-texte) :
       * catégorie déjà portée par les tags CCAG/CPV, exercice déjà dans le
       * kicker — seul le périmètre (M57…) migre dans Sources, où il sert
       * l'audit. Une section de moins. */}
      <section className="fx-fiche-section">
        <div className="fx-fiche-h">{t("fx.fiche.shared.sources")}</div>
        <dl>
          <div className="fx-fiche-prop">
            <dt>{t("fx.fiche.contrat.num_marche")}</dt>
            <dd style={{ fontFamily: "var(--f-mono)" }}>{contrat.numero}</dd>
          </div>
          {contrat.perimetre && contrat.perimetre !== "—" && (
            <div className="fx-fiche-prop">
              <dt>{t("fx.fiche.contrat.perimetre")}</dt>
              <dd>{contrat.perimetre}</dd>
            </div>
          )}
          {contrat.numero.startsWith("decp-") ? (
            /* Marché issu des DECP consolidées : pas de page par enregistrement
             * côté data.gouv, on pointe le jeu de données lui-même. */
            <div className="fx-fiche-prop">
              <dt>{t("fx.fiche.contrat.decp")}</dt>
              <dd>
                <a
                  href="https://www.data.gouv.fr/fr/datasets/donnees-essentielles-de-la-commande-publique-fichiers-consolides/"
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ color: "var(--bleu)", borderBottom: "1px solid var(--bleu)" }}
                >
                  {t("fx.fiche.contrat.decp_link")}
                </a>
              </dd>
            </div>
          ) : (
            /* Marché opendata Paris : refine.num_marche matche exactement la
             * ligne source (vérifié 30/30 sur échantillon). */
            <div className="fx-fiche-prop">
              <dt>{t("fx.fiche.contrat.opendata")}</dt>
              <dd>
                <a
                  href={`https://opendata.paris.fr/explore/dataset/liste-des-marches-de-la-collectivite-parisienne/table/?refine.num_marche=${encodeURIComponent(contrat.numero)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ color: "var(--bleu)", borderBottom: "1px solid var(--bleu)" }}
                >
                  {t("fx.fiche.contrat.opendata_link")}
                </a>
              </dd>
            </div>
          )}
        </dl>
      </section>

    </div>
  );
}
