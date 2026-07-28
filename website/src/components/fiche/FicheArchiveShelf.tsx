import type { FicheArchiveDoc } from "./types";

/**
 * THE ARCHIVE PRESENTATION CONTRACT — one shelf, every fiche type, no variants.
 *
 * A ranked list of documents that are worth a reader's time. Per document,
 * exactly three things:
 *
 *    1. one line saying what this document says   (the gloss)
 *    2. the document title, linked to the archive
 *    3. the source collection it is held in
 *
 * and nothing else. No pull-quotes, no raw OCR passages, no minutes presented
 * as evidence, no per-document creator line, no narrative group headers. The
 * previous SF shelf spent ~170px per document on four stacked lines and put
 * `Agenda` and `Minutes` at the top of 45 fiches; this one spends ~55px and
 * cannot show them at all, because procedural documents never reach it (they
 * are filtered upstream by document type — see export_sf_places.py DOC_TYPES).
 *
 * `cap` rows are visible; everything past it is behind ONE expander with an
 * honest count. Documents held back for being procedural are reported as a
 * count too — collapsed or counted, never silently dropped.
 */
export default function FicheArchiveShelf({
  docs,
  cap = 4,
  withheld = 0,
  withheldLabel = (n) =>
    `procedural record${n === 1 ? "" : "s"} — minutes, agendas, calendars — not listed`,
  moreLabel = (n) => `See ${n} more document${n === 1 ? "" : "s"}`,
}: {
  /** Already ranked by interest. This component does not re-rank. */
  docs: FicheArchiveDoc[];
  cap?: number;
  /** How many documents exist but are deliberately not listed. */
  withheld?: number;
  withheldLabel?: (n: number) => string;
  moreLabel?: (n: number) => string;
}) {
  if (docs.length === 0 && withheld === 0) return null;
  const head = docs.slice(0, cap);
  const tail = docs.slice(cap);

  return (
    <>
      <ul className="fx-shelf">
        {head.map((d) => (
          <ShelfRow key={d.id} doc={d} />
        ))}
      </ul>
      {tail.length > 0 && (
        <details className="fx-shelf-more">
          <summary>{moreLabel(tail.length)}</summary>
          <ul className="fx-shelf">
            {tail.map((d) => (
              <ShelfRow key={d.id} doc={d} />
            ))}
          </ul>
        </details>
      )}
      {withheld > 0 && (
        <p className="fx-fiche-note fx-shelf-withheld">
          {withheld} {withheldLabel(withheld)}.
        </p>
      )}
    </>
  );
}

function ShelfRow({ doc }: { doc: FicheArchiveDoc }) {
  return (
    <li className="fx-shelf-row">
      {doc.gloss ? <p className="fx-shelf-says">{doc.gloss}</p> : null}
      <a href={doc.href} target="_blank" rel="noopener noreferrer" className="fx-shelf-title">
        {doc.title}
        {doc.year ? <span className="fx-shelf-year"> · {doc.year}</span> : null} ↗
      </a>
      <div className="fx-shelf-source">
        {doc.sourceLabel}
        {doc.variantNote ? ` · ${doc.variantNote}` : ""}
      </div>
    </li>
  );
}
