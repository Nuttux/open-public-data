#!/bin/zsh
# auto_render.sh <run dir> <pod label prefix> <npods> <label glob> [overlay dir]: renders <run dir>/jobs_<k>.txt on npods lmk pods (PAR 1, RUN_LESSONS 1),
# snapshot combo5 + the overlay (default qh/kt/k7) copied into ${SN}k on each pod; outputs fetched per pod into <run dir>/render (as each pod
# finishes: RUN_LESSONS 4); every pod down when its jobs are done and on EXIT. New label per retry (<prefix><k>t<try>).
eval "$(python3 ${0:A:h}/eracity.py sh)"   # per city: ERA_SNAP, ERA_OVERLAY (CITY unset = SF's literals)  # ERA_CITY
set -u; SN=${SNAPN:-$ERA_SNAP}; export MAXPRICE=${MAXPRICE:-0.85}; export LMK_GPUS=${LMK_GPUS:-'NVIDIA A40,NVIDIA RTX A5000,NVIDIA GeForce RTX 4090,NVIDIA RTX A6000'}   # (30/09 22:20) no community 3090s: blacklisted hosts kept coming back
export FETCH_EACH=${FETCH_EACH:-1}   # (03/10 era_auto) default ON: each job is posted and pulled as it ends (beauty fetched: 1, pass fetched: 4 checked in i15p), so a dead pod loses one job; FETCH_EACH=0 for the old batch fetch
R=$1; PF=$2; NP=$3; GL=$4; K=${5:-$ERA_OVERLAY}
W=/Users/daniel/code/qipu-render-work; LK=/Volumes/QIPU-SSD/qipu-render-work/combo/block52/qh/kt/lmk_pod_L.sh; B=$W/combo/block52; MAXH=${MAXH:-1.2}
exec > >(tee -a $R/render.log) 2>&1
cd $W
say() { echo "$(date +%H:%M:%S) [$PF] $*"; }
LBL=(); down_all() { for p in $LBL; do [ -f $W/cloud/state/lmk_$p/env ] && bash cloud/lmk_pod.sh $p down "era_auto $R (exit)" 2>&1 | tail -1; done; say "cards down"; }
trap down_all EXIT
pod() { k=$1
  for t in 1 2 3; do p=${PF}${k}t$t; LBL+=($p)
    bash $LK $p up $SN $MAXH > $R/pod_$p.log 2>&1
    if [ -f cloud/state/lmk_$p/env ] && ! grep -q "upload incomplete\|no OptiX" $R/pod_$p.log; then break; fi
    [ -f cloud/state/lmk_$p/env ] && bash cloud/lmk_pod.sh $p down "era_auto: bad host, retry" | tail -1; say "$p failed (no pod / bad host), retry"; sleep 15; done
  [ -f cloud/state/lmk_$p/env ] || { say "$k no pod after 3 tries"; return 1; }
  . cloud/state/lmk_$p/env; SO=(-o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null -o LogLevel=ERROR)
  ssh -p $PORT $SO root@$IP "Q=/root/q/qw/snap; [ -f \$Q/$SN/gen_buildings.py ] || exit 1; rm -rf \$Q/${SN}k; mkdir -p \$Q/${SN}k && cp -rs \$Q/$SN/. \$Q/${SN}k/ && rm -f \$Q/${SN}k/hq_city.py \$Q/${SN}k/hq_scene.py \$Q/${SN}k/era.py \$Q/${SN}k/lm_places.py$([ -f $K/gen_buildings.py ] && echo " \$Q/${SN}k/gen_buildings.py")" || { say "$p link failed"; return 1; }
  scp -q -P $PORT $SO $K/hq_city.py $K/hq_scene.py $K/era.py $K/lm_places.py $(ls $K/*.json $K/gen_buildings.py 2>/dev/null) root@$IP:/root/q/qw/snap/${SN}k/ || { say "$p scp failed"; return 1; }
  # (02/10 k20 RULE TOPO_SHIP) the stage list drops '*/masks/*': an overlay with topo/ (the USGS sheet masks era.py reads) ships it next to era.py
  if [ -d $K/topo ]; then scp -q -r -P $PORT $SO $K/topo root@$IP:/root/q/qw/snap/${SN}k/ && ssh -p $PORT $SO root@$IP "ls /root/q/qw/snap/${SN}k/topo | wc -l" | grep -q "^ *$(ls $K/topo | wc -l | tr -d ' ')\$" || { say "$p topo scp failed"; return 1; }; say "$p topo sheets shipped"; fi
  say "$p ready ($(grep -o 'NVIDIA [A-Za-z0-9 ]*' $R/pod_$p.log | head -1))"
  PAR=1 bash $B/render_b8.sh $p ${SN}k $R/jobs_$k.txt $R/render "$GL" > $R/render_$p.log 2>&1
  say "$p rendered: $(grep -c ' s tb=0 png=[12]' $R/render_$p.log) ok, tracebacks $(grep -c 'tb=[1-9]' $R/render_$p.log)"
  bash cloud/lmk_pod.sh $p down "era_auto $R" 2>&1 | tail -1; }
for k in $(seq 0 $((NP - 1))); do pod $k & sleep 20; done
wait
down_all; trap - EXIT
say "DONE: $(ls $R/render 2>/dev/null | grep -c 'b_.*\.jpg$') beauty, $(ls $R/render 2>/dev/null | grep -c 'gid.png$') passes"
