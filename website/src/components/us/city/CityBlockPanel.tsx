"use client";

/**
 * THE BLOCK DRAWER — what the record says about one assessor block.
 *
 * It follows `components/fiche/FicheArchiveShelf.tsx`, which is the house
 * contract for "one line saying what a document says, the title linked to the
 * archive, and nothing else". Per row, three things and no fourth:
 *
 *   1. the sentence the volume actually prints        → `gloss`
 *   2. what it is and when, linked to the scan's leaf → `title` + `href`
 *   3. the series it is held in, and HOW PRECISELY    → `sourceLabel`,
 *      `variantNote`                                    `variantNote`
 *
 * ── THE PRECISION TIER IS NOT DECORATION ─────────────────────────────────
 * A `street`-tier row is not a claim about this block. It is a claim about a
 * street this block fronts, and 35,244 of the 76,419 placed decisions are that
 * tier. So the block-precision rows and the street-precision rows are in
 * **two different sections with two different sentences**, and the street ones
 * are not fetched at all until the reader asks for them. Flattening the two
 * into one list would be presenting a street's record as a block's.
 *
 * ── WHY NOT A ROUTED DRAWER ──────────────────────────────────────────────
 * The site's drawer architecture is one root-level `(...)` route per ENTITY.
 * An assessor block is not an entity on this site — there are 5,404 of them,
 * none has a page, and the click is an inspection of the canvas rather than a
 * navigation. So this is an in-page panel with the same focus and Escape
 * behaviour, and no URL of its own.
 */

import { useEffect, useRef, useState } from "react";
import FicheArchiveShelf from "@/components/fiche/FicheArchiveShelf";
import type { FicheArchiveDoc } from "@/components/fiche/types";
import {
  archiveHref,
  loadStreetRecord,
  streetLabel,
  KIND_WORDING,
  PHASE_ORDER,
  TIER_WORDING,
  type BlockDecision,
  type BlockRecord,
} from "./block-records";

const nfInt = new Intl.NumberFormat("en-US");
const nfUsd = new Intl.NumberFormat("en-US", {
  style: "currency", currency: "USD", maximumFractionDigits: 0,
});

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function whenOf(d: BlockDecision): string {
  if (!d.d) return String(d.y);
  const [mm, dd] = d.d.split("-");
  const m = MONTHS[Number(mm) - 1];
  return m ? `${Number(dd)} ${m} ${d.y}` : String(d.y);
}

/** the volume slug, spelled out as far as it spells itself */
function seriesOf(u: string): string {
  const vol = u.split("/")[0] ?? "";
  if (vol.startsWith("journal")) return "Board of Supervisors, Journal of Proceedings";
  if (vol.startsWith("annualreport") || vol.startsWith("annrep"))
    return "Department annual report";
  if (vol.startsWith("reportof")) return "Bureau of Engineering / Board of Public Works report";
  return "Internet Archive";
}

function toDoc(d: BlockDecision, i: number): FicheArchiveDoc {
  const kind = KIND_WORDING[d.k] ?? "Item";
  const phase = PHASE_ORDER[d.f];
  const money = d.a > 0 ? ` · ${nfUsd.format(d.a)} printed on the page` : "";
  const tier = TIER_WORDING[d.p] ?? "";
  return {
    id: `${d.u}#${i}`,
    gloss: d.t,
    title: `${kind} · ${whenOf(d)}`,
    year: d.y || null,
    href: archiveHref(d.u),
    sourceLabel: seriesOf(d.u) + money,
    variantNote:
      (tier ? tier : "") +
      (phase ? ` · ${phase}` : "") +
      (d.approx ? " · page ≈" : ""),
  };
}

export interface BlockContext {
  /** the assessor block's own id, as the roll prints it */
  id: string;
  /** the published neighbourhood the block sits in */
  hood: string;
  /** the published area, m² */
  areaM2: number;
}

