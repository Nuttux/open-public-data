#!/bin/sh
# citysnap.sh <city> <name> [commit]  — a frozen snapshot of these scripts for
# ANOTHER city than San Francisco (mksnap.sh stays SF's).
#   The scripts read their data at absolute paths under qipu-render-work/ (SF's
#   layers: landmarks, veg, water, newbuildings…) and the engine chunks under
#   public/data/us/sf/city. In the snapshot every such path is re-pointed at the
#   city's own folder qipu-render-work/cities/<city>/ (its `engine/` holds its
#   qc/1 chunks): a layer the city has not built yet is simply missing there,
#   and the scripts skip it — SF's files are never read for another city.
#   cities/<city>/city.json `env` (CITY, CITY_REF, the layer switches…) is
#   written at the top of hq_city.py as defaults; an explicit env still wins.
#   The .sh files are not re-pointed: gpuq.sh / memguard.sh keep the ONE shared
#   GPU queue of this Mac (a second queue = two Blenders = out of memory).
set -e
CITY=${1:?city}; N=${2:?snapshot name}; C=${3:-HEAD}; shift 2; [ $# -gt 0 ] && shift   # then optional KEY=VAL switches (as mksnap.sh)
REPO=${CITYSNAP_REPO:-$(cd "$(dirname "$0")/../../.." && pwd)}
W=/Users/daniel/code/qipu-render-work; CW=$W/cities/$CITY; S=${SNAP_ROOT:-$CW/snap}/$N   # SNAP_ROOT: a test dir (identity / dry runs)
[ -f $CW/city.json ] || { echo "no $CW/city.json"; exit 1; }
[ -e $S ] && { echo "$S exists"; exit 1; }
mkdir -p $S
(cd $REPO && git archive $C website/scripts/blender) | tar -x -C $S --strip-components=3
# SF data that ships inside the scripts folder
rm -f $S/newb_records.json $S/transit.json $S/skip_gids.json
for f in $S/*.py $S/*.mjs $S/cloud/*.py; do
  [ -f "$f" ] || continue
  case "$f" in */cityconf.py) continue;; esac     # it finds the city from CITY itself
  # work folder FIRST, engine second: the engine's new path is itself under qipu-render-work/, and the
  # other order rewrote it twice (cities/<city>/cities/<city>/engine: terrain_hq, era fell back in silence)
  sed -i '' -e "s#/Users/daniel/code/qipu-render-work/#$CW/#g" \
            -e "s#/Users/daniel/code/opd-render/website/public/data/us/sf/city#$CW/engine#g" "$f"
done
python3 - "$S/hq_city.py" "$CW/city.json" "$@" <<'PY'
import json, sys
p, cj = sys.argv[1], json.load(open(sys.argv[2])); kv = dict(a.split('=', 1) for a in sys.argv[3:])
import ast
sf_only = next(ast.literal_eval(n.value) for n in ast.parse(open(sys.argv[1].rsplit('/', 1)[0] + '/cityconf.py').read()).body
               if isinstance(n, ast.Assign) and getattr(n.targets[0], 'id', '') == 'SF_ONLY')   # SF's own data: off unless city.json env turns it on
env = dict({k: 0 for k in sf_only}, **cj.get('env', {}), CITY=cj['city'], CITY_REF=','.join(repr(float(v)) for v in cj['ref']))
env = dict(env, **kv)   # given switches win
pre = "import os as _os_city\n" + "".join(f"_os_city.environ.setdefault({k!r}, {str(v)!r})\n" for k, v in env.items())
open(p, 'w').write(pre + open(p).read())
PY
python3 -c "import ast,glob; [ast.parse(open(f).read()) for f in glob.glob('$S/*.py')]"
echo "$N = $C ($(cd $REPO && git log --oneline -1 $C | cut -c1-80)) for $CITY" > $S/SNAPSHOT.txt
# anything still pointing at SF's data (should be empty)
grep -rn "qipu-render-work/\|us/sf/city" $S/*.py $S/*.mjs 2>/dev/null | grep -v "$CW" | grep -v "/cityconf.py:" | grep -v "qipu-assets" | cut -c1-160 > $S/SF_PATHS.txt || true
grep -rn "cities/$CITY/cities/" $S/*.py $S/*.mjs 2>/dev/null | cut -c1-160 >> $S/SF_PATHS.txt || true
# every city data path the snapshot reads, and whether it exists (a missing layer is skipped by the scripts: listed, not an error)
grep -ohE "$CW/[A-Za-z0-9_./{}-]+" $S/*.py $S/*.mjs 2>/dev/null | sed -E 's#[{].*##; s#[./]+$##' | sort -u | while read p; do
  [ -e "$p" ] && echo "ok $p" || echo "MISSING $p"; done > $S/CITY_PATHS.txt
echo "$S  ($(du -sh $S | cut -f1)); SF paths left: $(wc -l < $S/SF_PATHS.txt); doubled: $(grep -c "cities/$CITY/cities/" $S/SF_PATHS.txt); city paths missing: $(grep -c ^MISSING $S/CITY_PATHS.txt) of $(wc -l < $S/CITY_PATHS.txt)"
