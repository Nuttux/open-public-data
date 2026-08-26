"""roofs/roof-data.js  (window.ROOFD)

Two per-building arrays, both in gen/bldg-data.js's own record order (proven by
form/reindex.py, which re-derives the shipped height byte and asserts it matches
element for element over all 166,166).

  st   number_of_stories, wv5m-vpq2, the 2025 secured roll, 4 bits packed two
       to a byte. 0 means the roll publishes no storey count for the parcel —
       drawn as no storey lines rather than as a guess.
  hf   THE SUB-METRE HEIGHT THE SHIPPED FILE ROUNDED AWAY. gen/bldg-data.js
       stores hgt_mediancm as one byte of whole metres, so a blockface of
       houses published at 5.62, 5.94, 6.11 and 6.38 m all draw at 6 and the
       row comes out as one bar. This is the residual, h - round(h), at a
       0.25 m grid, 4 bits packed two to a byte. It is the published
       median; nothing here is modelled.

    python3 roofs/build_roofs.py     -> roofs/roof-data.js
"""
import base64, gzip, json, math, os, pickle, sys
HERE=os.path.dirname(os.path.abspath(__file__)); ROOT=os.path.dirname(HERE)
sys.path.insert(0,HERE)
from join import build

def main():
    R=build()
    # the height clamp is the PRODUCER's, read off the shipped meta — `h` went
    # from u8 to u16 on 2026-08-24 and a literal 255 here would have silently
    # re-clipped the tallest three buildings back down.
    import sys as _s, os as _o
    _s.path.insert(0, _o.path.join(ROOT, "form"))
    import reindex as _r
    HCAP = _r.height_cap(_r.shipped_h()[0])
    n=len(R)
    st=bytearray((n+1)//2); hf=bytearray((n+1)//2)
    ns=0; hist={}
    for i,r in enumerate(R):
        s=int(round(r["st"] or 0))
        s=0 if s<1 else min(15,s)
        if s: ns+=1
        hist[s]=hist.get(s,0)+1
        # residual of the PUBLISHED median against the shipped whole-metre byte
        h=r["h"]; q=max(1,min(HCAP,int(round(h))))
        d=h-q                                  # in [-0.5, 0.5)
        # FOUR levels, a 0.25 m grid. Deliberately coarser than the file can
        # carry: Block Z measured this same file's HORIZONTAL geometry at
        # 1.01 m p50 against the published rings, so a roof level finer than a
        # quarter metre is precision the record does not have.
        v=int((d+0.5)//0.25)
        v=0 if v<0 else (3 if v>3 else v)
        if i&1: st[i>>1]|=s<<4;  hf[i>>1]|=v<<4
        else:   st[i>>1] |=s;    hf[i>>1] |=v
    # ── THE ROOF VALUE INSIDE BLOCK M's OWN BAND ─────────────────────────
    # Block M bands the roof tone at 9 / 15 / 25 m, which the assessor's storey
    # cross-check puts at about 2, 4 and 7 storeys. That is right for the city
    # and it means EVERY house in the Sunset falls in band 0 and takes one
    # single roof colour: 121,419 of 166,166 footprints are under 9 m. These
    # are the QUARTILES of the published median height WITHIN each band, so a
    # building's roof carries where it stands in its own band. Twelve numbers,
    # derived from the published column; the value itself is UH, already on the
    # page, so nothing per-building is shipped for this.
    BANDS=[(0,9),(9,15),(15,25),(25,1e9)]
    hq=[]
    for lo,hi in BANDS:
        v=sorted(r["h"] for r in R if lo<=r["h"]<hi)
        hq.append([round(v[len(v)*k//4],2) for k in (1,2,3)] if len(v)>8 else [lo,lo,lo])
    d={"n":n,"hq":hq,"st":base64.b64encode(bytes(st)).decode(),
       "hf":base64.b64encode(bytes(hf)).decode(),
       "stN":ns,
       "src":{"st":"wv5m-vpq2 number_of_stories, closed_roll_year 2025",
              "hf":"ynuv-fyni hgt_mediancm, the sub-metre residual gen/bldg-data.js rounds"}}
    js="window.ROOFD="+json.dumps(d,separators=(",",":"))+";\n"
    p=os.path.join(HERE,"roof-data.js"); open(p,"w").write(js)
    print("storeys published on %d of %d = %.1f%%"%(ns,n,100*ns/n))
    print("  ",sorted(hist.items())[:9])
    print("in-band height quartiles:",d["hq"])
    print("%s  %.1f KB raw  %.1f KB gzip"%(p,len(js)/1024,len(gzip.compress(js.encode(),9))/1024))

if __name__=="__main__": main()
