#!/bin/sh
# MEMORY GUARD — so a render can never take the laptop down again (it did,
# 2026-09-24 00:10, "128 GB"). Every 5 s, the biggest Blender is stopped (TERM,
# then KILL) and it is written down in memguard.log when:
#   · its own footprint (top MEM: resident + compressed + its Metal buffers — a
#     normal frame shows 34-46 GB on this unified-memory Mac) passes 58 GB, or
#   · the Mac's free + inactive + purgeable memory falls under 3 GB.
# A render lost is minutes; a crash is the night.
W=/Users/daniel/code/qipu-render-work
tomb() { case "$1" in *G) echo "${1%G}" | awk '{printf "%d", $1*1024}';; *M) echo "${1%M}" | awk '{printf "%d", $1}';; *K) echo 0;; *) echo 0;; esac; }
while :; do
  a=$(vm_stat | awk '/Pages free/ {f=$3} /Pages inactive/ {i=$3} /Pages purgeable/ {p=$3} END {printf "%d", (f+i+p)*16384/1e6}')
  row=$(top -l 1 -o mem -stats pid,command,mem -n 40 2>/dev/null | awk '$2 ~ /Blender/ {print $1, $3; exit}')
  if [ -n "$row" ]; then
    pid=${row%% *}; mb=$(tomb "${row#* }")
    if [ "$mb" -gt 58000 ] || [ "$a" -lt 3000 ]; then
      echo "$(date '+%m-%d %H:%M:%S') Blender $pid at ${mb} MB, Mac available ${a} MB -> stopped: $(ps -o command= -p $pid | cut -c1-170)" >> $W/memguard.log
      kill -TERM $pid 2>/dev/null; sleep 5; kill -KILL $pid 2>/dev/null
    fi
  fi
  sleep 5
done
