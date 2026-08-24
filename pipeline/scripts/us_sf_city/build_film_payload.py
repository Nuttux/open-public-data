#!/usr/bin/env python3
"""The film's own payload: ten shots, their subjects, and 2,051 accepted streets.

    python3 pipeline/scripts/us_sf_city/build_film_payload.py
        -> website/public/data/us/sf/city/film/film.json

Deterministic: same input bytes give byte-identical output. Nothing here reads
the clock, iterates a set, or depends on the working directory.

WHAT IS AND IS NOT DECIDED HERE
-------------------------------
Nothing in this file writes a line of copy, a date, a coordinate or a citation.
Every one of those is COPIED out of `scratchpad/sf-city-anim/film/film-data.js`,
which `film/build_film.py` refuses to write unless every line on screen is a
headline or a verbatim run of a quote that already exists in `film/entries/` at
the volume and leaf the shot cites. That gate found a wrong citation on its first
run — camera.json had the Bay Bridge on volume 22 leaf 277, which is a 1927 beat
about a supervisor reading a newspaper into the record, not the 1936 one — so the
gate is load-bearing and this script stays downstream of it.

WHAT THIS SCRIPT DOES ADD, and it is arithmetic only:

  · lon/lat -> world metres, through the manifest's OWN projection constants,
    so the film's geometry and the map's geometry cannot drift apart. The
    conversion is `((lon-lon0)*mpd*cosl, (lat-lat0)*mpd)` — `_srcload`'s
    `CITY.proj`, which `encode_city_chunks.py` copies into `manifest.proj`.
  · the subject list: for every entity a shot names, the name, the family, the
    position and the precision radius out of `gen/decisions-data.js`, which is
    `gen/decisions_from_entries.py`'s output and carries no hand-typed
    coordinate anywhere in it.
  · the two footprint indices the film raises as buildings. City Hall's comes
    from `base/heroes.json` (`b`), which is `marks/join_fp.py`'s published-parcel
    join; the 1917 Main Library's comes from `form/form-data.js` (`lm`), which is
    the record's own corner description resolved to APN 0353001 and carried with
    its citation. Neither is computed here and neither is guessed.

The acceptance geometry is `film/out/accept-lines.json`: 2,051 published
centreline segments, each lit in the year the Board voted to accept it, each
carrying the exact BookReader leaf of that vote.

THE FILM IS NOT A CHUNK, and that is deliberate. `encode_city_chunks.py`'s
`main()` clears exactly the six directories it writes; `film/` is not one of
them, for the same reason `blocks/` is not — an encoder that `rmtree`s a
directory it does not own has already deleted 39 MB once on this project.
"""
from __future__ import annotations

import json
import pathlib
import re
import sys

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))

from _srcload import MOCK, ROOT, load  # noqa: E402

OUT = ROOT / "website" / "public" / "data" / "us" / "sf" / "city" / "film"

# The film raises exactly two entities as their own footprint. Both indices are
# published joins made elsewhere and carried here; see the header.
HERO_KEY_FOR = {"new-city-hall": "cityhall"}


def _read_assignment(rel: str, var: str) -> object:
    """`window.X = <json>` or `const X = <json>` at <MOCK>/<rel>.

    `_srcload.load` requires the assignment to be the first thing in the file.
    Two of the payloads this script reads carry a generated-by comment above it,
    so the assignment is located rather than assumed — and it is still parsed as
    strict JSON, never executed.
    """
    text = (MOCK / rel).read_text()
    m = re.search(rf"(?:window\.|const\s+){re.escape(var)}\s*=\s*([\[{{])", text)
    if not m:
        raise ValueError(f"{rel}: no assignment to {var}")
    value, _ = json.JSONDecoder().raw_decode(text[m.start(1):])
    return value


