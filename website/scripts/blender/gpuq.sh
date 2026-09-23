#!/bin/sh
# ONE BLENDER AT A TIME, FIRST COME FIRST SERVED. Every render on this Mac:
#   sh gpuq.sh <label> <command...>
# Three Blender scenes loaded at once took ~40 GB of the 48 and the system
# killed them (2026-09-23). A waiter takes a numbered ticket; the lock (a
# directory: mkdir is atomic) goes to the oldest live ticket, so a loop that
# asks again the instant it lets go (the city frames) cannot starve the short
# tests waiting behind it. Dead owners and dead tickets are cleared.
W=/Users/daniel/code/qipu-render-work
L=$W/.gpu.lock; Q=$W/.gpu.queue; mkdir -p "$Q"
label="$1"; shift
# the long city loop steps back a moment between frames, so a waiter that
# still polls the old way (no ticket) gets its turn too
case "$label" in city*) sleep 8;; esac
me="$Q/$(date +%s)$(printf '%06d' $$)_$$"
echo "$label" > "$me"
trap 'rm -f "$me"' EXIT INT TERM
while :; do
  for t in "$Q"/*; do                       # clear tickets whose waiter is gone
    p=${t##*_}; [ -f "$t" ] && ! kill -0 "$p" 2>/dev/null && rm -f "$t"
  done
  first=$(ls "$Q" | sort | head -1)
  if [ "$Q/$first" = "$me" ] && mkdir "$L" 2>/dev/null; then break; fi
  owner=$(cat "$L/pid" 2>/dev/null)
  if [ -n "$owner" ] && ! kill -0 "$owner" 2>/dev/null; then rm -rf "$L"; fi
  sleep 3
done
rm -f "$me"
echo $$ > "$L/pid"; echo "$label $(date +%H:%M:%S)" > "$L/who"
trap 'rm -rf "$L"' EXIT INT TERM
"$@"
