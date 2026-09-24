#!/bin/bash
# bundle.sh — what a snapshot render needs on the pod, and its upload.
#   bash bundle.sh size  <snap>                 -> sizes of the static part and of the snapshot part (nothing sent)
#   bash bundle.sh lists <snap>                 -> writes cloud/state/static.list and snap_<snap>.list (rsync --files-from)
#   bash bundle.sh up-static <ip> <port>        -> rsync the static part to the pod (once per pod: its volume)
#   bash bundle.sh up-snap <snap> <ip> <port>   -> rsync one snapshot (only what it reads), then patch the POD copy
#                                                  for CYCLES_DEVICE until main commits the patch
# Layout on the pod ($QIPU_ROOT=/root/q, see pod_setup.sh, which maps the Mac's absolute paths onto it):
#   qw/  = qipu-render-work (city/, landmarks/dem/2m, snap/<name>/, cloud/)
#   assets/polyhaven/<asset>    pubcity/  = opd-render website/public/data/us/sf/city
# What is left out, from the file-access audit of a full frame (cloud/audit_open.py; cloud/parity/audit_mac.txt):
#   Poly Haven assets no script names; ground_cls_raw.npy, ground/naip_s, life/t (prep inputs, never opened
#   by a render); the public city film/ folder.
set -e
W=/Users/daniel/code/qipu-render-work; C=$W/cloud; P=/Users/daniel/code/qipu-assets/polyhaven
PUB=/Users/daniel/code/opd-render/website/public/data/us/sf/city; ST=$C/state; mkdir -p $ST
SSHO="-o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null -o LogLevel=ERROR -o ServerAliveInterval=30"

