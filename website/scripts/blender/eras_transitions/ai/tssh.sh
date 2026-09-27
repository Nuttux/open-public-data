#!/bin/bash
# run a command on a transitions pod: TPA=<label> tssh.sh <cmd>   (address in eras2/transitions/ai/pod_addr_<label>)
read IP PORT < /Users/daniel/code/qipu-render-work/eras2/transitions/ai/pod_addr_${TPA}
exec ssh -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null -o ConnectTimeout=20 -o ServerAliveInterval=30 -o LogLevel=ERROR -p $PORT root@$IP "$@"
