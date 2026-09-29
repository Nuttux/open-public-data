#!/bin/bash
# city/run/run_win.sh <gpu label> <window dir> <window name> up|wait|pull|push_l8   (= combo/block52/run_b8.sh for the city: resume + registries)
#  up      : window dir -> card /root/<w>/ (stage bucket when it works, rsync fallback); if <ROOT>/l8/<w>.jpg exists (a dead card's L8)
#            it goes to /root/lr/out/<w>/l8_<w>.jpg so sl8v_city.py RESUMES with the same L8; starts run_pyv.py sl8v.py (FP8=3, as b8)
#  wait    : until every P.txt tile exists on the card; exit 1 if the runner stopped (STOPPED) or no new tile for STALL s (default 900;
#            the first tile may take 25 min: L8 anchors + compile) -> city.py treats exit 1 as a dead card
#  pull    : tiles -> <ROOT>/tiles/ (the registry), l8_<w>.jpg/.json -> <ROOT>/l8/<w>.{jpg,json}, log_<w>.txt -> the window dir
W=/Users/daniel/code/qipu-render-work; ROOT=${CITY_ROOT:-/Volumes/QIPU-SSD/qipu-city}; L=$1; A=$2; N=$3; read IP PORT < $W/speed/addr_$L
SSHO="-o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null -o LogLevel=ERROR -o ServerAliveInterval=30 -o ConnectTimeout=20"
X() { ssh -p $PORT $SSHO root@$IP "$@"; }
case "$4" in
 up) rsync -a --exclude 'pt/' -e "ssh -p $PORT $SSHO" $A/ root@$IP:/root/$N/ || { echo UPLOAD_FAIL; exit 1; }
     if [ -f $ROOT/l8/$N.jpg ]; then X "mkdir -p /root/lr/out/$N" && scp -q -P $PORT $SSHO $ROOT/l8/$N.jpg root@$IP:/root/lr/out/$N/l8_$N.jpg; fi
     X "mkdir -p /root/lr/out; cd /root/$N && FP8=3 HF_HOME=/root/hf HF_HUB_OFFLINE=1 nohup /usr/local/bin/python -u run_pyv.py sl8v.py /root/$N > /root/$N/run.out 2>&1 < /dev/null &"; echo STARTED;;
 wait) n=$(grep -c '^C9:' $A/P.txt); last=-1; t=$(date +%s); STALL=${STALL:-900}; FIRST=${FIRST:-1500}
     while :; do d=$(X "ls /root/lr/out/$N 2>/dev/null | grep -v '^l8' | grep -c jpg" 2>/dev/null) || d=$last; r=$(X "pgrep -f 'sl8v.py /root/$N' >/dev/null && echo run || echo stop" 2>/dev/null) || r=unreachable
       [ "${d:-0}" -ge "$n" ] && break; [ "$r" = stop ] && { echo "STOPPED at $d/$n"; X "tail -5 /root/$N/run.out"; exit 1; }
       if [ "$d" != "$last" ]; then last=$d; t=$(date +%s); fi; lim=$STALL; [ "${d:-0}" -eq 0 ] && lim=$FIRST
       [ $(( $(date +%s) - t )) -gt $lim ] && { echo "STALLED at $d/$n ($r)"; exit 1; }; echo "$(date +%H:%M:%S) $N $d/$n $r" > $A/progress; sleep 60; done; echo "DONE $d/$n";;
 pull) mkdir -p $ROOT/tiles $ROOT/l8
     rsync -a --exclude 'l8*' -e "ssh -p $PORT $SSHO" root@$IP:/root/lr/out/$N/ $ROOT/tiles/ || exit 1
     rsync -a -e "ssh -p $PORT $SSHO" root@$IP:/root/lr/out/$N/l8_$N.jpg root@$IP:/root/lr/out/$N/l8_$N.json $A/ 2>/dev/null && cp $A/l8_$N.jpg $ROOT/l8/$N.jpg && cp $A/l8_$N.json $ROOT/l8/$N.json
     rsync -a -e "ssh -p $PORT $SSHO" root@$IP:/root/$N/log_$N.txt root@$IP:/root/$N/run.out $A/ 2>/dev/null
     echo PULLED $(grep -c '^C9:' $A/P.txt) tiles in P.txt, $(ls $ROOT/tiles | grep -c jpg) in the registry;;
esac
