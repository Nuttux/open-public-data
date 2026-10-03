#!/bin/zsh
# b14: after the render (BOTH worker sets b14r* and b14s*: the queue empty, nothing in flight, no b14 render_q.sh left) and b8.py check OK ->
# Vast balance check (>= $8.5: AI ~$4.5 + $4 reserve; b14 AI ~$4 + margin) -> ai_q.sh 8 (L8 + 8 tile cards + autoreroll + post + publish block_b14)
HERE=${0:A:h}; V=${BLK_DIR:?BLK_DIR = the block work dir}; TAG=${BLK_TAG:-${${V:t}#work_}}; W=/Users/daniel/code/qipu-render-work   # (city_run/block/chain.sh; SF defaults = work_b14/chain.sh)
say() { echo "$(date +%H:%M:%S) $*" >> $V/logs/ai_q.log; }
until grep -q RENDER_Q_DONE $V/logs/render_q.log && [ -z "$(ls $V/q/todo)" ] && [ -z "$(ls $V/q/doing_* 2>/dev/null | grep txt)" ] && ! pgrep -f "render_q.sh [0-9]+ [0-9.]+ $TAG" > /dev/null; do sleep 30; done
if [ "$(ls $V/q/fail | wc -l | tr -d ' ')" != 0 ] || ! BLK_DIR=$V python3 $HERE/b8.py check > /dev/null 2>&1; then say "ABORT: render incomplete ($(BLK_DIR=$V python3 $HERE/b8.py check 2>&1 | tail -1 | cut -c1-200); fail $(ls $V/q/fail | tr '\n' ' '))"; exit 1; fi
C=$(cd $W && python3 speed/vast/vast.py credit 2>&1 | tail -1)
python3 - "$C" <<'PY' || { say "ABORT: Vast credit too low for the $TAG AI (+ era AI): $C"; exit 1; }
import re, sys; m = re.search(r'\$([0-9.]+)', sys.argv[1]); sys.exit(0 if m and float(m.group(1)) >= 8.5 else 1)
PY
say "CHAIN: render complete, Vast $C"
BLK_DIR=$V BLK_TAG=$TAG zsh $HERE/ai_q.sh ${BLK_CARDS:-4}
