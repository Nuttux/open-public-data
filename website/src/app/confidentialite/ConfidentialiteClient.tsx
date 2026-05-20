"use client";

import { useState, useEffect } from "react";
import Navbar from "@/components/fusion/Navbar";
import Footer from "@/components/fusion/Footer";
import Button from "@/components/fusion/Button";
import SectionHead from "@/components/fusion/SectionHead";
import {
  optOutAnalytics as optOut,
  optInAnalytics as optIn,
  isOptedOutAnalytics as isCurrentlyOptedOut,
  isReplayOptedIn,
  enableReplay,
  disableReplay,
} from "@/components/AnalyticsProvider";
import { useLocale } from "@/lib/localeContext";

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

type ToggleRowProps = {
  label: string;
  status: string;
  ariaLabel: string;
  on: boolean;
  disabled?: boolean;
  onClick: () => void;
};

function ToggleRow({ label, status, ariaLabel, on, disabled, onClick }: ToggleRowProps) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 16,
        padding: "20px 22px",
        border: "1px solid var(--rule-hard)",
        marginTop: 16,
        background: "var(--bg)",
      }}
    >
      <div style={{ minWidth: 0 }}>
        <div style={{ fontFamily: "var(--f-disp)", fontWeight: 600, fontSize: 16, color: "var(--ink)" }}>
          {label}
        </div>
        <div style={{ fontSize: 13.5, color: "var(--muted)", marginTop: 4 }}>{status}</div>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={on}
        aria-label={ariaLabel}
        disabled={disabled}
        onClick={onClick}
        style={{
          position: "relative",
          flexShrink: 0,
          width: 48,
          height: 28,
          borderRadius: 14,
          border: "2px solid transparent",
          background: on ? "#0a0a0a" : "#9099a6",
          cursor: disabled ? "not-allowed" : "pointer",
          opacity: disabled ? 0.4 : 1,
          padding: 0,
          transition: "background 200ms",
        }}
      >
        <span
          aria-hidden="true"
          style={{
            position: "absolute",
            top: 2,
            left: on ? 22 : 2,
            width: 20,
            height: 20,
            borderRadius: "50%",
            background: "#ffffff",
            boxShadow: "0 1px 2px rgba(0,0,0,0.2)",
            transition: "left 200ms",
          }}
        />
      </button>
    </div>
  );
}

