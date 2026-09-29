#!/bin/bash
# city/run/render_sb.sh (= combo/block52/render_b8.sh, unchanged logic) <pod> <snap> <jobfile> <local_out_dir> <prefix-glob>: the jobs on an lmk pod (PAR at once), then on the pod pod_post_b8.py
# (JPEG q96 for every frame; mask/class copies + gid/part decoded from .guide.exr for passes frames) into /root/q/out/<pod>_post/,
# one bucket fetch -> <local_out_dir>. Frame outputs: /root/q/out/lmk/<label>_z9_i_j.* ; jobs already done on the pod (png present) are skipped (resume on the same pod)
W=/Users/daniel/code/qipu-render-work; POD=$1; N=$2; J=$3; OUT=$4; PG=$5; . $W/cloud/state/lmk_$POD/env
SSHO="-o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null -o LogLevel=ERROR -o ServerAliveInterval=30 -o ConnectTimeout=20"
X() { ssh -p $PORT $SSHO root@$IP "$@"; }
one() { L=$1; IJ=$2; BD=$3; shift 3; X "ls /root/q/out/lmk/${L}_z9_*.png >/dev/null 2>&1" && { echo "$(date +%H:%M:%S) $L skip (done)"; return; }; touch $W/cloud/state/lmk_$POD/last; t0=$(date +%s)
  X "mkdir -p /root/q/out/lmk; cd /root/q && env MODE=pyramid Z=7 ONLY=$IJ BORDER=$BD CYCLES_DEVICE=OPTIX DN_GPU=1 $* blender -b -P $W/snap/$N/hq_city.py -- $W/city /root/q/out/lmk/$L 16 5120 3072 > /root/q/out/lmk/$L.log 2>&1"
  echo "$(date +%H:%M:%S) $L $(( $(date +%s) - t0 )) s tb=$(X "grep -c Traceback /root/q/out/lmk/$L.log") png=$(X "ls /root/q/out/lmk/${L}_z9_*.png 2>/dev/null | wc -l") exr=$(X "ls /root/q/out/lmk/${L}_z9_*.guide.exr 2>/dev/null | wc -l")"; }
export -f one X; export W IP PORT SSHO N POD
grep -v '^ *$' $J | xargs -P ${PAR:-2} -L 1 bash -c 'one "$@"' _
scp -q -P $PORT $SSHO $W/combo/block52/pod_post_b8.py root@$IP:/root/q/pod_post_b8.py
PY=$(X "[ -x /root/v12/bin/python ] && echo /root/v12/bin/python || echo python3")
X "$PY -c 'import OpenEXR' 2>/dev/null || $PY -m pip install -q OpenEXR 2>&1 | tail -1; cd /root/q && $PY pod_post_b8.py /root/q/out/lmk /root/q/out/${POD}_post '$PG' | tail -3"
mkdir -p $OUT; bash $W/cloud/lmk_pod.sh $POD fetch /root/q/out/${POD}_post/ $OUT/
X "for f in /root/q/out/lmk/*.log; do cp \$f /root/q/out/${POD}_post/ 2>/dev/null; done"; bash $W/cloud/lmk_pod.sh $POD fetch /root/q/out/${POD}_post/ $OUT/ >/dev/null 2>&1
ls $OUT | wc -l
