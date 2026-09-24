# Cloud renders (RunPod): full frames + full-city checkpoints

Why: the Mac keeps crop tests; full frames / whole-city level-7 checkpoints go to ONE rented 48 GB GPU.
Scope (Daniel 24/09): PRESENT-DAY city only. Budget $20 prepaid, HARD STOP when COSTS.md totals $15.
Checkpoints ON DEMAND only (main runs `ckpt.sh <name>`, at most ~2 a day). No cron, no loop.

## Pieces
- portability: snapshot scripts reach data outside the snapshot through absolute Mac paths.
  On the pod they are rewritten at bundle time to $QIPU_ROOT (default = the Mac paths, unchanged locally).
  patches/ = changes for main's files (format `old\n>>>>\nnew`, blocks separated by `====`).
- CYCLES_DEVICE=OPTIX|CUDA|METAL (default METAL): patch for hq_scene.py/hq_city.py.
- bundle.sh: static part (city/, landmarks/dem, Poly Haven assets, public city data) uploaded once to a small
  network volume; each snapshot uploaded incrementally (rsync over the pod's SSH).
- pod lifecycle (pod.sh): one 48 GB GPU (L40S or RTX A6000, cheaper available), Blender 5.2.2 Linux,
  volume at /workspace. Three stops: on-pod watchdog (`sleep $MAXH; stop self`), driver stops at end,
  local guard (guard.sh) stops any pod past its planned end. Every run logged in COSTS.md (h x $/h).
- parity: one frame (4:3), pod vs Mac, same snapshot: mean abs diff + 2x visual check, times.
- ckpt.sh <name>: snapshot at HEAD, render all land frames of level 7 on the pod, pull back to
  cloud/ckpt_<name>/, grade, build the tile pyramid LOCALLY (no GCS), viewer.
- viewer/: static Leaflet page (swipe vs previous checkpoint and vs pass 0924_0735), python -m http.server
  on a free port (8766 and 8790 are taken).

(Committed copy; the scripts run from qipu-render-work/cloud/, where state/, COSTS.md, ckpt_*/ live. Copy back with cp if edited here.)
