"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";

import {
  groupHits,
  loadCitySearch,
  blockForAddress,
  loadCityAddresses,
  searchCity,
  streetForAddress,
  type AddressIndex,
  type CitySearchIndex,
  type SearchHit,
  type SearchKind,
} from "@/lib/us/city-search";
import { useT } from "@/lib/localeContext";

/**
 * THE OTHER WAY IN.
 *
 * Until this existed the map was the only one: a reader who wanted their own
 * street had to find it by eye on a picture of San Francisco with 5,404 blocks
 * in it, and a reader who wanted the neighbourhood they live in had to know
 * where it was before they could read about it.
 *
 * Everything it reaches is something the fiche beside it already knows how to
 * open — a division, a street, a curated place, a door the Board named. The
 * box does not render results of its own: it moves the map and hands the panel
 * a unit, and the panel is unchanged.
 *
 * ── THE INDEX IS FETCHED ON FOCUS, NOT ON LOAD ─────────────────────────────
 * 106 KB. The map already pulls megabytes of geometry before it can draw a
 * frame, and a reader who never touches this box should not be queued behind
 * it. One round trip on the first focus, which finishes before a two-letter
 * query does.
 *
 * ── RESULTS ARE GROUPED BECAUSE THE KINDS ARE NOT INTERCHANGEABLE ──────────
 * A flat list would put `Guerrero St` and the forty doors on Guerrero Street
 * in one column, and the street — the thing almost everybody typing that word
 * means — would be buried under its own addresses. The sections also carry
 * the one caveat this feature has to make, which is that a door is a house
 * number the Board of Supervisors printed and NOT a register of San
 * Francisco's addresses.
 */

const KIND_LABEL: Record<SearchKind, string> = {
  hood: "Neighbourhoods",
  street: "Streets",
  place: "Places",
  addr: "Addresses the record names",
};

const nfInt = new Intl.NumberFormat("en-US");

export interface CitySearchPick {
  readonly hit: SearchHit;
}

