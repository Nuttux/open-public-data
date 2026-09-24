#!/bin/sh
# THE GPU QUEUE. Every render on this Mac:   sh gpuq.sh <label> <command...>
# ONE Blender at a time, and only when the Mac really has the memory free.
# 2026-09-24 00:10: the laptop crashed out of memory. Two renders had been let
# run together on estimates read from their labels (an era test labelled
# "history …" was counted 10 GB and took 21), while other sessions' dev servers
# held ~30 GB. So: one slot, and a MEASURED gate — a job starts only when free +
# inactive + purgeable memory is at least GPU_NEED GB (24). memguard.sh stops
# the biggest render if memory still runs out.
# Order: tickets, quick tests first (0…), long city renders after (1…); the
# oldest ticket goes first.
W=/Users/daniel/code/qipu-render-work
L=$W/.gpu.lock; Q=$W/.gpu.queue; mkdir -p "$Q"
label="$1"; shift
case "$label" in city*) sleep 8;; esac
case "$label" in city*) pri=1;; *) pri=0;; esac
NEED=${GPU_NEED:-24}
# TWO SLOTS FOR SMALL JOBS (24/09 pm): a crop test (BORDER= or PCT=) now builds
# only its crop's scene (a quarter of a frame's buildings; 34 s instead of 66),
# so two of them fit side by side: a small job needs GPU_NEED_SMALL (16) GB
# free and may take the second slot when the first holds another small job. A
# full-frame job ('big') still runs alone. memguard stays the backstop.
kind=big; for a in "$@"; do case "$a" in BORDER=*|PCT=*) kind=small;; esac; done
[ $kind = small ] && NEED=${GPU_NEED_SMALL:-24}     # (a crop peaks at 20-23.5 GB, 24/09 pm)
me="$Q/$pri$(date +%s)$(printf '%06d' $$)_$$"
echo "$label" > "$me"
trap 'rm -f "$me"' EXIT; trap 'rm -f "$me"; exit 1' INT TERM   # a stopped waiter leaves (it used to loop on without a ticket)
avail() { vm_stat | awk '/Pages free/ {f=$3} /Pages inactive/ {i=$3} /Pages purgeable/ {p=$3} /Pages speculative/ {s=$3} END {printf "%d", (f+i+p+s)*16384/1e9}'; }
while :; do
  for t in "$Q"/*; do p=${t##*_}; [ -f "$t" ] && ! kill -0 "$p" 2>/dev/null && rm -f "$t"; done
  for X in "$L" "$W/.gpu.lock2"; do        # a dead owner frees its slot
    o=$(cat "$X/pid" 2>/dev/null); [ -n "$o" ] && ! kill -0 "$o" 2>/dev/null && rm -rf "$X"
  done
  # fairness: after a test, the oldest waiting city frame goes next (1:1; 2:1 left the pass at 4.5 min a frame, 24/09 02:40)
  # (tests first starved the city pass: 39/64 for half an hour, 24/09 00:40)
  first=$(ls "$Q" | sort | head -1)
  if [ "$(cat "$W/.gpu.tests" 2>/dev/null || echo 0)" -ge 1 ]; then
    c=$(ls "$Q" | grep '^1' | sort | head -1); [ -n "$c" ] && first=$c
  fi
  if [ "$Q/$first" = "$me" ] && [ "$(avail)" -ge "$NEED" ]; then
    if [ ! -d "$W/.gpu.lock2" ] && mkdir "$L" 2>/dev/null; then break; fi
    # the second slot: small jobs only, beside another small job
    # (OFF by default since 24/09 17:35: crop scenes grew to 20-23.5 GB each and
    # memguard stopped 15 Blenders in 2.5 h with two side by side; GPU_SLOTS=2 turns it back on)
    if [ "${GPU_SLOTS:-1}" -ge 2 ] && [ $kind = small ] && [ "$(cat "$L/kind" 2>/dev/null)" = small ] && mkdir "$W/.gpu.lock2" 2>/dev/null; then L=$W/.gpu.lock2; break; fi
  fi
  sleep 3
done
rm -f "$me"
if [ $pri = 1 ]; then echo 0 > "$W/.gpu.tests"; else echo $(( $(cat "$W/.gpu.tests" 2>/dev/null || echo 0) + 1 )) > "$W/.gpu.tests"; fi
echo $$ > "$L/pid"; echo "$label $(date +%H:%M:%S)" > "$L/who"; echo $kind > "$L/kind"
trap 'rm -rf "$L"' EXIT; trap 'rm -rf "$L"; exit 1' INT TERM
"$@"
