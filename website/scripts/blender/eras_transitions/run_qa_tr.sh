#!/bin/zsh
# the consistent keys as viewer layers (tag tr) + the QA tool's random-tile audit against the published pilot3 layers
cd /Users/daniel/code/qipu-render-work
python3 eras2/transitions/build_pyr_tr.py /Volumes/DANI-SD-DRIVE2/transitions/kstar /Volumes/DANI-SD-DRIVE2/transitions/pyr tr || exit 1
for y in ${@:-1985}; do
  python3 ai/pilot/qa_audit.py sample eras_tr_$y cloud/ckpt_era${y}_tr/tiles era$y --eras cloud/viewer/eras_tr.json \
      --compare pilot3=cloud/ckpt_era${y}_pilot3/tiles --compare-eras cloud/viewer/eras_pilot3.json --seed 1926 2>&1 | tail -5
done
echo QA_TR_DONE
