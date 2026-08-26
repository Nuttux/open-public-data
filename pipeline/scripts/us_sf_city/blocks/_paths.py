"""Where the code is, and where the data is — the one place they are told apart.

THE REASON THIS FILE EXISTS. Every module in this directory used to compute its
inputs from its own location: `HERE/cache`, `HERE/out`, `HERE/../geo/cache`. That
is correct only while the code sits inside the data tree, and the data tree —
`scratchpad/sf-city-anim/`, 11 GB of intermediates — is not in git and never
should be. So the code could not be committed without breaking, and the map could
not be rebuilt from a clone. ADR-0012 §4.7 states the consequence plainly: *the
SF map cannot currently be rebuilt from the repository.*

The split is one variable. **Code lives in the repo. Data lives wherever
`CITY_DATA` says**, defaulting to the tree this was developed against so nothing
a running build does changes today.

    CITY_DATA        the city's intermediate tree      (default: <repo>/scratchpad/sf-city-anim)
    BLOCKS_CACHE     the record corpus + derived caches (default: $CITY_DATA/blocks/cache)
    BLOCKS_OUT       where the index is written         (default: $CITY_DATA/blocks/out)
    BLOCKS_ITEMS     the located-item corpus            (default: $BLOCKS_CACHE/items.jsonl)
    BLOCKS_JOINED    the join dump verify_geo reads     (default: $BLOCKS_CACHE/joined.json)

`BLOCKS_ITEMS`/`BLOCKS_OUT`/`BLOCKS_JOINED` predate this file and keep their exact
meaning: they are what lets a build run BESIDE the published one and be diffed,
instead of overwriting it to find out what a change did. That is the control
pattern every gate in MINUTES.md is measured with, and it is the reason this move
could be proved rather than asserted.

PORTABILITY NOTE. `CITY_DATA` is the whole of what a second city has to redirect
in this directory. It is not a config system and there is nothing to register:
one environment variable, five derived paths, and the fork is the vocabulary in
`build_index.py`, not the plumbing here.
"""
import os

HERE = os.path.dirname(os.path.abspath(__file__))
# <repo>/pipeline/scripts/us_sf_city/blocks -> <repo>
REPO = os.path.abspath(os.path.join(HERE, "..", "..", "..", ".."))

# The city's intermediate tree. Not in git: 11 GB of DEM tiles, hOCR gzips,
# parcel dumps and mock payloads. Committing it is not the fix; naming it is.
ANIM = os.path.abspath(os.environ.get("CITY_DATA")
                       or os.path.join(REPO, "scratchpad", "sf-city-anim"))

GEO = os.path.join(ANIM, "geo", "cache")          # DataSF geometry, fetched
IA = os.path.join(GEO, "ia")                      # archive.org hOCR, fetched
VOLS = os.path.join(ANIM, "vols.txt")             # the volume list the sweep walks
MIN = os.path.join(REPO, "pipeline", "minutes")   # the record adapters — IN GIT

CACHE = os.environ.get("BLOCKS_CACHE") or os.path.join(ANIM, "blocks", "cache")
OUT = os.environ.get("BLOCKS_OUT") or os.path.join(ANIM, "blocks", "out")
ITEMS = os.environ.get("BLOCKS_ITEMS") or os.path.join(CACHE, "items.jsonl")
JOINED = os.environ.get("BLOCKS_JOINED") or os.path.join(CACHE, "joined.json")
