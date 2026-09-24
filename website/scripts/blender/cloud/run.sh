#!/bin/bash
# run.sh <label> <snap> <max_hours> <local_outdir> <PAR> <i:j> [<i:j> …]
# One pod, start to finish: create (cheapest 48 GB GPU, watchdog = max_hours) -> setup -> upload static + snapshot
# -> render the frames -> pull them back to <local_outdir> -> TERMINATE the pod -> log its cost in COSTS.md.
# Whatever fails, the EXIT trap terminates the pod and logs it; the on-pod watchdog and `pod.py guard` are the backstops.
set -u
L=$1; N=$2; MAXH=$3; OUT=$4; PAR=$5; shift 5; FR="$*"
C=/Users/daniel/code/qipu-render-work/cloud; cd $C; mkdir -p $OUT
SSHO="-o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null -o LogLevel=ERROR -o ServerAliveInterval=30 -o ConnectTimeout=20"
log() { echo "$(date +%H:%M:%S) $*" | tee -a $OUT/run.log; }
python3 pod.py total >/dev/null || { log "HARD STOP: COSTS.md total reached \$15, nothing created"; exit 3; }
PID=$(python3 pod.py create $L $MAXH 2>>$OUT/run.log) || { log "create failed: $(tail -2 $OUT/run.log)"; exit 1; }
NOTE="started"
done_() { python3 pod.py terminate $PID >> $OUT/run.log 2>&1; python3 pod.py log $PID "$L: $NOTE" | tee -a $OUT/run.log; }
trap done_ EXIT
log "pod $PID: $(python3 -c "import json;s=json.load(open('state/$PID.json'));print(s['gpu'],s['cloud'],s['cost_per_hr'],'\$/h')")"
read IP PORT < <(python3 pod.py wait $PID) || { NOTE="never reachable"; exit 1; }
X() { ssh -p $PORT $SSHO root@$IP "$@"; }
for k in 1 2 3 4 5 6 7 8 9 10 11 12; do X true 2>/dev/null && break; sleep 10; done
log "ssh $IP:$PORT up"; t0=$(date +%s)
scp -P $PORT $SSHO -q pod_setup.sh root@$IP:/root/ && X "QIPU_ROOT=/workspace bash /root/pod_setup.sh" 2>&1 | tee -a $OUT/run.log
log "setup $(( $(date +%s) - t0 )) s"; t0=$(date +%s)
bash bundle.sh up-static $IP $PORT $N 2>&1 | tail -3 | tee -a $OUT/run.log
bash bundle.sh up-snap $N $IP $PORT 2>&1 | tail -3 | tee -a $OUT/run.log
log "upload $(( $(date +%s) - t0 )) s"; t0=$(date +%s)
X "nohup bash /workspace/qw/cloud/pod_render.sh $N /workspace/out/$L $PAR $FR > /workspace/out_$L.log 2>&1 &"
NOTE="rendering"
while :; do                       # poll (an ssh drop doesn't stop the render)
  sleep 30
  s=$(X "tail -1 /workspace/out_$L.log" 2>/dev/null) || continue
  case "$s" in RENDER_DONE*) break;; esac
  [ $(( $(date +%s) - t0 )) -gt $(python3 -c "print(int($MAXH*3600))") ] && { log "time budget over"; break; }
done
X "cat /workspace/out_$L.log" | tee -a $OUT/run.log
log "render $(( $(date +%s) - t0 )) s"; t0=$(date +%s)
rsync -a -e "ssh -p $PORT $SSHO" root@$IP:/workspace/out/$L/ $OUT/
log "pulled $(ls $OUT/f_z7_*.png 2>/dev/null | wc -l) frames in $(( $(date +%s) - t0 )) s"
NOTE="$(ls $OUT/f_z7_*.png 2>/dev/null | wc -l | tr -d ' ') frames"
