import Navbar from "@/components/fusion/Navbar";
import Footer from "@/components/fusion/Footer";
import Button from "@/components/fusion/Button";
import SectionHead from "@/components/fusion/SectionHead";
import LocaleRefresh from "@/components/LocaleRefresh";
import { readLocale } from "@/lib/seo";

// Mentions légales conformes LCEN art. 6-III-1.
// À mettre à jour si statut juridique, hébergeur ou contact change.

const LAST_UPDATE = "7 mai 2026";
const LAST_UPDATE_EN = "May 7, 2026";

type DLProps = { children: React.ReactNode };
function DefList({ children }: DLProps) {
  return (
    <dl
      style={{
        display: "grid",
        gridTemplateColumns: "minmax(180px, 240px) 1fr",
        rowGap: 14,
        columnGap: 24,
        marginTop: 8,
        marginBottom: 24,
        fontSize: 15,
        lineHeight: 1.55,
      }}
    >
      {children}
    </dl>
  );
}

const dtStyle: React.CSSProperties = {
  fontFamily: "var(--f-mono)",
  fontSize: 11,
  textTransform: "uppercase",
  letterSpacing: ".08em",
  color: "var(--muted)",
  paddingTop: 4,
};
const ddStyle: React.CSSProperties = { margin: 0 };

