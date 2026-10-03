#!/bin/zsh
# (city_run/block/launch_ai.sh: BLK_DIR [BLK_TAG] [BLK_CARDS=4]; SF defaults = work_b14/launch_b14_ai.sh)
# b14 AI step: waits for the render (queue empty, nothing in flight, b8.py check OK), checks Vast credit >= $8,
# then ai_q.sh 4 (shared L8 + 4 tile cards + autoreroll + post QUAY_LIP/ROOF_RN_SEAM/ROOF_FLAT_TONE + publish ckpt_block_b14). Run: zsh <this file>
# ~1230 tiles on 4 cards (~55 min each on a 5090). Resume after a tile loss: ai_q.sh --from 3 (finished groups skipped), see work_b9/launch_b9_fix.sh.
set -u
HERE=${0:A:h}; N=${BLK_DIR:?BLK_DIR = the block work dir}; TAG=${BLK_TAG:-${${N:t}#work_}}; W=/Users/daniel/code/qipu-render-work
mkdir -p $N/logs $N/tq $N/tiles_a $N/l8
cd $W; python3 speed/vast/vast.py credit 2>&1 | tail -1
python3 -c "import re,subprocess,sys; m=re.search(r'\\\$([0-9.]+)', subprocess.run(['python3','speed/vast/vast.py','credit'],capture_output=True,text=True).stdout); sys.exit(0 if m and float(m.group(1))>=8.5 else 1)" || { echo "ABORT: Vast credit under \$8.5"; exit 1; }
cd $N; BLK_DIR=$N BLK_TAG=$TAG nohup zsh $HERE/chain.sh > logs/chain.out 2>&1 < /dev/null &
echo "started $(date +%H:%M:%S); log $N/logs/ai_q.log"
# watcher: tail -n 0 -F $BLK_DIR/logs/ai_q.log | grep -E --line-buffered "ABORT|STEP|WARN|group|autoreroll:|AI_Q_DONE|EXIT|CHAIN"
