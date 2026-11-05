# (city_run/block/prompts/vancouver.py) Vancouver's prompt keys, pasted by citycfg.prompt_text into lr_run9's source just before
# the model-name line when city.json block.prompt_add names this file (SF: no prompt_add -> lr_run9 byte-identical).
# Runs in lr_run9's namespace: BASE_DRY, GLASS, P are defined above it. Every key is BASE_DRY-based (no water or coastline words: the
# water pixels are the render's, and water words on dry tiles invented ponds in SF, R13) with the light line made northern and one
# per-kind clause (prep_b8 picks the key per tile from block.prompt_areas). Nothing SF: no bay, cable cars, Victorians, California light.
# v2 (06/10 var test VR1): 'green roof gardens' / 'dense mature street trees' / 'half hidden under trees' made the AI plant gardens on bare
# tower roofs and canopy over West End lots -> no tree COUNT words; tree SPECIES only. v3 (VR3): even a negated 'roof gardens' planted
# gardens on Coal Harbour's low roofs -> no garden noun at all; the SOLID-style 'keeps exactly the surface the render shows'.
V_BASE = BASE_DRY.replace('at clear midday: high sun, neutral daylight,',
                          'at clear midday in Vancouver, British Columbia: high sun, clean, cool Pacific Northwest daylight,')
assert V_BASE != BASE_DRY and 'water' not in V_BASE and V_BASE.startswith('Turn this 3D render into a real aerial photograph')
V_GREEN = (' Vancouver is a lush, green Pacific Northwest city: lawns and leaves are deep green, conifers dark green, nothing dry or dusty.'
           ' Every roof, street and lot keeps exactly the surface the render shows.')
V_WOODS = (' an old-growth temperate rainforest, a dense, closed, tall canopy of dark-green Douglas fir, western red cedar and western'
           ' hemlock crowns touching each other, with a few lighter bigleaf maples and red alders; the shaded forest floor between the'
           ' trunks is dark fern and salal understorey; the paths, roads and seawall stay exactly where the render shows them.')
V_GREEN_WOODS = (' Vancouver is a lush, green Pacific Northwest city: leaves are deep green, conifers dark green, nothing dry or dusty.'
                 ' Every roof, street and lot keeps exactly the surface the render shows.')
V_KIND = {
    'towers': (' Downtown Vancouver: slender residential towers with blue-green and green-grey tinted glass curtain walls, thin light mullions'
               ' and glass balcony bands; concrete and brick towers stay concrete and brick.' + GLASS),
    'westend': (' Vancouver\'s West End: concrete and glass apartment towers and older three-storey brick and wooden walk-ups and wooden'
                ' houses on grass boulevards.'),
    'old': (' Gastown, Chinatown and Strathcona: old red-brick and grey-stone warehouses and shops with flat tar-and-gravel roofs, narrow'
            ' heritage storefronts, and painted wooden houses with steep gable roofs of dark shingle.'),
    'lowrise': (' Fairview and False Creek South: three- and four-storey wood-frame and concrete apartment blocks and townhouses with dark'
                ' shingle or flat roofs.'),
    'houses_w': (' Vancouver\'s west side: large wooden Craftsman and Tudor-style houses with steep gable roofs of dark charcoal asphalt'
                 ' shingle, some with moss, wooden siding in deep colours, clipped hedges and deep green lawns; its street trees are mixed'
                 ' broadleaf trees, mostly tall maples, and dark conifers, all in full green summer leaf.'),
    'houses_e': (' East Vancouver: narrow wooden houses with steep gable roofs of dark grey asphalt shingle, mixed with boxy two-storey houses'
                 ' with a shallow-pitched roof and stucco-and-brick walls, wooden siding in deep colours, small green front gardens, back'
                 ' lanes with garages, and grass boulevards; its street trees are mixed broadleaf trees, mostly maples, in full green summer leaf.'),
    # (VT3 06/10) vt2 painted Stanley Park's floor between thin crowns as striped mown grass: the key named 'mown green lawns' and
    # V_GREEN 'lawns'. Now an old-growth clause with no ground-cover noun but the understorey (a negated word plants it, VR3);
    # the render's real openings (Brockton Oval, the Pavilion) keep their surface by 'keeps exactly the surface the render shows'
    'park': (' Stanley Park:' + V_WOODS),
    'forest': (' Pacific Spirit Park:' + V_WOODS),
    'port': (' The working port and industrial flats: flat warehouse roofs of grey and white metal, concrete wharves, rail yards, asphalt'
             ' and gravel yards, and cranes and container stacks only where the render shows them; plain and functional.'),
    'midrise': (' Southeast False Creek: six- to twelve-storey concrete, brick and glass apartment buildings with flat roofs, set along'
                ' wide paved streets.'),
    'gi': (' Granville Island: low industrial sheds and market halls of corrugated metal painted in bright colours, with flat tar roofs.'),
}
for k_, c_ in V_KIND.items(): P['van_' + k_] = V_BASE + c_ + ('' if k_ == 'port' else V_GREEN_WOODS if k_ in ('park', 'forest') else V_GREEN)
P['van_base'] = V_BASE + V_GREEN   # no area kind
# (VT2 06/10) vt1: the CPR / Waterfront yards were painted as an invented park. prep_b8 adds '_rail' to the tile's area key
# where >= block.rail_min m of OSM heavy-rail track crosses it (rails_city.py); the render now draws the tracks (rail_city.py)
# on ballast (ground_city rule 8). No vegetation noun at all (a negated 'garden' planted gardens, VR3).
V_RAIL = (' The railway tracks and rail yards stay exactly where the render shows them: parallel steel rails on dark grey-brown'
          ' gravel ballast and wooden ties, freight cars standing on the yard tracks; a rail yard is bare ballast and track from edge to edge.')
