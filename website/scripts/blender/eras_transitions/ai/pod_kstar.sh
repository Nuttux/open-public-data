#!/bin/bash
# on trcb: K* of the whole pilot on the ek2 keys (fresh) + the slider pyramids tr2
T=/Users/daniel/code/qipu-render-work/eras2/transitions; V=/Volumes/DANI-SD-DRIVE2/transitions
cd $T; unset TR_EK2; export TR_KEYS=ek2; rm -rf $V/kstar_ek2; mkdir -p $V/pyr viewer; [ -e pyr ] || ln -s $V/pyr pyr
python3 kstar_pilot.py $V/kstar_ek2 5 2>&1 | grep -E "FAILED|KSTAR|tile"; echo "$(date +%H:%M:%S) KSTAR_DONE"
python3 build_pyr_tr.py $V/kstar_ek2 tr2 2>&1 | tail -n 2; echo "$(date +%H:%M:%S) PYR_DONE"
