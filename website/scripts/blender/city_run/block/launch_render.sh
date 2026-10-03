#!/bin/zsh
# (city_run/block/launch_render.sh: BLK_DIR [BLK_TAG]; zsh launch_render.sh [npods=3] [watchdog h=3.0] [VIC_SAT]; SF defaults = work_b14/launch_b14_render.sh)
# b14 render launch. Run: zsh <this file> [VIC_SAT value, e.g. 1.4; omit = no Victorian colour fix]
# 72 jobs, snapshot combo7 + the b9 switches (env_b8.txt), shared queue, 4 RunPod pods,
# watchdog 3.0 h (~1.2 h of work on 4 A40 PAR 2; ~2.5 h if all 4 are 24 GB cards at PAR 1). Pods go down as soon as the queue is empty.
# With a VIC_SAT value: VIC_SAT=<v> is added to env_b8.txt, the jobs are rebuilt, and each pod gets combo/vicsat_overlay/gen_buildings.py.
set -u
HERE=${0:A:h}; W=/Users/daniel/code/qipu-render-work; N=${BLK_DIR:?BLK_DIR = the block work dir (new_block.py)}; TAG=${BLK_TAG:-${${N:t}#work_}}; NP=${1:-3}; WH=${2:-3.0}; VS=${3:-}
mkdir -p $N/logs $N/q/todo $N/q/done $N/q/fail $N/render
cd $W
B=$(python3 cloud/pod.py balance 2>&1 | tail -1); echo "RunPod: $B"; python3 speed/vast/vast.py credit 2>&1 | tail -1
python3 - "$B" <<'PY' || { echo "ABORT: RunPod balance under \$5 ($TAG render, R2 staging)"; exit 1; }
import re, sys; m = re.search(r'balance \$([0-9.]+)', sys.argv[1]); sys.exit(0 if m and float(m.group(1)) >= 5 else 1)
PY
RUN=$(python3 speed/gpu.py list 2>&1 | sed -n '/== RunPod running:/,$p' | grep -c 'qipu-'); echo "RunPod pods running: $RUN"
[ $RUN -le 9 ] || { echo "ABORT: only $((12 - RUN)) free RunPod slots (need 3)"; exit 1; }
[ "$(ls $N/q/todo $N/q/done $N/q/fail | grep -c txt)" = 0 ] || { echo "ABORT: queue not fresh"; exit 1; }
sed -i '' -E 's/ VIC_SAT=[0-9.]+//' $N/env_b8.txt
[ -n "$VS" ] && { [ -s $W/combo/vicsat_overlay/gen_buildings.py ] || { echo "ABORT: no overlay"; exit 1; }; printf '%s VIC_SAT=%s\n' "$(cat $N/env_b8.txt | tr -d '\n')" "$VS" > $N/env_b8.txt.new && mv $N/env_b8.txt.new $N/env_b8.txt; }
(BLK_DIR=$N python3 $HERE/b8.py jobs) && cp $N/jobs_b8.txt $N/jobs_order.txt
echo "jobs $(grep -c . $N/jobs_order.txt), VIC_SAT in jobs: $(grep -c VIC_SAT= $N/jobs_order.txt)"
cd $N; BLK_DIR=$N BLK_TAG=$TAG nohup zsh $HERE/render_q.sh $NP $WH ${TAG}r > logs/render_q.out 2>&1 < /dev/null &
echo "started $(date +%H:%M:%S); log $N/logs/render_q.log"
# watcher (every terminal state + pod failures):
#   tail -n 0 -F $BLK_DIR/logs/render_q.log | grep -E --line-buffered "READY|ABORT|POD_DOWN|FAILED|Traceback|MISSING|VIC_SAT|RENDER_Q_DONE|EXIT| OK "
