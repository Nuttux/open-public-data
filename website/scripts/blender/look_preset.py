"""The default look of the city render, applied as env defaults (imported first by hq_scene.py and hq_city.py).

LOOK=V5 (default since 24/09 evening, Daniel): "clear midday" (tamed: walls 1.25, expo 0.1), matched to three real aerials
(FiDi toward Transamerica, Telegraph Hill / Coit with the piers, Oracle Park): high sun, neutral
white light, a white city with dark glass, red brick, deep water. An env var set explicitly still wins.
LOOK=B gives back the previous look (golden hour, sun el 24, warm sun): every key below then
falls back to the default written in hq_scene.py / hq_city.py. The matching post grade is
grade.py's default preset (grade.py preset=B for the old one)."""
import os
V5 = {'SUN_EL': '50', 'SUN_AZ': '215', 'SUN_K': '4.5', 'SKY_K': '0.30', 'EXPO': '0.1', 'AGX_LOOK': 'AgX - Punchy',
      'SUN_RGB': '1.0,0.97,0.92', 'SKY_SAT': '0.35', 'GLOSS_K': '0.6',
      'WALL_VALUE': '1.25', 'ROOF_VALUE': '1.3', 'BRICK_VALUE': '1.0', 'BCOL_VSPREAD': '1.15'}
LOOK = os.environ.get('LOOK', 'V5')
if LOOK == 'V5':
    for k_, v_ in V5.items(): os.environ.setdefault(k_, v_)
elif LOOK != 'B': raise SystemExit(f'LOOK={LOOK}: unknown (V5 or B)')