V_KEEP = ' Every roof, street, lot and track keeps exactly the surface the render shows.'   # V_GREEN's 'nothing dry or dusty' would green the yards
for k_, c_ in V_KIND.items(): P['van_' + k_ + '_rail'] = V_BASE + c_ + V_RAIL + ('' if k_ == 'port' else V_KEEP)
P['van_base_rail'] = V_BASE + V_RAIL + V_KEEP
# (VT2 06/10) vt1's East Van and Kits were painted with too many pink cherries: the houses keys no longer name 'flowering
# cherries' (the register's share, 18.7k of 184k street trees, is drawn green: summer); 'mixed broadleaf ... summer leaf'
assert all('lawn' not in P[k_] and 'stripe' not in P[k_] and 'mown' not in P[k_] for k_ in ('van_park', 'van_forest', 'van_park_rail', 'van_forest_rail'))   # (VT3) the woods keys name no lawn
# (OPEN-GROUND 07/10) kits vt: the houses_w key painted big Tudor mansions over Jericho / Locarno / Spanish Banks meadows and beach,
# where the render has only grass, trees and sand (city_today/kits_beach_strip.jpg). prep_b8 now gives a mostly-open tile (render
# buildings <= 8 %, open ground >= 60 %, block/tile_content.py) one of these keys. They are written from scratch, NOT on V_BASE:
# BASE names building / roof / walls / tower / footprint, and even a negated noun plants the thing (VR3). No water word (BASE_DRY rule).
V_OPEN = ('Turn this 3D render into a real aerial photograph taken from the air at clear midday in Vancouver, British Columbia: high sun,'
          ' clean, cool Pacific Northwest daylight, crisp and sharp, real photographic materials on the existing ground, paths and trees.'
          ' Strict edit: keep every path, tree and open surface exactly where it is, same framing and camera; add nothing, remove nothing,'
          ' move nothing.')
