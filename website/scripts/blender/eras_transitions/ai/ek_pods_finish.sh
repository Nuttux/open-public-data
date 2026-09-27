#!/bin/zsh
# ek_pods_finish.sh: PODS ONLY (no Mac-heavy step). For each transitions pod (trek1, trek2): when its last job file is done (JOBS_DONE
# in the pulled log) OR the pod is no longer RUNNING (watchdog stop), final pull, terminate, log the cost in cloud/COSTS.md.
E=/Volumes/DANI-SD-DRIVE2/transitions/ek2; A=/Users/daniel/code/qipu-render-work/eras2/transitions/ai; CL=/Users/daniel/code/qipu-render-work/cloud
log() { echo "$(date '+%H:%M:%S') $*"; }
finish_pod() {   # <label> <last job file>
  local L=$1 J=$2 P=$(cat $A/pod_id_$1)
  while :; do
    grep -q "JOBS_DONE $J" $E/tiles/log_$L.txt 2>/dev/null && break
    python3 $CL/pod.py list 2>/dev/null | grep -q "^$P .* RUNNING" || { log "$L: pod not RUNNING any more"; break; }
    sleep 120
  done
  log "$L: finishing"; sleep 100
  TPA=$L $A/tssh.sh "touch /root/ek/STOP" >/dev/null 2>&1; sleep 60
  pkill -f "ek_pull2.sh $L"
  TPA=$L $A/tssh.sh "cd /root/ek && tar -cf - out log.txt" > $E/final_$L.tar 2>/dev/null && mkdir -p $E/final_$L && tar -xf $E/final_$L.tar -C $E/final_$L 2>/dev/null \
    && rsync -a $E/final_$L/out/ $E/tiles/out/ && cp $E/final_$L/log.txt $E/tiles/log_$L.txt; rm -rf $E/final_$L $E/final_$L.tar
  python3 $CL/pod.py terminate $P > /dev/null; python3 $CL/pod.py log $P "transitions ek2 $L: era keys v2 (FIX-v2 prompts, CPU noise, invented-water re-rolls), $(grep -c '"out"' $E/tiles/log_$L.txt) tiles"
  log "$L: terminated + logged ($P); local tiles $(find $E/tiles/out -name 't_*.jpg' | wc -l | tr -d ' ')"
}
finish_pod trek1 10_rest.txt &
finish_pod trek2 10_rest_b.txt &
wait
log "PODS_DONE"
