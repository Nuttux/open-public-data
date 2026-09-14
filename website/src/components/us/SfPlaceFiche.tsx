import Link from "@/components/LocalizedLink";
import type { ReactNode } from "react";
import type { SfPlaceFicheData, SfPlaceDoc } from "@/lib/us/sf-places-data";
import { loadSfPlacesIndex, sfPlaceHeadline } from "@/lib/us/sf-places-data";
import { deptSlug } from "@/lib/us/sf-budget-slugs";
import { fmtUsd, fmtUsdCompact } from "@/lib/us/format";
import { FicheArchiveShelf, FicheMore, type FicheArchiveDoc } from "@/components/fiche";
import Tip from "@/components/fusion/Tip";
import { payeeSlugIfKeyed } from "@/lib/us/sf-payees-data";

/**
 * A contractor row links to its payee fiche ONLY when that fiche exists — only
 * the top ~200 payees by lifetime dollars are keyed, so roughly five in six
 * vendor rows stay plain text. Never emit a link we cannot honour
 * ("pas de suggestions mortes").
 */
function payeeHref(vendor: string): string | null {
  const slug = vendor
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return payeeSlugIfKeyed(slug) ? `/usa/san-francisco/who-gets-paid/payee/${slug}` : null;
}

/**
 * SF place fiche — the SF analogue of the Paris LieuFiche, EN-only. Section
 * order mirrors the lieu exactly: photo hero → grounded summary → the money
 * → document shelf → cross-links. Every archive document carries its own
 * source label so SFPL partnership scans are never mislabelled as
 * Democracy's Library, and the shelf is grouped + salience-capped by
 * export_sf_places.py's curate_documents() rather than dumped in linkage
 * order. See DEFLUFF_AUDIT.md for the before/after review this came from.
 */

// A place that barely cleared the publication gate (GATE_MIN_DOCS = 3 in
// export_sf_places.py) gets an honest "limited archive coverage" flag on its
// summary instead of a shorter narrative dressed up to look complete.
const THIN_DOCS_THRESHOLD = 4;

/** Archive rows visible before the single expander. */
const SHELF_CAP = 4;
/** Rows visible before the fold in each money list (bond items, vendors). */
const MONEY_FOLD = 4;

function Amt({ usd, full = false, size = 13 }: { usd: number; full?: boolean; size?: number }) {
  return (
    <span
      className="tnum"
      style={{ fontFamily: "var(--f-disp)", fontWeight: 700, letterSpacing: "-0.01em", whiteSpace: "nowrap", fontSize: size }}
    >
      {full ? fmtUsd(usd) : fmtUsdCompact(usd)}
    </span>
  );
}

/** SF document shape → the neutral archive-shelf row. The mapping is where the
 *  contract is enforced: `creator` and the narrative `group` simply have no
 *  destination, so they cannot come back as a fourth line or a section header. */
const toShelfDoc = (d: SfPlaceDoc): FicheArchiveDoc => ({
  id: d.identifier,
  gloss: d.gloss,
  title: d.title,
  year: d.year,
  href: d.deep_link,
  sourceLabel: d.source_label,
  variantNote: d.variant_note,
});

function FacilityRecord({ place }: { place: SfPlaceFicheData }) {
  const f = place.facility;
  if (!f || !f.primary_address) return null;
  const owned = f.primary_is_city_owned;
  const sqft = f.total_gross_sq_ft ?? f.primary_gross_sq_ft;
  const facts: { label: string; value: ReactNode }[] = [
    { label: "Address", value: titleCase(f.primary_address) },
  ];
  // Three place-specific facts, max — address, tenure, size. District/parcel/
  // dept are footnote-grade, not tiles (the review: "trim to the 3 that matter").
  if (owned !== null) facts.push({ label: "Tenure", value: owned ? "City-owned" : "Leased" });
  if (sqft) facts.push({ label: f.n_facilities > 1 ? "Floor area · all buildings" : "Floor area", value: `${sqft.toLocaleString("en-US")} sq ft` });
  else if (f.n_facilities > 1) facts.push({ label: "On site", value: `${f.n_facilities} buildings` });
  // Address, tenure and size are facts a reader glances at once; three labelled
  // tiles plus a registry footnote spent 144px saying so. One dotted line says
  // the same thing in ~24px, and the money keeps the space.
  return (
    <p className="fx-place-identity">
      {facts.map((x, i) => (
        <span key={i}>
          {i > 0 ? " · " : ""}
          {x.value}
        </span>
      ))}
      {/* `facts` already carries the building count when there is no floor
       *  area, so only add it when floor area took that slot. */}
      {f.n_facilities > 1 && sqft ? <> · {f.n_facilities} buildings on site</> : null}
      {f.primary_block_lot ? <> · parcel {f.primary_block_lot}</> : null}
      {f.supervisor_district != null ? <> · District {f.supervisor_district}</> : null}
      <span className="fx-place-identity-src"> · City Facilities registry</span>
    </p>
  );
}

