"""(city_run/block/era_prompts.py, 4D s1 03/11) the block paint's prompts for a PAST year (env ERA_YEAR, CITY != sf).
The block line (prep_b8 -> lr_run9 keys van_*) was written for today: 'glass curtain walls' (van_towers), 'lush green, nothing dry
or dusty' (V_GREEN), a sandy English Bay beach with driftwood (van_beach / van_shore) and a lush park meadow (van_meadow). In the 4D
1990 test (s1, north False Creek) those words painted BC Place's 1983 wall as a glass curtain wall, the vacant Expo lands (render:
bare earth) as lawns and parks, the quay as a driftwood beach, and opened a hole with towers in the white dome.
One rule for every tile of a past year (never per tile): the code below is pasted into lr_run9 before the model line and rewrites
every van_* key: today's look words out, the render's surface in, the era clause (keys.py's 1930-69 clause, generalised) appended.
  patch(src, year) -> src"""


def code(year):
    y = int(year); dec = (y - 1) // 10 * 10   # 1990 -> cars of the 1980s
    keep = (' Every roof, street, yard and open ground keeps exactly the surface and colour the render shows: bare earth, gravel and dry'
            ' weeds stay bare, paving stays paving, grass only where the render shows grass.')
    roofs = ' Every roof the render shows stays one closed roof of the same shape: no openings in it and nothing seen through it.'
    era = (f' It is Vancouver in {y}: only cars of the {dec}s and earlier (no modern cars or SUVs), no bike lanes, no modern street'
           ' furniture, no solar panels, no glass curtain walls that the render does not show; modest street trees only where the render shows them.')
    towers = (' Downtown Vancouver: concrete office and apartment buildings with banded windows and plain concrete or brick walls, and'
              ' a few dark tinted glass buildings only where the render shows glass.' + ('' if y >= 1960 else ' Brick and stone walls, no glass towers.'))
    open_ = (' Open land in Vancouver: bare packed earth, gravel, dry weeds and old paving exactly where the render shows them, grass only'
             ' where the render shows green; no sand beach, no driftwood, no park lawn that the render does not show.')
    opn = f' It is Vancouver in {y}.'
    keep_open = ' Bare earth, gravel and dry weeds stay bare; grass only where the render shows green.'
    shore_old = ('a pale tan sandy beach with a few scattered single driftwood logs')
    shore_new = ('the land surface the render shows there: gravel fill, rock riprap, bare earth or old timber pilings')
    return f'''
# (era_prompts.py) ERA_YEAR={y}: today's look words out, the render's surface and the era clause in (every van_* key)
_EY = {y}
for _k in [k_ for k_ in P if k_.startswith('van_')]:
    _s = P[_k]
    for _a in (V_GREEN, V_GREEN_WOODS):
        _s = _s.replace(_a, {keep!r})
    _s = _s.replace(V_LUSH, {keep_open!r})
    if _k.startswith('van_towers'): _s = _s.replace(V_KIND['towers'], {towers!r})
    if _k in ('van_beach', 'van_meadow'): _s = V_OPEN + {open_!r}
    _s = (_s.replace({shore_old!r}, {shore_new!r}).replace('the calm deep blue sea of English Bay', 'the calm water')
          .replace("A stretch of the shore on Vancouver's west side", 'A stretch of the Vancouver shore'))
    # open keys (V_OPEN based) name no building / roof / street word: even a negated noun plants the thing (VR3)
    P[_k] = _s + ({opn!r} if 'keep every path, tree and open surface exactly where it is' in _s else {roofs!r} + {era!r})
'''


def patch(src, year):
    anc = "MODEL = os.environ.get('MODEL'"
    assert anc in src and '_EY = ' not in src
    return src.replace(anc, code(year) + anc, 1)
