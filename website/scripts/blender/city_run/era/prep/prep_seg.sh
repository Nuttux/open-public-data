#!/bin/zsh
# prep_seg.sh (qhprep): everything of one segment that needs no painting (needs years/<Ya>, years/<Yb> = ids.py + mosaic.py)
#   zsh prep_seg.sh <Ya> <Yb>   -> seg/<Ya>_<Yb>/in: prisms_w.pkl, Cc_*, structures.json, state.npz (provisional), same.pkl, events.json
set -eu
P=${0:A:h}; WQ=$(python3 -c "import sys; sys.path.insert(0,'$P'); import common; print(common.WQ)"); S=$WQ/seg/$1_$2
python3 $P/seg.py $1 $2
SEG=$1_$2 python3 $P/prep.py > $S/work/prep.log 2>&1 || { tail -5 $S/work/prep.log; exit 1; }
grep "^segment\|^structure\|^NEW\|non-building" $S/work/prep.log
python3 $P/events.py $S/in > $S/work/events.log 2>&1 || { tail -5 $S/work/events.log; exit 1; }
python3 $P/sumev.py $S
