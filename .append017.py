import json, sys, os
SLICE='/Users/daniel/code/open-public-data/pipeline/data/sf_bos/work/slice-017.jsonl'
OUT='/Users/daniel/code/open-public-data/pipeline/data/sf_bos/work/out-017.jsonl'
src=[json.loads(l) for l in open(SLICE)]
have=sum(1 for _ in open(OUT)) if os.path.exists(OUT) else 0
payload=json.load(sys.stdin)
assert payload[0][0]==have, f"expected next idx {have}, got {payload[0][0]}"
with open(OUT,'a') as f:
    for i,(idx,line) in enumerate(payload):
        assert idx==have+i, f"gap at {idx}"
        f.write(json.dumps({"id":src[idx]['id'],"line":line}, ensure_ascii=False)+"\n")
print("appended", len(payload), "now", have+len(payload))
