# FIX5 log
15:49:43 start
15:51:05 wrote mk_water_fix5.py (river/seam 2D water)
16:55:32 river 2D fix: tuned on zoom box; full strip run started (fix5_river_00..03)
16:56:53 seam 2D fix written (patches/fix5_seam), qa/fix5_seam_ba.jpg
17:10:53 defect3: building 1/4-scale scan (wh/scan.py) to find warehouses
17:29:35 wh prep running (prep_wh.py, cand>=150k)
22:13:17 resumed after usage limit
22:13:53 river QA images saved
22:14:06 river v1 QA FAIL (damaged tree crowns standing in water); added keep-mask (non-water dilated 5), rerun started
22:14:31 wh selection (17 industrial of 37): 12 13 14 15 16 17 19 20 21 22 26 27 28 29 31 33 34; card fix5 up
22:17:18 card fix5 first attempt: setup failed, destroyed ($0.12); retry
22:21:42 card fix5 READY 5090 $0.689/h
22:23:43 killed resident lr_run9v pid 1926 (OOM), started wh jobs (17) on fix5 card
22:29:17 wh jobs done+pulled
22:29:27 card fix5 destroyed ($0.12 + $0.23 = ~$0.35)
22:31:01 wh: 16 patches accepted (QA sheet: flat membrane roofs, geometry kept); wh_13 lost (card pull cut), skipped. patches/wh_*
23:02:25 river v2 done, QA images regenerated
23:02:46 river v2 QA: trees ok but sand/pine/lawn edges eaten; v3 keep-mask = non-water minus small specks; rerun started (~1h)
00:19:32 river v3 done
00:19:44 river v3 QA: land safe but sparkle lattice remnants at south; v4 keep = opening(nonwater,4) dilated 5; rerun started
12:03:56 resumed (2nd usage reset)
12:04:27 river v4 done, QA regenerated
12:04:32 river v4 accepted PARTIAL (land safe, patchwork mostly gone, a few sparkle remnants at south shore); rebuild+merge
12:14:50 random check seeds 8101..8106 logged BEFORE looking (patch name + point via random.Random(seed))
12:15:57 random check 6/6 pass (all wh patch edges seamless, geometry kept)
