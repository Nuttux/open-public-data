# Vancouver landmark patches (LMK1, 13/10)
Painted landmark patches on the present-day painted map (FLUX.2 klein on a cloud card), shape held by the clay render + a coarse colour lock. Data (jobs/, out/, patches/, qa/, LMK_LOG.md) lives on the SSD: /Volumes/QIPU-SSD/qipu-render-work/combo/vancouver/lmk (LMK_HOME).
- mkjobs.py -> jobs.json (boxes, polygons, prompts); prep.py -> jobs/<name>/{base.png,mask.png,job.json}; lmk_job.py runs on the card via run_pyv.py; pull.sh; composite.py <name> [--save] (soft rim, QA before/after in qa/, --save keeps patches/<name>)
- rebuild_lmk_tiles.py: re-applies patches/ onto the LATEST block tiles, writes ONLY the touched z9 tiles to cloud/ckpt_van_ct_lmk; merge_city_today.py lists van_ct_lmk FIRST. Rerun both after any block merge.
- lmk_lock.json "off": the render-paste is retired per landmark (bc_place, harbour_centre, science_world); canada_place keeps it (its patch failed QA).
