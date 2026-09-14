import type { CSSProperties, ReactNode } from "react";
import Navbar from "@/components/fusion/Navbar";
import Footer from "@/components/fusion/Footer";
import Button from "@/components/fusion/Button";
import SectionHead from "@/components/fusion/SectionHead";
import Link from "@/components/LocalizedLink";
import LocaleRefresh from "@/components/LocaleRefresh";
import { readLocale } from "@/lib/seo";

// Data licences mirror website/public/data/LICENSE.md and the stamps written by
// pipeline/scripts/export/stamp_licenses.py — change all three together.

const PIPELINE_REPO = "https://github.com/AbstractsMachine/qipu-pipeline";

type Licence = { name: string; nameEn?: string; url: string };
type Bilingual = { fr: string; en: string };

const LICENCES = {
  mit: { name: "MIT", url: "https://opensource.org/license/mit" },
  odbl: { name: "ODbL 1.0", url: "https://opendatacommons.org/licenses/odbl/1-0/" },
  lo2: {
    name: "Licence Ouverte 2.0",
    nameEn: "Etalab Open Licence 2.0",
    url: "https://www.etalab.gouv.fr/licence-ouverte-open-licence",
  },
  ccBy: { name: "CC BY 4.0", url: "https://creativecommons.org/licenses/by/4.0/" },
  ccBySa: { name: "CC BY-SA 4.0", url: "https://creativecommons.org/licenses/by-sa/4.0/" },
  pddl: { name: "PDDL", url: "https://opendatacommons.org/licenses/pddl/1-0/" },
} satisfies Record<string, Licence>;

const DATA_SOURCES: { sources: Bilingual; licence: Licence; duty: Bilingual }[] = [
  {
    sources: {
      fr: "Paris (Paris Open Data) et Recife (Dados Abertos)",
      en: "Paris (Paris Open Data) and Recife (Dados Abertos)",
    },
    licence: LICENCES.odbl,
    duty: {
      fr: "Citer la source et Qipu. Une base dérivée que vous redistribuez doit rester sous ODbL.",
      en: "Credit the source and Qipu. A derived database you redistribute must stay under ODbL.",
    },
  },
  {
    sources: {
      fr: "Communes, Marseille et données nationales (DGFiP, OFGL, DECP, INSEE, PLF, PLFSS, Ville de Marseille, Métropole Aix-Marseille-Provence)",
      en: "French municipalities, Marseille and national data (DGFiP, OFGL, DECP, INSEE, PLF, PLFSS, Ville de Marseille, Métropole Aix-Marseille-Provence)",
    },
    licence: LICENCES.lo2,
    duty: {
      fr: "Citer la source dans la forme demandée par le producteur, par exemple « calcul OFGL - source DGFiP » ou « Source : Insee ».",
      en: "Credit the source in the form its producer asks for, for example “calcul OFGL - source DGFiP” or “Source : Insee”.",
    },
  },
  {
    sources: { fr: "Eurostat", en: "Eurostat" },
    licence: LICENCES.ccBy,
    duty: {
      fr: "Citer Eurostat et préciser que les chiffres ont été retraités.",
      en: "Credit Eurostat and state that the figures were reprocessed.",
    },
  },
  {
    sources: { fr: "San Francisco (DataSF)", en: "San Francisco (DataSF)" },
    licence: LICENCES.pddl,
    duty: { fr: "Domaine public : aucune obligation.", en: "Public domain: no obligation." },
  },
];

const TEXT: CSSProperties = { lineHeight: 1.65, maxWidth: 780, margin: "0 0 12px" };
const LIST: CSSProperties = { ...TEXT, listStyle: "disc", paddingLeft: 20, display: "grid", gap: 10 };
// Same look as the other inline text links on the site (.fx-fiche-grounded-sources a).
const LINK: CSSProperties = { color: "var(--bleu)", textDecoration: "underline", textUnderlineOffset: 2 };
const NOTE: CSSProperties = { fontSize: 13, color: "var(--muted)", marginTop: 16, maxWidth: 780 };

function Ext({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" style={LINK}>
      {children} ↗
    </a>
  );
}

