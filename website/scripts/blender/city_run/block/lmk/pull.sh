#!/bin/bash
# pull.sh <name>...: card -> lmk/out/<name>/
H=/Volumes/QIPU-SSD/qipu-render-work/combo/vancouver/lmk; read IP PORT < /Users/daniel/code/qipu-render-work/speed/addr_lmk4
for n in "$@"; do mkdir -p $H/out/$n; rsync -a -e "ssh -p $PORT -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null -o LogLevel=ERROR" root@$IP:/root/lr/out/LMK/$n/ $H/out/$n/; done
