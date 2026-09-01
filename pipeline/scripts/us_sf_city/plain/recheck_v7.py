#!/usr/bin/env python3
"""Return to the queue only the rows v7 can actually move.

A version bump normally means re-reading everything. That was judged not worth
it: five double-reads put inter-reader agreement at 92-97% on band, and the
residual disagreement sits in a handful of named families rather than spread
thin. So v7 re-reads those families and leaves the rest at v6, with each row's
own stamp recording what it was read against.

Run with --apply to move them; without it, this only counts.
"""
import json, pathlib, re, sys, shutil, datetime

HERE = pathlib.Path(__file__).resolve().parents[4] / "pipeline" / "data" / "sf_bos"
IMP = HERE / "importance.jsonl"
LINES = HERE / "plain_lines.jsonl"

STREETS = (r"market|mission|geary|van ness|army|fulton|california|bush|sutter|polk|"
           r"howard|folsom|harrison|bryant|dolores|divisadero|masonic|columbus|"
           r"broadway|kearny|montgomery|sansome|battery|third|san bruno|ocean|"
           r"great highway|sloat|portola|nineteenth|point lobos")

FAMILIES = {
    # the thoroughfare rule now adds +6 to any street act on a listed street
    "street act on a listed thoroughfare":
        re.compile(rf"(pav|grad|sewer|sidewalk|level|widen|repav|resurfac)\w*.*\b({STREETS})\b"
                   rf"|\b({STREETS})\b.*(pav|grad|sewer|sidewalk|level|widen|repav|resurfac)", re.I),
    "an appeal, rehearing or continuance":
        re.compile(r"\bappeal|rehearing|reheard|continuance\b", re.I),
    "a lease":
        re.compile(r"\bleas(e|ed|es|ing)\b|\bsubleas", re.I),
    "traffic or parking regulation":
        re.compile(r"stop sign|parking meter|tow.?away|turn ban|one.?way|speed limit|"
                   r"bike lane|transit.?only|permit parking|angle parking|no parking|"
                   r"through highway|traffic signal|crosswalk", re.I),
    "landmark or historic designation":
        re.compile(r"landmark|historic(al)? (district|designation|building)|"
                   r"designated historic", re.I),
    "rezoning":
        re.compile(r"rezon|reclassif|zoning (map|change|district)|use district|height limit", re.I),
    "housing bonds or a named residential site":
        re.compile(r"housing bond|bonds? for .*(housing|flats|dwelling|apartment)|"
                   r"(housing|flats|dwellings|apartments) .*bonds?", re.I),
}

def main():
    apply = "--apply" in sys.argv
    lines = {}
    for ln in LINES.open():
        try:
            d = json.loads(ln); lines[d["id"]] = d.get("line") or ""
        except Exception:
            pass

    # importance.jsonl holds every reading, so an id read twice appears twice.
    # The decision is per RECORD: if any reading of an id is affected, every
    # reading of it goes back, so the id cannot end up half at v6 and half at v7.
    rows, order = {}, []
    for ln in IMP.open():
        try:
            d = json.loads(ln)
        except Exception:
            continue
        i = d["id"]
        if i not in rows:
            rows[i] = []; order.append(i)
        rows[i].append((ln, d))

    keep, back, why = [], [], {}
    for i in order:
        rs = rows[i]
        if all(d.get("rv", 0) >= 7 for _, d in rs):
            keep += [ln for ln, _ in rs]; continue
        txt = lines.get(i, "")
        low = min((d["score"] for _, d in rs if isinstance(d.get("score"), int)), default=None)
        hit = None
        # the floor rules moved every row that landed under 18
        if low is not None and low < 18:
            hit = "below the new floor of 18"
        else:
            for name, rx in FAMILIES.items():
                if rx.search(txt):
                    hit = name; break
        if hit:
            back += [ln for ln, _ in rs]; why[hit] = why.get(hit, 0) + 1
        else:
            keep += [ln for ln, _ in rs]

    tot = len(order)
    print(f"records scored at v6   {tot:,}  (in {len(keep)+len(back):,} rows, duplicates included)")
    for k, v in sorted(why.items(), key=lambda x: -x[1]):
        print(f"    {k:42s} {v:6,}")
    nb = sum(why.values())
    print(f"\n  back to the queue for v7   {nb:,} records  ({nb/tot*100:.1f}% of what is scored)")
    print(f"  left at v6, stamp intact   {tot-nb:,} records")

    if not apply:
        print("\n(count only — pass --apply to move them)")
        return
    stamp = datetime.datetime.now().strftime("%Y%m%d-%H%M%S")
    arch = IMP.with_name(f"importance-pre-v7-{stamp}.jsonl")
    shutil.copy2(IMP, arch)
    (IMP.with_name(f"returned-for-v7-{stamp}.jsonl")).write_text("".join(back))
    IMP.write_text("".join(keep))
    print(f"\n  archived whole file to     {arch.name}")
    print(f"  the returned rows kept in  returned-for-v7-{stamp}.jsonl")

main()
