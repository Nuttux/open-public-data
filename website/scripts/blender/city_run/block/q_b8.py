"""block b8 (block52_v7 extended south/east to Oracle Park): ONE place for the geometry, imported by the *_b8 scripts.
Q = global L9 px 102400..133120 x 24576..49152 (crop cols 20..25, rows 8..15 = 6 x 8 = 48 full 5120 x 3072 crops); same NW corner as block52
(so block52's Q-relative constants, e.g. post_b7 WAKE_BOXES / sheet crops, stay valid). Margin crops like block52: col 19 x 0.7..1, col 26 x 0..0.3,
row 16 y 0.5..1 (y bottom-up) -> 72 render jobs. Mosaic = Q +- 1536 (+1536 reflect pad on top). AI tiles stride 640, 1024 px.
python3 q_b8.py            -> print the geometry
python3 q_b8.py jobs       -> write jobs_b8_pass.txt (MASK/CLASS/GID passes, as jobs_render.txt) + jobs_b8_beauty.txt (no passes, as jobs_beauty.txt)"""
import math, os, sys
Q = [102400, 24576, 133120, 49152]; CW, CH, S, TS, M = 5120, 3072, 640, 1024, 1536
C0, C1, R0, R1 = Q[0] // CW, Q[2] // CW - 1, Q[1] // CH, Q[3] // CH - 1            # full crops (inclusive)
OX, OY0, W, H, PAD = Q[0] - M, Q[1], Q[2] - Q[0] + 2 * M, Q[3] - Q[1] + M, M       # mosaic (as mosaic_b7: OY0 = Q top, pad above)
GX = range(math.ceil(Q[0] / S) - 1, math.ceil(Q[2] / S)); GY = range(math.ceil(Q[1] / S) - 1, math.ceil(Q[3] / S))   # = 159..191 / 38..57 for block52
REG = [GX[0] * S, GY[0] * S, GX[-1] * S + TS, GY[-1] * S + TS]
def crops():
    fx = M / CW; fy = M / CH
    for j in range(R0, R1 + 2):
        for i in range(C0 - 1, C1 + 2):
            x0, x1 = (1 - fx, 1) if i < C0 else (0, fx) if i > C1 else (0, 1); y0, y1 = (1 - fy, 1) if j > R1 else (0, 1)
            yield i, j, f'{x0:g},{x1:g},{y0:g},{y1:g}'
if __name__ == '__main__':
    L = list(crops()); print('Q', Q, 'crops full', (C1 - C0 + 1) * (R1 - R0 + 1), 'jobs', len(L), 'mosaic', (OX, OY0 - PAD, W, H + PAD), 'tiles', f'gx {GX[0]}..{GX[-1]} gy {GY[0]}..{GY[-1]} = {len(GX) * len(GY)}', 'REG', REG)
    if sys.argv[1:] == ['jobs']:
        D = os.path.dirname(os.path.abspath(__file__)); tail = lambda f: open(f'{D}/{f}').readline().split(None, 3)[3].strip()
        for f, src, pre in (('jobs_b8_pass.txt', 'jobs_render.txt', 'b8'), ('jobs_b8_beauty.txt', 'jobs_beauty.txt', 'b8b')):
            open(f'{D}/{f}', 'w').write(''.join(f'{pre}_{i}_{j} {i}:{j} {bd} {tail(src)}\n' for i, j, bd in L)); print('wrote', f)
