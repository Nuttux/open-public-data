#!/bin/bash
# ON THE POD. pod_render.sh <snap> <outdir> <PAR> <i:j> [<i:j> …]
# Renders level-7 frames of a snapshot, one Blender per frame (as on the Mac), PAR at a time (1, or 2 if VRAM allows).
# Writes <outdir>/f_z7_i_j.png + .log, and <outdir>/times.tsv (frame, render s, wall s, peak VRAM MiB over the run so far).
# DN_GPU=1: OIDN on the GPU (on the pod's few vCPUs the CPU denoiser took most of a 141 s frame).
# Never runs past its frames: the driver (ckpt.sh / parity.sh on the Mac) stops the pod when this returns.
N=$1; O=$2; PAR=$3; shift 3
S=/Users/daniel/code/qipu-render-work/snap/$N; mkdir -p $O
for k in $(seq 120); do [ -s /root/q/device ] && break; sleep 5; done       # the setup's warm-up (OptiX, else CUDA)
DEV=${CYCLES_DEVICE:-$(cat /root/q/device 2>/dev/null)}
# CUDA renders some Brick-node materials pure black (lm_apron, dock decks, lots: ai_eras 25/09). OptiX only, unless ALLOW_CUDA=1.
if [ "$DEV" != OPTIX ] && [ "${ALLOW_CUDA:-0}" != 1 ]; then echo "REFUSING TO RENDER: device $DEV (OptiX failed on this host; CUDA blackens some materials). Set ALLOW_CUDA=1 to override."; echo "RENDER_DONE 0 frames; refused: device $DEV"; exit 3; fi
[ -z "$DEV" -o "$DEV" = NONE ] && { echo "RENDER_DONE 0 frames; no working GPU device (see /root/q/warm_*.log)"; exit 1; }
echo "device $DEV"; export DEV
# frames at once: what the container's RAM holds (a frame's Blender peaks at ~25 GB RSS; 24/09 A40 parity)
LIM=$(( $(cat /sys/fs/cgroup/memory.max 2>/dev/null || cat /sys/fs/cgroup/memory/memory.limit_in_bytes) / 1073741824 ))
FIT=$(( (LIM - 4) / 27 )); [ $FIT -lt 1 ] && FIT=1; [ $PAR -gt $FIT ] && { echo "PAR $PAR -> $FIT (container RAM $LIM GB)"; PAR=$FIT; }
( while :; do nvidia-smi --query-gpu=memory.used --format=csv,noheader,nounits >> $O/vram.txt; ps -C blender -o rss= | awk '{s+=$1} END {print int(s/1024)}' >> $O/ram.txt; sleep 2; done ) &
SAMP=$!
one() {
  ij=$1; f=$O/f_z7_${ij/:/_}.png; [ -f $f ] && return
  t0=$(date +%s)
  env MODE=pyramid Z=7 ONLY=$ij CYCLES_DEVICE=$DEV DN_GPU=${DN_GPU:-1} blender -b -P $S/hq_city.py -- \
      /Users/daniel/code/qipu-render-work/city $O/f 16 5120 3072 > $O/f_${ij/:/_}.log 2>&1
  r=$(grep -o "frame [0-9]*,[0-9]*: [0-9.]*s" $O/f_${ij/:/_}.log | grep -o "[0-9.]*s$")
  echo -e "$ij\t$r\t$(( $(date +%s) - t0 ))\t$(sort -n $O/vram.txt | tail -1)\t$(sort -n $O/ram.txt | tail -1)" >> $O/times.tsv
  echo "$ij render $r wall $(( $(date +%s) - t0 ))s tracebacks $(grep -c Traceback $O/f_${ij/:/_}.log)"
}
export -f one; export O S
printf '%s\n' "$@" | xargs -P $PAR -I{} bash -c 'one {}'
kill $SAMP
echo "RENDER_DONE $(ls $O/f_z7_*.png 2>/dev/null | wc -l) frames; peak VRAM $(sort -n $O/vram.txt | tail -1) MiB, peak Blender RSS $(sort -n $O/ram.txt | tail -1) MiB"
