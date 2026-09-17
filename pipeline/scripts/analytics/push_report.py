#!/usr/bin/env python3
"""
Did a push to prod work ? One table, before and after a date, on human
French-speaking sessions (PostHog, HogQL).

The measure (2026-09-18) :
  - true bounce     = one pageview AND no action (a fold, a drawer, a door, a
                      tab, a search, a year, a share…). A reader who opened a
                      fold on a single page did not bounce.
  - engaged (broad) = an action, OR a second page, OR ≥ 50 % scroll and ≥ 30 s.
  - pages / session, actions / session, median duration, median scroll.
Each rate carries its 95 % Wilson interval : at ~6 human sessions a day, a
family needs about four weeks on each side before a 15-point move is real.

Humans = not localhost / vercel.app, a browser, not Daniel's two ids, not the
robot pattern ($direct + 1920 px), and a French-speaking country (the US and
Ireland traffic is still ~95 % robots : 0-5 s, 100 % direct, desktop).

Usage :
  python3 pipeline/scripts/analytics/push_report.py --split 2026-09-16 [--since 2026-09-01] [--family commune]
Key : POSTHOG_PERSONAL_API_KEY in website/.env.local (never printed).
"""
from __future__ import annotations
import argparse, json, math, os, re, statistics, sys, urllib.request
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
ME = ("01a08151-9a35-784e-bed3-54a92957b27f", "01a0921b-8021-7389-8e97-b58925e1b670")
FRANCOPHONE = {"FR", "BE", "CH", "LU", "MC", "CA", "RE", "GP", "MQ", "GF", "NC", "PF"}
ACTIVE = ("details_toggle", "drawer_open", "link_click", "nav_click", "toc_click", "year_change", "search_modal_open",
          "search_modal_query", "search_modal_select", "search_result_click", "search_seed_click", "search_submit",
          "share_click", "chart_element_click", "choropleth_click", "map_marker_click", "filter_change",
          "mobile_menu_toggle", "cta_click", "external_link_click", "load_more", "results_expand", "scope_change",
          "lang_switch", "chat_question", "compare_pick", "alert_submit")


def env() -> dict[str, str]:
    """website/.env.local on Daniel's machine ; the process environment on a
    cloud routine (POSTHOG_PERSONAL_API_KEY, POSTHOG_HOST), which wins."""
    out: dict[str, str] = {}
    f = ROOT / "website/.env.local"
    if f.exists():
        for line in f.read_text().splitlines():
            if "=" in line and not line.strip().startswith("#"):
                k, v = line.split("=", 1)
                out[k.strip()] = v.strip().strip('"').strip("'")
    # The routines name the key POSTHOG_API_KEY, sometimes pasted with its own
    # `NAME=` prefix : both spellings, the prefix stripped.
    for k, target in (("POSTHOG_PERSONAL_API_KEY", "POSTHOG_PERSONAL_API_KEY"), ("POSTHOG_API_KEY", "POSTHOG_PERSONAL_API_KEY"), ("POSTHOG_HOST", "POSTHOG_HOST")):
        v = os.environ.get(k, "").strip()
        if v:
            out[target] = v.split("=", 1)[1] if v.startswith(f"{k}=") else v
    return out


