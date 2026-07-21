import type { FicheDoc } from "./types";

/** «…» guillemet spans in a snippet mark the matched terms — highlight them. */
function highlight(snippet: string) {
  return snippet.split(/(«[^»]*»)/g).map((p, i) =>
    p.startsWith("«") && p.endsWith("»") ? (
      <mark key={i} className="fx-doc-hit">{p.slice(1, -1)}</mark>
    ) : (
      <span key={i}>{p}</span>
    ),
  );
}

function Row({ doc }: { doc: FicheDoc }) {
  return (
    <li className="fx-doc-row">
      <a href={doc.href} target="_blank" rel="noopener noreferrer" className="fx-doc-title">
        {doc.title}
        {doc.year ? <span className="fx-doc-year"> · {doc.year}</span> : null} ↗
      </a>
      {doc.snippet ? <p className="fx-doc-snippet">“{highlight(doc.snippet)}”</p> : null}
      <div className="fx-doc-source">{doc.sourceLabel}</div>
    </li>
  );
}

/** Archive paper-trail list — where an entity appears in the digitized record. */
export default function FicheDocList({ docs }: { docs: FicheDoc[] }) {
  return (
    <ul className="fx-doc-list">
      {docs.map((d) => (
        <Row key={d.id} doc={d} />
      ))}
    </ul>
  );
}
