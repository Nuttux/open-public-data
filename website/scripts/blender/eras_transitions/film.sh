#!/bin/zsh
# the pilot transitions film: each shot rendered from its prepared step, then cut together (hard cuts; shots 1-3 chain
# seamlessly: each ends on the consistent key the next one starts from)
F=/Volumes/DANI-SD-DRIVE2/transitions/film; cd /Users/daniel/code/qipu-render-work/eras2/transitions
for s in $(python3 -c "import json; print(' '.join(x['name'] for x in json.load(open('$F/shots.json'))))"); do
  pkl=$(python3 -c "import json; print([x['pkl'] for x in json.load(open('$F/shots.json')) if x['name']=='$s'][0])")
  echo "shot $s $(date +%H:%M:%S)"; nice python3 render.py $pkl $F/plan_$s.json 2>&1 | tail -1
done
ls $F/s*_*.mp4 | sort > $F/list.txt; sed -i '' 's#^#file #' $F/list.txt
ffmpeg -v error -y -f concat -safe 0 -i $F/list.txt -c copy $F/pilot_transitions_1938_today.mp4 && echo "film $(date +%H:%M:%S)" && ffprobe -v error -show_entries stream=width,height,nb_frames -of csv=p=0 $F/pilot_transitions_1938_today.mp4
