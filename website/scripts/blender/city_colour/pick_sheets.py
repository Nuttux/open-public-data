import json
from PIL import Image, ImageDraw
P = json.load(open('pick.json')); L = [(t, p) for t, ps in P.items() for p in ps]
CW, CH = 340, 270
for s in range(0, len(L), 12):
    sh = Image.new('RGB', (3 * CW, 4 * CH), 'white'); d = ImageDraw.Draw(sh)
    for i, (t, p) in enumerate(L[s:s + 12]):
        im = Image.open(f'photos/{p}.jpg').convert('RGB'); im.thumbnail((CW - 6, CH - 16)); x, y = (i % 3) * CW, (i // 3) * CH + 14
        sh.paste(im, (x, y)); w, h = im.size; dd = ImageDraw.Draw(sh)
        for k in range(1, 10):
            c = (255, 0, 255) if k == 5 else (255, 255, 0)
            dd.line([x + w * k / 10, y, x + w * k / 10, y + h], fill=c, width=1); dd.line([x, y + h * k / 10, x + w, y + h * k / 10], fill=c, width=1)
        d.text((x + 2, y - 13), f'{p}  [{t}]', fill='black')
    sh.save(f'sheets/pick_{s // 12}.jpg', quality=85)
print(len(L))