export default function CityBlockPanel({
  record,
  context,
  loading,
  onClose,
}: {
  record: BlockRecord | null;
  context: BlockContext | null;
  loading: boolean;
  onClose: () => void;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const [streets, setStreets] = useState<Record<string, BlockDecision[]>>({});
  const [openStreets, setOpenStreets] = useState(false);

  // Escape closes, and focus lands on the panel when it opens — the same
  // behaviour the routed drawers have, without the route.
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    closeRef.current?.focus();
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(() => {
    setOpenStreets(false);
    setStreets({});
  }, [record?.blockId]);

  useEffect(() => {
    if (!openStreets || !record) return;
    let live = true;
    void Promise.all(
      record.streets.slice(0, 6).map(async (k) => [k, await loadStreetRecord(k)] as const),
    ).then((pairs) => {
      if (!live) return;
      const out: Record<string, BlockDecision[]> = {};
      for (const [k, v] of pairs) out[k] = v;
      setStreets(out);
    });
    return () => {
      live = false;
    };
  }, [openStreets, record]);

  const here = record?.decisions ?? [];
  const years = here.length
    ? [Math.min(...here.map((d) => d.y)), Math.max(...here.map((d) => d.y))]
    : null;

  return (
    <div
      ref={panelRef}
      role="dialog"
      aria-modal="false"
      aria-label={
        context ? `Assessor's Block ${context.id}` : "Block record"
      }
      className="fx-city-panel"
    >
      <div className="fx-city-panel-head">
        <div>
          <span className="fx-city-panel-kicker">Assessor&rsquo;s block</span>
          <h2 className="fx-city-panel-title">{context?.id ?? "—"}</h2>
          {context ? (
            <p className="fx-place-sub" style={{ margin: "2px 0 0" }}>
              {context.hood}
              {context.areaM2 > 0
                ? ` · ${nfInt.format(Math.round(context.areaM2))} m² published area`
                : ""}
            </p>
          ) : null}
        </div>
        <button
          ref={closeRef}
          type="button"
          className="fx-city-panel-close"
          onClick={onClose}
          aria-label="Close the block record"
        >
          ×
        </button>
      </div>

      <div className="fx-city-panel-body">
        {loading ? (
          <p className="fx-fiche-note">Reading the record…</p>
        ) : here.length > 0 ? (
          <>
            <p className="fx-place-sub">
              <b>{nfInt.format(here.length)}</b>{" "}
              {here.length === 1 ? "decision the record places" : "decisions the record places"}{" "}
              on this block
              {years ? `, ${years[0]}–${years[1]}` : ""}. Each one links to the
              page of the scan it was read from.
            </p>
            <FicheArchiveShelf
              docs={here.map(toDoc)}
              cap={5}
              moreLabel={(n) => `See ${n} more decision${n === 1 ? "" : "s"}`}
            />
          </>
        ) : (
          <p className="fx-fiche-note">
            The record places no decision on this block. That is what the index
            says, not a gap in the fetch: 324 of the city&rsquo;s 5,404 blocks
            carry nothing at all.
          </p>
        )}

        {record && record.streets.length > 0 ? (
          <details
            className="fx-shelf-more"
            open={openStreets}
            onToggle={(e) => setOpenStreets((e.target as HTMLDetailsElement).open)}
          >
            <summary>
              On the streets this block fronts ({record.streets.length})
            </summary>
            <p className="fx-fiche-note" style={{ marginTop: 8 }}>
              These name a street and nothing else, so they are{" "}
              <b>not a claim about this block</b> — they are the record of a
              street it fronts.
            </p>
            {record.streets.slice(0, 6).map((k) => {
              const rows = streets[k];
              return (
                <div key={k} style={{ marginTop: 14 }}>
                  <div className="fx-doc-source" style={{ marginBottom: 4 }}>
                    {streetLabel(k)}
                  </div>
                  {rows === undefined ? (
                    <p className="fx-fiche-note">Loading…</p>
                  ) : rows.length === 0 ? (
                    <p className="fx-fiche-note">Nothing on this street.</p>
                  ) : (
                    <FicheArchiveShelf
                      docs={rows.slice(0, 40).map(toDoc)}
                      cap={3}
                      moreLabel={(n) => `See ${n} more on ${streetLabel(k)}`}
                    />
                  )}
                </div>
              );
            })}
          </details>
        ) : null}
      </div>
    </div>
  );
}