function titleCase(s: string) {
  return s.replace(/\w\S*/g, (t) => t.charAt(0) + t.slice(1).toLowerCase());
}


/**
 * The money — built on the Paris LieuFiche grammar, because the flat version of
 * this section read as a dump: four unlabelled lists, no totals, nothing
 * clickable, and no sentence anywhere saying what a "declared value" was.
 *
 * The grammar, from fusion/LieuFiche.tsx:
 *   - one LEAD sentence for the section, saying how to read it;
 *   - each block is a named heading with ITS OWN total on the right, because a
 *     block of rows with no total is a list, not an answer;
 *   - every row is a link when a target exists, plain text when it does not
 *     (never a dead link — the vendor list is only ~17% keyed);
 *   - one short note per block saying what its number actually measures;
 *   - the department budget stays a grey context line, never a headline.
 *
 * The two ledgers are never summed: a bond pays the contracts that do the work,
 * so the same dollar can appear in both.
 */
function MoneyBlock({
  title,
  tip,
  total,
  note,
  children,
}: {
  title: string;
  tip?: string;
  total?: ReactNode;
  note?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="fx-place-block">
      <div className="fx-place-block-h">
        <span>{tip ? <Tip label={tip}>{title}</Tip> : title}</span>
        {total ? <span className="fx-place-block-total">{total}</span> : null}
      </div>
      {children}
      {note ? <p className="fx-fiche-note">{note}</p> : null}
    </div>
  );
}

/** One row of a money list: label (+ sub-label), amount right. Wrapped in a
 *  Link when `href` resolves, so a row is only ever clickable if it truly
 *  leads somewhere. */
function MoneyRow({
  label,
  sub,
  amount,
  href,
}: {
  label: ReactNode;
  sub?: ReactNode;
  amount?: ReactNode;
  href?: string | null;
}) {
  const body = (
    <>
      <span className="fx-place-row-label">
        {label}
        {href ? <span aria-hidden="true" className="fx-place-row-arrow"> →</span> : null}
        {sub ? <span className="fx-place-row-sub">{sub}</span> : null}
      </span>
      {amount ? <span className="fx-place-row-amt">{amount}</span> : null}
    </>
  );
  return href ? (
    <Link href={href} scroll={false} className="fx-place-row fx-row-link">
      {body}
    </Link>
  ) : (
    <div className="fx-place-row">{body}</div>
  );
}

