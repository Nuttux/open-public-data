#!/bin/bash
# viewer.sh — (re)writes viewer/checkpoints.json from what is on disk, starts the local server once, prints the URL.
# Newest checkpoint first; then the pass 0924_0735 (rebuilt locally from its frames) and the site's local tile mirror.
W=/Users/daniel/code/qipu-render-work; C=$W/cloud
python3 - <<'PY'
import glob, json, os
C = '/Users/daniel/code/qipu-render-work/cloud'; out = []
for d in sorted(glob.glob(C + '/ckpt_*/tiles/index.json'), key=os.path.getmtime, reverse=True):
    t = os.path.dirname(d); n = os.path.basename(os.path.dirname(t))[5:]
    note = open(os.path.join(os.path.dirname(t), 'NOTE.txt')).read().strip() if os.path.exists(os.path.join(os.path.dirname(t), 'NOTE.txt')) else ''
    out.append(dict(name=n, tiles='../' + os.path.relpath(t, C), note=note))
if os.path.exists(C + '/ref_0924_0735/tiles/7'): out.append(dict(name='pass 0924_0735', tiles='../ref_0924_0735/tiles', note='present pass, 64 frames'))
if os.path.exists(C + '/../pyramid/tiles/index.json'): out.append(dict(name='site mirror', tiles='../../pyramid/tiles', note='pyramid/tiles (what the site shows)'))
json.dump(out, open(C + '/viewer/checkpoints.json', 'w'), indent=1); print(len(out), 'pyramids:', ', '.join(p['name'] for p in out))
PY
PORT=$(cat $C/state/viewer.port 2>/dev/null)
if [ -z "$PORT" ] || ! curl -s -o /dev/null http://127.0.0.1:$PORT/cloud/viewer/index.html; then
  PORT=8797; while lsof -iTCP:$PORT -sTCP:LISTEN >/dev/null 2>&1; do PORT=$((PORT + 1)); done   # 8766 and 8790 belong to others
  nohup python3 -m http.server $PORT --bind 127.0.0.1 --directory $W > $C/state/viewer.log 2>&1 &
  echo $PORT > $C/state/viewer.port; sleep 1
fi
echo "http://127.0.0.1:$PORT/cloud/viewer/"
