import Link from "next/link";
import type { SfPlaceFicheData, SfPlaceDoc } from "@/lib/us/sf-places-data";
import { deptSlug } from "@/lib/us/sf-budget-slugs";
import { fmtUsd, fmtUsdCompact } from "@/lib/us/format";

/**
 * SF place fiche — the SF analogue of the Paris LieuFiche, EN-only. Structure
 * mirrors the lieu: photo hero → source-grounded summary → the money (owning
 * department budget line, contracts at the place) → the archive document
 * shelf with highlighted-hit deep links → cross-links to money entities. Every
 * document carries its own source label so SFPL partnership scans are never
 * mislabelled as Democracy's Library.
 */

function highlightSnippet(snippet: string) {
  // The scraper marks matched terms with «…»; render them emphasised.
  const parts = snippet.split(/(«[^»]*»)/g);
  return parts.map((p, i) =>
    p.startsWith("«") && p.endsWith("»") ? (
      <mark key={i} className="fx-doc-hit">{p.slice(1, -1)}</mark>
    ) : (
      <span key={i}>{p}</span>
    ),
  );
}

function DocRow({ doc }: { doc: SfPlaceDoc }) {
  return (
    <li className="fx-doc-row">
      <a href={doc.deep_link} target="_blank" rel="noopener noreferrer" className="fx-doc-title">
        {doc.title}
        {doc.year ? <span className="fx-doc-year"> · {doc.year}</span> : null} ↗
      </a>
      {doc.creator ? <div className="fx-doc-creator">{doc.creator}</div> : null}
      {doc.snippet ? <p className="fx-doc-snippet">“{highlightSnippet(doc.snippet)}”</p> : null}
      <div className="fx-doc-source">{doc.source_label}</div>
    </li>
  );
}

export default function SfPlaceFiche({ place }: { place: SfPlaceFicheData }) {
  const bl = place.money.budget_line;
  const contracts = place.money.contracts;

  return (
    <div className="fx-fiche fx-place-fiche">
      {/* ── Photo hero ── */}
      {place.photo && (
        <figure className="fx-place-hero">
          <img src={place.photo} alt={place.name} loading="eager" />
          {place.photo_credit && (
            <figcaption className="fx-place-credit">
              {place.photo_credit.source}
              {" · "}
              <a href={place.photo_credit.file_url} target="_blank" rel="noopener noreferrer">
                {place.photo_credit.author}
              </a>
              {" · "}
              {place.photo_credit.license_url ? (
                <a href={place.photo_credit.license_url} target="_blank" rel="noopener noreferrer">
                  {place.photo_credit.license}
                </a>
              ) : (
                place.photo_credit.license
              )}
            </figcaption>
          )}
        </figure>
      )}

      {/* ── Grounded summary ── */}
      {place.summary_en && <p className="fx-place-summary">{place.summary_en}</p>}

      {/* ── The money ── */}
      <section className="fx-place-block">
        <h2 className="fx-place-h2">The money</h2>
        {bl && (
          <p className="fx-place-money-line">
            Operated by the{" "}
            <Link href={`/us/city/sf/budget/dept/${deptSlug(bl.code)}?year=${bl.fiscal_year}`}>
              {bl.name}
            </Link>
            , whose FY{bl.fiscal_year} budget is <b>{fmtUsdCompact(bl.total_usd)}</b>.
          </p>
        )}
        {contracts.length > 0 ? (
          <ul className="fx-place-contracts">
            {contracts.slice(0, 8).map((c) => (
              <li key={c.contract_no}>
                <Link href={`/us/city/sf/contracts/contract/${c.contract_no}`} className="fx-row-link">
                  {c.title}
                </Link>
                <span className="fx-place-contract-meta">
                  {c.prime ? ` · ${c.prime}` : ""}
                  {c.paid_usd != null ? ` · ${fmtUsd(c.paid_usd)} paid` : ""}
                </span>
                <span className="fx-doc-source">Names the place: “{c.evidence}”</span>
              </li>
            ))}
          </ul>
        ) : (
          !bl && <p className="fx-empty">No money link identified yet.</p>
        )}
      </section>

      {/* ── Archive document shelf ── */}
      {place.documents.length > 0 && (
        <section className="fx-place-block">
          <h2 className="fx-place-h2">In the archive</h2>
          <p className="fx-place-sub">
            {place.documents.length} document{place.documents.length === 1 ? "" : "s"} from the
            Internet Archive name this place — every link opens the scanned page with the match
            highlighted.
          </p>
          <ul className="fx-doc-list">
            {place.documents.map((d) => (
              <DocRow key={d.identifier} doc={d} />
            ))}
          </ul>
        </section>
      )}

      {/* ── Owning department's report shelf ── */}
      {place.dept_shelf.length > 0 && (
        <section className="fx-place-block">
          <h2 className="fx-place-h2">From the {place.owning_dept.name}</h2>
          <ul className="fx-doc-list fx-doc-list-compact">
            {place.dept_shelf.map((d) => (
              <li key={d.identifier} className="fx-doc-row">
                <a href={d.url} target="_blank" rel="noopener noreferrer" className="fx-doc-title">
                  {d.title}
                  {d.year ? <span className="fx-doc-year"> · {d.year}</span> : null} ↗
                </a>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* ── Sources ── */}
      <footer className="fx-place-sources">
        {place.sources.map((s, i) => (
          <p key={i} className="fx-footer-sources-meta">
            <b>{s.label}</b>: {s.note}
          </p>
        ))}
      </footer>
    </div>
  );
}