function MoneySection({ place }: { place: SfPlaceFicheData }) {
  const cap = place.capital;
  const bl = place.money.budget_line;
  const pl = place.money.payroll_line;
  const contracts = [...place.money.contracts].sort(
    (a, b) => (b.paid_usd ?? b.agreed_usd ?? 0) - (a.paid_usd ?? a.agreed_usd ?? 0),
  );
  // Bond rows WITHOUT dollars are withheld (2026-07-28). 90 of the 95 crosswalk
  // rows are `bond_project` — named work whose dollars the City reports at
  // programme level, never per place. Rendered as rows they became a money
  // heading with an empty total over a list of raw source strings ("RP Water
  // Cnsrvtn Ggp Panhandle"), on 24 of the 27 fiches that carried the block.
  // They return with the citywide bond page, which gives them the programme
  // total to hang on — as context, not as a per-place figure.
  const allBondItems = cap?.items ?? [];
  const bondItems = allBondItems.filter((i) => (i.amount_usd ?? 0) > 0);
  const bondNamedOnly = bondItems.length === 0 && allBondItems.length > 0;
  const vendors = cap?.payees ?? [];
  const hasAny = bondItems.length > 0 || vendors.length > 0 || contracts.length > 0;
  if (!hasAny && !bl) return null;

  const bondTotal = cap?.measure_totals.bond_expended;
  // Programmes named from the SHOWN rows only. Taking cap.bond_programs listed
  // the same 2024 bond twice on ZSFG, because the spending and projects
  // datasets spell it differently ("Healthy, Safe and Vibrant San Francisco"
  // vs "Healthy, Safe, Vibrant SF").
  const bondPrograms = [...new Set(bondItems.map((i) => i.bond_program).filter(Boolean) as string[])];

  // How many ledgers actually have something to show — the lead sentence must
  const ledgers = [
    bondItems.length > 0 && "voter bonds",
    (vendors.length > 0 || contracts.length > 0) && "city contracts",
  ].filter(Boolean) as string[];
  // Building permits were removed from the app entirely (2026-07-28). A permit
  // records what an applicant DECLARED work would cost — frequently a private
  // owner's work on a parcel the City merely shares, and often work that was
  // withdrawn and never done. It is not public spending and does not belong on
  // a fiche about public money. The mart still exists for lineage; nothing
  // ships it.
  const hasPublicMoney = bondItems.length > 0 || vendors.length > 0 || contracts.length > 0;

  return (
    <section className="fx-fiche-section">
      <div className="fx-fiche-h fx-fiche-h--money">What public money did here</div>
      {ledgers.length > 1 && (
        <p className="fx-place-lead">
          Two separate city ledgers name this place — {ledgers[0]} and {ledgers[1]}. Each is
          counted on its own below and they are <b>never added together</b>: the same job can appear
          in both, because a bond pays the contract that does the work.
        </p>
      )}


      {vendors.length > 0 && (
        <MoneyBlock
          title="Paid to contractors for work here"
          tip="Money the City actually paid out, from its own payment records (vouchers), on contracts whose text names this place."
          total={cap!.payees_total_paid ? <Amt usd={cap!.payees_total_paid} size={14} /> : undefined}
          note={
            <>
              What the City actually paid, across {cap!.n_payees} contractor{cap!.n_payees === 1 ? "" : "s"}
              {cap!.n_payees > vendors.length ? <> (the {cap!.n_payees - vendors.length} smallest are in the total but not listed)</> : null}.
              Contractors big enough to have their own page are linked; the rest are named only.
            </>
          }
        >
          {vendors.slice(0, MONEY_FOLD).map((py, k) => (
            <MoneyRow
              key={k}
              label={titleCaseItem(py.vendor)}
              href={payeeHref(py.vendor)}
              sub={py.first_fiscal_year ? `FY${py.first_fiscal_year}${py.last_fiscal_year && py.last_fiscal_year !== py.first_fiscal_year ? `–${py.last_fiscal_year}` : ""}${py.n_contracts > 1 ? ` · ${py.n_contracts} contracts` : ""}` : undefined}
              amount={<Amt usd={py.paid_usd} />}
            />
          ))}
          <FicheMore count={vendors.length - MONEY_FOLD} noun="more contractors">
            {vendors.slice(MONEY_FOLD).map((py, k) => (
              <MoneyRow
                key={k}
                label={titleCaseItem(py.vendor)}
                href={payeeHref(py.vendor)}
                sub={py.first_fiscal_year ? `FY${py.first_fiscal_year}` : undefined}
                amount={<Amt usd={py.paid_usd} />}
              />
            ))}
          </FicheMore>
        </MoneyBlock>
      )}

      {contracts.length > 0 && (
        <MoneyBlock
          title="The contracts that name this place"
          tip="Contracts in the City's supplier register whose title or description names this place. Agreed is the ceiling written into the contract; paid is what has been drawn against it so far."
          total={<span className="fx-place-block-count">{contracts.length}</span>}
          note={<>Every line opens that contract&rsquo;s own page, with its spend curve and its subcontractors. Agreed amounts are ceilings, not spending.</>}
        >
          {contracts.slice(0, MONEY_FOLD).map((c) => (
            <MoneyRow
              key={c.contract_no}
              label={c.title || c.contract_no}
              href={`/usa/san-francisco/contracts/contract/${c.contract_no}`}
              sub={[c.prime, c.department_code].filter(Boolean).join(" · ")}
              amount={c.paid_usd ? <Amt usd={c.paid_usd} /> : c.agreed_usd ? <span className="fx-place-row-agreed"><Amt usd={c.agreed_usd} /> agreed</span> : undefined}
            />
          ))}
          <FicheMore count={contracts.length - MONEY_FOLD} noun="more contracts">
            {contracts.slice(MONEY_FOLD).map((c) => (
              <MoneyRow
                key={c.contract_no}
                label={c.title || c.contract_no}
                href={`/usa/san-francisco/contracts/contract/${c.contract_no}`}
                sub={[c.prime, c.department_code].filter(Boolean).join(" · ")}
                amount={c.paid_usd ? <Amt usd={c.paid_usd} /> : undefined}
              />
            ))}
          </FicheMore>
        </MoneyBlock>
      )}


      {bondItems.length > 0 && (
        <MoneyBlock
          title="Voter-approved bond money"
          tip="General obligation bonds: borrowing that San Francisco voters approved at the ballot box for a named capital programme. The City repays them from property tax."
          total={bondTotal ? <Amt usd={bondTotal} size={14} /> : undefined}
          note={<>Spent on work named for this place under the {bondPrograms.join("; ")} bond{bondPrograms.length > 1 ? "s" : ""}. A floor, not a ceiling: bond reporting is by programme, so work here that was not separately itemised is not in this figure.</>}
        >
          {bondItems.slice(0, MONEY_FOLD).map((i, k) => (
            <MoneyRow
              key={k}
              label={titleCaseItem(i.item_name)}
              sub={[i.bond_program ? `${i.bond_program} bond` : null, i.voter_approved_date ? `approved ${i.voter_approved_date.slice(0, 4)}` : null].filter(Boolean).join(" · ")}
              amount={<Amt usd={i.amount_usd!} />}
            />
          ))}
          <FicheMore count={bondItems.length - MONEY_FOLD} noun="more funded items">
            {bondItems.slice(MONEY_FOLD).map((i, k) => (
              <MoneyRow
                key={k}
                label={titleCaseItem(i.item_name)}
                sub={i.bond_program ? `${i.bond_program} bond` : undefined}
                amount={<Amt usd={i.amount_usd!} />}
              />
            ))}
          </FicheMore>
        </MoneyBlock>
      )}
      {!hasPublicMoney && (
        <p className="fx-place-lead">
          No city spending is recorded against this place by name.{" "}
          {bondNamedOnly ? (
            <>
              Voter-approved bond work is named here, but San Francisco reports those dollars by
              bond programme, never per site, so there is no amount to attribute to this place.
            </>
          ) : (
            <>
              San Francisco publishes contracts, bond items and vendor payments at project level,
              and none of them names this site — so there is no figure to show, rather than a
              figure of zero.
            </>
          )}
        </p>
      )}
      {bl && (
        <p className="fx-fiche-note fx-place-dept-line">
          Run by the{" "}
          <Link href={`/usa/san-francisco/budget/dept/${deptSlug(bl.code)}?year=${bl.fiscal_year}`} scroll={false}>{bl.name}</Link>
          , whose whole-department budget is <Amt usd={bl.total_usd} />
          {pl ? <> across {pl.n_employees.toLocaleString("en-US")} staff</> : null} (FY{bl.fiscal_year}) —
          citywide, not this place&rsquo;s own. The City does not publish a running cost per building.
        </p>
      )}
    </section>
  );
}

