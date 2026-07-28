import Link from "next/link";
import type { SfPayeeFicheData, SfSpendClass } from "@/lib/us/sf-payees-data";
import { fmtUsdCompact, fmtShare } from "@/lib/us/format";
import FicheKpis from "@/components/fusion/FicheKpis";
import {
  FicheShell,
  FicheStatHero,
  FicheSection,
  FicheYearBars,
  FicheBreakdown,
  FicheArchiveShelf,
  FicheMore,
  FicheSourceFooter,
  type FicheArchiveDoc,
  type FicheBreakdownRow,
  type FicheYearPoint,
} from "@/components/fiche";

/** Contracts visible before the fold. */
const CONTRACTS_FOLD = 6;
/** Archive rows visible before the expander — the same cap as every other fiche. */
const SHELF_CAP = 4;
/** Bars before the fold in the money breakdowns. */
const BREAKDOWN_FOLD = 5;
/** Below this, a searched (non-registry) identity is not shown at all —
 *  the same floor the Paris beneficiaire cascade applies. */
const IDENTITY_FLOOR = 0.6;

/**
 * SF payee fiche — who a payee is, what the City pays them for, and how much,
 * composed from the neutral fiche kit (components/fiche/*).
 *
 * The fiche used to be money and nothing else: a total, a bar per year, and a
 * "·"-joined list of department NAMES with no amounts. Paris fills the same
 * slot for free — a supplier is keyed by SIREN, so SIRENE returns its activity
 * label, legal form and head office (FournisseurFiche). SF vendors carry no
 * identifier at all, so two things had to be built instead:
 *
 *   - what the City pays them FOR, derived from the account coding on their
 *     own payment lines (mart_us_sf_payee_profile) — no enrichment, nothing
 *     invented, and it refreshes with the data;
 *   - who they ARE, from the IRS exempt-organization registry where one
 *     exists, or a grounded web search where none does (`identity`), always
 *     labelled with which of the two it is.
 *
 * See docs/adding-a-city.md.
 */

const KIND_LABEL: Record<string, string> = {
  supplier: "Supplier",
  nonprofit: "Nonprofit",
  healthcare: "Healthcare",
  fiscal_agent_debt_service: "Fiscal agent / debt service",
  payroll_passthrough: "Payroll pass-through",
  other: "Payee",
};

/** Only `purchase` is something the City bought; the rest is money out that
 *  a bar must not draw as a purchase. */
const isPurchase = (c: SfSpendClass) => c === "purchase";

/** Short enough to sit under every row without becoming the row. The full
 *  definition of each class belongs in one place (the source footer), not
 *  repeated four times down a column. */
const CLASS_NOTE: Record<Exclude<SfSpendClass, "purchase">, string> = {
  obligation: "not a purchase",
  ledger: "balance-sheet line",
  unclear: "unclassified",
};

