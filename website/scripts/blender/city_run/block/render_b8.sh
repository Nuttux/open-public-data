#!/bin/bash
# render_b8.sh <pod> <snap> <jobfile> <local_out_dir> <prefix-glob>: the jobs on an lmk pod (PAR at once), then on the pod pod_post_b8.py
# (JPEG q96 for every frame; mask/class copies + gid/part decoded from .guide.exr for passes frames) into /root/q/out/<pod>_post/,
# one bucket fetch -> <local_out_dir>. Frame outputs: /root/q/out/lmk/<label>_z9_i_j.*
W=/Users/daniel/code/qipu-render-work; POD=$1; N=$2; J=$3; OUT=$4; PG=$5; . $W/cloud/state/lmk_$POD/env
# (city_run/block, B1) CITY unset = SF: snap/<N>, city/ (as block52/render_b8.sh); another city: lmk_pod.sh's cities/<city>/snap, cities/<city>/city
if [ "${CITY:-sf}" = sf ]; then SNR=snap; CDR=city; else SNR=cities/$CITY/snap; CDR=cities/$CITY/city; fi; HERE=$(cd "$(dirname "$0")" && pwd)
SSHO="-o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null -o LogLevel=ERROR -o ServerAliveInterval=30 -o ConnectTimeout=20"
X() { ssh -p $PORT $SSHO root@$IP "$@"; }
one() { L=$1; IJ=$2; BD=$3; shift 3; touch $W/cloud/state/lmk_$POD/last; t0=$(date +%s)
  X "mkdir -p /root/q/out/lmk; cd /root/q && env MODE=pyramid Z=7 ONLY=$IJ BORDER=$BD CYCLES_DEVICE=OPTIX DN_GPU=1 $* blender -b -P $W/$SNR/$N/hq_city.py -- $W/$CDR /root/q/out/lmk/$L 16 5120 3072 > /root/q/out/lmk/$L.log 2>&1"
  echo "$(date +%H:%M:%S) $L $(( $(date +%s) - t0 )) s tb=$(X "grep -c Traceback /root/q/out/lmk/$L.log") png=$(X "ls /root/q/out/lmk/${L}_z9_*.png 2>/dev/null | wc -l") exr=$(X "ls /root/q/out/lmk/${L}_z9_*.guide.exr 2>/dev/null | wc -l")"
  if [ "${FETCH_EACH:-0}" = 1 ]; then   # (03/10 era_auto) FETCH_EACH: post this job's frames on the pod and pull them now, so a pod that dies loses one job, not its batch
    X "cd /root/q && $PY pod_post_b8.py /root/q/out/lmk /root/q/out/${POD}_post '$L' > /dev/null 2>&1"; mkdir -p $OUT
    for k_ in 1 2 3; do rsync -a --partial -e "ssh -p $PORT $SSHO -o IPQoS=none" "root@$IP:/root/q/out/${POD}_post/${L}_*" $OUT/ 2>/dev/null && break; sleep 10; done
    echo "$(date +%H:%M:%S) $L fetched: $(ls $OUT | grep -c "^${L}_")"
  fi; }
if [ "${FETCH_EACH:-0}" = 1 ]; then   # (FETCH_EACH) the post script and its OpenEXR before the first job
  scp -q -P $PORT $SSHO $HERE/pod_post_b8.py root@$IP:/root/q/pod_post_b8.py
  PY=$(X "[ -x /root/v12/bin/python ] && echo /root/v12/bin/python || echo python3"); X "$PY -c 'import OpenEXR' 2>/dev/null || $PY -m pip install -q OpenEXR 2>&1 | tail -1"
fi
export -f one X; export W IP PORT SSHO N POD OUT PY FETCH_EACH SNR CDR
grep -v '^ *$' $J | xargs -P ${PAR:-2} -L 1 bash -c 'one "$@"' _
scp -q -P $PORT $SSHO $HERE/pod_post_b8.py root@$IP:/root/q/pod_post_b8.py
PY=$(X "[ -x /root/v12/bin/python ] && echo /root/v12/bin/python || echo python3")
X "$PY -c 'import OpenEXR' 2>/dev/null || $PY -m pip install -q OpenEXR 2>&1 | tail -1; cd /root/q && $PY pod_post_b8.py /root/q/out/lmk /root/q/out/${POD}_post '$PG' | tail -3"
# (06/10 CITY-TODAY, Daniel's link saturated) Vancouver only: at most FETCH_MAX (2) pod->Mac fetches at once across all render_q pods (mkdir semaphore, stale pids freed)
SEM=""; if [ "${CITY:-sf}" = vancouver ]; then while [ -z "$SEM" ]; do
  for s_ in $(seq 1 ${FETCH_MAX:-2}); do mkdir $W/.van_fetch_sem_$s_ 2>/dev/null && { SEM=$W/.van_fetch_sem_$s_; echo $$ > $SEM/pid; break; }; done
  [ -n "$SEM" ] || { for d_ in $W/.van_fetch_sem_*; do p_=$(cat $d_/pid 2>/dev/null); [ -n "$p_" ] && ! kill -0 $p_ 2>/dev/null && rm -rf $d_; done; sleep 15; }
done; trap '[ -n "$SEM" ] && rm -rf $SEM' EXIT; fi
mkdir -p $OUT; bash $W/cloud/lmk_pod.sh $POD fetch /root/q/out/${POD}_post/ $OUT/
X "for f in /root/q/out/lmk/*.log; do cp \$f /root/q/out/${POD}_post/ 2>/dev/null; done"; bash $W/cloud/lmk_pod.sh $POD fetch /root/q/out/${POD}_post/ $OUT/ >/dev/null 2>&1
[ -n "$SEM" ] && rm -rf $SEM; SEM=""
ls $OUT | wc -l