def main() -> None:
    proj = load("gen/city-data.js", "CITY")["proj"]
    kx = proj["mpd"] * proj["cosl"]
    ky = proj["mpd"]
    lon0, lat0 = proj["lon0"], proj["lat0"]

    def to_m(lon: float, lat: float) -> tuple[float, float]:
        return ((lon - lon0) * kx, (lat - lat0) * ky)

    def to_dm(lon: float, lat: float) -> tuple[int, int]:
        """World DECIMETRES, the same integer store `parks` uses for its rings."""
        x, y = to_m(lon, lat)
        return (round(x * 10), round(y * 10))

    filmd = _read_assignment("film/film-data.js", "FILMD")
    assert isinstance(filmd, dict)
    decisions = _read_assignment("gen/decisions-data.js", "DECISIONS")
    assert isinstance(decisions, list)
    form = _read_assignment("form/form-data.js", "FORM")
    assert isinstance(form, dict)
    heroes = json.loads(
        (ROOT / "website" / "public" / "data" / "us" / "sf" / "city"
         / "base" / "heroes.json").read_text()
    )

    by_id = {d["id"]: d for d in decisions}
    hero_bi = {h["k"]: h["b"] for h in heroes["heroes"]}

    # ── the shots ───────────────────────────────────────────────────────────
    # Copied field for field. The one thing added is `wx`/`wy`: the target in
    # world metres, so the camera rails never have to carry a trig call.
    shots = []
    wanted: set[str] = set()
    for s in filmd["shots"]:
        out = dict(s)
        if s.get("lon") is not None:
            wx, wy = to_m(s["lon"], s["lat"])
            out["wx"] = round(wx, 3)
            out["wy"] = round(wy, 3)
        for key in ("cite", "build", "build2"):
            ent = (s.get(key) or {}).get("entity")
            if ent:
                wanted.add(ent)
        b2 = s.get("build2") or {}
        if b2.get("cite", {}).get("entity"):
            wanted.add(b2["cite"]["entity"])
        if b2.get("ll"):
            # the Bay Bridge west span, out of the same published centreline
            # file the accepted streets come from
            out["build2"] = dict(b2)
            out["build2"]["w"] = [
                [list(to_dm(c[0], c[1])) for c in line] for line in b2["ll"]
            ]
            out["build2"].pop("ll", None)
        shots.append(out)

    # ── the subjects ────────────────────────────────────────────────────────
    ents = {}
    for eid in sorted(wanted):
        d = by_id.get(eid)
        if d is None:
            raise ValueError(f"the film names {eid} and decisions-data.js has no such entity")
        row: dict[str, object] = {"n": d["n"], "f": d["f"], "y": d["y"]}
        if d.get("ll"):
            wx, wy = to_m(d["ll"][0], d["ll"][1])
            row["wx"] = round(wx, 3)
            row["wy"] = round(wy, 3)
            row["lon"] = d["ll"][0]
            row["lat"] = d["ll"][1]
        if d.get("rad") is not None:
            row["radM"] = d["rad"]
        if d.get("prec"):
            row["prec"] = d["prec"]
        # the published footprint, where a published join reached one
        hk = HERO_KEY_FOR.get(eid)
        if hk and hk in hero_bi:
            row["bi"] = hero_bi[hk]
            row["biBy"] = "the landmark register's own parcel join (marks/join_fp.py)"
        elif eid in form.get("lm", {}):
            lm = form["lm"][eid]
            row["bi"] = lm["i"]
            row["biBy"] = lm["how"]
            row["biCite"] = lm["cite"]
        ents[eid] = row

    # ── the accepted streets ────────────────────────────────────────────────
    # Sorted by year, so "everything accepted by 1930" is one contiguous run and
    # the year index is two integers rather than a filter.
    accepted = json.loads((MOCK / "film" / "out" / "accept-lines.json").read_text())
    accepted.sort(key=lambda r: (r["y"], r["cnn"]))
    vols = sorted({r["v"] for r in accepted})
    vol_ix = {v: i for i, v in enumerate(vols)}

    ys, vi, leaf, off, xs, yss = [], [], [], [0], [], []
    for r in accepted:
        ys.append(r["y"])
        vi.append(vol_ix[r["v"]])
        leaf.append(r["leaf"])
        for c in r["ll"]:
            x, y = to_dm(c[0], c[1])
            xs.append(x)
            yss.append(y)
        off.append(len(xs))

    payload = {
        "meta": {
            "generated_by": "pipeline/scripts/us_sf_city/build_film_payload.py",
            "copy": "Every line of copy and every citation here is copied verbatim "
                    "from scratchpad/sf-city-anim/film/film-data.js, which "
                    "film/build_film.py refuses to write unless the line is a "
                    "headline or a verbatim run of a quote that already exists in "
                    "film/entries/ at the volume and leaf the shot cites.",
            "geometry": "Accepted centrelines: DataSF street centrelines, lit in the "
                        "year the Board of Supervisors voted acceptance, resolved by "
                        "scratchpad/sf-city-anim/film/streets_accept.py from the "
                        "Journal of Proceedings. 2,051 of 16,554 centrelines carry "
                        "such a vote; the rest carry no date and are not in this file.",
            "world": "x and y are world DECIMETRES in the map's own frame — "
                     "((lon - proj.lon0) * proj.mpd * proj.cosl, "
                     "(lat - proj.lat0) * proj.mpd), times ten. The same "
                     "constants manifest.proj publishes.",
            "streets_note": "The corpus opens in April 1906, so every street accepted "
                            "before the fire was accepted before the record starts and "
                            "downtown stays dark. 1,826 of the 2,051 are lit by 1930 "
                            "and the last lands in 1947. Thirteen years in the span "
                            "have no ingested volume, so the curve sits flat through "
                            "them: that is the sweep, not the city.",
        },
        "runtime": {
            "titleMs": filmd["runtime"]["title_card_ms"],
            "endMs": filmd["runtime"]["end_card_ms"],
            "shotsMs": filmd["runtime"]["shots_ms"],
            "totalMs": filmd["runtime"]["total_ms"],
        },
        "title": filmd["title"],
        "end": filmd["end"],
        "shots": shots,
        "ents": ents,
        "st": {
            "vols": vols,
            "y": ys,
            "vi": vi,
            "leaf": leaf,
            "off": off,
            "x": xs,
            "yv": yss,
            "n": len(accepted),
        },
    }

    OUT.mkdir(parents=True, exist_ok=True)
    path = OUT / "film.json"
    path.write_text(json.dumps(payload, separators=(",", ":"), sort_keys=False))
    print(f"{path}: {path.stat().st_size:,} bytes · {len(shots)} shots · "
          f"{len(ents)} subjects · {len(accepted):,} accepted segments · "
          f"{len(xs):,} vertices · {len(vols)} volumes")


if __name__ == "__main__":
    main()
