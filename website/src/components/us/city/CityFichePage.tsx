import Link from "next/link";
import type { CityPage } from "@/lib/us/sf-city-pages";

/**
 * ONE PAGE FOR A NEIGHBOURHOOD OR A STREET, AS A DOCUMENT.
 *
 * The same skeleton the map's fiche uses — one counted sentence, the way
 * down, the subjects, the decades with their most notable line, the notable
 * decisions — laid out as a page a search engine can read and a reader can
 * send. Every line links to the scanned page it comes from, and the map is
 * one press away with the same fiche open.
 */
export default function CityFichePage({ page }: { page: CityPage }) {
  const p = page;
  const max = p.decades.reduce((m, d) => Math.max(m, d.n), 0);
  return (
    <div className="fx-fiche-wrap fx-cityp">
      {p.mapHref ? (
        <p className="fx-cityp-map">
          <Link className="fx-block-jump" href={p.mapHref}>
            Open {p.name} on the map, {p.kind === "neighbourhood" ? "with its record" : "street by street"} →
          </Link>
        </p>
      ) : null}

      {p.streets.length > 0 ? (
        <section className="fx-cityp-sec">
          <h2 className="fx-city-ledger-head">Its busiest streets</h2>
          <p className="fx-cityp-streets">
            {p.streets.map((s, i) => (
              <span key={s.slug}>
                {i > 0 ? <span className="fx-block-streets-sep"> · </span> : null}
                <Link href={`/us/city/sf/the-city/street/${s.slug}`}>
                  {s.label}
                  <span className="fx-block-street-n">{s.count}</span>
                </Link>
              </span>
            ))}
          </p>
        </section>
      ) : null}

      {p.subjects.length > 0 ? (
        <section className="fx-cityp-sec">
          <h2 className="fx-city-ledger-head">What keeps coming up</h2>
          <ul className="fx-cityp-subjects">
            {p.subjects.map((s) => (
              <li key={s.l}>
                <span className="fx-cityp-subject-l">{s.l}</span>
                <span className="fx-cityp-subject-n">{s.n.toLocaleString("en-US")}</span>
                <span className="fx-cityp-subject-note">{s.note}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="fx-cityp-sec">
        <h2 className="fx-city-ledger-head">Decade by decade</h2>
        <p className="fx-block-hint">
          Newest first. Each decade shows its most notable decision; the line opens the scanned page.
        </p>
        <ol className="fx-cityp-decades">
          {p.decades.map((d) => (
            <li key={d.decade} className="fx-cityp-dec">
              <div className="fx-cityp-dec-head">
                <span className="fx-cityp-dec-l">{d.decade}s</span>
                <span className="fx-cityp-dec-track">
                  <span
                    className="fx-cityp-dec-bar"
                    style={{ width: `${Math.max(3, Math.round((d.n / Math.max(max, 1)) * 100))}%` }}
                  />
                </span>
                <span className="fx-cityp-dec-n">{d.n.toLocaleString("en-US")}</span>
              </div>
              {d.face ? (
                <a className="fx-cityp-face" href={d.face.href} target="_blank" rel="noopener noreferrer">
                  {d.face.line}
                  <span className="fx-cityp-face-y"> · {d.face.y}</span>
                </a>
              ) : null}
            </li>
          ))}
        </ol>
      </section>

      {p.notable.length > 0 ? (
        <section className="fx-cityp-sec">
          <h2 className="fx-city-ledger-head">The most notable decisions</h2>
          <ul className="fx-shelf">
            {p.notable.map((r) => (
              <li key={r.href + r.when} className="fx-shelf-row">
                <p className="fx-shelf-says">{r.line}</p>
                <a href={r.href} target="_blank" rel="noopener noreferrer" className="fx-shelf-title">
                  {r.kind}
                  {r.status ? ` · ${r.status}` : ""} · {r.when} ↗
                </a>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="fx-cityp-sec">
        <h2 className="fx-city-ledger-head">Where this comes from</h2>
        <p className="fx-block-hint">
          {p.holds} Every line is written from one item in the minutes of the San Francisco Board of
          Supervisors, the city council, and links to the page it was printed on at the Internet Archive or
          in the Clerk&apos;s own files. Many of the Board&apos;s decisions name no street at all, and only the
          ones that do can be placed here.{" "}
          <Link href="/us/city/sf/records">How the record was read</Link>
          {" · "}
          <Link href="/us/city/sf/the-city">The whole city</Link>
        </p>
      </section>
    </div>
  );
}
