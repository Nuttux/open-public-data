# (city_run/block/prompts/vancouver.py) Vancouver's prompt keys, pasted by citycfg.prompt_text into lr_run9's source just before
# the model-name line when city.json block.prompt_add names this file (SF: no prompt_add -> lr_run9 byte-identical).
# Runs in lr_run9's namespace: BASE_DRY, GLASS, P are defined above it. Every key is BASE_DRY-based (no water or coastline words: the
# water pixels are the render's, and water words on dry tiles invented ponds in SF, R13) with the light line made northern and one
# per-kind clause (prep_b8 picks the key per tile from block.prompt_areas). Nothing SF: no bay, cable cars, Victorians, California light.
V_BASE = BASE_DRY.replace('at clear midday: high sun, neutral daylight,',
                          'at clear midday in Vancouver, British Columbia: high sun, clean, cool Pacific Northwest daylight,')
assert V_BASE != BASE_DRY and 'water' not in V_BASE and V_BASE.startswith('Turn this 3D render into a real aerial photograph')
V_GREEN = (' Vancouver is a lush, green Pacific Northwest city: deep green lawns, dense mature street trees and dark conifers, nothing'
           ' dry or dusty.')
V_KIND = {
    'towers': (' Downtown Vancouver: slender residential towers with blue-green and green-grey tinted glass curtain walls, thin light mullions'
               ' and glass balcony bands, on low townhouse podiums with green roof gardens; concrete towers stay concrete; streets lined with'
               ' dense mature deciduous street trees.' + GLASS),
    'westend': (' Vancouver\'s West End: concrete and glass apartment towers and older three-storey brick and wooden walk-ups and wooden'
                ' houses, half hidden under very large, dense, mature street trees on grass boulevards.'),
    'old': (' Gastown, Chinatown and Strathcona: old red-brick and grey-stone warehouses and shops with flat tar-and-gravel roofs, narrow'
            ' heritage storefronts, and painted wooden houses with steep gable roofs of dark shingle among mature trees.'),
    'lowrise': (' Fairview and False Creek South: three- and four-storey wood-frame and concrete apartment blocks and townhouses with dark'
                ' shingle or flat roofs, roof terraces and planted courtyards, among dense mature trees.'),
    'houses_w': (' Vancouver\'s west side: large wooden Craftsman and Tudor-style houses with steep gable roofs of dark charcoal asphalt'
                 ' shingle, some with moss, wooden siding in deep colours, clipped hedges, deep green lawns, and very tall mature street'
                 ' trees, flowering cherries and dark conifers along the boulevards and back lanes.'),
    'houses_e': (' East Vancouver: narrow wooden houses with steep gable roofs of dark grey asphalt shingle, mixed with boxy two-storey houses'
                 ' with a shallow-pitched roof and stucco-and-brick walls, wooden siding in deep colours, small green front gardens, back'
                 ' lanes with garages, and rows of mature street trees and flowering cherries on grass boulevards.'),
    'park': (' Stanley Park: a dense, tall temperate rainforest of dark-green Douglas fir, western red cedar and hemlock with lighter'
             ' deciduous maples at its edges, mown green lawns, and the paths, roads and seawall exactly where the render shows them.'),
    'port': (' The working port and industrial flats: flat warehouse roofs of grey and white metal, concrete wharves, rail yards, asphalt'
             ' and gravel yards, and cranes and container stacks only where the render shows them; plain and functional.'),
    'gi': (' Granville Island: low industrial sheds and market halls of corrugated metal painted in bright colours, with flat tar roofs,'
           ' among a few trees.'),
}
for k_, c_ in V_KIND.items(): P['van_' + k_] = V_BASE + c_ + ('' if k_ == 'port' else V_GREEN)
P['van_base'] = V_BASE + V_GREEN   # no area kind
