# -*- coding: utf-8 -*-
"""Feed records out for writing, take lines back, check them, keep the store."""
import json, os, re, sys
sys.path.insert(0, '/tmp')
import pred as P
from gate import check
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import pass2 as PASS2

STORE = "/Users/daniel/code/open-public-data/pipeline/data/sf_bos/plain_lines.jsonl"
ITEMS = "/tmp/items_merged.jsonl"
src = open('/tmp/render2.py').read().split("def run(seed")[0]
ns = {}; exec(src, ns)

# The roll call is not the minute. "Ayes — Supervisors Bancroft, Deasy,
# Gallagher, Hayden, Hilmer, Hocks, Jennings, Kortick, McCarthy, McLeran,
# Nelson, Nolan, Payot, Power, Suhr, Vogelsang, Walsh — 17. Absent —
# Supervisor Murdock — 1." carries no fact about the city; it is who was in
# the room. It is removed before reading so the substance fits, and nothing
# else is.
TALLY = re.compile(r"(?:Ayes?|Noes?|Absent|Excused)\s*[:—–-][^.]{0,400}?(?:—\s*\d+\s*\.|\.)", re.I)
VOTED = re.compile(r"\b(?:Adopted|Finally [Pp]assed|Passed for Second Reading|"
                   r"PASSED ON FIRST READING|The motion carried)\s+by the following vote\s*:?", re.I)
ROLL  = re.compile(r"\bSupervisors?\s+(?:[A-Z][\w'-]+,\s*){3,}[A-Z][\w'-]+\s*[—–-]?\s*\d*\.?", re.I)
SITE  = re.compile(r"https?://\S+|City and County of San Francisco Page \d+[^.]*")

def substance(t):
    t = TALLY.sub(" ", t); t = VOTED.sub(" ", t); t = ROLL.sub(" ", t); t = SITE.sub(" ", t)
    return re.sub(r"\s+", " ", t).strip()

def sentence_at(t, off):
    a = max(t.rfind('.', 0, off), t.rfind(';', 0, off)) + 1
    b = min([x for x in (t.find('.', off), t.find(';', off)) if x >= 0] or [len(t)])
    return t[a:b + 1].strip()

def load_records(pass2=True):
    """Every record a line can be written for.

    ── WHAT THIS USED TO DO, AND WHY IT WAS WRONG ─────────────────────────
    It opened `if not o.get('r'): continue` and then required
    `P.predicate` to match. Both were inherited from the map: a record
    needed a street to get a dot, and the predicate found the event span so
    the writer had something to read. Used as a FILTER they excluded 33,841
    records — 27% of the corpus — without either one having asked whether
    the record said anything.

    Neither test was about the reader. The year panel lists decisions that
    place no dot at all, so the street was the map's requirement; and
    `predicate` returning None means its patterns did not match, which is
    not the same as the page being empty. MEASURED on the excluded set:
    33,565 of 33,841 state something a line can be written from.

    So the filter is now `pass2.held_reason` — the one claim that can be
    made without reading the record, which is whether there is any text on
    the page once the roll call is taken off it. `pass2.py` documents it and
    writes every held record out with its reason.

    `pass2=False` restores the original selection, for reproducing the first
    run's numbers.
    """
    out = []
    with open(ITEMS) as fh:
        for ln in fh:
            o = json.loads(ln)
            if pass2:
                if PASS2.held_reason(o.get('t') or ''): continue
            else:
                if not o.get('r'): continue
                off = o['r'][0].get('o') or 0
                if not (P.predicate(ns['clean'](sentence_at(o['t'], off)))
                        or P.predicate(ns['clean'](o['t']))): continue
            out.append({"id": f"{o['v']}|{o['i']}", "y": o['y'], "t": o['t'],
                        "p": [(r.get('d') or r.get('s') or '')
                              for r in (o.get('r') or [])][:3]})
    return out

def done_ids():
    if not os.path.exists(STORE): return set()
    return {json.loads(l)["id"] for l in open(STORE)}

def save(rows):
    """rows: [(id, line)] — checked, then appended."""
    recs = {r["id"]: r for r in load_records()}
    n_ok = n_inv = n_ovr = n_dmg = 0
    with open(STORE, "a") as fh:
        for rid, line in rows:
            rec = recs[rid]
            c = check(line, rec["t"])
            flags = {k: v for k, v in c.items() if v}
            if c["invented"]: n_inv += 1
            if c["overstates"]: n_ovr += 1
            if c["damaged"]: n_dmg += 1
            if not (c["invented"] or c["overstates"]): n_ok += 1
            fh.write(json.dumps({"id": rid, "y": rec["y"], "line": line,
                                 "flags": flags}, ensure_ascii=False) + "\n")
    return n_ok, n_inv, n_ovr, n_dmg
