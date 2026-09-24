#!/bin/bash
# run.sh <label> <snap> <max_hours> <local_outdir> <PAR> <i:j> [<i:j> …]
# One pod, start to finish: create (cheapest 48 GB GPU, watchdog = max_hours) -> setup -> upload static + snapshot
# -> render the frames -> pull them back to <local_outdir> -> TERMINATE the pod -> log its cost in COSTS.md.
# Whatever fails, the EXIT trap terminates the pod and logs it; the on-pod watchdog and `pod.py guard` are the backstops.
set -u
L=$1; N=$2; export N; MAXH=$3; OUT=$4; PAR=$5; shift 5; FR="$*"
C=/Users/daniel/code/qipu-render-work/cloud; cd $C; mkdir -p $OUT
SSHO="-o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null -o LogLevel=ERROR -o ServerAliveInterval=30 -o ConnectTimeout=20"
log() { echo "$(date +%H:%M:%S) $*" | tee -a $OUT/run.log; }
python3 pod.py total >/dev/null || { log "HARD STOP: COSTS.md total reached \$15, nothing created"; exit 3; }
PID=$(python3 pod.py create $L $MAXH 2>>$OUT/run.log) || { log "create failed: $(tail -2 $OUT/run.log)"; python3 pod.py guard >> $OUT/run.log 2>&1; exit 1; }
NOTE="started"
done_() { python3 pod.py terminate $PID >> $OUT/run.log 2>&1; python3 pod.py log $PID "$L: $NOTE" | tee -a $OUT/run.log; python3 pod.py guard >> $OUT/run.log 2>&1; }
trap done_ EXIT
log "pod $PID: $(python3 -c "import json;s=json.load(open('state/$PID.json'));print(s['gpu'],s['cloud'],s['cost_per_hr'],'\$/h')")"
read IP PORT < <(python3 pod.py wait $PID) || { NOTE="never reachable"; exit 1; }
X() { ssh -p $PORT $SSHO root@$IP "$@"; }
for k in 1 2 3 4 5 6 7 8 9 10 11 12; do X true 2>/dev/null && break; sleep 10; done
log "ssh $IP:$PORT up"; t0=$(date +%s)
scp -P $PORT $SSHO -q pod_setup.sh root@$IP:/root/ && X "QIPU_ROOT=/root/q bash /root/pod_setup.sh" 2>&1 | tee -a $OUT/run.log
log "setup $(( $(date +%s) - t0 )) s"; t0=$(date +%s)
RATE=$(bash bundle.sh speed $IP $PORT | tail -1)
log "uplink $RATE MB/s (4 streams, 100 MB)"
# BEFORE uploading: will upload + render fit in max_hours? If not, abort now (the trap terminates the pod)
bash bundle.sh lists $N; bash bundle.sh pack $N | tee -a $OUT/run.log
EST=$(python3 - $RATE $MAXH $(python3 -c "import json,time;print(int(time.time()-json.load(open('state/$PID.json'))['created']))") $# $PAR <<'PY'
import os, sys
rate, maxh, spent, nfr, par = float(sys.argv[1]), float(sys.argv[2]), int(sys.argv[3]), int(sys.argv[4]), int(sys.argv[5])
k = f"/Users/daniel/code/qipu-render-work/cloud/state/pack_{os.environ['N']}.tar.zst"
up = os.path.getsize(k) / 1e6 / rate * 1.3 + 300      # +5 min: unpack, the public fetch and its checksum fix-up
need = spent + up + nfr * float(os.environ.get('SPF', 200)) / par + 240
print(int(up), int(need), int(maxh * 3600), 'OK' if need < maxh * 3600 else 'NOFIT')
PY
)
log "estimate: upload ~${EST%% *} s; upload+render ~$(echo $EST | cut -d' ' -f2) s of the $(echo $EST | cut -d' ' -f3) s budget -> $(echo $EST | cut -d' ' -f4)"
case "$EST" in *NOFIT*) NOTE="aborted: would not fit in $MAXH h at $RATE MB/s"; log "$NOTE"; exit 2;; esac
t0=$(date +%s)
bash bundle.sh up-public $IP $PORT 2>&1 | tail -4 | tee -a $OUT/run.log &
bash bundle.sh up-pack $N $IP $PORT 2>&1 | tail -3 | tee -a $OUT/run.log &
wait
log "upload $(( $(date +%s) - t0 )) s"; t0=$(date +%s)
X "test -f /Users/daniel/code/qipu-render-work/snap/$N/hq_city.py && test -f /root/q/qw/city/scene.json && test -d /root/q/assets/polyhaven" \
  || { NOTE="aborted: upload incomplete"; log "$NOTE"; exit 2; }
X "nohup bash /root/q/qw/cloud/pod_render.sh $N /root/q/out/$L $PAR $FR > /root/q/out_$L.log 2>&1 &"
NOTE="rendering"
while :; do                       # poll (an ssh drop doesn't stop the render)
  sleep 30
  s=$(X "tail -1 /root/q/out_$L.log" 2>/dev/null) || continue
  case "$s" in RENDER_DONE*) break;; esac
  # stop polling 3 min before the on-pod watchdog would stop the pod, to pull what is done
  [ $(date +%s) -gt $(python3 -c "import json;print(int(json.load(open('state/$PID.json'))['created'] + $MAXH * 3600 - 180))") ] && { log "time budget over: pulling what is done"; break; }
done
X "cat /root/q/out_$L.log" | tee -a $OUT/run.log
log "render $(( $(date +%s) - t0 )) s"; t0=$(date +%s)
rsync -a -e "ssh -p $PORT $SSHO" root@$IP:/root/q/out/$L/ $OUT/
log "pulled $(ls $OUT/f_z7_*.png 2>/dev/null | wc -l) frames in $(( $(date +%s) - t0 )) s"
NOTE="$(ls $OUT/f_z7_*.png 2>/dev/null | wc -l | tr -d ' ') frames"
