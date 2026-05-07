"use client";

import Navbar from "@/components/fusion/Navbar";
import Footer from "@/components/fusion/Footer";
import Button from "@/components/fusion/Button";
import SectionHead from "@/components/fusion/SectionHead";
import { useLocale } from "@/lib/localeContext";

// Modèle DINUM officiel — Décret n° 2019-768, arrêté du 20 sept. 2019.
// Format obligatoire pour tout service à mission de service public en France.
// Mise à jour à chaque audit RGAA (interne ou externe).

const ESTABLISHED_DATE = "7 mai 2026";
const ESTABLISHED_DATE_EN = "May 7, 2026";
const LAST_UPDATE_DATE = ESTABLISHED_DATE;
const LAST_UPDATE_DATE_EN = ESTABLISHED_DATE_EN;

export default function AccessibiliteClient() {
  const { locale } = useLocale();
  const isFr = locale !== "en";

  return (
    <div className="theme-fusion">
      <Navbar />
      <main id="main-content" tabIndex={-1}>

      <section className="fx-page-header">
        <div className="fx-wrap">
          <div className="fx-page-kicker">{isFr ? "— Accessibilité" : "— Accessibility"}</div>
          <h1 className="fx-page-title">
            {isFr ? (
              <>Une <em>déclaration</em>, pas une promesse.</>
            ) : (
              <>A <em>statement</em>, not a promise.</>
            )}
          </h1>
          <p className="fx-page-lede">
            {isFr
              ? "France Open Data s'engage à rendre son site accessible conformément à l'article 47 de la loi n° 2005-102 du 11 février 2005 et au Référentiel Général d'Amélioration de l'Accessibilité (RGAA 4.1)."
              : "France Open Data is committed to making its site accessible in accordance with Article 47 of Law No. 2005-102 of 11 February 2005 and the French General Accessibility Improvement Framework (RGAA 4.1)."}
          </p>
        </div>
      </section>

      <section className="fx-section" id="conformite">
        <div className="fx-wrap">
          <SectionHead
            number="01"
            kind={isFr ? "Conformité" : "Compliance"}
            title={
              isFr ? (
                <>État de <em>conformité</em></>
              ) : (
                <>Compliance <em>level</em></>
              )
            }
          />
          <p>
            {isFr ? (
              <>
                Le site <b>franceopendata.org</b> est en <b>conformité partielle</b> avec le RGAA 4.1.
                Aucune non-conformité critique ou sérieuse n'a été identifiée par les outils d'audit
                automatique sur les pages auditées, mais l'audit externe formel par un cabinet agréé
                n'a pas encore été réalisé.
              </>
            ) : (
              <>
                The <b>franceopendata.org</b> site is in <b>partial compliance</b> with RGAA 4.1.
                No critical or serious non-conformities were detected by automated audit tools on
                the pages reviewed, but a formal external audit by a certified firm has not yet been
                conducted.
              </>
            )}
          </p>
          <div className="fx-note">
            {isFr
              ? "« Conformité partielle » est l'une des trois catégories officielles définies par le décret 2019-768 (totale / partielle / non-conforme). Elle reflète l'absence d'audit externe complet, pas un manquement constaté."
              : "\"Partial compliance\" is one of three official categories defined by French decree 2019-768 (full / partial / non-compliant). It reflects the absence of a full external audit, not an identified failure."}
          </div>
        </div>
      </section>

      <section className="fx-section" id="resultats">
        <div className="fx-wrap">
          <SectionHead
            number="02"
            kind={isFr ? "Résultats des tests" : "Test results"}
            title={
              isFr ? (
                <>Audit <em>interne</em> du {ESTABLISHED_DATE}</>
              ) : (
                <>Internal <em>audit</em> of {ESTABLISHED_DATE_EN}</>
              )
            }
            subtitle={
              isFr
                ? "Outils utilisés : axe-core 4.x via Playwright (navigateur Chromium), Lighthouse 12.x. Tests effectués sur quatre pages représentatives, en viewport desktop (1440×900) et mobile (390×844)."
                : "Tools used: axe-core 4.x via Playwright (Chromium browser), Lighthouse 12.x. Tests performed on four representative pages, on desktop (1440×900) and mobile (390×844) viewports."
            }
          />
          <table className="fx-sources-table">
            <thead>
              <tr>
                <th>{isFr ? "Page auditée" : "Page audited"}</th>
                <th>{isFr ? "Score Lighthouse a11y" : "Lighthouse a11y score"}</th>
                <th>{isFr ? "Violations axe-core" : "axe-core violations"}</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>{isFr ? "Accueil" : "Home"} <code>/</code></td>
                <td>100 / 100</td>
                <td>0 {isFr ? "critique · 0 sérieuse" : "critical · 0 serious"}</td>
              </tr>
              <tr>
                <td>{isFr ? "Subventions" : "Grants"} <code>/qui-recoit</code></td>
                <td>97 / 100</td>
                <td>0 {isFr ? "critique · 0 sérieuse" : "critical · 0 serious"}</td>
              </tr>
              <tr>
                <td>{isFr ? "Marchés publics" : "Public contracts"} <code>/marches-publics</code></td>
                <td>97 / 100</td>
                <td>0 {isFr ? "critique · 0 sérieuse" : "critical · 0 serious"}</td>
              </tr>
              <tr>
                <td>{isFr ? "Méthode" : "Methodology"} <code>/methode</code></td>
                <td>100 / 100</td>
                <td>0 {isFr ? "critique · 0 sérieuse" : "critical · 0 serious"}</td>
              </tr>
            </tbody>
          </table>
          <p style={{ marginTop: 24 }}>
            {isFr ? (
              <>
                Les outils automatiques détectent <b>30 à 50 % des critères RGAA</b>. Les autres
                critères (logique de navigation au lecteur d'écran, contenus alternatifs pertinents,
                cohérence des intitulés) demandent un audit humain qualifié, qui n'a pas encore
                été réalisé.
              </>
            ) : (
              <>
                Automated tools detect <b>30 to 50 % of RGAA criteria</b>. The remaining criteria
                (screen-reader navigation logic, meaningful alternatives, label coherence) require a
                qualified human audit, which has not yet been conducted.
              </>
            )}
          </p>
        </div>
      </section>

      <section className="fx-section" id="non-accessibles">
        <div className="fx-wrap">
          <SectionHead
            number="03"
            kind={isFr ? "Limites connues" : "Known limitations"}
            title={
              isFr ? (
                <>Contenus <em>non accessibles</em></>
              ) : (
                <>Non-accessible <em>content</em></>
              )
            }
            subtitle={
              isFr
                ? "Nous documentons publiquement les zones du site qui ne respectent pas encore l'ensemble des critères RGAA, et l'alternative que nous proposons en attendant la mise en conformité."
                : "We publicly document areas of the site that do not yet meet all RGAA criteria, and the alternative we provide while compliance work is ongoing."
            }
          />
          <div className="fx-engagements">
            <div className="fx-engagement">
              <h3>
                {isFr ? "Cartes interactives (Leaflet)" : "Interactive maps (Leaflet)"}
              </h3>
              <p>
                {isFr
                  ? "Les cartes des arrondissements et des projets ne sont pas entièrement navigables au clavier (zoom et déplacement à la souris uniquement). En remplacement : un tableau exhaustif des données est affiché en dessous de chaque carte, avec export CSV/JSON."
                  : "The district and project maps are not fully keyboard-navigable (zoom and pan are mouse-only). As an alternative: an exhaustive data table is displayed below each map, with CSV/JSON export."}
              </p>
            </div>
            <div className="fx-engagement">
              <h3>
                {isFr ? "Graphiques interactifs (ECharts)" : "Interactive charts (ECharts)"}
              </h3>
              <p>
                {isFr
                  ? "Les graphiques temporels et en barres exposent un libellé global (aria-label sur le SVG parent) mais les segments individuels ne sont pas focusables un par un au clavier. En remplacement : les chiffres détaillés sont publiés en JSON téléchargeable et résumés en texte sous chaque graphique."
                  : "Time-series and bar charts expose an overall label (aria-label on the parent SVG) but individual segments are not separately keyboard-focusable. As an alternative: detailed figures are published as downloadable JSON and summarised in text below each chart."}
              </p>
            </div>
            <div className="fx-engagement">
              <h3>
                {isFr ? "PDF historiques" : "Legacy PDFs"}
              </h3>
              <p>
                {isFr
                  ? "Certains comptes administratifs publiés par la Ville sont diffusés en PDF non balisés. Nous ne re-publions pas ces PDF sur le site : nous extrayons les données et les publions au format ouvert. Le PDF source reste accessible sur le portail d'origine."
                  : "Some administrative accounts published by the City are distributed as untagged PDFs. We do not re-publish these PDFs on the site: we extract the data and publish them in open format. The source PDF remains available on the original portal."}
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="fx-section" id="etablissement">
        <div className="fx-wrap">
          <SectionHead
            number="04"
            kind={isFr ? "Méta" : "Meta"}
            title={
              isFr ? (
                <>Établissement <em>de cette déclaration</em></>
              ) : (
                <>Statement <em>information</em></>
              )
            }
          />
          <dl
            style={{
              display: "grid",
              gridTemplateColumns: "minmax(180px, 240px) 1fr",
              rowGap: 14,
              columnGap: 24,
              marginTop: 24,
              fontSize: 15,
              lineHeight: 1.55,
            }}
          >
            <dt style={{ fontFamily: "var(--f-mono)", fontSize: 11, textTransform: "uppercase", letterSpacing: ".08em", color: "var(--muted)", paddingTop: 4 }}>{isFr ? "Date d'établissement" : "Date of establishment"}</dt>
            <dd style={{ margin: 0 }}>{isFr ? ESTABLISHED_DATE : ESTABLISHED_DATE_EN}</dd>
            <dt style={{ fontFamily: "var(--f-mono)", fontSize: 11, textTransform: "uppercase", letterSpacing: ".08em", color: "var(--muted)", paddingTop: 4 }}>{isFr ? "Dernière mise à jour" : "Last update"}</dt>
            <dd style={{ margin: 0 }}>{isFr ? LAST_UPDATE_DATE : LAST_UPDATE_DATE_EN}</dd>
            <dt style={{ fontFamily: "var(--f-mono)", fontSize: 11, textTransform: "uppercase", letterSpacing: ".08em", color: "var(--muted)", paddingTop: 4 }}>{isFr ? "Technologies du site" : "Site technologies"}</dt>
            <dd style={{ margin: 0 }}>Next.js 16, React 19, CSS modules, ECharts, Leaflet</dd>
            <dt style={{ fontFamily: "var(--f-mono)", fontSize: 11, textTransform: "uppercase", letterSpacing: ".08em", color: "var(--muted)", paddingTop: 4 }}>{isFr ? "Outils d'évaluation" : "Evaluation tools"}</dt>
            <dd style={{ margin: 0 }}>axe-core 4.x (Playwright), Lighthouse 12.x</dd>
            <dt style={{ fontFamily: "var(--f-mono)", fontSize: 11, textTransform: "uppercase", letterSpacing: ".08em", color: "var(--muted)", paddingTop: 4 }}>{isFr ? "Référentiel appliqué" : "Reference framework"}</dt>
            <dd style={{ margin: 0 }}>RGAA 4.1 · WCAG 2.1 niveau AA</dd>
          </dl>
        </div>
      </section>

      <section className="fx-section" id="contact">
        <div className="fx-wrap">
          <SectionHead
            number="05"
            kind={isFr ? "Retour d'information" : "Feedback"}
            title={
              isFr ? (
                <>Vous rencontrez <em>un blocage</em> ?</>
              ) : (
                <>Hit <em>a blocker</em>?</>
              )
            }
            subtitle={
              isFr
                ? "Si vous n'arrivez pas à accéder à un contenu ou un service, contactez-nous : nous vous répondrons sous cinq jours ouvrés et vous orienterons vers une alternative accessible."
                : "If you cannot access any content or service, please contact us: we will respond within five business days and direct you to an accessible alternative."
            }
          />
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 24 }}>
            <Button variant="primary" href="mailto:contact@franceopendata.org">
              contact@franceopendata.org ↗
            </Button>
            <Button href="/contact">{isFr ? "Formulaire de contact" : "Contact form"}</Button>
          </div>
        </div>
      </section>

      <section className="fx-section" id="recours">
        <div className="fx-wrap">
          <SectionHead
            number="06"
            kind={isFr ? "Voies de recours" : "Complaint procedure"}
            title={
              isFr ? (
                <>Si <em>aucune réponse</em> ne vous satisfait</>
              ) : (
                <>If <em>no response</em> is satisfactory</>
              )
            }
          />
          <p>
            {isFr
              ? "Cette procédure s'applique si vous nous avez signalé un défaut d'accessibilité qui vous empêche d'accéder à un contenu ou un service, et si vous n'avez pas obtenu de réponse satisfaisante. Vous pouvez :"
              : "This procedure applies if you have reported an accessibility defect that prevents you from accessing any content or service, and you have not received a satisfactory response. You can:"}
          </p>
          <ul style={{ marginTop: 12, paddingLeft: 20, lineHeight: 1.7 }}>
            <li>
              {isFr ? "Écrire au " : "Write to the "}
              <a
                href="https://formulaire.defenseurdesdroits.fr/"
                target="_blank"
                rel="noopener noreferrer"
              >
                {isFr ? "Défenseur des droits" : "Défenseur des droits"} ↗
              </a>
            </li>
            <li>
              {isFr ? "Contacter " : "Contact "}
              <a
                href="https://www.defenseurdesdroits.fr/saisir/delegues"
                target="_blank"
                rel="noopener noreferrer"
              >
                {isFr ? "le délégué du Défenseur des droits dans votre région" : "the Défenseur des droits delegate in your region"} ↗
              </a>
            </li>
            <li>
              {isFr
                ? "Envoyer un courrier : Défenseur des droits, Libre réponse 71120, 75342 Paris CEDEX 07."
                : "Send mail to: Défenseur des droits, Libre réponse 71120, 75342 Paris CEDEX 07."}
            </li>
          </ul>
        </div>
      </section>

      </main>
      <Footer />
    </div>
  );
}
