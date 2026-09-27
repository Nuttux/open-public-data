#!/bin/bash
# ek_pod.sh <label> <max_hours>: a klein pod for the era keys v2: create (NETVOL=1 first), check CUDA, set up klein, upload the
# runner + the job's inputs (ek2/up), start ek_run.py. The job files are released separately (touch <file>.ok on the pod).
# Log: /Volumes/DANI-SD-DRIVE2/transitions/ek2/pod_<label>.log
D=/Users/daniel/code/qipu-render-work/eras2/transitions/ai; E=/Volumes/DANI-SD-DRIVE2/transitions/ek2; L=$1; H=$2; export TPA=$L
cd $D
for try in 1 2 3; do
  P=""; for c in $(seq 12); do
    P=$(NETVOL=${NETVOL:-1} python3 pod_tr.py create $L $H 2>$E/pod_create_$L.log | tail -1); tail -1 $E/pod_create_$L.log
    echo "$P" | grep -qE '^[a-z0-9]{10,20}$' && break; P=""; echo "$(date +%H:%M:%S) create attempt $c: no card, retry in 90 s"; sleep 90; done
  [ -z "$P" ] && { echo "NO POD"; exit 1; }
  python3 /Users/daniel/code/qipu-render-work/cloud/pod.py wait $P > pod_addr_$L || exit 1; echo "pod $P $(cat pod_addr_$L)"; echo $P > pod_id_$L
  ok=""; for k in 1 2 3 4 5 6 7 8; do ok=$(./tssh.sh 'nvidia-smi -L >/dev/null 2>&1 && python -c "import torch;print(torch.cuda.is_available())"' 2>/dev/null | tail -1); [ -n "$ok" ] && break; sleep 15; done
  [ "$ok" = True ] && break
  echo "pod $P: CUDA not usable ($ok): terminating, retry"; python3 /Users/daniel/code/qipu-render-work/cloud/pod.py terminate $P >/dev/null; python3 /Users/daniel/code/qipu-render-work/cloud/pod.py log $P "$L: bad host (CUDA), replaced"
done
[ "$ok" = True ] || { echo "NO WORKING POD"; exit 1; }
read IP PORT < pod_addr_$L; SCP="scp -q -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null -o LogLevel=ERROR -P $PORT"
./tssh.sh "mkdir -p /root/ek/jobs /root/ek/out /root/ek/up" && $SCP /Users/daniel/code/qipu-render-work/ai/setup_klein.sh /Users/daniel/code/qipu-render-work/ai/addguard.py $D/ek_run.py root@$IP:/root/ \
  && ./tssh.sh "nohup bash /root/setup_klein.sh > /root/setup.log 2>&1 &"
until [ -f $E/up/READY ]; do sleep 10; done
echo "$(date +%H:%M:%S) uploading inputs"; tar -C $E/up -cf - --exclude jobs . | ./tssh.sh "tar -xf - -C /root/ek/up" && $SCP $E/up/jobs/*.txt root@$IP:/root/ek/jobs/ && echo "$(date +%H:%M:%S) uploaded"
./tssh.sh "until grep -q SETUP_DONE /root/setup.log; do sleep 5; done; grep -E 'ENV_OK|KLEIN_OK' /root/setup.log; [ -x /root/klein/bin/python ] && PY=/root/klein/bin/python || PY=python; export HF_HOME=/root/hf HF_HUB_OFFLINE=1; cd /root; setsid nohup \$PY -u ek_run.py > /root/ek_run.out 2>&1 < /dev/null & echo RUN_STARTED"
