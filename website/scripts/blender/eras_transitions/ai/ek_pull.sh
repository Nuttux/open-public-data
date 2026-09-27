#!/bin/bash
# ek_pull.sh <label>: every 90 s, copy the finished tiles and the log from the pod to ek2/tiles (incremental); ends when the pod's
# log says STOPPED or the pod is gone for 10 tries.
E=/Volumes/DANI-SD-DRIVE2/transitions/ek2; L=$1; export TPA=$L; cd /Users/daniel/code/qipu-render-work/eras2/transitions/ai; bad=0; mkdir -p $E/tiles
while :; do
  if ./tssh.sh "cd /root/ek && { [ -f .last_pull ] || touch -d 2000-01-01 .last_pull; } && touch .last_pull_next && tar -cf - log.txt \$(find out -newer .last_pull -name 't_*.jpg' 2>/dev/null) 2>/dev/null" > $E/pull_$L.tar 2>/dev/null; then
    tar -xf $E/pull_$L.tar -C $E/tiles 2>/dev/null && ./tssh.sh "mv /root/ek/.last_pull_next /root/ek/.last_pull" >/dev/null 2>&1; bad=0
    grep -q STOPPED $E/tiles/log.txt 2>/dev/null && { echo "$(date +%T) STOPPED seen"; break; }
  else bad=$((bad + 1)); [ $bad -ge 10 ] && { echo "$(date +%T) pod unreachable"; break; }; fi
  sleep 90
done
