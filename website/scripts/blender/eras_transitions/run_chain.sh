#!/bin/zsh
# the consistent keys of one window, from today back to 1938 (each step's A* is the next earlier step's B), then its preps
W=$1; D=$2; mkdir -p $D; cd /Users/daniel/code/qipu-render-work/eras2/transitions
echo "chain start $(date +%H:%M:%S) win $W" 
nice python3 prep.py 2006 now $W $D/p_2006_now.pkl - $D/K_2006.npy 2>&1 | grep -v "^sanborn: no freeway" | tail -4
nice python3 prep.py 1985 2006 $W $D/p_1985_2006.pkl $D/K_2006.npy $D/K_1985.npy 2>&1 | grep -v "^sanborn: no freeway" | tail -4
nice python3 prep.py 1959 1985 $W $D/p_1959_1985.pkl $D/K_1985.npy $D/K_1959.npy 2>&1 | grep -v "^sanborn: no freeway" | tail -4
nice python3 prep.py 1938 1959 $W $D/p_1938_1959.pkl $D/K_1959.npy $D/K_1938.npy 2>&1 | grep -v "^sanborn: no freeway" | tail -4
echo "chain done $(date +%H:%M:%S)"