export default function CitySearch({ onPick }: { onPick: (p: CitySearchPick) => void }) {
  const t = useT();
  const [q, setQ] = useState("");
  const [ix, setIx] = useState<CitySearchIndex | null>(null);
  const [aix, setAix] = useState<AddressIndex | null>(null);
  const [failed, setFailed] = useState(false);
  const [open, setOpen] = useState(false);
  const [cursor, setCursor] = useState(0);
  const boxRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listId = useId();

  const load = useCallback(() => {
    if (ix || failed) return;
    void loadCitySearch().then((i) => {
      if (i) setIx(i);
      else setFailed(true);
    });
  }, [ix, failed]);

  const hits = useMemo(() => searchCity(ix, q), [ix, q]);
  const groups = useMemo(() => groupHits(hits), [hits]);
  /* ── THE ADDRESS NOBODY WROTE DOWN — TWO RUNGS, NOT ONE ──────────────
     The index holds 1,052 doors against a city of some two hundred thousand
     addresses, so a miss is the ORDINARY outcome of somebody typing where
     they live, and a bare "nothing found" would tell them the wrong thing.

     The FIRST rung is the assessor's own parcels: 17,468 street-and-block
     faces that say which block a house number is on. No geocoding and no
     coordinates — the assessor published the join. That lands the reader on
     the actual ground their address stands on, and the fiche then carries the
     rest of the ladder itself: the block's whole record, the streets around
     it, and the neighbourhood's paragraph one fold down.

     The SECOND rung is the street, for when the parcels cannot place it —
     a street the assessor does not name, or a number off the end of one it
     does. Neither is guessed around. */
  const noDoor = !hits.some((h) => h.kind === "addr");
  const onBlock = useMemo(
    () => (noDoor ? blockForAddress(aix, q) : null),
    [aix, q, noDoor],
  );
  const fallback = useMemo(
    () => (noDoor && !onBlock ? streetForAddress(ix, q) : []),
    [ix, q, noDoor, onBlock],
  );
  const parcelHit: SearchHit | null = useMemo(
    () =>
      onBlock
        ? {
            kind: "addr",
            label: onBlock.label,
            n: 0,
            block: onBlock.block,
            to: "",
            sub: onBlock.street,
            viaParcel: true,
          }
        : null,
    [onBlock],
  );

  /* the parcel file is 357 KB and only an address-shaped query can use it, so
     it is asked for on the first such query rather than on focus */
  useEffect(() => {
    if (!noDoor || aix || !/^\s*\d+\s+\S/.test(q)) return;
    void loadCityAddresses().then((a) => a && setAix(a));
  }, [q, noDoor, aix]);
  /* the flat order the arrow keys walk, which has to be the order on screen —
     `groupHits` caps each section, so the flat list is the sections joined
     rather than `hits` */
  const flat = useMemo(
    () => [
      ...groups.flatMap((g) => g.hits),
      ...(parcelHit ? [parcelHit] : []),
      ...fallback,
    ],
    [groups, parcelHit, fallback],
  );

  useEffect(() => setCursor(0), [q]);

  /* a click anywhere else closes the list. Not a blur handler: pressing a
     result IS a blur, and closing on blur would unmount the row under the
     pointer before the press landed. */
  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => {
      if (!boxRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", away);
    return () => document.removeEventListener("mousedown", away);
  }, [open]);

  const choose = useCallback(
    (hit: SearchHit) => {
      onPick({ hit });
      setOpen(false);
      setQ(hit.label);
      inputRef.current?.blur();
    },
    [onPick],
  );

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      setOpen(false);
      return;
    }
    if (!flat.length) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setOpen(true);
      setCursor((c) => (c + 1) % flat.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setCursor((c) => (c - 1 + flat.length) % flat.length);
    } else if (e.key === "Enter") {
      e.preventDefault();
      choose(flat[cursor] ?? flat[0]);
    }
  };

  const showList = open && q.trim().length >= 2;

  return (
    <div className="fx-city-search" ref={boxRef}>
      <input
        ref={inputRef}
        type="search"
        className="fx-city-search-in"
        value={q}
        placeholder={t("us.sf.thecity.search.placeholder")}
        aria-label={t("us.sf.thecity.search.placeholder")}
        aria-expanded={showList}
        aria-controls={listId}
        autoComplete="off"
        onFocus={() => {
          load();
          setOpen(true);
        }}
        onChange={(e) => {
          setQ(e.target.value);
          setOpen(true);
        }}
        onKeyDown={onKey}
      />

      {showList ? (
        <div className="fx-city-search-out" id={listId} role="listbox">
          {failed ? (
            <p className="fx-block-hint fx-city-search-note">
              {t("us.sf.thecity.search.failed")}
            </p>
          ) : !ix ? (
            <p className="fx-block-hint fx-city-search-note">
              {t("us.sf.thecity.search.loading")}
            </p>
          ) : groups.length === 0 && fallback.length === 0 && !parcelHit ? (
            /* ── THE EMPTY ANSWER IS AN ANSWER ─────────────────────────────
               Typing an address that is not in the index does not mean the
               address does not exist. It means the Board of Supervisors never
               printed a house number for it, and saying so is the finding.
               A bare "no results" would let a reader conclude the opposite. */
            <p className="fx-block-hint fx-city-search-note">
              {t("us.sf.thecity.search.none")}
            </p>
          ) : (
            groups.map((g) => (
              <div key={g.kind} className="fx-city-search-group">
                <div className="fx-city-search-kind">{KIND_LABEL[g.kind]}</div>
                {g.hits.map((h) => {
                  const i = flat.indexOf(h);
                  return (
                    <button
                      key={`${h.kind}:${h.label}:${h.block}`}
                      type="button"
                      role="option"
                      aria-selected={i === cursor}
                      className={`fx-city-search-hit${i === cursor ? " is-on" : ""}`}
                      onMouseEnter={() => setCursor(i)}
                      onClick={() => choose(h)}
                    >
                      <span className="fx-city-search-l">
                        {h.label}
                        {/* WHY THIS ONE IS HERE. A place found by its address
                            reads as the search inventing a link unless the
                            address it matched is on the row. */}
                        {h.sub ? (
                          <span className="fx-city-search-sub">{h.sub}</span>
                        ) : null}
                      </span>
                      <span className="fx-city-search-n">
                        {h.kind === "addr" && h.y0
                          ? h.y0 === h.y1
                            ? String(h.y0)
                            : `${h.y0}–${h.y1}`
                          : h.n > 0
                            ? nfInt.format(h.n)
                            : ""}
                      </span>
                    </button>
                  );
                })}
                {g.more > 0 ? (
                  <p className="fx-city-search-more">
                    {t("us.sf.thecity.search.more").replace(
                      "{n}",
                      nfInt.format(g.more),
                    )}
                  </p>
                ) : null}
                {/* the caveat rides with the section it is about, so it is
                    read beside the doors rather than in a note somewhere */}
                {g.kind === "addr" ? (
                  <p className="fx-city-search-caveat">
                    {t("us.sf.thecity.search.addr_note")}
                  </p>
                ) : null}
              </div>
            ))
          )}

          {parcelHit ? (
            <div className="fx-city-search-group">
              <div className="fx-city-search-kind">
                {t("us.sf.thecity.search.parcel_head")}
              </div>
              <p className="fx-city-search-caveat">
                {t("us.sf.thecity.search.parcel_why")}
              </p>
              <button
                type="button"
                role="option"
                aria-selected={flat.indexOf(parcelHit) === cursor}
                className={`fx-city-search-hit${
                  flat.indexOf(parcelHit) === cursor ? " is-on" : ""
                }`}
                onMouseEnter={() => setCursor(flat.indexOf(parcelHit))}
                onClick={() => choose(parcelHit)}
              >
                <span className="fx-city-search-l">
                  {parcelHit.label}
                  <span className="fx-city-search-sub">
                    {t("us.sf.thecity.search.parcel_on").replace(
                      "{street}",
                      parcelHit.sub ?? "",
                    )}
                  </span>
                </span>
              </button>
            </div>
          ) : null}

          {fallback.length > 0 ? (
            <div className="fx-city-search-group">
              <div className="fx-city-search-kind">
                {t("us.sf.thecity.search.fallback_head")}
              </div>
              <p className="fx-city-search-caveat">
                {t("us.sf.thecity.search.fallback_why")}
              </p>
              {fallback.map((h) => {
                const i = flat.indexOf(h);
                return (
                  <button
                    key={`fb:${h.label}`}
                    type="button"
                    role="option"
                    aria-selected={i === cursor}
                    className={`fx-city-search-hit${i === cursor ? " is-on" : ""}`}
                    onMouseEnter={() => setCursor(i)}
                    onClick={() => choose(h)}
                  >
                    {/* THE ROW HAS TO SAY WHAT IT IS. The reader typed an
                        address and this offers a STREET, which is a different
                        thing — and the sentence above it explaining that was
                        skipped: "frankly i missed it when i typed i just
                        clicked the rest and then it shows me the street its
                        confusing". Whatever is read or not read above, the
                        row itself now says it is the whole street. */}
                    <span className="fx-city-search-l">
                      {h.label}
                      <span className="fx-city-search-sub">
                        {t("us.sf.thecity.search.fallback_row")}
                      </span>
                    </span>
                    <span className="fx-city-search-n">
                      {h.n > 0 ? nfInt.format(h.n) : ""}
                    </span>
                  </button>
                );
              })}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
