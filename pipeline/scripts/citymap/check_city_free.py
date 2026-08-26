"""THE MODULARITY RULE, ENFORCED RATHER THAN INTENDED — pipeline side.

`website/src/lib/citygl/engine-is-city-free.test.ts` fails the build when a
city's name appears in the renderer. ADR-0012 §2.2 records what that test has
actually been worth, and it is not compliance:

    it does not just forbid a name, it surfaces the places where a number was
    really a name.

and then records what the other half of the subsystem had instead:

    `lib/citygl`'s city-free test finds them by forbidding names; the pipeline
    has no such test, so they are enumerated here by hand.

This is that test. Run it:

    python3 pipeline/scripts/citymap/check_city_free.py

Exit code is non-zero if anything in `citymap/` names a city, a city's dataset,
a city's data path or a city's landmark. It is meant to be cheap enough to run
on every change and blunt enough that the only way to satisfy it is to move the
thing out or take it as an argument.

── COMMENTS ARE NOT CODE ─────────────────────────────────────────────────────
The frontend test learned this on its first run — it failed on the file whose
doc comment STATES the rule. A file explaining the rule is not a file breaking
it. So docstrings and `#` comments are stripped before the search, and what is
left is what actually executes. This module is itself the extreme case: the
patterns below are city names, in code, and it excludes itself by name.

── WHAT THIS TEST CANNOT SEE, AND IT IS THE BIGGER HALF ──────────────────────
It cannot see a number that is really a name. A snap radius that is half one
city's street standard, a march ceiling that is one city's relief, a tiling box
that is one city's diameter, a base year that is one city's founding: none of
them carries a city token and every one of them degrades silently rather than
failing. ADR-0012 §2.2 lists four found by hand and one found by this kind of
test only because the test forced somebody to ask the question.

So passing this is a floor, not a result. The defence against the other half is
`pipeline/scripts/us_sf_city/derive/` — the instrument beside the number — and
there is no automating that.
"""
from __future__ import annotations

import pathlib
import re
import sys

HERE = pathlib.Path(__file__).resolve().parent

# This file only. It is the one place in the package where a city's name is the
# subject rather than a leak.
SELF = {"check_city_free.py"}

# A city's name, its data path, its publisher's dataset id, or a place only one
# city has. Kept in the same spirit as the frontend's list: short, blunt, and
# extended when a leak gets through rather than pre-emptively.
FORBIDDEN: list[tuple[re.Pattern, str]] = [
    (re.compile(r"\bsan\s*francisco\b", re.I), "a city's name"),
    (re.compile(r"\b(?:marseille|recife|paris)\b", re.I), "a city's name"),
    (re.compile(r"\bsf\b(?!x)", re.I), "a city's short name"),
    (re.compile(r"/data/[a-z]{2}/[a-z-]+/city\b", re.I), "a city's data path"),
    (re.compile(r"\b(?:ferry building|golden gate|market st|treasure island"
                r"|embarcadero|coit tower)\b", re.I), "a landmark"),
    (re.compile(r"\bdatasf\b|\bsfbos\b|\bsfgov\b", re.I), "a city's publisher"),
    (re.compile(r"\b[a-z0-9]{4}-[a-z0-9]{4}\b"), "a Socrata dataset id"),
    (re.compile(r"\bhttps?://"), "a URL — a source belongs to the city that has it"),
    (re.compile(r"scratchpad|public/data"), "a path into one city's tree"),
]

# Python's comment and string-literal syntax, stripped in that order so a `#`
# inside a docstring does not end a line that is not a comment.
_DOCSTR = re.compile(r'("""|\'\'\')(?:.|\n)*?\1')
_COMMENT = re.compile(r"#[^\n]*")


def code(src: str) -> str:
    return _COMMENT.sub(" ", _DOCSTR.sub(" ", src))


def main() -> int:
    files = sorted(p for p in HERE.rglob("*.py")
                   if "__pycache__" not in p.parts and p.name not in SELF)
    if not files:
        print("  FAIL — nothing to check; is the package empty?")
        return 1

    bad = 0
    for p in files:
        hits = []
        src = code(p.read_text())
        for rx, why in FORBIDDEN:
            m = rx.search(src)
            if m:
                line = src[:m.start()].count("\n") + 1
                hits.append(f"line {line}: {why}: {m.group(0)!r}")
        rel = p.relative_to(HERE)
        if hits:
            bad += 1
            print(f"  FAIL {rel}")
            for h in hits:
                print(f"         {h}")
            print("         take it as an argument, or move it to the city's own directory.")
        else:
            print(f"  ok   {rel}")

    n = len(files)
    if bad:
        print(f"\n  FAIL — {bad} of {n} modules name a city.")
        return 1
    print(f"\n  PASS — {n} modules, none of them knows which city it is in.\n"
          "  (A floor, not a result: this cannot see a number that is really a\n"
          "   name. See the module docstring.)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
