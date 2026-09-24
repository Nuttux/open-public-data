#!/bin/bash
# bundle.sh — what a snapshot render needs on the pod, and its upload.
#   bash bundle.sh size  <snap>                 -> sizes of the static part and of the snapshot part (nothing sent)
#   bash bundle.sh lists <snap>                 -> writes cloud/state/static.list and snap_<snap>.list (rsync --files-from)
#   bash bundle.sh up-static <ip> <port>        -> rsync the static part to the pod (once per pod: its volume)
#   bash bundle.sh up-snap <snap> <ip> <port>   -> rsync one snapshot (only what it reads), then patch the POD copy
#                                                  for CYCLES_DEVICE until main commits the patch
# Layout on the pod ($QIPU_ROOT=/workspace, see pod_setup.sh, which maps the Mac's absolute paths onto it):
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
case $1 in
  size)  lists $2; sz $ST/static.list $ST/snap_$2.list ;;
  lists) lists $2 ;;
  up-static)
    IP=$2; PORT=$3; lists ${4:-$(ls -t $W/snap | head -1)}
    t0=$(date +%s)
    grep -v '^@' $ST/static.list > $ST/s_qw.list; grep '^@assets/' $ST/static.list | cut -c9- > $ST/s_as.list; grep '^@pubcity/' $ST/static.list | cut -c10- > $ST/s_pc.list
    R="rsync -a --files-from"; E="ssh -p $PORT $SSHO"
    $R=$ST/s_qw.list -e "$E" $W/ root@$IP:/workspace/qw/
    $R=$ST/s_as.list -e "$E" $P/.. root@$IP:/workspace/assets/
    $R=$ST/s_pc.list -e "$E" $PUB/ root@$IP:/workspace/pubcity/
    echo "static upload $(( $(date +%s) - t0 )) s" ;;
  up-snap)
    N=$2; IP=$3; PORT=$4; lists $N; t0=$(date +%s); E="ssh -p $PORT $SSHO"
    # incremental: files already on the pod (an earlier snapshot of the same data) are reused, only changed ones travel
    PREV=$(ssh -p $PORT $SSHO root@$IP "ls -t /workspace/qw/snap 2>/dev/null | grep -vx $N | head -1")
    rsync -a -z --checksum ${PREV:+--copy-dest=/workspace/qw/snap/$PREV/} --files-from=<(sed "s#^snap/$N/##" $ST/snap_$N.list) \
      -e "$E" $W/snap/$N/ root@$IP:/workspace/qw/snap/$N/
    scp -P $PORT $SSHO -q $C/apply_patch.py $C/patches/hq_scene_cycles_device.patch $C/pod_render.sh root@$IP:/workspace/qw/cloud/ 2>/dev/null || \
      { ssh -p $PORT $SSHO root@$IP mkdir -p /workspace/qw/cloud; scp -P $PORT $SSHO -q $C/apply_patch.py $C/patches/hq_scene_cycles_device.patch $C/pod_render.sh root@$IP:/workspace/qw/cloud/; }
    ssh -p $PORT $SSHO root@$IP "python3 /workspace/qw/cloud/apply_patch.py /workspace/qw/snap/$N/hq_scene.py /workspace/qw/cloud/hq_scene_cycles_device.patch"
    echo "snapshot $N upload $(( $(date +%s) - t0 )) s" ;;
esac