export default function SfPayeeFiche({
  payee,
  categorySlugs = {},
  deptHrefs = {},
}: {
  payee: SfPayeeFicheData;
  /** sub-object code → category-fiche slug, resolved server-side. */
  categorySlugs?: Record<string, string>;
  /** department code → budget-fiche href, server-validated. */
  deptHrefs?: Record<string, string>;
}) {
  // A fiscal year that is still running (or only preliminarily closed) is
  // flagged provisional: FicheYearBars then hatches it and captions why, so
  // the short last bar reads as "year in progress", not "payments stopped".
  const status = payee.year_status ?? {};
  const years: FicheYearPoint[] = Object.entries(payee.by_year)
    .map(([y, v]) => ({
      year: Number(y),
      value: v,
      provisional: status[y] != null && status[y] !== "closed",
    }))
    .sort((a, b) => a.year - b.year);
  const openYears = years.filter((y) => y.provisional).map((y) => y.year);

  // Same archive contract as the place fiche: gloss → title → source, no
  // snippet. `snippet` is a raw OCR fragment and is deliberately not mapped —
  // raw archive text does not go in front of a reader on any fiche type.
  const docs: FicheArchiveDoc[] = (payee.paper_trail ?? [])
    .filter((d) => !d.procedural)
    .map((d) => ({
      id: d.identifier,
      gloss: d.gloss ?? null,
      title: d.title,
      year: d.year,
      href: d.deep_link,
      sourceLabel: d.source_label,
    }));
  const proceduralDocs = (payee.paper_trail ?? []).filter((d) => d.procedural);

  const profile = payee.profile ?? null;
  const identity =
    payee.identity && payee.identity.confidence >= IDENTITY_FLOOR ? payee.identity : null;

  // Departments as money, not as a name list. Every keyed department links to
  // its own budget fiche only where one exists — so no dead links are emitted
  // here; the department name is plain text (the who-gets-paid page owns the
  // dept → fiche resolution and is not available to this server component).
  const deptRows: FicheBreakdownRow[] = (profile?.departments ?? []).map((d) => ({
    key: d.department_code ?? d.department,
    label: d.department,
    meta: `${d.n_vouchers.toLocaleString("en-US")} vouchers`,
    value: d.usd,
    href: d.department_code ? deptHrefs[d.department_code] : undefined,
  }));

  const catRows: FicheBreakdownRow[] = (profile?.categories ?? []).map((c) => ({
    key: c.code,
    label: c.label,
    meta: isPurchase(c.spend_class) ? undefined : CLASS_NOTE[c.spend_class],
    value: c.usd,
    tone: isPurchase(c.spend_class) ? "solid" : "muted",
    href: categorySlugs[c.code]
      ? `/us/city/sf/who-gets-paid/category/${categorySlugs[c.code]}`
      : undefined,
  }));

  // Department leads, category is the second line. The other way round, a
  // payee funded by one programme across several departments rendered as the
  // same category label repeated four times ("Community Based Org Srvcs" ×4)
  // with only the small print distinguishing the rows.
  const recentRows: FicheBreakdownRow[] = (profile?.recent_lines ?? []).map((l, i) => ({
    key: `${l.department_code ?? l.department}-${l.label}-${i}`,
    label: l.department,
    meta: l.label,
    value: l.usd,
    tone: isPurchase(l.spend_class) ? "solid" : "muted",
    href: l.department_code ? deptHrefs[l.department_code] : undefined,
  }));

  // "at least N" when several spellings were merged: each variant reports its
  // own distinct count and the union is not recoverable from the top-8 lists.
  const countPrefix = profile?.counts_are_floor ? "at least " : "";

  const period =
    payee.first_year && payee.last_year && payee.first_year !== payee.last_year
      ? `${payee.first_year}–${payee.last_year}`
      : String(payee.last_year ?? "—");

  return (
    <FicheShell>
      {/* ── Tag chips ──────────────────────────────────────────────────────
          The opening move on every other entity fiche in the project (Recife
          RecebedorFiche, Paris AssociationFiche): what KIND of thing this is,
          before any number. */}
      <div className="fx-fiche-tags">
        {(() => {
          const kind = KIND_LABEL[payee.kind] ?? "Payee";
          // The IRS activity label often restates the bucket ("Healthcare" +
          // "Health care" on Kaiser). Compare ignoring case and spacing.
          const flat = (s: string) => s.toLowerCase().replace(/[^a-z]/g, "");
          const ntee = identity?.ntee_label;
          return (
            <>
              <span className="fx-sm-tag">{kind}</span>
              {payee.is_non_profit && <span className="fx-sm-tag">Nonprofit</span>}
              {ntee && flat(ntee) !== flat(kind) && <span className="fx-sm-tag">{ntee}</span>}
            </>
          );
        })()}
        {payee.n_contracts_held > 0 && (
          <span className="fx-sm-tag">
            {payee.n_contracts_held} active {payee.n_contracts_held === 1 ? "contract" : "contracts"}
          </span>
        )}
      </div>

      {/* ── Who they are ───────────────────────────────────────────────────
          The lead Paris gets from SIRENE. Rendered only when the cascade
          actually resolved something above the floor — never a placeholder,
          and always carrying which method produced it. */}
      {identity && (
        <div className="fx-fiche-lead">
          <p className="fx-fiche-lead-main">{identity.description}</p>
          <p className="fx-fiche-lead-meta">
            {[
              identity.legal_name && identity.legal_name !== payee.name ? identity.legal_name : null,
              identity.ntee_label,
              identity.city && identity.state ? `${identity.city}, ${identity.state}` : identity.city,
              identity.ein ? `EIN ${identity.ein}` : null,
            ]
              .filter(Boolean)
              .join(" · ")}
          </p>
          <p className="fx-fiche-lead-src">
            {identity.method === "irs_bmf" ? "Registry" : "Web search"}:{" "}
            {identity.source_url ? (
              <a href={identity.source_url} target="_blank" rel="noopener noreferrer">
                {identity.source_label}
              </a>
            ) : (
              identity.source_label
            )}
          </p>
        </div>
      )}

      <FicheStatHero
        value={fmtUsdCompact(payee.total_paid_usd)}
        caption={<>paid by San Francisco, {period}</>}
      />

      {/* ── KPI band ───────────────────────────────────────────────────────
          The four-column band every entity fiche carries under its lead
          (Paris AssociationFiche → FicheKpis → Recife RecebedorFiche). The
          hero states the money; these state the shape of it, and each one is
          a fact the sections below then break down. */}
      {profile && (
        <FicheKpis
          items={[
            {
              label: "Departments",
              value: `${countPrefix}${profile.n_departments}`,
            },
            {
              label: "Categories",
              value: `${countPrefix}${profile.n_categories}`,
            },
            { label: "Payments", value: profile.n_vouchers.toLocaleString("en-US") },
            { label: "Period", value: period },
          ]}
        />
      )}

      {/* ── What the City pays them for ────────────────────────────────────
          The section that answers the reader's actual question, from the
          City's own sub-object coding on this payee's payment lines. */}
      {catRows.length > 0 && profile && (
        <FicheSection
          title="What the City pays them for"
          sub={
            <>
              The City&rsquo;s own accounting categories, FY2018 on.
              {/* The legend earns its line only when a hatched bar is on
                  screen — for a payee the City only buys from, every bar is
                  solid and the sentence explained nothing. */}
              {catRows.slice(0, BREAKDOWN_FOLD).some((r) => r.tone === "muted")
                ? " Hatched bars are money out, but not a purchase."
                : ""}
            </>
          }
        >
          <FicheBreakdown
            rows={catRows}
            format={fmtUsdCompact}
            cap={BREAKDOWN_FOLD}
            footer={
              profile.n_categories > catRows.length
                ? `${countPrefix}${profile.n_categories} categories in all.`
                : undefined
            }
          />
        </FicheSection>
      )}

      {/* ── Most recent closed year ────────────────────────────────────────
          The honest stand-in for Paris's dated "recent contracts" table: SF
          vouchers carry no payment date, only a fiscal year, so the last
          closed year's composition is as close as this source allows. */}
      {recentRows.length > 0 && profile?.recent_fy != null && (() => {
        // A bar cannot express a negative, so FicheBreakdown drops refund and
        // reversal lines. Without saying so, the count in this sentence
        // disagrees with the number of bars underneath it (Turner
        // Construction FY2025: 3 lines, 2 bars).
        const negatives = recentRows.length - recentRows.filter((r) => r.value > 0).length;
        return (
        <FicheSection
          title={`In FY${profile.recent_fy}`}
          sub={
            <>
              {fmtUsdCompact(profile.recent_total_usd)}, in the last year with closed books.
              {negatives > 0
                ? ` ${negatives === 1 ? "One refund is" : `${negatives} refunds are`} not shown.`
                : ""}
            </>
          }
        >
          <FicheBreakdown rows={recentRows} format={fmtUsdCompact} cap={BREAKDOWN_FOLD} />
        </FicheSection>
        );
      })()}

      <FicheSection title="Paid by year">
        <FicheYearBars
          points={years}
          format={fmtUsdCompact}
          provisionalNote={
            openYears.length > 0
              ? `Hatched: FY${openYears.join(", FY")} ${openYears.length > 1 ? "are" : "is"} not closed yet — the bar shows payments recorded so far, not a full year.`
              : undefined
          }
          peakNote={(peak) => (
            <>
              Tallest bar — FY{peak.year}: {fmtUsdCompact(peak.value)}. Bars are scaled to this
              payee’s own peak year.
            </>
          )}
        />
      </FicheSection>

      {/* ── Who pays them ──────────────────────────────────────────────────
          Was a "·"-joined list of department names with no amounts. */}
      {deptRows.length > 0 && profile ? (
        <FicheSection
          title="Who pays them"
          sub={
            deptRows.length === 1 ? undefined : (
              <>
                {countPrefix}
                {profile.n_departments} departments, {fmtShare(deptRows[0].value / payee.total_paid_usd)} of
                it from {deptRows[0].label}.
              </>
            )
          }
        >
          <FicheBreakdown rows={deptRows} format={fmtUsdCompact} cap={BREAKDOWN_FOLD} />
        </FicheSection>
      ) : (
        payee.top_departments.length > 0 && (
          <FicheSection title="Who pays them">
            <p className="fx-fiche-line">{payee.top_departments.join(" · ")}</p>
          </FicheSection>
        )
      )}

      {payee.contracts_held.length > 0 && (() => {
        // Was `.slice(0, 10)` with nothing after it: a payee holding 43
        // contracts silently lost 33 of them. Now the tail is one click away
        // and the count is on screen either way.
        const head = payee.contracts_held.slice(0, CONTRACTS_FOLD);
        const tail = payee.contracts_held.slice(CONTRACTS_FOLD);
        const row = (c: (typeof payee.contracts_held)[number]) => (
          <li key={c.contract_no}>
            <Link
              href={`/us/city/sf/contracts/contract/${c.contract_no}`}
              scroll={false}
              className="fx-row-link"
            >
              {c.title ?? c.contract_no}
            </Link>
            <span className="fx-place-contract-meta">
              {c.department_code ? ` · ${c.department_code}` : ""}
              {c.agreed_usd != null ? ` · ${fmtUsdCompact(c.agreed_usd)} awarded` : ""}
              {c.paid_usd != null ? ` · ${fmtUsdCompact(c.paid_usd)} paid` : ""}
              {c.sole_source ? " · sole-source" : ""}
            </span>
          </li>
        );
        return (
          <FicheSection title={`Active contracts (${payee.n_contracts_held})`}>
            <ul className="fx-place-contracts">{head.map(row)}</ul>
            <FicheMore count={tail.length} noun="more contracts">
              <ul className="fx-place-contracts">{tail.map(row)}</ul>
            </FicheMore>
          </FicheSection>
        );
      })()}

      {docs.length > 0 && (
        <FicheSection title="In the archive">
          <FicheArchiveShelf docs={docs} cap={SHELF_CAP} withheld={proceduralDocs.length} />
        </FicheSection>
      )}

      {/* Provenance detail, not a headline: collapsed so it stops competing
          with the money and the archive trail above it. */}
      {payee.n_variants > 1 && (
        <FicheSection title={`Name variants merged (${payee.n_variants})`}>
          <details>
            <summary
              style={{
                cursor: "pointer",
                fontFamily: "var(--f-mono)",
                fontSize: 12,
                color: "var(--ink-2)",
                padding: "4px 0 8px",
              }}
            >
              Show the {payee.n_variants} spellings merged into this payee
            </summary>
          <ul className="fx-payee-variants">
            {payee.variants.map((v) => (
              <li key={v.name}>
                <span className="fx-payee-variant-name">{v.name}</span>
                <span className="fx-place-contract-meta"> · {fmtUsdCompact(v.total)}</span>
              </li>
            ))}
          </ul>
          {payee.merges.length > 0 && (
            <ul className="fx-payee-merges">
              {payee.merges.map((m, i) => (
                <li key={i} className="fx-doc-source">
                  {m.variant}: {m.reason}
                </li>
              ))}
            </ul>
          )}
          </details>
        </FicheSection>
      )}

      <FicheSourceFooter>
        <b>Source</b>: SF Controller — Vendor Payments (Vouchers) &amp; Supplier Contracts,
        name-normalized.{" "}
        {profile
          ? "Departments and categories are the City's own coding; sorting them into purchases and non-purchases (debt service, benefit plans, tax withholding, payments to other governments, balance-sheet lines) is ours. The file records a fiscal year, never a payment date."
          : ""}
      </FicheSourceFooter>
    </FicheShell>
  );
}
