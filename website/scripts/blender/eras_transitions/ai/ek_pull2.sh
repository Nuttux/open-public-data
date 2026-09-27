#!/bin/bash
# ek_pull2.sh <label>: every 90 s, copy the finished tiles (to ek2/tiles/out) and the pod's log (to ek2/tiles/log_<label>.txt)
# from the pod, incrementally; ends when the log says STOPPED or the pod is unreachable 10 times in a row.
E=/Volumes/DANI-SD-DRIVE2/transitions/ek2; L=$1; export TPA=$L; cd /Users/daniel/code/qipu-render-work/eras2/transitions/ai; bad=0
mkdir -p $E/tiles $E/pull_tmp_$L
while :; do
  if ./tssh.sh "cd /root/ek && { [ -f .last_pull ] || touch -d 2000-01-01 .last_pull; } && touch .last_pull_next && tar -cf - log.txt \$(find out -newer .last_pull -name 't_*.jpg' -size +4k 2>/dev/null) 2>/dev/null" > $E/pull_$L.tar 2>/dev/null; then
    rm -rf $E/pull_tmp_$L/*; tar -xf $E/pull_$L.tar -C $E/pull_tmp_$L 2>/dev/null && { mv $E/pull_tmp_$L/log.txt $E/tiles/log_$L.txt; [ -d $E/pull_tmp_$L/out ] && rsync -a $E/pull_tmp_$L/out/ $E/tiles/out/; ./tssh.sh "mv /root/ek/.last_pull_next /root/ek/.last_pull" >/dev/null 2>&1; }; bad=0
    grep -q STOPPED $E/tiles/log_$L.txt 2>/dev/null && { echo "$(date +%T) STOPPED seen"; break; }
  else bad=$((bad + 1)); [ $bad -ge 10 ] && { echo "$(date +%T) pod unreachable"; break; }; fi
  sleep 90
done
