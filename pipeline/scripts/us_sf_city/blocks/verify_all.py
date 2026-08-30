"""Every gate, in one command.

    python3 verify_all.py

Runs each check and prints one line per gate. Exits non-zero if any fail, so it
can sit in CI or in front of a publish.

WHY THIS EXISTS. The checks were spread across five scripts and a person had to
remember all five. A gate nobody runs is a comment. This is the list, and adding
a gate means adding it here — not writing a new file that gets forgotten.

WHAT EACH GATE PROTECTS, in one line, because a failing check is only useful if
the reader knows what it was guarding:
"""
from __future__ import annotations

import collections
import csv
import json
import os
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from _paths import REPO  # noqa: E402

SEEDS = os.path.join(REPO, "pipeline", "seeds")
BLOCKS = os.path.join(REPO, "website/public/data/us/sf/city/blocks")
RECORDS = os.path.join(REPO, "website/public/data/us/sf/city/records")

RESULTS: list[tuple[str, bool, str]] = []


def gate(name: str, guards: str):
    def deco(fn):
        try:
            ok, detail = fn()
        except Exception as e:                                  # noqa: BLE001
            ok, detail = False, f"{type(e).__name__}: {e}"
        RESULTS.append((name, ok, detail))
        mark = "ok  " if ok else "FAIL"
        print(f"  [{mark}] {name:<44} {detail}")
        if not ok:
            print(f"         guards: {guards}")
        return fn
    return deco