export default async function LicenceClient() {
  const locale = await readLocale();
  const isFr = locale !== "en";
  const tr = (s: Bilingual) => (isFr ? s.fr : s.en);
  const licenceName = (l: Licence) => (!isFr && l.nameEn ? l.nameEn : l.name);

  return (
    <div className="theme-fusion">
      <LocaleRefresh />
      <Navbar />
      <main id="main-content" tabIndex={-1}>

      <section className="fx-page-header">
        <div className="fx-wrap">
          <div className="fx-page-kicker">{isFr ? "— Licence" : "— License"}</div>
          <h1 className="fx-page-title">
            {isFr ? <>Ce que vous pouvez <em>réutiliser</em></> : <>What you can <em>reuse</em></>}
          </h1>
          <p className="fx-page-lede">
            {isFr
              ? "Le code, les données et les textes du site ont chacun leur licence. Voici lesquelles, et comment citer la source."
              : "The site's code, data and text each have their own licence. Here is which, and how to credit the source."}
          </p>
        </div>
      </section>

      <section className="fx-section" id="code">
        <div className="fx-wrap">
          <SectionHead title={isFr ? <>Le code du pipeline : <em>MIT</em></> : <>Pipeline code: <em>MIT</em></>} />
          <p style={TEXT}>
            {isFr
              ? "Le pipeline qui calcule les chiffres du site est publié sous licence MIT. Vous pouvez l'utiliser, le modifier et le redistribuer, y compris à des fins commerciales. Il faut seulement conserver la mention de copyright et le texte de la licence."
              : "The pipeline that computes the site's figures is published under the MIT licence. You may use, modify and redistribute it, including commercially. You only need to keep the copyright notice and the licence text."}
          </p>
          <p style={TEXT}>
            {isFr
              ? "Le code du site web et des enrichissements n'est pas publié."
              : "The code of the website and of the enrichment steps is not published."}
          </p>
          <div style={{ marginTop: 20, display: "flex", gap: 10, flexWrap: "wrap" }}>
            <Button variant="primary" href={PIPELINE_REPO} target="_blank" rel="noopener noreferrer">
              {isFr ? "Dépôt qipu-pipeline sur GitHub ↗" : "qipu-pipeline repository on GitHub ↗"}
            </Button>
            <Button href={LICENCES.mit.url} target="_blank" rel="noopener noreferrer">
              {isFr ? "Texte de la licence MIT ↗" : "Text of the MIT licence ↗"}
            </Button>
          </div>
        </div>
      </section>

      <section className="fx-section" id="donnees">
        <div className="fx-wrap">
          <SectionHead
            title={isFr ? <>Les données : <em>selon la source</em></> : <>Data: <em>depends on the source</em></>}
          />
          <p style={TEXT}>
            {isFr
              ? "Les fichiers de données du site sont dérivés des portails open data. Chacun garde la licence de sa source la plus contraignante."
              : "The site's data files are derived from open data portals. Each keeps the licence of its most restrictive source."}
          </p>
          <ul style={{ listStyle: "none", padding: 0, margin: "20px 0 0", maxWidth: 900 }}>
            {DATA_SOURCES.map((row) => (
              <li
                key={row.licence.url}
                style={{
                  display: "flex",
                  flexWrap: "wrap",
                  gap: "6px 32px",
                  padding: "14px 0",
                  borderTop: "1px solid var(--rule)",
                  lineHeight: 1.55,
                }}
              >
                <div style={{ flex: "1 1 15rem", fontWeight: 600 }}>{tr(row.sources)}</div>
                <div style={{ flex: "2 1 20rem" }}>
                  <Ext href={row.licence.url}>{licenceName(row.licence)}</Ext>
                  <div style={{ color: "var(--ink-2)", marginTop: 2 }}>{tr(row.duty)}</div>
                </div>
              </li>
            ))}
          </ul>
          <p style={NOTE}>
            {isFr
              ? "Licences vérifiées sur chaque portail le 13 septembre 2026. "
              : "Licences checked on each portal on 13 September 2026. "}
            <a href="/data/LICENSE.md" style={LINK}>
              {isFr ? "Détail par dossier de fichiers (LICENSE.md, en anglais)" : "Details per file folder (LICENSE.md)"}
            </a>
          </p>
        </div>
      </section>

      <section className="fx-section" id="textes">
        <div className="fx-wrap">
          <SectionHead title={isFr ? <>Les textes et les <em>images</em></> : <>Text and <em>images</em></>} />
          <ul style={LIST}>
            <li>
              {isFr ? "Les textes écrits par Qipu sont sous " : "Text written by Qipu is under "}
              <Ext href={LICENCES.ccBy.url}>CC BY 4.0</Ext>
              {isFr
                ? ". Vous pouvez les reprendre, y compris à des fins commerciales, en citant Qipu avec un lien vers la page."
                : ". You may reuse it, including commercially, by crediting Qipu with a link to the page."}
            </li>
            <li>
              {isFr
                ? "Certains textes courts sont rédigés par un modèle de langage à partir des sources. C'est le cas des réponses de l'assistant et des descriptions en langage clair des contrats et des projets. Si vous les reprenez, merci de préciser qu'ils ont été rédigés par IA."
                : "Some short texts are written by a language model from the sources. This is the case for the assistant's answers and the plain-language descriptions of contracts and projects. If you reuse them, please say they were written by AI."}
            </li>
            <li>
              {isFr ? "Les extraits de Wikipédia sur les fiches de lieux restent sous " : "Wikipedia extracts on place pages remain under "}
              <Ext href={LICENCES.ccBySa.url}>CC BY-SA 4.0</Ext>.
            </li>
            <li>
              {isFr
                ? "Chaque photo garde la licence indiquée dans son crédit."
                : "Each photo keeps the licence shown in its credit."}
            </li>
          </ul>
        </div>
      </section>

      <section className="fx-section" id="citer">
        <div className="fx-wrap">
          <SectionHead title={isFr ? <>Comment <em>citer</em></> : <>How to <em>credit</em></>} />
          <p style={TEXT}>
            {isFr ? "Pour un chiffre, un graphique ou un fichier :" : "For a figure, a chart or a file:"}
          </p>
          <blockquote
            style={{
              borderLeft: "2px solid var(--ink)",
              paddingLeft: 20,
              margin: "16px 0",
              fontFamily: "var(--f-mono)",
              fontSize: 14,
              lineHeight: 1.7,
              color: "var(--ink-2)",
              maxWidth: 780,
            }}
          >
            {isFr
              ? "Qipu (qipu.org), d'après [producteur de la donnée], sous licence [licence]. Consulté le [date]."
              : "Qipu (qipu.org), based on [data producer], under [licence]. Accessed [date]."}
          </blockquote>
          <p style={TEXT}>
            {isFr
              ? "Pour une base dérivée des données de Paris ou de Recife, ajoutez : « Qipu · base dérivée, sous licence ODbL »."
              : "For a database derived from the Paris or Recife data, add: “Qipu · derived database, licensed ODbL”."}
          </p>
          <p style={{ ...TEXT, marginTop: 24 }}>
            {isFr ? "Pour toute question sur une réutilisation : " : "For any question about reuse: "}
            <Link href="/contact" style={LINK}>{isFr ? "page Contact" : "Contact page"}</Link>
          </p>
        </div>
      </section>

      </main>
      <Footer />
    </div>
  );
}