export default function ConfidentialiteClient() {
  const { locale } = useLocale();
  const isFr = locale !== "en";

  const [isOptedOut, setIsOptedOut] = useState(false);
  const [replayOn, setReplayOn] = useState(false);

  useEffect(() => {
    setIsOptedOut(isCurrentlyOptedOut());
    setReplayOn(isReplayOptedIn());
  }, []);

  const handleToggle = () => {
    if (isOptedOut) {
      optIn();
      setIsOptedOut(false);
    } else {
      optOut();
      setIsOptedOut(true);
      setReplayOn(false);
    }
  };

  const handleReplayToggle = () => {
    if (replayOn) {
      disableReplay();
      setReplayOn(false);
    } else {
      enableReplay();
      setReplayOn(true);
    }
  };

  return (
    <div className="theme-fusion">
      <Navbar />
      <main id="main-content" tabIndex={-1}>

      <section className="fx-page-header">
        <div className="fx-wrap">
          <div className="fx-page-kicker">{isFr ? "— Confidentialité" : "— Privacy"}</div>
          <h1 className="fx-page-title">
            {isFr ? (
              <>Vos données, <em>nos règles</em>.</>
            ) : (
              <>Your data, <em>our rules</em>.</>
            )}
          </h1>
          <p className="fx-page-lede">
            {isFr
              ? "Notre politique RGPD se résume à un principe simple : collecter le strict minimum techniquement nécessaire, en mode anonyme par défaut, sans bandeau cookies parce qu'il n'y a aucun traceur invasif à autoriser."
              : "Our GDPR policy comes down to one principle: collect the bare minimum that is technically required, anonymously by default, with no cookie banner because there are no invasive trackers to opt into."}
          </p>
        </div>
      </section>

      <section className="fx-section" id="pourquoi-pas-de-banner">
        <div className="fx-wrap">
          <SectionHead
            number="01"
            kind={isFr ? "Vue d'ensemble" : "Overview"}
            title={
              isFr ? (
                <>Pourquoi <em>pas de bandeau</em> cookies ?</>
              ) : (
                <>Why <em>no cookie banner</em>?</>
              )
            }
            subtitle={
              isFr
                ? "Le site fonctionne en mode CNIL-exempt : la mesure d'audience par défaut ne nécessite pas de consentement explicite. Tout ce qui pourrait nécessiter un consentement (replay vidéo des sessions) est strictement opt-in."
                : "The site operates in CNIL-exempt mode: default audience measurement does not require explicit consent. Anything that would require consent (session video replay) is strictly opt-in."
            }
          />
          <p>
            {isFr ? (
              <>
                La CNIL définit une <b>exemption de consentement</b> pour la mesure d'audience qui
                respecte cinq conditions cumulatives : finalité strictement limitée à la mesure
                d'audience, pas de croisement avec d'autres traitements, anonymisation, durées de
                conservation raisonnables, et information claire des utilisateurs. Notre
                configuration coche toutes ces cases.
              </>
            ) : (
              <>
                The CNIL defines a <b>consent exemption</b> for audience measurement that meets
                five cumulative conditions: purpose strictly limited to audience measurement, no
                cross-purpose linkage, anonymisation, reasonable retention periods, and clear user
                information. Our configuration ticks all five.
              </>
            )}
          </p>
          <div style={{ marginTop: 16 }}>
            <a
              href="https://www.cnil.fr/fr/cookies-et-autres-traceurs/regles/cookies-solutions-pour-les-outils-de-mesure-daudience"
              target="_blank"
              rel="noopener noreferrer"
            >
              {isFr ? "Référentiel CNIL ↗" : "CNIL guidelines ↗"}
            </a>
          </div>
        </div>
      </section>

      <section className="fx-section" id="analytics">
        <div className="fx-wrap">
          <SectionHead
            number="02"
            kind={isFr ? "Outil utilisé" : "Tool used"}
            title={
              isFr ? (
                <>PostHog <em>en région UE</em></>
              ) : (
                <>PostHog <em>in EU region</em></>
              )
            }
            subtitle={
              isFr
                ? "Toutes les données techniques collectées passent exclusivement par les serveurs PostHog hébergés en Union européenne (eu.i.posthog.com). Aucun transfert hors UE pour cette finalité."
                : "All technical data collected goes exclusively through PostHog servers hosted in the European Union (eu.i.posthog.com). No outside-EU transfer for this purpose."
            }
          />
          <p>
            {isFr ? (
              <>
                Configuration par défaut, sans consentement requis :
              </>
            ) : (
              <>
                Default configuration, no consent required:
              </>
            )}
          </p>
          <ul style={{ paddingLeft: 20, lineHeight: 1.7 }}>
            <li>
              {isFr
                ? "Persistance en mémoire de session uniquement (pas de cookie persistant, pas d'ID stocké entre visites)."
                : "Session-memory persistence only (no persistent cookie, no ID stored across visits)."}
            </li>
            <li>
              {isFr
                ? "Aucune capture automatique des clics ou des saisies — seuls les évènements explicitement nommés dans le code sont remontés."
                : "No automatic click or keystroke capture — only events explicitly named in the code are sent."}
            </li>
            <li>
              {isFr
                ? "Pas de profil personne implicite (mode person_profiles: identified_only)."
                : "No implicit person profile (person_profiles: identified_only mode)."}
            </li>
            <li>
              {isFr
                ? "Respect automatique du signal Global Privacy Control (navigator.globalPrivacyControl)."
                : "Automatic compliance with the Global Privacy Control signal (navigator.globalPrivacyControl)."}
            </li>
          </ul>
        </div>
      </section>

      <section className="fx-section" id="donnees">
        <div className="fx-wrap">
          <SectionHead
            number="03"
            kind={isFr ? "Données collectées" : "Data collected"}
            title={isFr ? <>Ce qu'on <em>voit</em>, ce qu'on <em>ignore</em></> : <>What we <em>see</em>, what we <em>ignore</em></>}
          />
          <h3>{isFr ? "Ce qu'on collecte" : "What we collect"}</h3>
          <ul style={{ paddingLeft: 20, lineHeight: 1.7, marginBottom: 24 }}>
            <li>{isFr ? "Page consultée et page précédente (referer)" : "Page viewed and previous page (referer)"}</li>
            <li>{isFr ? "Type d'appareil (desktop / mobile / tablet) et taille d'écran" : "Device type (desktop / mobile / tablet) and screen size"}</li>
            <li>{isFr ? "Navigateur et système d'exploitation (chaîne user-agent)" : "Browser and operating system (user-agent string)"}</li>
            <li>{isFr ? "Langue préférée du navigateur" : "Browser preferred language"}</li>
            <li>{isFr ? "Pays approximatif (résolu depuis l'IP, sans stockage de l'IP elle-même)" : "Approximate country (resolved from IP, without storing the IP itself)"}</li>
            <li>{isFr ? "Évènements explicites : clic sur un graphique, ouverture d'un drawer, soumission d'un formulaire" : "Explicit events: chart click, drawer opening, form submission"}</li>
          </ul>
          <h3>{isFr ? "Ce qu'on n'a pas" : "What we don't have"}</h3>
          <ul style={{ paddingLeft: 20, lineHeight: 1.7 }}>
            <li>{isFr ? "Pas de nom, prénom, email, téléphone, identifiant national" : "No name, email, phone, national identifier"}</li>
            <li>{isFr ? "Pas d'adresse IP stockée (résolution géo en mémoire, IP jetée immédiatement)" : "No stored IP address (geo resolved in memory, IP discarded immediately)"}</li>
            <li>{isFr ? "Pas d'identifiant publicitaire ni de fingerprinting actif" : "No advertising identifier nor active fingerprinting"}</li>
            <li>{isFr ? "Pas de données de saisie dans les champs de formulaire" : "No data from form-field input"}</li>
            <li>{isFr ? "Pas de croisement avec des bases tierces" : "No cross-referencing with third-party bases"}</li>
          </ul>
        </div>
      </section>

      <section className="fx-section" id="conservation">
        <div className="fx-wrap">
          <SectionHead
            number="04"
            kind={isFr ? "Conservation" : "Retention"}
            title={isFr ? <>Durées <em>conformes au référentiel CNIL</em></> : <>Retention <em>compliant with CNIL framework</em></>}
          />
          <DefList>
            <dt style={dtStyle}>{isFr ? "Identifiant de visite" : "Visit identifier"}</dt>
            <dd style={ddStyle}>
              {isFr
                ? "Stocké en mémoire de session uniquement, supprimé à la fermeture de l'onglet."
                : "Stored in session memory only, cleared when the tab is closed."}
            </dd>
            <dt style={dtStyle}>{isFr ? "Cookie technique (replay opt-in seulement)" : "Technical cookie (replay opt-in only)"}</dt>
            <dd style={ddStyle}>
              {isFr ? "13 mois maximum (limite CNIL)." : "13 months max (CNIL limit)."}
            </dd>
            <dt style={dtStyle}>{isFr ? "Données d'audience" : "Audience data"}</dt>
            <dd style={ddStyle}>
              {isFr ? "25 mois maximum (limite CNIL)." : "25 months max (CNIL limit)."}
            </dd>
          </DefList>
        </div>
      </section>

      <section className="fx-section" id="hebergement">
        <div className="fx-wrap">
          <SectionHead
            number="05"
            kind={isFr ? "Hébergement & transferts" : "Hosting & transfers"}
            title={isFr ? <>Où <em>tournent</em> vos données</> : <>Where your data <em>runs</em></>}
          />
          <DefList>
            <dt style={dtStyle}>{isFr ? "Hébergeur du site" : "Site host"}</dt>
            <dd style={ddStyle}>
              {isFr
                ? "Vercel Inc. (États-Unis) — transferts encadrés par le Data Privacy Framework EU-US (décision d'adéquation de la Commission européenne du 10 juillet 2023)."
                : "Vercel Inc. (United States) — transfers governed by the EU-US Data Privacy Framework (European Commission adequacy decision of 10 July 2023)."}
            </dd>
            <dt style={dtStyle}>{isFr ? "Mesure d'audience" : "Audience analytics"}</dt>
            <dd style={ddStyle}>
              {isFr
                ? "PostHog Cloud EU (eu.i.posthog.com) — Union européenne, aucun transfert hors UE."
                : "PostHog Cloud EU (eu.i.posthog.com) — European Union, no outside-EU transfer."}
            </dd>
          </DefList>
        </div>
      </section>

      <section className="fx-section" id="droits">
        <div className="fx-wrap">
          <SectionHead
            number="06"
            kind={isFr ? "Vos droits RGPD" : "Your GDPR rights"}
            title={isFr ? <>Six <em>droits</em>, un même contact</> : <>Six <em>rights</em>, one contact</>}
            subtitle={
              isFr
                ? "Conformément aux articles 15 à 22 du RGPD, vous pouvez à tout moment exercer les droits suivants — sans avoir à justifier votre demande."
                : "In accordance with GDPR articles 15 to 22, you may at any time exercise the following rights — without having to justify your request."
            }
          />
          <ul style={{ paddingLeft: 20, lineHeight: 1.7 }}>
            <li><b>{isFr ? "Accès" : "Access"}</b> {isFr ? "(art. 15) — savoir quelles données nous avons sur vous." : "(art. 15) — know which data we hold about you."}</li>
            <li><b>{isFr ? "Rectification" : "Rectification"}</b> {isFr ? "(art. 16) — corriger une donnée inexacte." : "(art. 16) — correct inaccurate data."}</li>
            <li><b>{isFr ? "Effacement" : "Erasure"}</b> {isFr ? "(art. 17) — demander la suppression." : "(art. 17) — request deletion."}</li>
            <li><b>{isFr ? "Limitation" : "Restriction"}</b> {isFr ? "(art. 18) — geler un traitement contesté." : "(art. 18) — freeze a disputed processing."}</li>
            <li><b>{isFr ? "Portabilité" : "Portability"}</b> {isFr ? "(art. 20) — récupérer vos données dans un format structuré." : "(art. 20) — retrieve your data in a structured format."}</li>
            <li><b>{isFr ? "Opposition" : "Objection"}</b> {isFr ? "(art. 21) — refuser un traitement." : "(art. 21) — object to processing."}</li>
          </ul>
          <p style={{ marginTop: 16 }}>
            {isFr ? (
              <>
                Note : comme nous ne stockons aucune donnée nominative et qu'aucun ID stable ne lie
                vos visites entre elles par défaut, l'exercice des droits d'accès / rectification /
                effacement n'a en pratique pas grand-chose à exercer — il n'y a rien d'identifiant
                à corriger ou supprimer. Si vous avez activé le replay opt-in (section 08), une
                demande d'effacement supprimera l'enregistrement correspondant.
              </>
            ) : (
              <>
                Note: since we do not store any personal data and no stable ID links your visits by
                default, the rights of access / rectification / erasure have little to be exercised
                on in practice — there is nothing identifying to correct or remove. If you have
                opted into replay (section 08), an erasure request will remove the corresponding
                recording.
              </>
            )}
          </p>
          <div style={{ marginTop: 16 }}>
            <Button variant="primary" href="mailto:daniel@franceopendata.org?subject=Demande%20RGPD">
              daniel@franceopendata.org ↗
            </Button>
          </div>
        </div>
      </section>

      <section className="fx-section" id="controles">
        <div className="fx-wrap">
          <SectionHead
            number="07"
            kind={isFr ? "Contrôles utilisateur" : "User controls"}
            title={isFr ? <>Refuser <em>tout suivi</em></> : <>Refuse <em>all tracking</em></>}
            subtitle={
              isFr
                ? "Cette bascule désactive immédiatement toute remontée d'évènement. Active à l'instant même, sur ce navigateur, sans recharger la page."
                : "This toggle immediately disables all event reporting. Effective right away, on this browser, no reload required."
            }
          />
          <ToggleRow
            label={isFr ? "Mesure d'audience" : "Audience analytics"}
            status={
              isOptedOut
                ? isFr
                  ? "Désactivée — aucun évènement ne quitte votre navigateur."
                  : "Disabled — no event leaves your browser."
                : isFr
                ? "Active — évènements anonymes envoyés à PostHog EU."
                : "Active — anonymous events sent to PostHog EU."
            }
            ariaLabel={isFr ? "Activer ou désactiver la mesure d'audience" : "Enable or disable audience analytics"}
            on={!isOptedOut}
            onClick={handleToggle}
          />
        </div>
      </section>

      <section className="fx-section" id="replay">
        <div className="fx-wrap">
          <SectionHead
            number="08"
            kind={isFr ? "Replay opt-in" : "Replay opt-in"}
            title={
              isFr ? (
                <>Replay session — <em>opt-in seulement</em></>
              ) : (
                <>Session replay — <em>opt-in only</em></>
              )
            }
            subtitle={
              isFr
                ? "L'enregistrement vidéo de votre session ne s'active que si vous l'autorisez explicitement ici. Désactivé tant que vous n'avez pas cliqué."
                : "Session video recording activates only if you explicitly authorise it here. Disabled until you click."
            }
          />
          <ToggleRow
            label={isFr ? "Enregistrement de session" : "Session recording"}
            status={
              replayOn
                ? isFr
                  ? "Activé — votre interaction sera enregistrée pour le débogage produit."
                  : "Enabled — your interaction will be recorded for product debugging."
                : isFr
                ? "Désactivé — aucun enregistrement n'est effectué."
                : "Disabled — no recording is taken."
            }
            ariaLabel={isFr ? "Activer ou désactiver l'enregistrement de session" : "Enable or disable session recording"}
            on={replayOn}
            disabled={isOptedOut}
            onClick={handleReplayToggle}
          />
          {isOptedOut && (
            <p style={{ marginTop: 12, fontSize: 13.5, color: "var(--muted)" }}>
              {isFr
                ? "Pour activer le replay, réactivez d'abord la mesure d'audience (section 07)."
                : "To enable replay, first re-enable audience analytics (section 07)."}
            </p>
          )}
        </div>
      </section>

      <section className="fx-section" id="recours">
        <div className="fx-wrap">
          <SectionHead
            number="09"
            kind={isFr ? "Recours" : "Remedies"}
            title={
              isFr ? (
                <>Si <em>une question</em> reste sans réponse</>
              ) : (
                <>If <em>a question</em> goes unanswered</>
              )
            }
          />
          <p>
            {isFr ? (
              <>
                Si vous estimez, après contact avec nous, que vos droits ne sont pas respectés,
                vous pouvez introduire une réclamation auprès de la CNIL (Commission nationale de
                l'informatique et des libertés).
              </>
            ) : (
              <>
                If, after contacting us, you believe your rights are not being respected, you may
                file a complaint with the CNIL (Commission nationale de l'informatique et des
                libertés).
              </>
            )}
          </p>
          <div style={{ marginTop: 16, display: "flex", gap: 10, flexWrap: "wrap" }}>
            <Button variant="primary" href="https://www.cnil.fr/fr/plaintes">
              {isFr ? "Saisir la CNIL ↗" : "File with the CNIL ↗"}
            </Button>
            <Button href="mailto:daniel@franceopendata.org">
              {isFr ? "Nous écrire d'abord" : "Write to us first"}
            </Button>
          </div>
        </div>
      </section>

      <section className="fx-section" id="meta">
        <div className="fx-wrap">
          <SectionHead
            number="10"
            kind={isFr ? "Méta" : "Meta"}
            title={isFr ? <>Mise <em>à jour</em></> : <>Last <em>update</em></>}
          />
          <DefList>
            <dt style={dtStyle}>{isFr ? "Dernière mise à jour" : "Last update"}</dt>
            <dd style={ddStyle}>{isFr ? LAST_UPDATE : LAST_UPDATE_EN}</dd>
            <dt style={dtStyle}>{isFr ? "Outils" : "Tools"}</dt>
            <dd style={ddStyle}>PostHog Cloud EU, Vercel (EU-US DPF)</dd>
            <dt style={dtStyle}>{isFr ? "Référentiels appliqués" : "Frameworks applied"}</dt>
            <dd style={ddStyle}>RGPD · CNIL exemption mesure d'audience · GPC · Data Privacy Framework</dd>
          </DefList>
          <div className="fx-note">
            {isFr
              ? "Cette politique est mise à jour à chaque changement structurant : changement d'outil, ajout d'une fonctionnalité collectant des données, évolution réglementaire significative. Toute modification est datée."
              : "This policy is updated at each structural change: tool change, addition of a data-collecting feature, significant regulatory evolution. Every modification is dated."}
          </div>
        </div>
      </section>

      </main>
      <Footer />
    </div>
  );
}
