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
    'park': (' Stanley Park: a dense, tall temperate rainforest of dark-green Douglas fir, western red cedar and hemlock with lighter'
             ' deciduous maples at its edges, mown green lawns, and the paths, roads and seawall exactly where the render shows them.'),
    'port': (' The working port and industrial flats: flat warehouse roofs of grey and white metal, concrete wharves, rail yards, asphalt'
             ' and gravel yards, and cranes and container stacks only where the render shows them; plain and functional.'),
    'gi': (' Granville Island: low industrial sheds and market halls of corrugated metal painted in bright colours, with flat tar roofs.'),
}
for k_, c_ in V_KIND.items(): P['van_' + k_] = V_BASE + c_ + ('' if k_ == 'port' else V_GREEN)
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
