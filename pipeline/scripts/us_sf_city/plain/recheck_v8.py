#!/usr/bin/env python3
"""Return to the queue only the rows v8 can actually move.

v8 adds one rung: the rule that binds the CITY ITSELF, the right or prohibition
created for a class of people, and the record a newspaper would have run. See
IMPORTANCE.md, "The rule that binds the CITY ITSELF".

WHY THIS IS A SELECTION AND NOT A RE-READ. Measured before the bump, over 1,116
records about the city governing itself or about civil rights:

      80 and above        1
      68-79              13
      55-67              56
      under 55        1,046

against a flat 80 for any transit line ordered or extended. The rung was
missing, so readers fell back to the neighbourhood rung, the ballot rung, or
wide-reach-small-stakes, and the same subject landed at 75, 68 and 58 in three
different places. Nothing else in the rubric moved, so nothing else is re-read.

WHAT IS DELIBERATELY NOT SELECTED. Money into a service that serves a class — a
shelter grant, a clinic contract — is money into a service and v8 says so
explicitly. Those already score on the right rung and a re-read would only add
noise, so a line needs a RULE, a RIGHT, a BAN or a CONTEST to come back.

Run with --apply to move them; without it, this only counts.
"""
import json, pathlib, re, sys, shutil, datetime

HERE = pathlib.Path(__file__).resolve().parents[4] / "pipeline" / "data" / "sf_bos"
IMP = HERE / "importance.jsonl"
LINES = HERE / "plain_lines.jsonl"

FAMILIES = {
    # what the city's own officers may do, buy, keep or share
    "a rule binding the city's own conduct":
        re.compile(r"surveillance|facial recogni|licence plate reader|license plate reader|"
                   r"body camera|police use of|use of force|drones?\b|"
                   r"city departments? (would need|must|may not|shall)|"
                   r"public records|open data|sunshine ordinance|"
                   r"cooperat\w+ with (federal|immigration)|\bICE\b|sanctuary city|"
                   r"ethics commission|campaign contribut|lobbyist|conflict of interest", re.I),
    # a right, a protection or a prohibition for a class of people
    "a right, protection or prohibition for a class":
        re.compile(r"discriminat|civil rights|reparations|racial|transgender|"
                   r"gender-affirming|LGBTQ|sanctuary|deport|"
                   r"minimum wage|paid (sick|parental|family) leave|"
                   r"right to (counsel|return|organize)|tenant protections?|"
                   r"just cause|harassment|hate crime", re.I),
    # a citywide ban or a first
    "a citywide ban, or a first":
        re.compile(r"\bban(s|ned|ning)?\b|prohibit|outlaw|made unlawful|"
                   r"first in the (nation|country|state)|"
                   r"no longer be (allowed|permitted)|barred from", re.I),
    # an emergency declared or ended. NOT a contested vote: a unanimous ban
    # matters as much as a six-to-five one, and scoring conflict would rank a
    # bitter fight over a parking permit above a quiet landmark decision.
    "an emergency declared or ended":
        re.compile(r"declar\w+ (a )?(local )?emergency|state of emergency|"
                   r"emergency (declared|ended|extended|terminated)", re.I),
    # the transit anchor split: a line ordered/built/extended keeps 80, a route
    # changed on a line that already runs drops to 55. Only the second kind
    # comes back, and the pattern is deliberately narrow.
    "a transit ROUTE CHANGE on a line that already runs":
        re.compile(r"(bus|streetcar|railway|rail|trolley|coach|line)\b[^.]{0,60}"
                   r"\b(route|rerout|re-rout|realign)\w*"
                   r"|\broute\b[^.]{0,40}\b(chang|shift|mov|alter)\w*"
                   r"|\b(stop|terminal)s?\b[^.]{0,30}\bmov\w*"
                   r"|\b(mov|reloc)\w*\b[^.]{0,40}\b(line|track|railway|streetcar)s?\b"
                   r"|\b(line|track|railway|streetcar)s?\b[^.]{0,30}\bto be (mov|reloc)\w*", re.I),
    # The sum is not the line. Narrow on purpose: the line must name a SUM,
    # name TRANSIT, and its act must be a MONEY verb. "Resolution to extend the
    # L line to Sloat" is the line and keeps 80; "$7,500 to extend the L line to
    # Sloat" is the payment. A first draft matched any transit word anywhere and
    # pulled 6,242 records, which is the whole transit corpus, not the defect.
    "money TOWARD a transit line, not the line itself":
        re.compile(r"(?=.*\$[\d])"
                   r"(?=.*\b(bus(es)?|streetcar|street car|railway|trolley|car line|"
                   r"guideway|municipal railway|muni)\b)"
                   r"(?=.*\b(paid|pay|payment|set aside|appropriat\w*|allowed for|"
                   r"for plans|plans for|toward|contract awarded|awarded)\b)", re.I),
}


def main():
    apply = "--apply" in sys.argv
    lines = {}
    for ln in LINES.open():
        try:
            d = json.loads(ln); lines[d["id"]] = d.get("line") or ""
        except Exception:
            pass

    # the decision is per RECORD: if any reading of an id is affected, every
    # reading of it goes back, so an id cannot end half at one version.
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
        if all(d.get("rv", 0) >= 8 for _, d in rs):
            keep += [ln for ln, _ in rs]; continue
        txt = lines.get(i, "")
        hit = None
        for name, rx in FAMILIES.items():
            if rx.search(txt):
                hit = name; break
        if hit:
            back += [ln for ln, _ in rs]; why[hit] = why.get(hit, 0) + 1
        else:
            keep += [ln for ln, _ in rs]

    tot = len(order)
    print(f"records scored below v8   {tot:,}")
    for k, v in sorted(why.items(), key=lambda x: -x[1]):
        print(f"    {k:44s} {v:6,}")
    nb = sum(why.values())
    print(f"\n  back to the queue for v8   {nb:,} records  ({nb/tot*100:.1f}% of what is scored)")
    print(f"  left where it is           {tot-nb:,} records")

    if not apply:
        print("\n(count only — pass --apply to move them)")
        return
    stamp = datetime.datetime.now().strftime("%Y%m%d-%H%M%S")
    arch = IMP.with_name(f"importance-pre-v8-{stamp}.jsonl")
    shutil.copy2(IMP, arch)
    (IMP.with_name(f"returned-for-v8-{stamp}.jsonl")).write_text("".join(back))
    IMP.write_text("".join(keep))
    print(f"\n  archived whole file to     {arch.name}")
    print(f"  the returned rows kept in  returned-for-v8-{stamp}.jsonl")


main()
