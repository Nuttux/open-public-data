import Navbar from "@/components/fusion/Navbar";
import Footer from "@/components/fusion/Footer";
import Button from "@/components/fusion/Button";
import SectionHead from "@/components/fusion/SectionHead";
import LocaleRefresh from "@/components/LocaleRefresh";
import { readLocale } from "@/lib/seo";
import type { CorrectionsDoc, CorrectionEntry, CorrectionCategory } from "@/lib/corrections";

const CATEGORY_LABELS: Record<CorrectionCategory, { fr: string; en: string }> = {
  data: { fr: "Donnée", en: "Data" },
  methodology: { fr: "Méthode", en: "Method" },
  editorial: { fr: "Éditorial", en: "Editorial" },
};

function formatDate(iso: string, isFr: boolean): string {
  const d = new Date(iso + "T00:00:00Z");
  return new Intl.DateTimeFormat(isFr ? "fr-FR" : "en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  }).format(d);
}

function CorrectionCard({ entry, isFr }: { entry: CorrectionEntry; isFr: boolean }) {
  const lang = (isFr ? "fr" : "en") as "fr" | "en";
  return (
    <article className="fx-correction" id={entry.id}>
      <header className="fx-correction-head">
        <time dateTime={entry.date} className="fx-correction-date">
          {formatDate(entry.date, isFr)}
        </time>
        <span className={`fx-correction-cat fx-correction-cat--${entry.category}`}>
          {CATEGORY_LABELS[entry.category][lang]}
        </span>
        <span className="fx-correction-scope">{entry.scope}</span>
      </header>
      <h3>{entry.title[lang]}</h3>
      <p>{entry.summary[lang]}</p>
      {entry.trigger ? (
        <p className="fx-correction-trigger">
          <strong>{isFr ? "Origine du signalement :" : "Source of the report:"}</strong>{" "}
          {entry.trigger[lang]}
        </p>
      ) : null}
      {entry.before && entry.after ? (
        <div className="fx-correction-diff">
          <div>
            <div className="fx-correction-diff-label">{isFr ? "Avant" : "Before"}</div>
            <p>{entry.before[lang]}</p>
          </div>
          <div>
            <div className="fx-correction-diff-label">{isFr ? "Après" : "After"}</div>
            <p>{entry.after[lang]}</p>
          </div>
        </div>
      ) : null}
      {entry.links?.length ? (
        <ul className="fx-correction-links">
          {entry.links.map((l) => (
            <li key={l.url}>
              <a href={l.url}>{l.label} ↗</a>
            </li>
          ))}
        </ul>
      ) : null}
    </article>
  );
}

export default async function CorrectionsClient({ doc }: { doc: CorrectionsDoc }) {
  const locale = await readLocale();
  const isFr = locale !== "en";
  const lang = (isFr ? "fr" : "en") as "fr" | "en";

  return (
    <div className="theme-fusion">
      <LocaleRefresh />
      <Navbar />
      <main id="main-content" tabIndex={-1}>
        <section className="fx-page-header">
          <div className="fx-wrap">
            <div className="fx-page-kicker">{isFr ? "— Corrections" : "— Corrections"}</div>
            <h1 className="fx-page-title">
              {isFr ? (
                <>
                  Tout ce qu'on a <em>corrigé</em> publiquement.
                </>
              ) : (
                <>
                  Everything we've <em>corrected</em> in public.
                </>
              )}
            </h1>
            <p className="fx-page-lede">{doc.policy[lang]}</p>
          </div>
        </section>

        <section className="fx-section" id="historique">
          <div className="fx-wrap">
            <SectionHead
              number="01"
              kind={isFr ? "Historique" : "History"}
              title={
                isFr ? (
                  <>
                    Par ordre <em>antéchronologique</em>
                  </>
                ) : (
                  <>
                    Reverse <em>chronological</em>
                  </>
                )
              }
              subtitle={
                isFr
                  ? `${doc.entries.length} correction${doc.entries.length > 1 ? "s" : ""} enregistrée${doc.entries.length > 1 ? "s" : ""} depuis le lancement.`
                  : `${doc.entries.length} correction${doc.entries.length > 1 ? "s" : ""} recorded since launch.`
              }
            />
            {doc.entries.length === 0 ? (
              <p className="fx-note">
                {isFr
                  ? "Aucune correction publique enregistrée à ce jour. Cette page sera mise à jour à chaque signalement traité."
                  : "No public corrections recorded yet. This page will be updated each time a report is processed."}
              </p>
            ) : (
              <div className="fx-corrections-list">
                {doc.entries.map((e) => (
                  <CorrectionCard key={e.id} entry={e} isFr={isFr} />
                ))}
              </div>
            )}
          </div>
        </section>

        <section className="fx-section" id="signaler">
          <div className="fx-wrap">
            <SectionHead
              number="02"
              kind={isFr ? "Signaler" : "Report"}
              title={
                isFr ? (
                  <>
                    Vous voyez une <em>erreur</em> ?
                  </>
                ) : (
                  <>
                    Spotted an <em>error</em>?
                  </>
                )
              }
            />
            <p>
              {isFr
                ? "Tout signalement nous aide. Indiquez la page concernée, le chiffre ou l'affirmation contestée, et la source officielle si vous l'avez. On répond dès que possible."
                : "Every report helps. Tell us which page, which figure or claim, and the official source if you have it. We respond as soon as we can."}
            </p>
            <div style={{ marginTop: 24, display: "flex", gap: 10, flexWrap: "wrap" }}>
              <Button
                variant="primary"
                href="https://github.com/AbstractsMachine/france-open-data-pipeline/issues/new?labels=correction&template=signaler-une-erreur.md"
                target="_blank"
                rel="noopener noreferrer"
              >
                {isFr ? "Ouvrir une issue GitHub" : "Open a GitHub issue"}
              </Button>
              <Button href="/contact">
                {isFr ? "Ou nous écrire" : "Or email us"}
              </Button>
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </div>
  );
}
