# -*- coding: utf-8 -*-
"""TAKE VERIFIED SLICES INTO THE STORE AND CLEAR THEM FROM THE QUEUE.

    python3 pipeline/scripts/us_sf_city/plain/ingest.py out-001.jsonl [...]
    python3 pipeline/scripts/us_sf_city/plain/ingest.py --all

Appends each line to `plain_lines.jsonl` through `harness.save`, which runs
`gate.check` again and records what it found on the row. Ingested slices move
to `work/done/` and their ids come off `inflight.txt`, so `prep.py` can hand
out the next wave without reissuing them.

── THE GATE'S FLAGS ARE RECORDED, NOT ENFORCED ─────────────────────────────
A flag is a note on the row, not a rejection, and that is deliberate: on the
1906–1912 scans `invented` fires on words the writer restored CORRECTLY from
damage — the record prints "Applen Ilicks Wrecking", "Ignited Railroads",
"City Planning Conunission", and a line saying Hicks, United and Commission
is right about all three. Rejecting those would throw away the best writing
in the corpus and keep the OCR's mistakes.

So the flags ride with the row and can be re-read later. What DOES stop an
ingest is structural: a count mismatch, a duplicate or unknown id, a blank
line, or a run of unpaired lines — the signature of a writer that lost its
place. `verify_slice.py` explains that test.
"""
from __future__ import annotations

import argparse
import json
import pathlib
import shutil
import sys

HERE = pathlib.Path(__file__).resolve().parent
sys.path.insert(0, "/tmp")
sys.path.insert(0, str(HERE))

import harness as H  # noqa: E402
import verify_slice as V  # noqa: E402

assert pathlib.Path(H.__file__).parent == HERE, f"wrong harness: {H.__file__}"

WORK = V.WORK
DONE = WORK / "done"


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("files", nargs="*")
    ap.add_argument("--all", action="store_true")
    ap.add_argument("--force", action="store_true",
                    help="ingest despite a structural failure (never for runs)")
    args = ap.parse_args()

    DONE.mkdir(parents=True, exist_ok=True)
    paths = ([WORK / f for f in args.files] if args.files
             else sorted(WORK.glob("out-*.jsonl")))
    recs = {r["id"]: r for r in H.load_records()}
    gloss = V.gloss_terms()
    inflight = {l.strip() for l in (WORK / "inflight.txt").read_text().splitlines()
                if l.strip()} if (WORK / "inflight.txt").exists() else set()

    took = 0
    for p in paths:
        if not p.exists():
            continue
        r = V.verify(p, recs, gloss)
        # `unknown_ids` is NOT a structural failure here. It counts rows whose
        # record the selector has since stopped offering, and those are dropped
        # below rather than blocking a slice whose other 197 lines are sound.
        # A duplicate, a blank, a count mismatch or a RUN still blocks.
        #
        # THE COUNT ONLY COUNTS IF THERE IS SOMETHING TO COUNT AGAINST. When a
        # slice file is gone — released after its writer was thought dead, and
        # the writer then finished anyway — `n_in` reads 0 and the comparison
        # fails every time. It is the wrong test to gate on, because it is the
        # only check here that needs the slice: the duplicate, blank, unknown-id
        # and RUN tests all resolve each row against the corpus by id, and they
        # are the ones that decide whether a file is sound.
        counted = r["n_in"] > 0
        structural = ((counted and r["n_in"] != r["n_out"])
                      or r["ids_aligned"] is False
                      or r["dupes"] or r["blank"] or r["runs"])
        if not counted:
            print(f"     (slice file gone — checked against the corpus by id)")
        if structural and not args.force:
            print(f"SKIP {p.name}: {r['n_out']}/{r['n_in']} dupes {r['dupes']} "
                  f"blank {r['blank']} unknown {r['unknown_ids']} runs {len(r['runs'])}")
            continue
        # ── A ROW WHOSE RECORD IS NO LONGER OFFERED IS DROPPED, NOT SAVED ──
        # `pass2.held_reason` tightened mid-run: the Clerk's standing notice —
        # where to get the Sunshine Ordinance, whom to call, the lobbyist and
        # disability-access lines — was being handed out as though it were
        # Board business, and one slice was 103 records of it out of 300.
        #
        # The writers read it correctly and wrote an accurate line about a
        # page footer. The fault was upstream, so the fix is upstream, and the
        # slices already written are not binned whole for it: the lines about
        # real records are kept and the rest go back to being unoffered.
        # ── AND A RECORD ALREADY IN THE STORE IS NOT WRITTEN TWICE ─────────
        # A worker killed by the session limit had in fact finished its file;
        # its ids had already been released and handed to a second writer
        # under a new slice number. Both outputs are legitimate and both would
        # have been appended, putting 300 records in the store twice — and the
        # store is what the map reads, so the panel would have listed each of
        # them twice.
        #
        # The store is the authority on what is written. Whichever output
        # arrives first wins; the second is dropped on ingest rather than
        # being reconciled afterwards.
        done_now = H.done_ids()
        raw = [json.loads(l) for l in p.open()]
        rows, gone, dupe = [], 0, 0
        for x in raw:
            if x["id"] not in recs:
                gone += 1
            elif x["id"] in done_now:
                dupe += 1
            else:
                rows.append((x["id"], x["line"]))
        if gone:
            print(f"     {gone} rows dropped — their records are no longer offered")
        if dupe:
            print(f"     {dupe} rows dropped — already written by another slice")
        n_ok, n_inv, n_ovr, n_dmg = H.save(rows)
        inflight -= {i for i, _ in rows}
        shutil.move(str(p), str(DONE / p.name))
        sp = WORK / p.name.replace("out-", "slice-")
        if sp.exists():
            shutil.move(str(sp), str(DONE / sp.name))
        took += len(rows)
        print(f"took {p.name}: {len(rows):4} rows · clean {n_ok} · "
              f"invented {n_inv} · overstates {n_ovr} · damaged-scan {n_dmg}")

    (WORK / "inflight.txt").write_text("\n".join(sorted(inflight)) + "\n")
    store = sum(1 for _ in H.STORE_PATH.open()) if hasattr(H, "STORE_PATH") else None
    total = len(H.done_ids())
    print(f"\n{took:,} rows in; store now {total:,} of {len(recs):,} "
          f"({100*total/max(1,len(recs)):.1f}%); {len(inflight):,} still in flight")


if __name__ == "__main__":
    main()
