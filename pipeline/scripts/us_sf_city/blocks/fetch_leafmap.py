"""Map the hOCR page index onto the leaf that archive.org's /page/nN actually shows.

This is not a guess and it is not a calibration. archive.org's BookReader paginates
only the leaves its scandata flags addToAccessFormats=true; the hOCR covers EVERY
leaf, including the covers, colour targets and inserts BookReader skips. So the
index into one list is not the index into the other, and the gap GROWS through the
volume as more leaves are skipped.

It was checked by eye before being trusted. journalofproceed69sanfrich hOCR leaf 253
carries "Ordinance designating the Sylvester House, 1556 Revere Avenue, as a
Landmark". This mapping sends it to /page/n250, and the scan at n250 is printed page
221 and carries that ordinance. The scan at n253 is printed page 224 and does not.

A per-volume constant offset was tried first and is WRONG: in that same volume the
gap is 3 at leaf 253 and 9 at leaf 1389.

Output: cache/leafmap.json  {volume: [ia_index_or_null per hOCR leaf]}
"""
import json, os, re, subprocess, sys

import sys as _sys
_sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
# Code in the repo, data under CITY_DATA. See _paths.py.
from _paths import ANIM, CACHE  # noqa: F401
HERE = os.path.dirname(os.path.abspath(__file__))
SD = os.path.join(CACHE, "scandata")
os.makedirs(SD, exist_ok=True)

PAGE = re.compile(r'<page leafNum="(\d+)">(.*?)</page>', re.S)


def get(ident):
    p = os.path.join(SD, f"{ident}.xml")
    if os.path.exists(p) and os.path.getsize(p) > 2000:
        return p
    # Two locations. The later scans publish <ident>_scandata.xml directly; the
    # 1906-1948 scans only have it inside a 100 MB scandata.zip, which archive.org
    # will unpack and serve a single member from.
    for url in (f"https://archive.org/download/{ident}/{ident}_scandata.xml",
                f"https://archive.org/download/{ident}/scandata.zip/scandata.xml"):
        subprocess.run(["curl", "-sL", "--max-time", "300", "-o", p, url], check=False)
        if (os.path.exists(p) and os.path.getsize(p) > 20000
                and b"<book" in open(p, "rb").read(400)):
            return p
    if os.path.exists(p):
        os.remove(p)
    return None


def main():
    vols = []
    for ln in open(os.path.join(ANIM, "vols.txt")):
        q = ln.split()
        if len(q) == 2:
            vols.append(q[1])
    out = {}
    for v in vols:
        if not os.path.exists(os.path.join(ANIM, "geo", "cache", "ia",
                                           f"{v}_hocr_pageindex.json.gz")):
            continue
        p = get(v)
        if not p:
            print(f"{v:<40} NO SCANDATA", flush=True); continue
        x = open(p, encoding="utf-8", errors="replace").read()
        pages = PAGE.findall(x)
        if not pages:
            print(f"{v:<40} scandata unparsable", flush=True); continue
        m, run, skipped = [], 0, 0
        for _, body in pages:
            if "addToAccessFormats>true<" in body:
                m.append(run); run += 1
            else:
                m.append(None); skipped += 1
        out[v] = m
        import gzip
        try:
            pi = json.load(gzip.open(os.path.join(ANIM, "geo", "cache", "ia",
                                                  f"{v}_hocr_pageindex.json.gz"), "rt"))
        except Exception:
            # a few cached sidecars are HTML error pages; those volumes were never
            # swept either, so there is nothing to map and nothing to publish
            del out[v]
            print(f"{v:<40} hOCR sidecar unreadable, skipped", flush=True); continue
        flag = "OK " if len(pi) == len(m) else "LEN MISMATCH "
        print(f"{v:<40} {flag}hocr {len(pi):>5} scandata {len(m):>5} "
              f"skipped {skipped:>3}  max drift {max((i - x2) for i, x2 in enumerate(m) if x2 is not None)}",
              flush=True)
    json.dump(out, open(os.path.join(CACHE, "leafmap.json"), "w"))
    print(f"\nwrote leafmap.json for {len(out)} volumes "
          f"({os.path.getsize(os.path.join(CACHE,'leafmap.json'))//1024:,} KB)")


if __name__ == "__main__":
    main()
