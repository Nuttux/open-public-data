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

## Measured (24/09 evening)
- Uplink from Daniel's Mac: 8.6–9.8 MB/s over 4 streams to EU/US pods; ~1 MB/s to a pod in Taiwan (latency-bound), so pods are EU first, then US east, never Asia.
- Upload per pod: ours = one zstd pack per snapshot (snapshot + city/ + the public city data, 720 MB, ~80 s up and unpacked);
  public data fetched by the pod itself (Poly Haven 2k, 3DEP tiles), which comes back byte-identical (checksum fix-up sends ~23 KB), ~90 s in parallel.
- Parity (frame 4:3, snap cloud_p1): A40 OptiX vs M4 Pro Metal, mean abs diff 1.11/255 (0.45 with noise averaged at 1/8 res);
  L40S CUDA + GPU denoiser: 1.36/255 (0.54). Geometry, materials and light identical at 2x.
- Per frame on the pod: path tracing 27–41 s (CUDA/OptiX + GPU OIDN), but the scene build is ~150 s of single-threaded Python
  (Mac: 66 s). Blender ~25 GB RSS and ~12 GB VRAM per frame, so throughput comes from PAR (frames at once), bounded by container RAM.
- Driver 550 fails OptiX (PTX compile error); the setup's warm-up falls back to CUDA automatically.
- A create call answering 500 can still make a pod: pod.py adopts it; guard terminates any untracked qipu-* pod older than 3 min.

(Committed copy; the scripts run from qipu-render-work/cloud/, where state/, COSTS.md, ckpt_*/ live.)