export default async function MentionsLegalesClient() {
  const locale = await readLocale();
  const isFr = locale !== "en";

  return (
    <div className="theme-fusion">
      <LocaleRefresh />
      <Navbar />
      <main id="main-content" tabIndex={-1}>

      <section className="fx-page-header">
        <div className="fx-wrap">
          <div className="fx-page-kicker">{isFr ? "— Mentions légales" : "— Legal notice"}</div>
          <h1 className="fx-page-title">
            {isFr ? (
              <>Qui édite, <em>qui héberge</em>, qui contacter.</>
            ) : (
              <>Who publishes, <em>who hosts</em>, who to contact.</>
            )}
          </h1>
          <p className="fx-page-lede">
            {isFr
              ? "Conformément à l'article 6-III-1 de la loi pour la confiance dans l'économie numérique (LCEN) du 21 juin 2004, voici les informations identifiant l'éditeur du site et son hébergeur."
              : "In accordance with Article 6-III-1 of the French law for confidence in the digital economy (LCEN) of 21 June 2004, the information identifying the site's publisher and host is provided below."}
          </p>
        </div>
      </section>

      <section className="fx-section" id="editeur">
        <div className="fx-wrap">
          <SectionHead
            number="01"
            kind={isFr ? "Éditeur" : "Publisher"}
            title={isFr ? <>Édition <em>indépendante</em></> : <>Independent <em>publisher</em></>}
            subtitle={
              isFr
                ? "Le site qipu.org est édité à titre individuel par une personne physique non professionnelle au sens de la LCEN. Aucune structure commerciale ou associative n'en est titulaire à ce stade."
                : "The qipu.org site is published individually by a non-professional natural person within the meaning of the French LCEN. No commercial or non-profit entity holds it at this stage."
            }
          />
          <DefList>
            <dt style={dtStyle}>{isFr ? "Nom" : "Name"}</dt>
            <dd style={ddStyle}>Daniel Shavit</dd>
            <dt style={dtStyle}>{isFr ? "Statut" : "Status"}</dt>
            <dd style={ddStyle}>{isFr ? "Personne physique, publication à titre indépendant et non professionnel" : "Natural person, independent and non-professional publication"}</dd>
            <dt style={dtStyle}>{isFr ? "Contact" : "Contact"}</dt>
            <dd style={ddStyle}>
              <a href="mailto:daniel@qipu.org">daniel@qipu.org</a>
            </dd>
          </DefList>
        </div>
      </section>

      <section className="fx-section" id="directeur">
        <div className="fx-wrap">
          <SectionHead
            number="02"
            kind={isFr ? "Direction de publication" : "Publication director"}
            title={isFr ? <>Responsable <em>du contenu</em></> : <>Content <em>responsible</em></>}
            subtitle={
              isFr
                ? "Le directeur de publication est responsable de l'ensemble des contenus mis en ligne sur le site, conformément à l'article 93-2 de la loi du 29 juillet 1982 sur la communication audiovisuelle."
                : "The publication director is responsible for all content posted on the site, in accordance with Article 93-2 of the French law of 29 July 1982 on audiovisual communication."
            }
          />
          <DefList>
            <dt style={dtStyle}>{isFr ? "Directeur de publication" : "Publication director"}</dt>
            <dd style={ddStyle}>Daniel Shavit</dd>
            <dt style={dtStyle}>{isFr ? "Contact" : "Contact"}</dt>
            <dd style={ddStyle}>
              <a href="mailto:daniel@qipu.org">daniel@qipu.org</a>
            </dd>
          </DefList>
        </div>
      </section>

      <section className="fx-section" id="hebergeur">
        <div className="fx-wrap">
          <SectionHead
            number="03"
            kind={isFr ? "Hébergeur" : "Host"}
            title={isFr ? <>Le site est hébergé par <em>Vercel</em></> : <>The site is hosted by <em>Vercel</em></>}
            subtitle={
              isFr
                ? "L'hébergement est assuré par Vercel Inc., qui fournit la plateforme technique sur laquelle le site est déployé. Vercel n'a aucun rôle éditorial."
                : "Hosting is provided by Vercel Inc., which supplies the technical platform on which the site is deployed. Vercel has no editorial role."
            }
          />
          <DefList>
            <dt style={dtStyle}>{isFr ? "Raison sociale" : "Legal name"}</dt>
            <dd style={ddStyle}>Vercel Inc.</dd>
            <dt style={dtStyle}>{isFr ? "Adresse" : "Address"}</dt>
            <dd style={ddStyle}>340 S Lemon Ave #4133, Walnut, CA 91789, {isFr ? "États-Unis" : "United States"}</dd>
            <dt style={dtStyle}>{isFr ? "Téléphone" : "Phone"}</dt>
            <dd style={ddStyle}>+1 559 288 7060</dd>
            <dt style={dtStyle}>{isFr ? "Site web" : "Website"}</dt>
            <dd style={ddStyle}>
              <a href="https://vercel.com" target="_blank" rel="noopener noreferrer">
                vercel.com ↗
              </a>
            </dd>
          </DefList>
          <div className="fx-note">
            {isFr
              ? "L'hébergement par un prestataire situé hors Union européenne implique des transferts de données techniques (logs serveur, en-têtes de requête) vers les États-Unis. Ces transferts sont encadrés par le Data Privacy Framework EU-US (décision d'adéquation CNIL/Commission européenne du 10 juillet 2023). Détails dans la politique de confidentialité."
              : "Hosting by a provider outside the European Union involves technical data transfers (server logs, request headers) to the United States. These transfers are governed by the EU-US Data Privacy Framework (CNIL/European Commission adequacy decision of 10 July 2023). Details in the privacy policy."}
          </div>
        </div>
      </section>

      <section className="fx-section" id="propriete-intellectuelle">
        <div className="fx-wrap">
          <SectionHead
            number="04"
            kind={isFr ? "Propriété intellectuelle" : "Intellectual property"}
            title={isFr ? <>Tout <em>est ouvert</em>, sous licences explicites</> : <>Everything <em>is open</em>, under explicit licenses</>}
          />
          <p>
            {isFr ? (
              <>
                Le code source du site et du pipeline est publié sous licence{" "}
                <b>GNU AGPL-3.0</b>. Les données dérivées sont publiées sous{" "}
                <b>Licence Ouverte 2.0 (Etalab)</b>. Les contenus éditoriaux (articles, analyses,
                méthodologie) sont publiés sous <b>Creative Commons CC BY 4.0</b>. Les conditions
                de réutilisation et d'attribution sont détaillées sur la page Licence.
              </>
            ) : (
              <>
                The source code of the site and pipeline is published under{" "}
                <b>GNU AGPL-3.0</b>. The derived data is published under the{" "}
                <b>Etalab Open License 2.0</b>. Editorial content (articles, analyses,
                methodology) is published under <b>Creative Commons CC BY 4.0</b>. Reuse and
                attribution terms are detailed on the License page.
              </>
            )}
          </p>
          <div style={{ marginTop: 16 }}>
            <Button variant="primary" href="/licence">
              {isFr ? "Voir les licences en détail" : "See full licenses"}
            </Button>
          </div>
        </div>
      </section>

      <section className="fx-section" id="donnees-personnelles">
        <div className="fx-wrap">
          <SectionHead
            number="05"
            kind={isFr ? "Données personnelles" : "Personal data"}
            title={isFr ? <>Vos <em>droits RGPD</em></> : <>Your <em>GDPR rights</em></>}
          />
          <p>
            {isFr
              ? "Le site collecte un minimum de données techniques nécessaires à son bon fonctionnement et, sur consentement, des mesures d'audience anonymisées. Toutes les modalités (finalités, durée de conservation, droit d'accès, de rectification, d'effacement, de portabilité, d'opposition) sont décrites dans la politique de confidentialité."
              : "The site collects a minimum of technical data needed for its operation and, with consent, anonymised audience metrics. All terms (purposes, retention period, rights of access, rectification, erasure, portability, objection) are described in the privacy policy."}
          </p>
          <div style={{ marginTop: 16 }}>
            <Button variant="primary" href="/confidentialite">
              {isFr ? "Politique de confidentialité" : "Privacy policy"}
            </Button>
          </div>
        </div>
      </section>

      <section className="fx-section" id="signalement">
        <div className="fx-wrap">
          <SectionHead
            number="06"
            kind={isFr ? "Signalement" : "Reporting"}
            title={isFr ? <>Une <em>erreur</em>, un <em>blocage</em> ?</> : <>A <em>mistake</em>, a <em>blocker</em>?</>}
            subtitle={
              isFr
                ? "Toute erreur factuelle, problème d'accessibilité ou contestation de chiffre peut être signalé. Réponse sous cinq jours ouvrés ; correction documentée dans le changelog public si l'erreur est avérée."
                : "Any factual error, accessibility issue or disputed figure can be reported. Response within five business days; correction documented in the public changelog if the error is confirmed."
            }
          />
          <div style={{ marginTop: 16, display: "flex", gap: 10, flexWrap: "wrap" }}>
            <Button variant="primary" href="mailto:daniel@qipu.org">
              daniel@qipu.org ↗
            </Button>
            <Button href="/contact">{isFr ? "Formulaire de contact" : "Contact form"}</Button>
            <Button href="/accessibilite">{isFr ? "Accessibilité & recours" : "Accessibility & remedies"}</Button>
          </div>
        </div>
      </section>

      <section className="fx-section" id="droit-applicable">
        <div className="fx-wrap">
          <SectionHead
            number="07"
            kind={isFr ? "Droit applicable" : "Applicable law"}
            title={isFr ? <>Juridiction <em>française</em></> : <>French <em>jurisdiction</em></>}
          />
          <p>
            {isFr
              ? "Le présent site et ses mentions sont régis par le droit français. Tout litige relatif à son utilisation, à défaut de résolution amiable, relève de la compétence exclusive des tribunaux français."
              : "This site and its notices are governed by French law. Any dispute relating to its use, failing amicable resolution, falls within the exclusive jurisdiction of French courts."}
          </p>
        </div>
      </section>

      <section className="fx-section" id="meta">
        <div className="fx-wrap">
          <SectionHead
            number="08"
            kind={isFr ? "Méta" : "Meta"}
            title={isFr ? <>Mise <em>à jour</em></> : <>Last <em>update</em></>}
          />
          <DefList>
            <dt style={dtStyle}>{isFr ? "Dernière mise à jour" : "Last update"}</dt>
            <dd style={ddStyle}>{isFr ? LAST_UPDATE : LAST_UPDATE_EN}</dd>
            <dt style={dtStyle}>{isFr ? "Version site" : "Site version"}</dt>
            <dd style={ddStyle}>Next.js 16, React 19, deployed on Vercel</dd>
          </DefList>
          <div className="fx-note">
            {isFr
              ? "Ces mentions évoluent à chaque changement structurant : changement de statut juridique, d'hébergeur, ou de directeur de publication. Toute correction est datée."
              : "This notice evolves with every structural change: change of legal status, of host, or of publication director. Every correction is dated."}
          </div>
        </div>
      </section>

      </main>
      <Footer />
    </div>
  );
}
