#!/bin/zsh
# ek_finish.sh: when a pod has done its job files, pull the last tiles, terminate it and log its cost; when both are done:
# quilt the era keys v2, rebuild the transitions on them (Embarcadero chain + hero -> the film; the whole-pilot K* pass -> the
# viewer layers tr2). Log: /Volumes/DANI-SD-DRIVE2/transitions/ek2/finish.log
E=/Volumes/DANI-SD-DRIVE2/transitions/ek2; A=/Users/daniel/code/qipu-render-work/eras2/transitions/ai; T=/Users/daniel/code/qipu-render-work/eras2/transitions
CL=/Users/daniel/code/qipu-render-work/cloud; F=/Volumes/DANI-SD-DRIVE2/transitions/film
log() { echo "$(date '+%H:%M:%S') $*"; }
finish_pod() {   # <label> <last job file>
  local L=$1 J=$2 P=$(cat $A/pod_id_$1)
  until grep -q "JOBS_DONE $J" $E/tiles/log_$L.txt 2>/dev/null; do sleep 60; done
  log "$L: $J done; final pull"; sleep 100          # (the pull loop runs every 90 s)
  TPA=$L $A/tssh.sh "touch /root/ek/STOP" >/dev/null 2>&1; sleep 100
  local n_pod=$(TPA=$L $A/tssh.sh "find /root/ek/out -name 't_*.jpg' | wc -l" 2>/dev/null | tr -d ' ')
  log "$L: pod has $n_pod tiles; local total $(find $E/tiles/out -name 't_*.jpg' | wc -l | tr -d ' ')"
  pkill -f "ek_pull2.sh $L"; TPA=$L $A/tssh.sh "cd /root/ek && tar -cf - out log.txt" > $E/final_$L.tar 2>/dev/null && mkdir -p $E/final_$L && tar -xf $E/final_$L.tar -C $E/final_$L 2>/dev/null \
    && rsync -a $E/final_$L/out/ $E/tiles/out/ && cp $E/final_$L/log.txt $E/tiles/log_$L.txt && rm -rf $E/final_$L $E/final_$L.tar
  python3 $CL/pod.py terminate $P > /dev/null; python3 $CL/pod.py log $P "transitions ek2 $L: era keys v2 (FIX-v2 prompts, CPU noise), $(grep -c '"out"' $E/tiles/log_$L.txt) tiles"
  log "$L: terminated + logged ($P)"
}
finish_pod trek1 10_rest.txt &
finish_pod trek2 10_rest_b.txt &
[ -f $A/pod_id_trek3 ] && finish_pod trek3 20_share.txt &
wait
log "tiles: $(find $E/tiles/out -name 't_*.jpg' | wc -l | tr -d ' ') (expected 3772)"
cd $T
nice python3 ai/ek_quilt.py $E 2>&1 | grep -E "tiles|Error|Trace"
log "quilted"
export TR_KEYS=ek2
./run_chain.sh 6560,3500,11240,7000 /Volumes/DANI-SD-DRIVE2/transitions/emb 2>&1 | grep -E "chain|Error|Trace"
nice python3 prep.py 2006 now 5800,4700,10240,7700 /Volumes/DANI-SD-DRIVE2/transitions/hero_2006_now.pkl 2>&1 | grep -E "saved /|Error|Trace"
log "chain + hero prep done"
for s in s1_1938_1959 s2_1959_1985 s3_1985_2006; do nice python3 render.py /Volumes/DANI-SD-DRIVE2/transitions/emb/p_${s#s?_}.pkl $F/plan_$s.json 2>&1 | tail -1; done
nice python3 render.py /Volumes/DANI-SD-DRIVE2/transitions/hero_2006_now.pkl $F/plan_s4_2006_today.json 2>&1 | tail -1
cd $F && ffmpeg -v error -y -f concat -safe 0 -i list.txt -c copy pilot_transitions_1938_today_ek2.mp4 && python3 $T/tools/concat_timing.py pilot_transitions_1938_today_ek2.timing.json s1_1938_1959.mp4 s2_1959_1985.mp4 s3_1985_2006.mp4 s4_2006_today.mp4
log "FILM_EK2_DONE"
cd $T && nice python3 kstar_pilot.py /Volumes/DANI-SD-DRIVE2/transitions/kstar_ek2 2 2>&1 | grep -E "FAILED|KSTAR"
log "kstar ek2 done"
nice python3 build_pyr_tr.py /Volumes/DANI-SD-DRIVE2/transitions/kstar_ek2 tr2 2>&1 | tail -2
log "EK_FINISH_DONE"
