#!/bin/bash
# ssh1.sh <cmd>: ssh to the lmk1 card
read IP PORT < /Users/daniel/code/qipu-render-work/speed/addr_lmk1
ssh -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null -o LogLevel=ERROR -o ConnectTimeout=20 -p $PORT root@$IP "$@"
