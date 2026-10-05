import json, sys
from PIL import Image, ImageDraw
S = json.load(open('sources_pool.json')); items = list(S.values()); n0 = int(sys.argv[1]) if len(sys.argv) > 1 else 0
for s in range(n0, len(items), 30):
    sh = Image.new('RGB', (6 * 175, 5 * 135), 'white'); d = ImageDraw.Draw(sh)
    for i, e in enumerate(items[s:s + 30]):
        im = Image.open(e['file']).convert('RGB'); im.thumbnail((172, 132)); x, y = (i % 6) * 175, (i // 6) * 135
        sh.paste(im, (x, y)); k = e['file'][-7:-4]; d.rectangle([x, y, x + 26, y + 12], fill='black'); d.text((x + 2, y), k, fill='yellow')
    sh.save(f'sheets/pool_{s // 30}.jpg', quality=80)
print(len(items))
