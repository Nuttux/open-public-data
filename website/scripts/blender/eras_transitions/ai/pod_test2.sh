#!/bin/bash
# on trcb: finish testq2 (EK chain fixes a-d) on the ek2q test keys; s3 + s4 videos
cd /Users/daniel/code/qipu-render-work/eras2/transitions
E=/Volumes/DANI-SD-DRIVE2/transitions/ek2; T=$E/testq2; F=/Volumes/DANI-SD-DRIVE2/transitions/film
export TR_KEYS=ek2 TR_EK2=/Volumes/DANI-SD-DRIVE2/transitions/ek2q
rm -f $T/*.pkl $T/K_1985.npy $T/prep_*.log $T/render_*.log
python3 prep.py 2006 now 6560,3500,11240,7000 $T/p_2006_now.pkl - $T/K_2006.npy > $T/prep_s4w.log 2>&1 &
python3 prep.py 2006 now 5800,4700,10240,7700 $T/hero_2006_now.pkl > $T/prep_hero.log 2>&1 &
wait
python3 prep.py 1985 2006 6560,3500,11240,7000 $T/p_1985_2006.pkl $T/K_2006.npy $T/K_1985.npy > $T/prep_s3.log 2>&1 &
wait; tail -n 1 $T/prep_s3.log $T/prep_hero.log; grep -q 'saved /' $T/prep_s3.log && grep -q 'saved /' $T/prep_hero.log || { echo PREP_FAILED; exit 1; }
for s in s3_1985_2006 s4_2006_today; do
  python3 -c "import json; p=json.load(open('$F/plan_$s.json')); p['out']='$T/$s'; json.dump(p, open('$T/plan_$s.json','w'))"
done
python3 render.py $T/p_1985_2006.pkl $T/plan_s3_1985_2006.json > $T/render_s3.log 2>&1 &
python3 render.py $T/hero_2006_now.pkl $T/plan_s4_2006_today.json > $T/render_s4.log 2>&1 &
wait; tail -n 1 $T/render_s3.log $T/render_s4.log
echo TEST_DONE
