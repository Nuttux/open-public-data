#!/bin/sh
# MEMORY GUARD — so a render can never take the laptop down again (it did,
# 2026-09-24 00:10). Every 5 s: if free + inactive + purgeable memory is under
# 3 GB, or swap is over 92 % full, the biggest Blender is stopped (TERM, then
# KILL) and it is written down in memguard.log. A render lost is minutes; a
# crash is the night.
W=/Users/daniel/code/qipu-render-work
while :; do
  a=$(vm_stat | awk '/Pages free/ {f=$3} /Pages inactive/ {i=$3} /Pages purgeable/ {p=$3} END {printf "%d", (f+i+p)*16384/1e6}')
  sw=$(sysctl -n vm.swapusage | awk '{gsub(/M/,""); t=$3; u=$6; if (t > 0) printf "%d", u*100/t; else print 0}')
  if [ "$a" -lt 3000 ] || [ "$sw" -gt 92 ]; then
    big=$(ps -ax -o pid=,rss=,comm= | awk '/Blender/ {print $2, $1}' | sort -nr | head -1)
    if [ -n "$big" ]; then
      pid=${big#* }; rss=${big%% *}
      echo "$(date '+%m-%d %H:%M:%S') available ${a} MB, swap ${sw}% -> stopping Blender $pid ($((rss / 1000)) MB): $(ps -o command= -p $pid | cut -c1-160)" >> $W/memguard.log
      kill -TERM $pid 2>/dev/null; sleep 5; kill -KILL $pid 2>/dev/null
    fi
  fi
  sleep 5
done
