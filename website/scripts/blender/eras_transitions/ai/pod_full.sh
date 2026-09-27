#!/bin/bash
# on trcb: (1) quilt the 4 years' ek2 keys, (2) the Embarcadero chain + hero on them, (3) the film (4 shots + concat), (4) K* of
# the whole pilot + the slider pyramids tr2. Stage markers in /root/full.log
T=/Users/daniel/code/qipu-render-work/eras2/transitions; E=/Volumes/DANI-SD-DRIVE2/transitions/ek2; V=/Volumes/DANI-SD-DRIVE2/transitions
FO=$V/film; F=$V/film2; C=$V/emb2
cd $T; unset TR_EK2; export TR_KEYS=ek2
log(){ echo "$(date +%H:%M:%S) $*"; }
if [ "$1" != "--skip-quilt" ]; then
  for y in 1938 1959 1985 2006; do python3 ai/ek_quilt.py $E $y > $E/quilt_$y.log 2>&1 & done; wait
  tail -q -n 1 $E/quilt_*.log; log QUILTED
fi
mkdir -p $F $C
bash run_chain.sh 6560,3500,11240,7000 $C > $F/chain.log 2>&1 &
python3 prep.py 2006 now 5800,4700,10240,7700 $C/hero_2006_now.pkl > $F/prep_hero.log 2>&1 &
wait; grep -h "saved /\|Error\|Trace" $F/chain.log $F/prep_hero.log | cut -c1-150; ls $C/*.pkl | wc -l; log CHAIN_DONE
for s in s1_1938_1959 s2_1959_1985 s3_1985_2006 s4_2006_today; do
  python3 -c "import json; p=json.load(open('$FO/plan_$s.json')); p['out']='$F/$s'; json.dump(p, open('$F/plan_$s.json','w'))"
done
for s in s1_1938_1959 s2_1959_1985 s3_1985_2006; do python3 render.py $C/p_${s#s?_}.pkl $F/plan_$s.json > $F/render_$s.log 2>&1 & done
python3 render.py $C/hero_2006_now.pkl $F/plan_s4_2006_today.json > $F/render_s4_2006_today.log 2>&1 &
wait; tail -q -n 1 $F/render_*.log
cd $F && printf "file 's1_1938_1959.mp4'\nfile 's2_1959_1985.mp4'\nfile 's3_1985_2006.mp4'\nfile 's4_2006_today.mp4'\n" > list.txt && \
  ffmpeg -v error -y -f concat -safe 0 -i list.txt -c copy pilot_transitions_1938_today_ek2.mp4 && \
  python3 $T/tools/concat_timing.py pilot_transitions_1938_today_ek2.timing.json s1_1938_1959.mp4 s2_1959_1985.mp4 s3_1985_2006.mp4 s4_2006_today.mp4
ls -la $F/pilot_transitions_1938_today_ek2.mp4; log FILM_DONE
[ "$2" = "--no-kstar" ] && exit 0
cd $T; mkdir -p $V/pyr viewer; [ -e pyr ] || ln -s $V/pyr pyr
python3 kstar_pilot.py $V/kstar_ek2 5 2>&1 | grep -E "FAILED|KSTAR|tile"; log KSTAR_DONE
python3 build_pyr_tr.py $V/kstar_ek2 tr2 2>&1 | tail -n 2; log PYR_DONE