def hogql(sql: str) -> list[dict]:
    e = env()
    key = e.get("POSTHOG_PERSONAL_API_KEY") or sys.exit("POSTHOG_PERSONAL_API_KEY missing (website/.env.local or the environment)")
    host = e.get("POSTHOG_HOST") or "https://eu.posthog.com"
    req = urllib.request.Request(f"{host}/api/projects/@current/query/", method="POST",
                                 data=json.dumps({"query": {"kind": "HogQLQuery", "query": sql}}).encode(),
                                 headers={"Authorization": f"Bearer {key}", "Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=300) as r:
        d = json.load(r)
    return [dict(zip(d["columns"], row)) for row in d["results"]]


def family(path: str | None) -> str:
    p = re.sub(r"^/(fr|en|pt)(?=/|$)", "", path or "") or "/"
    if p.startswith("/city/"):
        p = p.replace("/city/", "/france/", 1)
    if p == "/":
        return "accueil"
    if re.match(r"^/france/paris/?$", p):
        return "hub-paris"
    if re.match(r"^/france/paris/(budget|subventions|marches|investissements|logement|dette|lieux)/?$", p):
        return "section-paris"
    if p.startswith("/france/paris/"):
        return "fiche-paris"
    if p.startswith("/france/marseille"):
        return "marseille"
    if re.match(r"^/france/(budget|dette|etat|fiscalite|daily-bread|comparer)", p):
        return "national"
    if re.match(r"^/france/[^/]+/?$", p):
        return "commune"
    if p.startswith("/france/"):
        return "commune-sous-page"
    if p.startswith("/usa"):
        return "usa"
    if p.startswith("/brasil"):
        return "brasil"
    return "autre"


def wilson(k: int, n: int, z: float = 1.96) -> tuple[float, float]:
    if n == 0:
        return 0.0, 0.0
    p = k / n
    d = 1 + z * z / n
    c = (p + z * z / (2 * n)) / d
    h = z * math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / d
    return max(0.0, c - h), min(1.0, c + h)


def line(name: str, rs: list[dict]) -> str:
    n = len(rs)
    if n == 0:
        return f"{name:28s} n=  0"
    bounce = sum(1 for r in rs if r["pv"] == 1 and r["active"] == 0)
    eng = sum(1 for r in rs if r["active"] > 0 or r["pv"] > 1 or ((r["scroll"] or 0) >= 0.5 and r["dur"] >= 30))
    lo, hi = wilson(bounce, n)
    return (f"{name:28s} n={n:3d} | vrai rebond {bounce / n:4.0%} [{lo:.0%}-{hi:.0%}] | engagé {eng / n:4.0%} | "
            f"pages/sess {sum(r['pv'] for r in rs) / n:4.2f} | actions/sess {sum(r['active'] for r in rs) / n:4.2f} | "
            f"durée méd {statistics.median(r['dur'] for r in rs):3.0f}s | scroll méd {statistics.median((r['scroll'] or 0) for r in rs):4.0%}")


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--split", required=True, help="the push date, YYYY-MM-DD : before < split <= after")
    ap.add_argument("--since", default=None, help="start of the window (default : as many days before the split as after)")
    ap.add_argument("--family", default=None, help="entry family only (commune, section-paris, fiche-paris, accueil…)")
    a = ap.parse_args()
    split = datetime.fromisoformat(a.split)
    since = a.since or (split - (datetime.now() - split)).date().isoformat()
    active = "(" + ",".join(f"'{e}'" for e in ACTIVE) + ")"
    me = "(" + ",".join(f"'{i}'" for i in ME) + ")"
    rows = hogql(f"""
      SELECT properties.$session_id AS sid, min(timestamp) AS t0, max(timestamp) AS t1,
        countIf(event = '$pageview') AS pv, countIf(event IN {active}) AS active,
        argMin(properties.$pathname, timestamp) AS entry, any(properties.$geoip_country_code) AS cc,
        max(toFloat(properties.$prev_pageview_max_scroll_percentage)) AS scroll
      FROM events
      WHERE timestamp >= '{since}' AND properties.$session_id IS NOT NULL
        AND properties.$host NOT LIKE '%localhost%' AND properties.$host NOT LIKE '%vercel.app%'
        AND properties.$browser IS NOT NULL AND distinct_id NOT IN {me}
        AND NOT ((properties.$referring_domain IS NULL OR properties.$referring_domain = '$direct') AND properties.$screen_width = 1920)
      GROUP BY sid HAVING pv > 0 ORDER BY t0 LIMIT 20000""")
    for r in rows:
        t0 = datetime.fromisoformat(r["t0"].replace("Z", "+00:00"))
        t1 = datetime.fromisoformat(r["t1"].replace("Z", "+00:00"))
        r["dur"], r["day"], r["fam"] = (t1 - t0).total_seconds(), r["t0"][:10], family(r["entry"])
    human = [r for r in rows if r["cc"] in FRANCOPHONE and (not a.family or r["fam"] == a.family)]
    print(f"{len(rows)} sessions after the robot filter, {len(human)} French-speaking{' · ' + a.family if a.family else ''} (since {since})")
    print(line(f"avant {a.split}", [r for r in human if r["day"] < a.split]))
    print(line(f"depuis {a.split}", [r for r in human if r["day"] >= a.split]))
    if not a.family:
        for f in sorted({r["fam"] for r in human}, key=lambda f: -sum(1 for r in human if r["fam"] == f)):
            print(line(f"  {f} · avant", [r for r in human if r["fam"] == f and r["day"] < a.split]))
            print(line(f"  {f} · depuis", [r for r in human if r["fam"] == f and r["day"] >= a.split]))
    return 0


if __name__ == "__main__":
    sys.exit(main())