assets() {   # the Poly Haven assets the snapshot's scripts name
  for d in $(ls $P); do grep -qw "$d" "$1"/*.py && echo $d; done
}
lists() {
  S=$W/snap/$1
  { (cd $W && find city landmarks/dem/2m -type f)
    for a in $(assets $S); do (cd $P/.. && find polyhaven/$a -type f | sed 's#^#@assets/#'); done
    (cd $PUB && find . -type f ! -path './film/*' | sed 's#^./#@pubcity/#')
  } > $ST/static.list
  (cd $W && find snap/$1 -type f ! -path '*/data/ground/ground_cls_raw.npy' ! -path '*/data/ground/naip_s/*' \
     ! -path '*/data/life/t/*' ! -name '*.pyc' ! -path '*/masks/*') > $ST/snap_$1.list
}
sz() { python3 - "$@" <<'PY'
import os, sys
W, P, PUB = '/Users/daniel/code/qipu-render-work', '/Users/daniel/code/qipu-assets', '/Users/daniel/code/opd-render/website/public/data/us/sf/city'
for f in sys.argv[1:]:
    t = 0; n = 0
    for l in open(f):
        l = l.strip(); p = P + '/' + l[8:] if l.startswith('@assets/') else PUB + '/' + l[9:] if l.startswith('@pubcity/') else W + '/' + l
        t += os.path.getsize(p); n += 1
    print(f'{os.path.basename(f)}: {n} files, {t / 1e9:.2f} GB')
PY
}
prsync() {   # prsync <list> <src/> <dst/> <ssh> [opts]: rsync in NS parallel streams (one ssh stream is latency-bound)
  l=$1; src=$2; dst=$3; e=$4; shift 4; k=${NS:-4}
  python3 - $l $src $k <<'PY'
import os, sys
l, src, k = sys.argv[1], sys.argv[2], int(sys.argv[3]); fs = [x.strip() for x in open(l) if x.strip()]
fs.sort(key=lambda f: -os.path.getsize(os.path.join(src, f))); b = [[] for _ in range(k)]; t = [0] * k
for f in fs: i = t.index(min(t)); b[i].append(f); t[i] += os.path.getsize(os.path.join(src, f))
for i in range(k): open(f'{l}.{i}', 'w').write('\n'.join(b[i]) + '\n')
PY
  for i in $(seq 0 $((k - 1))); do rsync -a --no-owner --no-group "$@" --files-from=$l.$i -e "$e" $src root@$IP:$dst & done; wait
}
case $1 in
  size)  lists $2; sz $ST/static.list $ST/snap_$2.list ;;
  lists) lists $2 ;;
  speed)   # speed <ip> <port>: 100 MB of random bytes to the pod in NS parallel streams -> MB/s in state/uplink.txt
    IP=$2; PORT=$3; T=$ST/speed; mkdir -p $T; for i in 0 1 2 3; do [ -f $T/r$i ] || head -c 25000000 /dev/urandom > $T/r$i; done
    ls $T | grep '^r' > $ST/speed.list; t0=$(python3 -c 'import time;print(time.time())')
    NS=4 prsync $ST/speed.list $T/ /root/q/speedtest/ "ssh -p $PORT $SSHO"
    python3 -c "import time;r=100/(time.time()-$t0);print(f'{r:.2f}')" | tee $ST/uplink.txt
    ssh -p $PORT $SSHO root@$IP rm -rf /root/q/speedtest ;;
  pack)    # pack <snap>: ours (the snapshot + city/ + the public city data) as ONE zstd tar in the pod's layout, made once
           # per snapshot and reused by every pod (state/pack_<snap>.tar.zst; the 2 newest kept)
    N=$2; K=$ST/pack_$N.tar.zst; [ -s $K ] && { echo "$K $(du -h $K | cut -f1) (cached)"; exit 0; }
    lists $N; t0=$(date +%s); G=$ST/stage_$N; rm -rf $G; mkdir -p $G/qw $G/pubcity
    grep -v '^@' $ST/static.list | grep -v '^landmarks/dem/' | while read f; do mkdir -p $G/qw/$(dirname $f); cp -c $W/$f $G/qw/$f; done
    grep '^@pubcity/' $ST/static.list | cut -c10- | while read f; do mkdir -p $G/pubcity/$(dirname $f); cp -c $PUB/$f $G/pubcity/$f; done
    while read f; do mkdir -p $G/qw/$(dirname $f); cp -c $W/$f $G/qw/$f; done < $ST/snap_$N.list
    tar -C $G -cf - qw pubcity | zstd -q -T0 -3 -o $K; rm -rf $G
    ls -t $ST/pack_*.tar.zst | tail -n +3 | xargs rm -f
    echo "$K $(du -h $K | cut -f1) packed in $(( $(date +%s) - t0 )) s" ;;
  up-pack) # up-pack <snap> <ip> <port>: the pack in NS parallel pieces, unpacked on the pod
    N=$2; IP=$3; PORT=$4; K=$ST/pack_$N.tar.zst; t0=$(date +%s); k=${NS:-4}
    sz=$(stat -f %z $K); rm -f $K.part_*; split -b $(( sz / k + 1 )) $K $K.part_
    ssh -p $PORT $SSHO root@$IP "mkdir -p /root/q/in"
    for f in $K.part_*; do scp -P $PORT $SSHO -q $f root@$IP:/root/q/in/ & done; wait; rm -f $K.part_*
    ssh -p $PORT $SSHO root@$IP "cat /root/q/in/pack_$N.tar.zst.part_* | zstd -d -q | tar -x -C /root/q && rm -rf /root/q/in"
    scp -P $PORT $SSHO -q $C/apply_patch.py $C/patches/hq_scene_cycles_device.patch $C/pod_render.sh root@$IP:/root/q/qw/cloud/ 2>/dev/null || \
      { ssh -p $PORT $SSHO root@$IP mkdir -p /root/q/qw/cloud; scp -P $PORT $SSHO -q $C/apply_patch.py $C/patches/hq_scene_cycles_device.patch $C/pod_render.sh root@$IP:/root/q/qw/cloud/; }
    got=$(ssh -p $PORT $SSHO root@$IP "cd /root/q/qw/snap/$N && find . -type f | wc -l"); want=$(wc -l < $ST/snap_$N.list)
    [ "$got" -ge "$want" ] || { echo "SNAPSHOT INCOMPLETE on the pod: $got of $want files"; exit 1; }
    ssh -p $PORT $SSHO root@$IP "python3 /root/q/qw/cloud/apply_patch.py /root/q/qw/snap/$N/hq_scene.py /root/q/qw/cloud/hq_scene_cycles_device.patch"
    echo "pack up + unpacked in $(( $(date +%s) - t0 )) s" ;;
  up-public) # up-public <ip> <port>: the pod fetches Poly Haven + 3DEP itself; a --checksum rsync makes them the Mac's bytes
    IP=$2; PORT=$3; t0=$(date +%s); E="ssh -p $PORT $SSHO"
    grep '^landmarks/dem/' $ST/static.list > $ST/s_dem.list; grep '^@assets/' $ST/static.list | cut -c9- > $ST/s_as.list
    B=/Users/daniel/code/opd-render/website/scripts/blender
    { echo 'cd /root; rm -f /root/q/fetch.done'
      echo "printf '%s\\n' $(cut -d/ -f2 $ST/s_as.list | sort -u | tr '\n' ' ') | xargs -P 8 -I{} python3 ph_fetch.py 2k {} > /root/q/ph_fetch.log 2>&1"
      echo 'xargs -P 8 -L 1 python3 fetch_dem.py 2 < /root/dem_boxes.txt > /root/q/dem_fetch.log 2>&1'
      echo 'touch /root/q/fetch.done'; } > $ST/fetch_public.sh
    sed -E 's#.*/t_(-?[0-9]+)_(-?[0-9]+)\.npy#\1 \2#' $ST/s_dem.list | awk '{printf "%d %d %d %d\n", $1*2000+1, $2*2000+1, ($1+1)*2000-1, ($2+1)*2000-1}' > $ST/dem_boxes.txt
    scp -P $PORT $SSHO -q $B/ph_fetch.py $B/fetch_dem.py $ST/fetch_public.sh $ST/dem_boxes.txt root@$IP:/root/
    ssh -p $PORT $SSHO root@$IP "nohup bash /root/fetch_public.sh > /dev/null 2>&1 &"
    until ssh -p $PORT $SSHO root@$IP test -f /root/q/fetch.done; do sleep 5; done
    echo "public data fetched on the pod in $(( $(date +%s) - t0 )) s ($(ssh -p $PORT $SSHO root@$IP 'grep -c ^ok /root/q/ph_fetch.log; grep -c ^ok /root/q/dem_fetch.log' | tr '\n' ' ')ok)"
    t1=$(date +%s)
    prsync $ST/s_as.list $P/../ /root/q/assets/ "$E" --checksum --stats | grep -E "^Total transferred|^sent" | head -2 & prsync $ST/s_dem.list $W/ /root/q/qw/ "$E" --checksum -z --stats | grep -E "^sent" | head -1 & wait
    echo "checksum fix-up $(( $(date +%s) - t1 )) s" ;;
  up-static)
    # ours (city/, the public city data) goes up from the Mac; what is PUBLIC the pod fetches itself: the Poly Haven
    # assets (polyhaven.com, CC0) and the 3DEP DEM tiles (USGS). A --checksum rsync afterwards sends only a file whose
    # bytes differ from the Mac's copy, so the pod ends up with exactly the Mac's set whatever the sources returned.
    IP=$2; PORT=$3; [ -s $ST/static.list ] || lists ${4:-$(ls -t $W/snap | head -1)}
    t0=$(date +%s); E="ssh -p $PORT $SSHO"
    grep -v '^@' $ST/static.list | grep -v '^landmarks/dem/' > $ST/s_qw.list; grep '^landmarks/dem/' $ST/static.list > $ST/s_dem.list
    grep '^@assets/' $ST/static.list | cut -c9- > $ST/s_as.list; grep '^@pubcity/' $ST/static.list | cut -c10- > $ST/s_pc.list
    B=/Users/daniel/code/opd-render/website/scripts/blender
    scp -P $PORT $SSHO -q $B/ph_fetch.py $B/fetch_dem.py root@$IP:/root/
    { echo 'cd /root; rm -f /root/q/fetch.done'
      echo "printf '%s\\n' $(cut -d/ -f2 $ST/s_as.list | sort -u | tr '\n' ' ') | xargs -P 8 -I{} python3 ph_fetch.py 2k {} > /root/q/ph_fetch.log 2>&1"
      sed -E 's#.*/t_(-?[0-9]+)_(-?[0-9]+)\.npy#\1 \2#' $ST/s_dem.list | awk '{printf "%d %d %d %d\n", $1*2000+1, $2*2000+1, ($1+1)*2000-1, ($2+1)*2000-1}' > $ST/dem_boxes.txt
      echo 'xargs -P 8 -L 1 python3 fetch_dem.py 2 < /root/dem_boxes.txt > /root/q/dem_fetch.log 2>&1'
      echo 'touch /root/q/fetch.done'; } > $ST/fetch_public.sh
    scp -P $PORT $SSHO -q $ST/fetch_public.sh $ST/dem_boxes.txt root@$IP:/root/
    ssh -p $PORT $SSHO root@$IP "nohup bash /root/fetch_public.sh > /dev/null 2>&1 &"
    prsync $ST/s_qw.list $W/ /root/q/qw/ "$E" -z & prsync $ST/s_pc.list $PUB/ /root/q/pubcity/ "$E" -z & wait
    echo "ours up in $(( $(date +%s) - t0 )) s"
    until ssh -p $PORT $SSHO root@$IP test -f /root/q/fetch.done; do sleep 5; done
    echo "public data fetched on the pod in $(( $(date +%s) - t0 )) s ($(ssh -p $PORT $SSHO root@$IP 'grep -c ^ok /root/q/ph_fetch.log; grep -c ^ok /root/q/dem_fetch.log' | tr '\n' ' ')ok)"
    t1=$(date +%s)
    prsync $ST/s_as.list $P/../ /root/q/assets/ "$E" --checksum --stats & prsync $ST/s_dem.list $W/ /root/q/qw/ "$E" --checksum -z --stats & wait
    echo "checksum fix-up $(( $(date +%s) - t1 )) s; static total $(( $(date +%s) - t0 )) s" ;;
  up-snap)
    N=$2; IP=$3; PORT=$4; [ -s $ST/snap_$N.list ] || lists $N; t0=$(date +%s); E="ssh -p $PORT $SSHO"
    # incremental: files already on the pod (an earlier snapshot of the same data) are reused, only changed ones travel
    PREV=$(ssh -p $PORT $SSHO root@$IP "ls -t /root/q/qw/snap 2>/dev/null | grep -vx $N | head -1")
    sed "s#^snap/$N/##" $ST/snap_$N.list > $ST/snap_$N.rel
    ssh -p $PORT $SSHO root@$IP "mkdir -p /root/q/qw/snap/$N /root/q/qw/cloud"   # rsync creates only the last level
    prsync $ST/snap_$N.rel $W/snap/$N/ /root/q/qw/snap/$N/ "$E" -z --checksum ${PREV:+--copy-dest=/root/q/qw/snap/$PREV/}
    scp -P $PORT $SSHO -q $C/apply_patch.py $C/patches/hq_scene_cycles_device.patch $C/pod_render.sh root@$IP:/root/q/qw/cloud/ 2>/dev/null || \
      { ssh -p $PORT $SSHO root@$IP mkdir -p /root/q/qw/cloud; scp -P $PORT $SSHO -q $C/apply_patch.py $C/patches/hq_scene_cycles_device.patch $C/pod_render.sh root@$IP:/root/q/qw/cloud/; }
    got=$(ssh -p $PORT $SSHO root@$IP "cd /root/q/qw/snap/$N && find . -type f | wc -l"); want=$(wc -l < $ST/snap_$N.list)
    [ "$got" -ge "$want" ] || { echo "SNAPSHOT INCOMPLETE on the pod: $got of $want files"; exit 1; }
    ssh -p $PORT $SSHO root@$IP "python3 /root/q/qw/cloud/apply_patch.py /root/q/qw/snap/$N/hq_scene.py /root/q/qw/cloud/hq_scene_cycles_device.patch"
    echo "snapshot $N upload $(( $(date +%s) - t0 )) s" ;;
esac
