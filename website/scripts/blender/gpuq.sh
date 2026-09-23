#!/bin/sh
# THE GPU QUEUE. Every render on this Mac:   sh gpuq.sh <label> <command...>
# One GPU (M4 Pro), two slots: a render's scene build is CPU and single-thread,
# so two jobs overlap (quick crop tests ~1.5-2x). MEMORY decides, not the slot
# count: each job reserves an estimate from its label and a second job starts
# only if the two stay under GPU_BUDGET (28 GB: what the Mac has free between
# jobs with everything else open). Three Blender scenes once took ~40 GB of 48
# and the system killed them (2026-09-23) — an era frame at level 5 (22 GB)
# never shares.
# Order: tickets, quick tests first (0…), long city renders after (1…); the
# oldest ticket goes first, so a loop asking again cannot starve the others.
W=/Users/daniel/code/qipu-render-work
Q=$W/.gpu.queue; mkdir -p "$Q"
label="$1"; shift
case "$label" in city*) sleep 8;; esac
case "$label" in city*) pri=1;; *) pri=0;; esac
est=10
case "$label" in *z5*) est=22;; *z6*) est=16;; city*) est=12;; critic*) est=12;; esac
BUDGET=${GPU_BUDGET:-28}
me="$Q/$pri$(date +%s)$(printf '%06d' $$)_$$"
echo "$label" > "$me"
trap 'rm -f "$me"' EXIT INT TERM
used() {   # GB reserved by the running jobs; a job from before this version says nothing: 22
  u=0
  for L in "$W/.gpu.lock" "$W/.gpu.lock2"; do
    [ -d "$L" ] || continue
    o=$(cat "$L/pid" 2>/dev/null)
    if [ -n "$o" ] && ! kill -0 "$o" 2>/dev/null; then rm -rf "$L"; continue; fi
    e=$(cat "$L/est" 2>/dev/null); u=$((u + ${e:-22}))
  done
  echo $u
}
SLOT=""
while :; do
  for t in "$Q"/*; do p=${t##*_}; [ -f "$t" ] && ! kill -0 "$p" 2>/dev/null && rm -f "$t"; done
  first=$(ls "$Q" | sort | head -1)
  if [ "$Q/$first" = "$me" ] && [ $(( $(used) + est )) -le "$BUDGET" ]; then
    for L in "$W/.gpu.lock" "$W/.gpu.lock2"; do
      if mkdir "$L" 2>/dev/null; then SLOT=$L; break; fi
    done
    [ -n "$SLOT" ] && break
  fi
  sleep 3
done
rm -f "$me"
echo $$ > "$SLOT/pid"; echo $est > "$SLOT/est"; echo "$label $(date +%H:%M:%S)" > "$SLOT/who"
trap 'rm -rf "$SLOT"' EXIT INT TERM
"$@"
