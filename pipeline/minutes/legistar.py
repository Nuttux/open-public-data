"""
The modern half of the same record.

The scanned Journal of Proceedings ends in 1999. San Francisco's Board of Supervisors
legislation is machine-readable from file 000001, introduced 2000-01-04 — the handoff is
seamless. Same unit (a decision), same attributes (a place, an amount, a date), different
medium. This fetches it so the animation can run past the end of the scans.

Standalone. Usage:  python3 legistar.py [start_year] [end_year]
"""
import json, os, subprocess, urllib.parse, sys, time

BASE = "https://webapi.legistar.com/v1/sfgov"
CACHE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "cache", "legistar")
os.makedirs(CACHE, exist_ok=True)

FIELDS = "MatterId,MatterGuid,MatterFile,MatterName,MatterTitle,MatterTypeName,MatterStatusName,MatterBodyName,MatterIntroDate"

def _get(params, timeout=120):
    url = BASE + "/matters?" + urllib.parse.urlencode(params, quote_via=urllib.parse.quote)
    for attempt in range(4):
        r = subprocess.run(["curl", "-sL", "--max-time", str(timeout), url],
                           capture_output=True, text=True).stdout
        try:
            d = json.loads(r)
            if isinstance(d, list): return d
        except Exception:
            pass
        time.sleep(2 * (attempt + 1))
    return []

def year(y, page=1000):
    """All matters introduced in one calendar year, paged. Cached per year."""
    p = os.path.join(CACHE, f"matters_{y}.json")
    if os.path.exists(p) and os.path.getsize(p) > 40:
        return json.load(open(p))
    out, skip = [], 0
    while True:
        batch = _get({"$select": FIELDS,
                      "$filter": f"MatterIntroDate ge datetime'{y}-01-01' and MatterIntroDate lt datetime'{y+1}-01-01'",
                      "$orderby": "MatterIntroDate", "$top": str(page), "$skip": str(skip)})
        out += batch
        if len(batch) < page: break
        skip += page
        if skip > 20000: break
    json.dump(out, open(p, "w"))
    return out

def api_url(m):
    """The citable resource for a matter, and the one that actually answers.

    Checked 2026-08-20: returns the whole matter as JSON, including MatterTitle -- the text
    the entries quote. Use this for citations."""
    return f"{BASE}/matters/{m['MatterId']}"

def detail_url(m):
    """The canonical human-facing InSite permalink. CURRENTLY DEAD on this tenant.

    Checked 2026-08-20: every LegislationDetail.aspx?ID=&GUID= request to sfgov.legistar.com
    answers HTTP 200 with the 19-byte body "Invalid parameters!", for matters old and new,
    with and without a session cookie, browser User-Agent, referer, and the usual
    Options=/Search=/FullText= variants. MeetingDetail.aspx is broken the same way and the
    /events API endpoint errors on a missing InSite setting; Legislation.aspx and
    Calendar.aspx still render. Keep emitting it -- it is the address a reader recognises and
    it may come back -- but never cite it alone."""
    return (f"https://sfgov.legistar.com/LegislationDetail.aspx"
            f"?ID={m['MatterId']}&GUID={m['MatterGuid']}")

if __name__ == "__main__":
    a = int(sys.argv[1]) if len(sys.argv) > 1 else 2000
    b = int(sys.argv[2]) if len(sys.argv) > 2 else 2018
    tot = 0
    for y in range(a, b + 1):
        rows = year(y)
        tot += len(rows)
        print(f"  {y}  {len(rows):>5} matters", flush=True)
    print(f"total {tot}")
