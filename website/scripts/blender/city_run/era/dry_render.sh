#!/bin/zsh
# dry_render.sh <run dir> [overlay dir] (V-ERAS 05/10): auto_render.sh's pod path WITHOUT pods: the city's pod script, the snapshot root on
# the pod, the job runner, the overlay files that ship, and per job line the Blender command render_b8.sh would run, every path checked on
# the Mac (the pod's /root/q/qw = qipu-render-work). Exit 1 on a missing path.
eval "$(python3 ${0:A:h}/eracity.py sh)"
R=$1; K=${2:-$ERA_OVERLAY}; SN=${SNAPN:-$ERA_SNAP}; W=/Users/daniel/code/qipu-render-work; bad=0
ok() { if [ -e "$2" ]; then echo "ok   $1: $2"; else echo "MISSING $1: $2"; bad=1; fi; }
echo "city $ERA_CITY  snap $SN  overlay $K"
ok 'pod script' $ERA_POD_SH; ok 'job runner' $ERA_RENDER_SH; ok 'post on pod' ${ERA_RENDER_SH:h}/pod_post_b8.py
LOC=${ERA_POD_SNAP/\/root\/q\/qw/$W}; ok "snapshot (pod $ERA_POD_SNAP/$SN)" $LOC/$SN/gen_buildings.py
ok 'overlay era.py' $K/era.py; ok 'overlay hq_city.py' $K/hq_city.py
FS=($K/*.py(N) $K/*.json(N) $K/rn_*.png(N)); echo "overlay ships ${#FS} files into $ERA_POD_SNAP/${SN}k (topo/: $([ -d $K/topo ] && echo yes || echo 'none: masks via the stage list'))"
if [ "$ERA_CITY" = sf ]; then SNR=snap; CDR=city; else SNR=cities/$ERA_CITY/snap; CDR=cities/$ERA_CITY/city; fi
ok 'scene' $W/$CDR/scene.json
n=0; for f in $R/jobs_*.txt(N); do while read L IJ BD ENV; do [ -z "$L" ] && continue; n=$((n + 1))
  [ $n = 1 ] && echo "job 1: blender -b -P $W/$SNR/${SN}k/hq_city.py -- $W/$CDR /root/q/out/lmk/$L 16 5120 3072  env: MODE=pyramid Z=7 ONLY=$IJ BORDER=$BD $ENV"
  done < $f; done
echo "$n job lines; ${SN}k = $SN + overlay (local check on $SN)"; ok 'hq_city of the snapshot' $W/$SNR/$SN/hq_city.py
exit $bad
