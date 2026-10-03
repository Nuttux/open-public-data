"""era_auto, per city: the values the era chain's scripts (this folder: copies of qipu-render-work/era_anim/auto, parametrised)
took as San Francisco literals. CITY unset or 'sf' = exactly those literals (identity.py proves the copies equal the originals then).
Another city: qipu-render-work/cities/<CITY>/city.json "eras" -> "pipeline" (missing keys keep SF's value, so a city
states only what differs; a key set to null switches the SF thing off):
  city_name               the AI prompt's 'It is <city> in <year>' (SF 'San Francisco')
  fire_years              key years painted as the 1906 fire's ruins + its prompts (SF [1906, 1907]; [] = no fire)
  fire_checkpoint         the key year whose moment is 28 May 1906 (era.when; SF 1906; null = none)
  fire_state              (last pre-fire year, last ash year) of hybrid.py FIRE_GROUND (SF [1905, 1908]; null = one state)
  marks_from              lane paint first drawn (era.py TABLE marks; SF 1970)
  k5                      [from, until) K5: today's lane paint removed (SF [1950, 1972])
  old_pavement_before     M8 every street pixel the year's own (SF 1950)
  deck_cars_from          K1 / check: parked cars kept on an unchanged deck from (SF 1950)
  bike_green_from         M10 green bike paint (SFMTA, SF 2009)
  red_lane_before         hybrid RED_LANE (SFMTA red transit lanes, SF '2013')
  period_prompts_before   ERA_PROMPTS (SF 1930); early_prompts_before (SF 1910)
  key_today_from          auto_jobs KEY_TODAY=1 from (SF 1970)
  snap_root, snap         the snapshot the prep tools import (SF qipu-render-work/snap/ + combo5)
  overlay                 auto_render's default overlay dir (SF block52/qh/kt/k7)
  rail_overlay            keys.py M9's era.py dir when the area has no overlay (SF block52/era_auto/overlay/k8)
  burn_snap, burn_engine  burnmask.py's qc reader dir and engine (SF snap/combo7, opd-render us/sf/city)
  view_ref                [CX, CY, zoom] of the z9 camera the area grids (QC, RA) are in (cloud/viewer/realref.js; SF's REF)
    python3 eracity.py sh     -> the shell assignments (ERA_*) auto_render.sh / run_area.sh eval
    python3 eracity.py json   -> the resolved values"""
import os, sys, json

CITY = os.environ.get('CITY', 'sf')
SF = dict(
    city_name='San Francisco', fire_years=(1906, 1907), fire_checkpoint=1906, fire_state=(1905, 1908),
    marks_from=1970, k5=(1950, 1972), old_pavement_before=1950, deck_cars_from=1950, bike_green_from=2009, red_lane_before='2013',
    period_prompts_before=1930, early_prompts_before=1910, key_today_from=1970,
    snap_root='/Users/daniel/code/qipu-render-work/snap/', snap='combo5',
    overlay='/Volumes/QIPU-SSD/qipu-render-work/combo/block52/qh/kt/k7',
    rail_overlay='/Volumes/QIPU-SSD/qipu-render-work/combo/block52/era_auto/overlay/k8',
    burn_snap='/Users/daniel/code/qipu-render-work/snap/combo7', burn_engine='/Users/daniel/code/opd-render/website/public/data/us/sf/city',
    view_ref=(241.427019126574, 707.0567508859249, 0.06898352692062097))
V = dict(SF)
if CITY != 'sf':
    # (joined, not one literal: citysnap.sh re-points 'qipu-render-work/' literals at cities/<city>/)
    _p = os.environ.get('ERA_CITY_JSON') or os.path.join('/Users/daniel/code', 'qipu-render-work', 'cities', CITY, 'city.json')
    _c = json.load(open(_p))
    V.update({k: (tuple(v) if isinstance(v, list) else v) for k, v in _c.get('eras', {}).get('pipeline', {}).items() if k in SF})
    if 'view_ref' not in _c.get('eras', {}).get('pipeline', {}): V['view_ref'] = tuple(_c['ref'])
    if 'burn_engine' not in _c.get('eras', {}).get('pipeline', {}): V['burn_engine'] = _c['engine']

CITY_NAME = V['city_name']; FIRE_YEARS = tuple(V['fire_years'] or ()); FIRE_CHECKPOINT = V['fire_checkpoint']
FIRE_STATE = tuple(V['fire_state']) if V['fire_state'] else (-1, -1)
MARKS_FROM = V['marks_from']; K5_FROM, K5_UNTIL = V['k5']; OLD_PAVEMENT_BEFORE = V['old_pavement_before']; DECK_CARS_FROM = V['deck_cars_from']
BIKE_GREEN_FROM = V['bike_green_from']; RED_LANE_BEFORE = str(V['red_lane_before'])
PERIOD_PROMPTS_BEFORE = V['period_prompts_before']; EARLY_PROMPTS_BEFORE = V['early_prompts_before']; KEY_TODAY_FROM = V['key_today_from']
SNAP_ROOT = V['snap_root']; SNAP = V['snap']; OVERLAY = V['overlay']; RAIL_OVERLAY = V['rail_overlay']
BURN_SNAP = V['burn_snap']; BURN_ENGINE = V['burn_engine']; VIEW_CX, VIEW_CY, VIEW_Z = V['view_ref']


def moment(Y):
    """the float year a key year's render stands for (era.when): the fire checkpoint is 28 May 1906 (SF), else the year's middle"""
    return 1906 + 147 / 365.0 if Y == FIRE_CHECKPOINT else Y + 0.5


if __name__ == '__main__':
    if sys.argv[1:] == ['sh']:
        for k, v in dict(ERA_SNAP=SNAP, ERA_OVERLAY=OVERLAY, ERA_CITY=CITY).items(): print(f"{k}='{v}'")
    else:
        print(json.dumps(dict(CITY=CITY, **{k: V[k] for k in sorted(V)}), indent=1))
