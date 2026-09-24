#!/bin/bash
# ON THE POD. pod_render.sh <snap> <outdir> <PAR> <i:j> [<i:j> …]
# Renders level-7 frames of a snapshot, one Blender per frame (as on the Mac), PAR at a time (1, or 2 if VRAM allows).
# Writes <outdir>/f_z7_i_j.png + .log, and <outdir>/times.tsv (frame, render s, wall s, peak VRAM MiB over the run so far).
# Never runs past its frames: the driver (ckpt.sh / parity.sh on the Mac) stops the pod when this returns.
N=$1; O=$2; PAR=$3; shift 3
S=/Users/daniel/code/qipu-render-work/snap/$N; mkdir -p $O
( while :; do nvidia-smi --query-gpu=memory.used --format=csv,noheader,nounits >> $O/vram.txt; free -m | awk '/Mem/ {print $3}' >> $O/ram.txt; sleep 2; done ) &
SAMP=$!
one() {
  ij=$1; f=$O/f_z7_${ij/:/_}.png; [ -f $f ] && return
  t0=$(date +%s)
  env MODE=pyramid Z=7 ONLY=$ij CYCLES_DEVICE=${CYCLES_DEVICE:-OPTIX} blender -b -P $S/hq_city.py -- \
      /Users/daniel/code/qipu-render-work/city $O/f 16 5120 3072 > $O/f_${ij/:/_}.log 2>&1
  r=$(grep -o "frame [0-9]*,[0-9]*: [0-9.]*s" $O/f_${ij/:/_}.log | grep -o "[0-9.]*s$")
  echo -e "$ij\t$r\t$(( $(date +%s) - t0 ))\t$(sort -n $O/vram.txt | tail -1)\t$(sort -n $O/ram.txt | tail -1)" >> $O/times.tsv
  echo "$ij render $r wall $(( $(date +%s) - t0 ))s tracebacks $(grep -c Traceback $O/f_${ij/:/_}.log)"
}
export -f one; export O S
printf '%s\n' "$@" | xargs -P $PAR -I{} bash -c 'one {}'
kill $SAMP
echo "RENDER_DONE $(ls $O/f_z7_*.png 2>/dev/null | wc -l) frames; peak VRAM $(sort -n $O/vram.txt | tail -1) MiB, peak RAM $(sort -n $O/ram.txt | tail -1) MiB"