function titleCaseItem(s: string) {
  // Keep known acronyms upper; title-case the rest for readability.
  // Strip punctuation before the acronym test — "ZSFG," was failing the anchored
  // match and rendering as "Zsfg," on the largest bond row on the site.
  return s.replace(/\w\S*/g, (t) =>
    /^(ZSFG|LHH|SFGH|RP|COF|PES|EEI|NPC|IT|RR)$/i.test(t.replace(/\W/g, ""))
      ? t.toUpperCase()
      : t.charAt(0) + t.slice(1).toLowerCase(),
  );
}


export default function SfPlaceFiche({ place }: { place: SfPlaceFicheData }) {
  const bl = place.money.budget_line;
  const contracts = place.money.contracts;

  // The shelf carries substantive documents only. Procedural ones (minutes,
  // agendas, calendars, notices — classified by type upstream) are counted, not
  // listed: they are the bulk of the archive and the least of what it says.
  // Older fiches predate the `procedural` flag; absent it, nothing is withheld.
  const proceduralDocs = place.documents.filter((d) => d.procedural);
  const substantiveDocs = place.documents.filter((d) => !d.procedural);
  // A handful of places (Conservatory of Flowers) have an archive record that
  // IS commission minutes and nothing else — and their grounded summary says
  // so, in as many words. Hiding every row there would leave a section that
  // contradicts the paragraph above it. Demote, but do not erase the only
  // record that exists: list them, and say plainly what they are.
  const proceduralOnly = substantiveDocs.length === 0 && proceduralDocs.length > 0;
  const shelfDocs = (proceduralOnly ? proceduralDocs : substantiveDocs).map(toShelfDoc);
  const thin = place.documents.length <= THIN_DOCS_THRESHOLD;

  // Headline: ONE place-specific money figure (the largest across ledgers,
  // labelled by its own measure) — replaces the old dept-budget KPI that read
  // identically on every same-department fiche. Falls back to nothing when the
  // place has no place-level money (its story is then the archive + facility).
  // The page <title> reads the same figure (sfPlaceHeadline).
  const headline = sfPlaceHeadline(place.capital);

  const familyAll = loadSfPlacesIndex().filter((p) => p.slug !== place.slug);
  let related = familyAll.filter((p) => p.family === place.family);
  let relatedTitle = "Same kind";
  if (related.length < 2) {
    related = familyAll.filter((p) => p.owning_dept_code === place.owning_dept.code);
    relatedTitle = `Also from the ${place.owning_dept.name}`;
  }
  related = related.slice(0, 4);

  return (
    <div className="fx-place-fiche">
      {/* ── Photo hero ── */}
      {place.photo && (
        <div className="fx-fiche-thumb-wrap" style={{ position: "relative", marginBottom: 22 }}>
          <img
            src={place.photo}
            alt={place.name}
            className="fx-fiche-thumb"
            style={{ aspectRatio: "16 / 9", width: "100%", objectFit: "cover", display: "block" }}
          />
          {place.photo_credit && (
            <span
              style={{
                position: "absolute", right: 8, bottom: 8, background: "rgba(10,10,10,.72)",
                color: "#fff", fontFamily: "var(--f-mono)", fontSize: 9, padding: "3px 7px",
              }}
            >
              {place.photo_credit.source}
              {" · "}
              <a href={place.photo_credit.file_url} target="_blank" rel="noopener noreferrer" style={{ color: "#fff" }}>
                {place.photo_credit.author}
              </a>
              {" · "}
              {place.photo_credit.license_url ? (
                <a href={place.photo_credit.license_url} target="_blank" rel="noopener noreferrer" style={{ color: "#fff" }}>
                  {place.photo_credit.license}
                </a>
              ) : (
                place.photo_credit.license
              )}
            </span>
          )}
        </div>
      )}

      {/* ── Grounded summary ── */}
      {place.summary_en && (
        <div className="fx-fiche-grounded" {...(thin ? { "data-low": "" } : {})}>
          <div className="fx-fiche-grounded-head">Grounded summary</div>
          <p className="fx-fiche-grounded-body">{place.summary_en}</p>
          <div className="fx-fiche-grounded-meta">
            <span>
              <b>Built from:</b> {place.documents.length} archive document{place.documents.length === 1 ? "" : "s"}
              {contracts.length > 0 ? `, ${contracts.length} contract${contracts.length === 1 ? "" : "s"}` : ""}
              {bl ? ", city budget data" : ""} — no outside knowledge added.
            </span>
          </div>
          {thin && (
            <p className="fx-fiche-note" style={{ marginTop: 8 }}>
              Archive coverage for this place is limited — only {place.documents.length} matched documents so far,
              so this summary stays short rather than padded.
            </p>
          )}
        </div>
      )}

      {/* ── Headline stat — one place-specific money figure ── */}
      {headline && (
        <div className="fx-place-headline">
          <div className="fx-place-headline-value tnum" title={fmtUsd(headline.value)}>
            {fmtUsdCompact(headline.value)}
          </div>
          <div className="fx-place-headline-label">{headline.label}</div>
        </div>
      )}

      {/* ── Facility record (6A structured identity) ── */}
      <FacilityRecord place={place} />

      {/* ── The money — bonds + contracts + payees. No permits: see MoneySection. ── */}
      <MoneySection place={place} />

      {/* ── Archive document shelf — the presentation contract ── */}
      {shelfDocs.length > 0 && (
        <section className="fx-fiche-section">
          <div className="fx-fiche-h fx-fiche-h--moments">In the archive</div>
          {proceduralOnly && (
            <p className="fx-fiche-note" style={{ marginTop: 0, marginBottom: 8 }}>
              Everything the archive holds on this place is commission paperwork — minutes and
              calendars. Listed anyway, because it is the whole record.
            </p>
          )}
          <FicheArchiveShelf
            docs={shelfDocs}
            cap={SHELF_CAP}
            withheld={proceduralOnly ? 0 : proceduralDocs.length}
          />
        </section>
      )}

      {/* A standalone Sources section was a third statement of the same
       *  provenance: every money figure already names its ledger, every shelf
       *  row names its collection, and the page footer carries the dataset
       *  links. Cut — the labels stay where the figures are. */}

      {/* ── Cross-links ── */}
      {related.length > 0 && (
        <section className="fx-fiche-section">
          <div className="fx-fiche-h">{relatedTitle}</div>
          <div className="fx-voisins">
            {related.map((p) => (
              <Link key={p.slug} href={`/usa/san-francisco/places/place/${p.slug}`} scroll={false} className="fx-voisin">
                {p.photo ? <img src={p.photo} alt="" loading="lazy" /> : <span className="fx-voisin-noimg" />}
                <span className="fx-voisin-name">{p.name}</span>
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