def main() -> int:
    print("GATES\n")

    # ── the taxonomy is internally consistent ────────────────────────────
    @gate("taxonomy: slugs unique, subtopics belong",
          "a duplicate slug silently merges two topics; an orphan subtopic "
          "cannot be rendered under any heading")
    def _tax():
        tax = json.load(open(os.path.join(SEEDS, "sf_bos_taxonomy.json")))
        tops = [t["slug"] for t in tax["topics"]]
        subs = [s["slug"] for t in tax["topics"] for s in t["subtopics"]]
        acts = [a["slug"] for a in tax["actions"]]
        bad = []
        for name, xs in (("topic", tops), ("subtopic", subs), ("action", acts)):
            if len(set(xs)) != len(xs):
                d = [k for k, v in collections.Counter(xs).items() if v > 1]
                bad.append(f"duplicate {name}: {d}")
        return (not bad), ("; ".join(bad) or
                           f"{len(tops)} topics, {len(subs)} subtopics, {len(acts)} actions")

    # ── the classification seed only uses values the taxonomy defines ────
    @gate("classification: every value is in the taxonomy",
          "a value outside the taxonomy renders as a blank chip and cannot be "
          "filtered — it is invisible rather than wrong")
    def _cls():
        p = os.path.join(SEEDS, "sf_bos_classification.csv")
        if not os.path.exists(p):
            return False, "seed not built"
        tax = json.load(open(os.path.join(SEEDS, "sf_bos_taxonomy.json")))
        tops = {t["slug"] for t in tax["topics"]} | {""}
        subs = {s["slug"] for t in tax["topics"] for s in t["subtopics"]} | {""}
        acts = {a["slug"] for a in tax["actions"]} | {""}
        rts = {r["slug"] for r in tax["record_types"]} | {""}
        n = bad = 0
        with open(p, newline="") as f:
            for row in csv.DictReader(f):
                n += 1
                if (row["topic"] not in tops or row["subtopic"] not in subs
                        or row["action"] not in acts
                        or row["record_type"] not in rts):
                    bad += 1
        return bad == 0, f"{n:,} rows, {bad} invalid"

    # ── a subtopic never appears under the wrong topic ───────────────────
    @gate("classification: subtopic matches its topic",
          "a subtopic filed under the wrong topic double-counts one and "
          "empties the other")
    def _pair():
        p = os.path.join(SEEDS, "sf_bos_classification.csv")
        tax = json.load(open(os.path.join(SEEDS, "sf_bos_taxonomy.json")))
        owner = {s["slug"]: t["slug"] for t in tax["topics"] for s in t["subtopics"]}
        bad = set()
        with open(p, newline="") as f:
            for row in csv.DictReader(f):
                s, t = row["subtopic"], row["topic"]
                if s and owner.get(s) != t:
                    bad.add((s, t))
        return not bad, (f"{len(bad)} mismatched pair(s): {sorted(bad)[:3]}"
                         if bad else "every subtopic under its own topic")

    # ── the subject pass stayed inside its lane ──────────────────────────
    @gate("purpose-clause rows only ever gained a subject",
          "pass D reaching past the subject. It runs over rows that were "
          "already read and may only fill an empty topic — if it ever writes "
          "a record_type or drops an action, the earlier read is silently "
          "overwritten and nothing downstream can tell. Asserted here rather "
          "than trusted to a comment in freeze_classification.py")
    def _passd():
        p = os.path.join(SEEDS, "sf_bos_classification.csv")
        n, bad = 0, []
        with open(p, newline="") as f:
            for row in csv.DictReader(f):
                if row["classified_by"] != "purpose-clause":
                    continue
                n += 1
                if row["record_type"] != "decision":
                    bad.append(f'{row["id"]}: record_type {row["record_type"]!r}')
                elif not row["topic"]:
                    bad.append(f'{row["id"]}: filled but no topic')
                elif not row["action"]:
                    bad.append(f'{row["id"]}: lost its action')
        return not bad, (f"{len(bad)} bad: {bad[:2]}" if bad else
                         f"{n:,} rows, all decisions that kept their action")

    # ── the theme masks still agree with the shards ──────────────────────
    @gate("theme marks agree with the shards",
          "the map drawing a mark the panel cannot open, or the reverse")
    def _themes():
        r = subprocess.run([sys.executable, os.path.join(HERE, "verify_themes.py")],
                           capture_output=True, text=True)
        last = [l for l in r.stdout.strip().split("\n") if l.strip()][-1:]
        return r.returncode == 0, (last[0].strip()[:60] if last else "no output")

    # ── the fiche's subjects are read from the mask, not re-matched ──────
    @gate("threads.json is tagged in the pipeline",
          "the browser re-running 41 regexes over a 136-character line, which "
          "finds 35% of records where the record itself yields 57%")
    def _threads():
        p = os.path.join(BLOCKS, "threads.json")
        t = json.load(open(p))
        ok = bool(t.get("tagged_in_pipeline"))
        has_bits = all("bit" in x for x in t["threads"])
        return ok and has_bits, (f"{t['n_threads']} subjects, "
                                 f"{100*t['n_tagged']//t['n_records']}% of records")

    # ── the published record table ───────────────────────────────────────
    @gate("core table: gates pass",
          "the published dataset disagreeing with the taxonomy, or a precisely "
          "located record having no block for the map to draw")
    def _core():
        r = subprocess.run([sys.executable, os.path.join(HERE, "build_core_table.py"),
                            "--check"], capture_output=True, text=True)
        if r.returncode != 0:
            bad = [l for l in r.stdout.split("\n") if l.strip().startswith("-")]
            return False, (bad[0].strip() if bad else "see build_core_table --check")
        line = [l for l in r.stdout.split("\n") if "topic" in l and "%" in l]
        return True, (line[0].strip() if line else "ok")

    # ── nothing claims more precision than the record gave ───────────────
    @gate("no dot is drawn on a street-only record",
          "the map saying HERE where the record said `somewhere on this street`")
    def _street_only():
        mk = os.path.join(BLOCKS, "theme-marks.json")
        if not os.path.exists(mk):
            return True, "no marks published yet"
        m = json.load(open(mk))
        # every board mark must resolve to a block; place marks carry -1
        board = [i for i, s in enumerate(m["s"])
                 if (m.get("sources") or [{}])[s].get("open") == "block"]
        bad = sum(1 for i in board if m["b"][i] < 0)
        return bad == 0, f"{len(board):,} block-addressed marks, {bad} without a block"

    # ── the schema describes the data that is actually there ─────────────
    @gate("schema lists every value the data uses",
          "a column gaining a value the schema does not list — the page renders "
          "its own list, so those rows vanish from the page while staying in the "
          "file. `near-duplicate` did exactly this and was caught by hand")
    def _schema():
        sp = os.path.join(RECORDS, "schema.json")
        tp = os.path.join(RECORDS, "stats.json")
        if not os.path.exists(sp):
            return False, "no schema published"
        sch = {c["name"]: set(c.get("values") or []) for c in json.load(open(sp))["columns"]}
        st = json.load(open(tp))
        missing = []
        for col in ("record_type", "topic", "action", "how_we_know_where",
                    "classified_by"):
            declared = sch.get(col)
            if declared is None:
                continue
            used = {k for k, _v in st.get(col, [])}
            # `topic` is published as labels in stats and slugs in the schema,
            # so it is checked by count rather than by string
            if col == "topic":
                if len(used) > len(declared):
                    missing.append(f"{col}: {len(used)} used > {len(declared)} declared")
                continue
            gap = used - declared
            if gap:
                missing.append(f"{col}: {sorted(gap)}")
        return not missing, ("; ".join(missing) or
                             "every value in the data is in the schema")

    # ── no column is blank on every row ──────────────────────────────────
    @gate("no column is empty on every row",
          "shipping a column that is documented and never filled — a reader "
          "cannot tell a promise from a bug. `tags`, `streets` and "
          "`refers_to_decision_number` were all in this state once")
    def _nonempty():
        import gzip
        p = os.path.join(RECORDS, "sf_bos_records.csv.gz")
        if not os.path.exists(p):
            return False, "table not built"
        blank = collections.Counter()
        n = 0
        with gzip.open(p, "rt", newline="") as f:
            for row in csv.DictReader(f):
                n += 1
                for k, v in row.items():
                    if not v:
                        blank[k] += 1
        empty = sorted(k for k, v in blank.items() if v == n)
        return not empty, (f"always blank: {empty}" if empty
                           else f"{n:,} rows, every column used somewhere")

    # ── the page's subject figures count decisions and nothing else ──────
    @gate("stats.json subject figures count decisions only",
          "a subject chart tallied over every row with a topic. A bare vote "
          "outcome is filed under running-the-city/vote-or-scheduling — true "
          "of the row, not a subject — and counting those rows in doubled "
          "that topic and moved it up the published chart, breaking the "
          "counting rule printed on the same page. The other gates check that "
          "values are legal; nothing checked that a denominator is the one "
          "the sentence beside it claims, so this is that check")
    def _denominator():
        p = os.path.join(RECORDS, "stats.json")
        if not os.path.exists(p):
            return False, "stats not built"
        st = json.load(open(p))
        if "classified" in st or "topic" in st:
            return False, ("stats carries an all-rows subject field "
                           "(`classified` / `topic`) again")
        tax = json.load(open(os.path.join(SEEDS, "sf_bos_taxonomy.json")))
        label = {t["slug"]: t["label"] for t in tax["topics"]}
        want = collections.Counter()
        n_dec = 0
        with open(os.path.join(SEEDS, "sf_bos_classification.csv")) as f:
            for r in csv.DictReader(f):
                if r["record_type"] != "decision":
                    continue
                n_dec += 1
                if r["topic"]:
                    want[label.get(r["topic"], r["topic"])] += 1
        got = {k: v for k, v in st.get("topic_decisions", [])}
        if got != dict(want):
            off = sorted(k for k in set(got) | set(want)
                         if got.get(k) != want.get(k))
            return False, f"topic_decisions disagrees on {off}"
        by_dec = sum(v for _, v in st.get("decisions_by_decade", []))
        if by_dec != n_dec:
            return False, (f"decisions_by_decade sums to {by_dec:,}, "
                           f"decisions are {n_dec:,}")
        return True, (f"{sum(want.values()):,} of {n_dec:,} decisions, "
                      "topic and decade both over decisions")

    print()
    fails = [n for n, ok, _ in RESULTS if not ok]
    if fails:
        print(f"{len(fails)} of {len(RESULTS)} gates FAILED: {', '.join(fails)}")
        return 1
    print(f"all {len(RESULTS)} gates pass")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