V_LUSH = ' Everything is lush and green, nothing dry or dusty.'   # not on the beach key: it would green the sand
V_OPEN_KIND = {
    'beach': (' A wide public sandy beach on Vancouver\'s west side: pale tan sand with a few scattered single grey bleached'
              ' driftwood logs, the paved seawall path running along the back of the beach, and low tufts of'
              ' dune grass where the sand meets the park; sand only where the render shows sand, and grass and trees exactly where the render shows them.'),
    'meadow': (' A big open public park on Vancouver\'s west side: wide, flat, open green meadow grass, a few single broadleaf trees and dark'
               ' conifers standing apart, and narrow gravel and asphalt footpaths, all in full green summer leaf; the open grass stays'
               ' open grass from edge to edge.'),
    'woods': (' A Pacific Northwest park woodland:' + V_WOODS),
}
for k_, c_ in V_OPEN_KIND.items(): P['van_' + k_] = V_OPEN + c_ + ('' if k_ == 'beach' else V_LUSH)
# (OPEN-GROUND 07/10) the woods area keys too: on V_BASE (building / roof / tower words) kits' van_forest tiles got invented houses in
# Pacific Spirit (16 of 119 tiles flagged by block/invent_det.py). Same woods clause, on the building-free V_OPEN.
for k_ in ('park', 'forest'): P['van_' + k_ + '_bld'] = P['van_' + k_]; P['van_' + k_] = V_OPEN + V_KIND[k_] + V_LUSH   # _bld = the old V_BASE text, for woods tiles with render buildings (prep_b8)
_NOBLD = ('build', 'house', 'home', 'roof', 'wall', 'tower', 'footprint', 'storey', 'stories', 'mansion', 'villa', 'cottage', 'cabin', 'shed',
          'hut', 'pavilion', 'structure', 'residen', 'apartment', 'tudor', 'craftsman', 'garage', 'lot ', 'lots', 'street', 'chimney', 'water')
assert all(w_ not in P['van_' + k_].lower().replace('seawall', 'sea_path').replace('understorey', 'underlayer') for k_ in list(V_OPEN_KIND) + ['park', 'forest'] for w_ in _NOBLD), 'an open-ground key names a building word'
assert all('lawn' not in P[k_] and 'mown' not in P[k_] for k_ in ('van_park', 'van_forest', 'van_woods'))
# (step2 b, 07/10) the 'long rows of parallel driftwood logs' clause painted dense grey log rows (read as pipes / bleachers, 30 of kits'
# 37 remaining invent flags) and sand over meadows: a few scattered single logs now.
# (OPEN-GROUND step2 07/10) van_shore: a mostly-open tile with >= 30 % render sea (tile_content.WATER_SHORE). The open keys name no water, and
# on houses_w / meadow the AI ignored the sea of whole shoreline tiles (Tudor streets, a painted horizon). This one names the sea where the render has it.
P['van_shore'] = (V_OPEN.replace('existing ground, paths and trees.', 'existing sea, sand, paths and trees.')
                  + ' A stretch of the shore on Vancouver\'s west side: the calm deep blue sea of English Bay with natural sun glitter covers exactly'
                    ' the area the render shows as sea, seen from above out to the edge of the frame; only where the render shows land, a pale tan'
                    ' sandy beach with a few scattered single driftwood logs, and grass and trees exactly where the render shows them.')
assert all(w_ not in P['van_shore'].lower().replace('seawall', 'sea_path') for w_ in _NOBLD if w_ != 'water') and 'horizon' not in P['van_shore'] and 'sky' not in P['van_shore']


# (r2 05/11) van_shore named a sandy beach with driftwood logs for all shore land: the seawalls of False Creek got invented
# beaches. van_shore_wall (tile_content.shore_key: no sandy render ground) names the hard edge instead; no sand or log word.
P['van_shore_wall'] = (V_OPEN.replace('existing ground, paths and trees.', 'existing sea, paths and trees.')
                       + ' A stretch of Vancouver\'s seawall: the calm deep blue-green sea with natural sun glitter covers exactly the area the'
                         ' render shows as sea, seen from above out to the edge of the frame; where the render shows land, a hard shore edge of'
                         ' grey granite rip-rap boulders, the paved seawall walk and its railing, and grass and trees exactly where the render shows them.')
assert 'sand' not in P['van_shore_wall'] and 'log' not in P['van_shore_wall'] and 'beach' not in P['van_shore_wall']
# (r2) van_water_bld: a window that is mostly water but holds buildings (tile_content.water_key). The building keys name no water
# (dry-tile rule) and on 63-76 % water the AI filled it with a suburb and a horizon; this one keeps the buildings key's text and names the water.
P['van_water_bld'] = (V_BASE + ' Vancouver\'s waterfront: the calm deep blue-green water with natural sun glitter covers exactly the area the'
                      ' render shows as water, seen from above out to the edge of the frame; the buildings, piers, walks and trees stand exactly'
                      ' where the render shows them.' + V_GREEN)
assert 'horizon' not in P['van_water_bld'] and 'sky' not in P['van_water_bld']
