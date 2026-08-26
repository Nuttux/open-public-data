"""The part of the city map's build that does not know which city it is.

WHY THIS PACKAGE EXISTS, AND WHAT IT IS NOT.

`website/src/lib/citygl/` is the renderer that carries no city, and it is not
modular because somebody meant it to be — it is modular because
`engine-is-city-free.test.ts` fails the build when a city's name appears in it.
ADR-0012 §2.2 records the consequence for the other half of the subsystem:

    `lib/citygl`'s city-free test finds them by forbidding names; the pipeline
    has no such test, so they are enumerated here by hand.

This package is the pipeline's answer to that sentence. It holds the modules
whose behaviour is a function of their arguments and of nothing else, and
`check_city_free.py` is the test that keeps it that way.

THE ONE QUESTION EVERY MODULE HERE HAD TO ANSWER, and it is the question the
contract asks of every line: *is this true of a city, or is this true of San
Francisco?* A chunk container with a CRC is true of a city. A reader that knows
`gen/bldg-data.js` ships `window.BLDG` is true of San Francisco. The first is
here; the second stayed where it was and is named as San Francisco's.

WHAT THIS IS NOT, deliberately: there is no plugin system here, no registry, no
driver interface and no base class awaiting its second implementation. Every
module is functions and plain values. A second city does not *register* with
this package — it imports what it needs and passes its own numbers in. If a
thing turns out to be cheaper forked per city, it is meant to be left forked,
and the reason written down, rather than dragged in here to look symmetrical.

WHAT A LEXICAL TEST CANNOT SEE, said here because the test cannot say it.
`check_city_free.py` forbids a city's *name*. It cannot see the failure mode
ADR-0012 §2.2 is actually about — a number that is really a name, a measurement
of one city wearing no city token at all. A snap radius that is half one city's
street standard passes every grep ever written. The defence against that is not
in this package; it is `pipeline/scripts/us_sf_city/derive/`, where the
instrument that produced each number lives beside the number, so a second city
can re-run the measurement instead of inheriting the result.
"""
