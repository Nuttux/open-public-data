import sys
f, p = sys.argv[1], sys.argv[2]; s = open(f).read()
for blk in open(p).read().split('\n====\n'):
    old, new = blk.split('\n>>>>\n'); old, new = old.strip('\n'), new.strip('\n')
    if new in s and old not in s: print('already applied:', new.split('\n')[0][:60]); continue
    n = s.count(old)
    if n != 1: sys.exit(f'{f}: old block found {n} times: {old[:60]!r}')
    s = s.replace(old, new)
open(f, 'w').write(s); print('patched', f)
