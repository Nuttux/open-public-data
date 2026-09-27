#!/usr/bin/env python3
"""cpulock.py <command...>: run a heavy Mac CPU job (> 2 GB RAM) holding the SHARED lock of all agents (coordinator rule 27/09 ~15:45):
fcntl.flock on /Users/daniel/code/qipu-render-work/.cpu_heavy.lock (the same lock `flock(1)` takes; flock(1) is not installed on this
Mac), waiting for it; then waits until / has >= 8 GB free before starting. The lock is released when the command ends."""
import fcntl, os, sys, time, shutil, subprocess
L = '/Users/daniel/code/qipu-render-work/.cpu_heavy.lock'
fd = os.open(L, os.O_RDWR | os.O_CREAT, 0o644)
t0 = time.time(); fcntl.flock(fd, fcntl.LOCK_EX)
w = time.time() - t0
while shutil.disk_usage('/').free < 8e9: time.sleep(30)
if time.time() - t0 > 5: print(f'[cpulock] waited {time.time() - t0:.0f} s (lock {w:.0f} s)', file=sys.stderr, flush=True)
sys.exit(subprocess.call(sys.argv[1:]))
