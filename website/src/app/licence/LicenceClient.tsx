import Navbar from "@/components/fusion/Navbar";
import Footer from "@/components/fusion/Footer";
import Button from "@/components/fusion/Button";
import SectionHead from "@/components/fusion/SectionHead";
import LocaleRefresh from "@/components/LocaleRefresh";
import { readLocale } from "@/lib/seo";

export default async function LicenceClient() {
  const locale = await readLocale();
  const isFr = locale !== "en";

  return (
    <div className="theme-fusion">
      <LocaleRefresh />
      <Navbar />
      <main id="main-content" tabIndex={-1}>

      <section className="fx-page-header">
        <div className="fx-wrap">
          <div className="fx-page-kicker">{isFr ? "— Licence" : "— License"}</div>
          <h1 className="fx-page-title">
            {isFr ? (
              <>Trois <em>licences</em>, un projet ouvert.</>
            ) : (
              <>Three <em>licenses</em>, one open project.</>
            )}
          </h1>
          <p className="fx-page-lede">
            {isFr
              ? "Qipu publie trois types de production ouverte : le code du pipeline de données, les jeux de données dérivés, et les contenus éditoriaux. Chacun est régi par la licence la mieux adaptée à son usage."
              : "Qipu publishes three types of open output: the data pipeline code, the derived datasets, and the editorial content. Each is governed by the license best suited to its use."}
          </p>
        </div>
      </section>

      <section className="fx-section" id="resume">
        <div className="fx-wrap">
          <SectionHead
            number="01"
            kind={isFr ? "Vue d'ensemble" : "Overview"}
            title={isFr ? <>Que <em>couvre</em> quoi</> : <>What <em>covers</em> what</>}
          />
          <table className="fx-sources-table" style={{ marginTop: 16 }}>
            <thead>
              <tr>
                <th>{isFr ? "Production" : "Output"}</th>
                <th>{isFr ? "Périmètre" : "Scope"}</th>
                <th>{isFr ? "Licence" : "License"}</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>{isFr ? "Code du pipeline" : "Pipeline code"}</td>
                <td>
                  {isFr
                    ? "Pipeline Python (extraction, transformation), modèles dbt, scripts d'export, configurations"
                    : "Python pipeline (extraction, transformation), dbt models, export scripts, configurations"}
                </td>
                <td>
                  <a
                    href="https://www.gnu.org/licenses/agpl-3.0.html"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    GNU AGPL-3.0 ↗
                  </a>
                </td>
              </tr>
              <tr>
                <td>{isFr ? "Données dérivées" : "Derived data"}</td>
                <td>
                  {isFr
                    ? "Fichiers JSON/CSV publiés sous /public/data/"
                    : "JSON/CSV files published under /public/data/"}
                </td>
                <td>
                  <a
                    href="https://www.data.gouv.fr/pages/legal/licences/etalab-2.0"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Licence Ouverte Etalab 2.0 ↗
                  </a>
                </td>
              </tr>
              <tr>
                <td>{isFr ? "Contenus éditoriaux" : "Editorial content"}</td>
                <td>
                  {isFr
                    ? "Articles, analyses, méthodologie, vulgarisations IA"
                    : "Articles, analyses, methodology, AI summaries"}
                </td>
                <td>
                  <a
                    href="https://creativecommons.org/licenses/by/4.0/deed.fr"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Creative Commons CC BY 4.0 ↗
                  </a>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section className="fx-section" id="code">
        <div className="fx-wrap">
          <SectionHead
            number="02"
            kind={isFr ? "Code du pipeline" : "Pipeline code"}
            title={isFr ? <>Pipeline <em>libre</em>, copyleft « réseau »</> : <>Free <em>pipeline</em>, network-aware copyleft</>}
            subtitle={
              isFr
                ? "Le code du pipeline (Python + dbt + scripts d'export) est publié sous GNU Affero General Public License version 3."
                : "The pipeline code (Python + dbt + export scripts) is published under the GNU Affero General Public License version 3."
            }
          />
          <h3>{isFr ? "Vous pouvez" : "You may"}</h3>
          <ul style={{ paddingLeft: 20, lineHeight: 1.7, marginBottom: 24 }}>
            <li>{isFr ? "Cloner le dépôt, étudier le code, l'auditer librement." : "Clone the repository, study the code, audit it freely."}</li>
            <li>{isFr ? "Le modifier pour vos propres besoins (collectivité, association, recherche)." : "Modify it for your own needs (local government, non-profit, research)."}</li>
            <li>{isFr ? "Le redéployer pour votre territoire (multi-villes, multi-régions, échelle nationale)." : "Redeploy it for your territory (multi-city, multi-region, national scale)."}</li>
            <li>{isFr ? "L'utiliser à des fins commerciales (formation, conseil, intégration sur mesure)." : "Use it commercially (training, consulting, custom integration)."}</li>
          </ul>
          <h3>{isFr ? "Vous devez" : "You must"}</h3>
          <ul style={{ paddingLeft: 20, lineHeight: 1.7, marginBottom: 24 }}>
            <li>
              {isFr
                ? "Préserver les mentions de copyright et la licence dans toute redistribution."
                : "Preserve copyright notices and the license in any redistribution."}
            </li>
            <li>
              {isFr
                ? "Si vous faites tourner une version modifiée sur un serveur accessible (site web, SaaS), publier votre version modifiée sous AGPL-3.0 elle aussi."
                : "If you run a modified version on a publicly accessible server (website, SaaS), publish your modified version under AGPL-3.0 as well."}
            </li>
            <li>
              {isFr
                ? "Permettre aux utilisateurs de votre version modifiée d'accéder à votre code source."
                : "Allow users of your modified version to access your source code."}
            </li>
          </ul>
          <div className="fx-note">
            {isFr ? (
              <>
                <b>Pourquoi AGPL et pas MIT ?</b> L'AGPL est l'une des rares licences qui empêche
                qu'un acteur tiers prenne notre travail, le fasse tourner en service propriétaire et
                récupère les bénéfices sans contribuer en retour. C'est exactement le modèle utilisé
                par Plausible, Mastodon, Element, GitLab. Pour une infrastructure citoyenne, c'est
                la garantie que les améliorations restent dans le commun.
              </>
            ) : (
              <>
                <b>Why AGPL and not MIT?</b> AGPL is one of the few licenses that prevents a third
                party from taking our work, running it as a proprietary service, and reaping the
                benefits without giving back. It's the exact model used by Plausible, Mastodon,
                Element, GitLab. For citizen infrastructure, it's a guarantee that improvements
                stay in the commons.
              </>
            )}
          </div>
          <div style={{ marginTop: 24, display: "flex", gap: 10, flexWrap: "wrap" }}>
            <Button
              variant="primary"
              href="https://github.com/AbstractsMachine/france-open-data-pipeline"
            >
              {isFr ? "Le code sur GitHub ↗" : "Code on GitHub ↗"}
            </Button>
            <Button href="https://www.gnu.org/licenses/agpl-3.0.html">
              {isFr ? "Texte intégral AGPL-3.0 ↗" : "Full AGPL-3.0 text ↗"}
            </Button>
          </div>
        </div>
      </section>

      <section className="fx-section" id="commercial">
        <div className="fx-wrap">
          <SectionHead
            number="03"
            kind={isFr ? "Usage commercial sans AGPL" : "Commercial use without AGPL"}
            title={
              isFr ? (
                <>Une <em>licence commerciale</em> est possible</>
              ) : (
                <>A <em>commercial license</em> is available</>
              )
            }
          />
          <p>
            {isFr ? (
              <>
                Si votre organisation souhaite intégrer notre code dans un produit propriétaire
                <b> sans publier ses modifications</b> (par exemple : un cabinet de conseil qui
                intègre notre pipeline dans une suite logicielle vendue à ses clients), une licence
                commerciale alternative à l'AGPL peut être négociée. Contactez-nous pour discuter
                des conditions.
              </>
            ) : (
              <>
                If your organisation wishes to integrate our code into a proprietary product
                <b> without publishing its modifications</b> (e.g. a consulting firm integrating
                our pipeline into a software suite sold to its clients), a commercial license
                alternative to AGPL can be negotiated. Contact us to discuss terms.
              </>
            )}
          </p>
          <div style={{ marginTop: 16 }}>
            <Button variant="primary" href="mailto:daniel@qipu.org?subject=Licence%20commerciale">
              daniel@qipu.org ↗
            </Button>
          </div>
        </div>
      </section>

      <section className="fx-section" id="donnees">
        <div className="fx-wrap">
          <SectionHead
            number="04"
            kind={isFr ? "Données" : "Data"}
            title={
              isFr ? (
                <>Données dérivées : <em>Licence Ouverte 2.0</em></>
              ) : (
                <>Derived data: <em>Etalab Open License 2.0</em></>
              )
            }
            subtitle={
              isFr
                ? "Tous les fichiers JSON et CSV publiés sont sous Licence Ouverte 2.0 par compatibilité avec les sources d'origine (Paris Open Data, État, INSEE)."
                : "All published JSON and CSV files are under the Etalab Open License 2.0 for compatibility with the original sources (Paris Open Data, French State, INSEE)."
            }
          />
          <h3>{isFr ? "Vous pouvez" : "You may"}</h3>
          <ul style={{ paddingLeft: 20, lineHeight: 1.7, marginBottom: 24 }}>
            <li>{isFr ? "Télécharger librement les fichiers, à toutes fins, y compris commerciales." : "Download files freely for any purpose, including commercial."}</li>
            <li>{isFr ? "Les republier, les modifier, les croiser avec d'autres jeux." : "Republish, modify, and cross with other datasets."}</li>
            <li>{isFr ? "Les intégrer dans des produits payants (rapports, études, dashboards)." : "Embed them in paid products (reports, studies, dashboards)."}</li>
          </ul>
          <h3>{isFr ? "Vous devez" : "You must"}</h3>
          <ul style={{ paddingLeft: 20, lineHeight: 1.7, marginBottom: 24 }}>
            <li>
              {isFr
                ? "Mentionner la source : « Qipu · données dérivées de Paris Open Data, Etalab et INSEE »."
                : "Cite the source: \"Qipu · data derived from Paris Open Data, Etalab and INSEE\"."}
            </li>
            <li>
              {isFr
                ? "Conserver les champs source et source_url présents dans nos JSON — ils tracent l'origine ligne par ligne."
                : "Keep the source and source_url fields present in our JSON files — they trace the origin row by row."}
            </li>
            <li>
              {isFr
                ? "Ne pas suggérer que Qipu approuve votre réutilisation."
                : "Not imply that Qipu endorses your reuse."}
            </li>
          </ul>
          <div className="fx-note">
            {isFr
              ? "Les données brutes émises par les administrations restent toujours accessibles à leur source d'origine. Notre rôle est d'enrichir et d'organiser, pas de re-encadrer juridiquement."
              : "The raw data published by administrations always remains accessible at its original source. Our role is to enrich and organise, not to re-restrict it legally."}
          </div>
        </div>
      </section>

      <section className="fx-section" id="editorial">
        <div className="fx-wrap">
          <SectionHead
            number="05"
            kind={isFr ? "Contenus éditoriaux" : "Editorial content"}
            title={
              isFr ? (
                <>Articles & analyses : <em>CC BY 4.0</em></>
              ) : (
                <>Articles & analyses: <em>CC BY 4.0</em></>
              )
            }
            subtitle={
              isFr
                ? "Les articles, analyses et textes méthodologiques sont sous Creative Commons Attribution 4.0 — réutilisables librement avec attribution."
                : "Articles, analyses and methodology texts are under Creative Commons Attribution 4.0 — freely reusable with attribution."
            }
          />
          <h3>{isFr ? "Vous pouvez" : "You may"}</h3>
          <ul style={{ paddingLeft: 20, lineHeight: 1.7, marginBottom: 24 }}>
            <li>{isFr ? "Citer un paragraphe ou un article entier dans un autre média." : "Quote a paragraph or an entire article in another medium."}</li>
            <li>{isFr ? "Traduire un article et publier la traduction." : "Translate an article and publish the translation."}</li>
            <li>{isFr ? "Réutiliser une analyse dans un livre, un cours, un rapport (y compris commerciaux)." : "Reuse an analysis in a book, a course, a report (including commercial ones)."}</li>
          </ul>
          <h3>{isFr ? "Vous devez" : "You must"}</h3>
          <ul style={{ paddingLeft: 20, lineHeight: 1.7 }}>
            <li>
              {isFr
                ? "Citer Qipu (ou l'auteur·e nommé·e quand indiqué) avec un lien vers l'article original."
                : "Cite Qipu (or the named author when indicated) with a link to the original article."}
            </li>
            <li>
              {isFr
                ? "Indiquer si vous avez modifié le texte (traduction, condensé, montage)."
                : "Indicate whether you have modified the text (translation, summary, edit)."}
            </li>
          </ul>
        </div>
      </section>

      <section className="fx-section" id="ia">
        <div className="fx-wrap">
          <SectionHead
            number="06"
            kind={isFr ? "Transparence IA" : "AI transparency"}
            title={
              isFr ? (
                <>Quand un texte est <em>généré par IA</em></>
              ) : (
                <>When a text is <em>AI-generated</em></>
              )
            }
          />
          <p>
            {isFr ? (
              <>
                Une partie des résumés courts publiés sur ce site (vulgarisations d'objets de
                subvention, traductions automatiques) sont générés par modèles de langage
                (Gemini, Claude). Ils sont distribués sous CC BY 4.0 comme le reste de l'éditorial,
                <b> mais leur provenance IA doit être indiquée si vous les republiez</b>, conformément
                aux recommandations Open Data Paris et à l'AI Act européen d'août 2024 sur
                l'étiquetage transparent des contenus synthétiques.
              </>
            ) : (
              <>
                Some short summaries published on this site (grant-purpose plain-language
                rewrites, automatic translations) are generated by language models (Gemini,
                Claude). They are released under CC BY 4.0 like other editorial content,
                <b> but their AI provenance must be disclosed if you republish them</b>, in line
                with Paris Open Data editorial guidance and the European AI Act of August 2024
                on transparent labelling of synthetic content.
              </>
            )}
          </p>
        </div>
      </section>

      <section className="fx-section" id="citation">
        <div className="fx-wrap">
          <SectionHead
            number="07"
            kind={isFr ? "Citation recommandée" : "Recommended citation"}
            title={isFr ? <>Comment <em>nous citer</em></> : <>How to <em>cite us</em></>}
          />
          <p>
            {isFr
              ? "Si vous êtes journaliste, chercheur·se, étudiant·e, ou simplement curieux·se, voici le format de citation recommandé pour vos articles, mémoires et rapports :"
              : "If you are a journalist, researcher, student, or just curious, here is the recommended citation format for your articles, theses and reports:"}
          </p>
          <blockquote
            style={{
              borderLeft: "2px solid var(--ink)",
              paddingLeft: 20,
              margin: "20px 0",
              fontFamily: "var(--f-mono)",
              fontSize: 14,
              lineHeight: 1.7,
              color: "var(--ink-2)",
            }}
          >
            {isFr ? (
              <>
                D&apos;après <b>qipu.org</b>, données dérivées de Paris Open Data,
                Etalab et INSEE (Licence Ouverte 2.0). Méthodologie complète :
                <code> qipu.org/methode</code>. Consulté le [date].
              </>
            ) : (
              <>
                Based on <b>qipu.org</b>, data derived from Paris Open Data,
                Etalab and INSEE (Etalab Open License 2.0). Full methodology:
                <code> qipu.org/methode</code>. Accessed [date].
              </>
            )}
          </blockquote>
        </div>
      </section>

      <section className="fx-section" id="contact">
        <div className="fx-wrap">
          <SectionHead
            number="08"
            kind={isFr ? "Questions" : "Questions"}
            title={
              isFr ? (
                <>Un <em>doute</em> ? Écrivez-nous.</>
              ) : (
                <>In <em>doubt</em>? Get in touch.</>
              )
            }
            subtitle={
              isFr
                ? "Nous répondons sous cinq jours ouvrés sur les questions de licence, attribution, citation, intégration commerciale ou redistribution."
                : "We respond within five business days to questions about license, attribution, citation, commercial integration or redistribution."
            }
          />
          <div style={{ marginTop: 24, display: "flex", gap: 10, flexWrap: "wrap" }}>
            <Button variant="primary" href="mailto:daniel@qipu.org">
              daniel@qipu.org ↗
            </Button>
            <Button href="/contact">{isFr ? "Formulaire de contact" : "Contact form"}</Button>
            <Button href="/methode">{isFr ? "Méthodologie" : "Methodology"}</Button>
          </div>
        </div>
      </section>

      </main>
      <Footer />
    </div>
  );
}
