"""A number that carries its own derivation, and one that admits it has none.

── THE PROBLEM THIS IS FOR, STATED BY ADR-0012 §2.2 ──────────────────────────
A lexical test finds a city's NAME. It cannot find a number that is really a
name — a snap radius that is half one city's street standard, a tiling box that
is one city's diameter, a base year that is one city's founding. Those carry no
city token, no grep finds them, and **they degrade silently rather than failing.**
Copying them to a second city is free and wrong.

The defence is not a test. It is keeping the INSTRUMENT beside the NUMBER, so
the next city re-runs the measurement instead of inheriting the result:

    A constant re-expressed as a derivation from the city's own published data
    ports for free. A constant re-measured per city ports for the cost of a
    harness. A constant copied does not port at all — it just stops being true
    quietly.

── WHAT THIS MODULE IS, AND HOW SMALL IT IS ─────────────────────────────────
Two `float`/`int` subclasses and an audit. Nothing else.

    Z = Measured(1.55, name="LOD_Z0",
                 harness="derive/lod_probe.py",
                 method="the zoom at which the median building reaches 1.6 px")

`Z` IS 1.55 EVERYWHERE. It compares, multiplies, indexes and — the property the
whole design turns on — **serialises through `json` byte for byte as the bare
number**, because `json` formats floats with `float.__repr__` and ints with
`int.__repr__`, both of which ignore the subclass. Annotating a constant
therefore cannot change a published byte. That was verified before anything was
annotated, and it is the reason this is a wrapper rather than a comment.

    B = Declared(1849, name="bldg.yr base",
                 why="one byte offset by one city's founding; nothing measures it")

`Declared` is for the other kind, and it is the more useful of the two. The
repository has a list of numbers with **no derivation anywhere** —
`derive/README.md` enumerates seven. Their absence is currently invisible: they
look exactly like the measured ones. `Declared` makes the absence a fact the
audit prints, so nobody promotes one into a portable core by mistake.

── THE AUDIT ────────────────────────────────────────────────────────────────
`audit()` walks what has been registered and checks that **every harness a
`Measured` names is a file that exists.** That is the whole check, and it is
deliberately the only one: it catches the failure that actually happens, which
is a harness being deleted, renamed or never written while the number it
justified stays in the build looking justified.

It cannot check that the harness still MEASURES the thing, and it says so rather
than implying otherwise.

NO REGISTRY OF CITIES, NO CONFIGURATION. Registration is a side effect of
constructing the value, and the audit is a function over what got constructed.
"""
from __future__ import annotations

import pathlib

# Every annotated constant, in construction order. Populated as a side effect of
# building one; nothing has to remember to register.
REGISTRY: list["_Provenance"] = []


class _Provenance:
    """The fields both kinds carry. Not instantiated on its own."""

    name: str
    harness: str | None
    method: str | None
    why: str | None

    def _init(self, *, name, harness=None, method=None, why=None):
        self.name = name
        self.harness = harness
        self.method = method
        self.why = why
        REGISTRY.append(self)
        return self

    @property
    def is_measured(self) -> bool:
        return self.harness is not None

    def describe(self) -> str:
        if self.harness:
            return f"{self.name} = {self!s}   <- {self.harness}   {self.method or ''}"
        return f"{self.name} = {self!s}   <- NO DERIVATION   {self.why or ''}"


# No `__slots__`: int and float do not allow a non-empty one on a subtype, and
# a handful of annotated constants per city is not a memory question.
class _MeasuredFloat(float, _Provenance):
    pass


class _MeasuredInt(int, _Provenance):
    pass


def _wrap(value, **kw):
    cls = _MeasuredInt if isinstance(value, int) and not isinstance(value, bool) \
        else _MeasuredFloat
    return cls(value)._init(**kw)


def Measured(value, *, name: str, harness: str, method: str):
    """A number produced by an instrument that still exists.

    `harness` is a path RELATIVE TO THE DIRECTORY THAT DECLARES THE CONSTANT, so
    a city's constants point at that city's own harnesses and the audit resolves
    them against the declaring file.
    """
    return _wrap(value, name=name, harness=harness, method=method)


def Declared(value, *, name: str, why: str):
    """A number nothing measures. `why` says what it actually is."""
    return _wrap(value, name=name, why=why)


def audit(base: pathlib.Path, log=print) -> bool:
    """Check every registered `Measured` names a harness file that exists.

    `base` is the directory the constants' harness paths are relative to.
    Returns True when every one resolves. `Declared` values are printed, never
    failed — the point of them is that there is nothing to resolve.
    """
    base = pathlib.Path(base)
    measured = [m for m in REGISTRY if m.is_measured]
    declared = [m for m in REGISTRY if not m.is_measured]
    missing = []

    log(f"  {len(measured)} measured, {len(declared)} declared, "
        f"harness paths resolved against {base}\n")
    log("  MEASURED — the instrument exists and the next city runs it")
    for m in measured:
        p = base / m.harness
        mark = "ok  " if p.exists() else "MISS"
        if not p.exists():
            missing.append(m)
        log(f"    {mark} {m.name:<22} {str(m):<10} {m.harness}")
        if m.method:
            log(f"         {m.method}")

    if declared:
        log("\n  DECLARED — NOTHING MEASURES THESE. They may not be promoted into")
        log("  a portable core: there is nothing for a second city to re-run.")
        for m in declared:
            log(f"    --   {m.name:<22} {str(m):<10} {m.why}")

    if missing:
        log(f"\n  FAIL — {len(missing)} constant(s) name a harness that is not there:")
        for m in missing:
            log(f"    {m.name}: {m.harness}")
        return False
    log("\n  PASS — every measured constant's instrument is on disk.")
    log("  (It does not check that the instrument still measures the thing;")
    log("   nothing can. It catches the harness that was deleted or never written.)")
    return True
