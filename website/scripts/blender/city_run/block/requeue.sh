#!/bin/zsh
# requeue.sh <crop i_j>...: put both jobs of each crop back at the FRONT of the queue; old outputs moved to render_old/rq/ and deleted on every pod
# (a pod's post dir is re-fetched whole on each claim: an old copy there would overwrite the new render)
W=/Users/daniel/code/qipu-render-work; V=${BLK_DIR:?}; TAG=${BLK_TAG:-${${V:t}#work_}};   # (city_run/block; SF = work_b14/requeue.sh)
 mkdir -p $V/render_old/rq
SSHO=(-o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null -o LogLevel=ERROR -o ConnectTimeout=20)
pat=""; for c in "$@"; do
  for f in $V/q/done/*_b8[bp]_$c.txt(N) $V/q/fail/*_b8[bp]_$c.txt(N); do b=${f:t}; mv $f $V/q/todo/${RQ_PFX:-002}${b#???}; done
  mv $V/render/b8[bp]_${c}[._]* $V/render_old/rq/ 2>/dev/null; pat="$pat /root/q/out/lmk/b8?_${c}[._]* /root/q/out/*_post/b8?_${c}[._]*"; done
for p in ${TAG}r{1..6} ${TAG}s{1..4}; do [ -f $W/cloud/state/lmk_$p/env ] || continue; . $W/cloud/state/lmk_$p/env; ssh -p $PORT $SSHO root@$IP "rm -f $pat" 2>/dev/null; done
echo "$(date +%H:%M:%S) requeued $TAG: $*" >> $V/logs/render_q.log; ls $V/q/todo | wc -l
