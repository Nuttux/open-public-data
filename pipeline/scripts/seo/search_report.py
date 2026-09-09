#!/usr/bin/env python3
"""
Monthly SEO feed-the-loop report — what people search for that we don't yet
answer well, from the two sources the site already has:

  1. Google Search Console, per host (www / fr / pt): the queries with
     impressions, the ones with impressions but no click (a page to fix), and
     the pages that got impressions (a page that works).
  2. PostHog `search_submit` events: the site-search queries that returned
     zero results (a synonym to add to website/src/lib/search-synonyms.ts, or
     a page to create).

Writes one CSV per source under scratchpad/seo/<YYYY-MM>/ and prints a short
summary. Nothing is written to the site: the numbers are for a 20-minute
monthly read, then a decision.

Setup (once):
  pip install google-api-python-client google-auth
  # In the cloud routine image the system `cryptography` is broken (no _cffi_backend):
  pip install --ignore-installed cryptography cffi
  Either GOOGLE_ADC_JSON_B64 = base64 of the service-account key file (one line;
  the account seo-routine@open-data-france-484717 is a user on the Search
  Console properties) — or GOOGLE_ADC_JSON with the raw JSON — or locally:
  gcloud auth application-default login \
      --scopes=openid,https://www.googleapis.com/auth/cloud-platform,https://www.googleapis.com/auth/webmasters.readonly
  # PostHog (optional): a personal API key with query:read, and the project id
  export POSTHOG_API_KEY=phx_… POSTHOG_PROJECT_ID=12345 POSTHOG_HOST=https://eu.posthog.com

Usage:
  python3 pipeline/scripts/seo/search_report.py [--days 28] [--out scratchpad/seo]
"""
from __future__ import annotations

import argparse
import csv
import datetime as dt
import json
import os
import sys
import urllib.request
from pathlib import Path

PROPERTIES = ["sc-domain:qipu.org", "sc-domain:fr.qipu.org", "sc-domain:pt.qipu.org"]
ROOT = Path(__file__).resolve().parents[3]


def env(name: str) -> str | None:
    """An environment value, tolerant of the whole `NAME=value` line pasted into the value field."""
    v = (os.environ.get(name) or "").strip()
    if v.startswith(f"{name}="):
        v = v[len(name) + 1 :]
    return v.strip().strip('"') or None


def search_console(days: int, out: Path) -> dict[str, int]:
    """Top queries + zero-click queries + top pages per property, last `days` days."""
    try:
        import google.auth  # type: ignore
        from googleapiclient.discovery import build  # type: ignore
    except ImportError:
        print("  ⚠ google-api-python-client not installed — skipping Search Console (see header).")
        return {}
    scopes = ["https://www.googleapis.com/auth/webmasters.readonly"]
    # In the cloud routine the service-account key travels as GOOGLE_ADC_JSON
    # (its JSON content); on a laptop, Application Default Credentials.
    # GOOGLE_ADC_JSON_B64 (one line, base64 of the key file) fits the KEY=value
    # environment format of the cloud routine; GOOGLE_ADC_JSON (raw JSON) works too.
    adc_json = env("GOOGLE_ADC_JSON")
    if not adc_json and env("GOOGLE_ADC_JSON_B64"):
        import base64

        adc_json = base64.b64decode(env("GOOGLE_ADC_JSON_B64")).decode("utf-8")
    if adc_json:
        from google.oauth2 import service_account  # type: ignore

        creds = service_account.Credentials.from_service_account_info(json.loads(adc_json), scopes=scopes)
    else:
        creds, _ = google.auth.default(scopes=scopes)
    svc = build("searchconsole", "v1", credentials=creds, cache_discovery=False)
    end = dt.date.today() - dt.timedelta(days=2)  # GSC lags ~2 days
    start = end - dt.timedelta(days=days)
    totals: dict[str, int] = {}
    for prop in PROPERTIES:
        host = prop.replace("sc-domain:", "").split("//")[-1].rstrip("/")
        for dim, fname in (("query", "queries"), ("page", "pages")):
            rows: list[dict] = []
            start_row = 0
            while True:
                body = {
                    "startDate": start.isoformat(),
                    "endDate": end.isoformat(),
                    "dimensions": [dim],
                    "rowLimit": 5000,
                    "startRow": start_row,
                }
                try:
                    resp = svc.searchanalytics().query(siteUrl=prop, body=body).execute()
                except Exception as e:  # noqa: BLE001 — a missing property is a report line, not a crash
                    print(f"  ⚠ {host}: {e}")
                    break
                batch = resp.get("rows", [])
                rows.extend(batch)
                if len(batch) < 5000:
                    break
                start_row += 5000
            path = out / f"gsc_{host}_{fname}.csv"
            with path.open("w", newline="", encoding="utf-8") as f:
                w = csv.writer(f)
                w.writerow([dim, "clicks", "impressions", "ctr", "position"])
                for r in sorted(rows, key=lambda r: -r["impressions"]):
                    w.writerow([r["keys"][0], r["clicks"], r["impressions"], round(r["ctr"], 4), round(r["position"], 1)])
            totals[f"{host} {fname}"] = len(rows)
            if dim == "query":
                zero = [r for r in rows if r["clicks"] == 0 and r["impressions"] >= 5]
                zpath = out / f"gsc_{host}_zero_click.csv"
                with zpath.open("w", newline="", encoding="utf-8") as f:
                    w = csv.writer(f)
                    w.writerow(["query", "impressions", "position"])
                    for r in sorted(zero, key=lambda r: -r["impressions"]):
                        w.writerow([r["keys"][0], r["impressions"], round(r["position"], 1)])
                totals[f"{host} zero-click (≥5 impr.)"] = len(zero)
    return totals


def posthog_zero_results(days: int, out: Path) -> int | None:
    """Site searches that returned nothing, from the `search_submit` event."""
    key, project = env("POSTHOG_API_KEY"), env("POSTHOG_PROJECT_ID")
    if not key or not project:
        print("  ℹ POSTHOG_API_KEY / POSTHOG_PROJECT_ID not set — skipping site-search zero results.")
        return None
    host = env("POSTHOG_HOST") or "https://eu.posthog.com"
    hogql = (
        "select properties.query as q, properties.page as page, count() as n "
        f"from events where event = 'search_submit' and toInt(properties.results_count) = 0 "
        f"and timestamp > now() - interval {int(days)} day and q != '' "
        "group by q, page order by n desc limit 500"
    )
    req = urllib.request.Request(
        f"{host}/api/projects/{project}/query/",
        data=json.dumps({"query": {"kind": "HogQLQuery", "query": hogql}}).encode(),
        headers={"Authorization": f"Bearer {key}", "Content-Type": "application/json"},
    )
    try:
        data = json.load(urllib.request.urlopen(req, timeout=60))
    except Exception as e:  # noqa: BLE001
        print(f"  ⚠ PostHog: {e}")
        return None
    rows = data.get("results", [])
    with (out / "site_search_zero_results.csv").open("w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(["query", "page", "count"])
        w.writerows(rows)
    return len(rows)


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--days", type=int, default=28)
    ap.add_argument("--out", default=str(ROOT / "scratchpad" / "seo"))
    a = ap.parse_args()
    out = Path(a.out) / dt.date.today().strftime("%Y-%m")
    out.mkdir(parents=True, exist_ok=True)
    print(f"SEO report · last {a.days} days · {out}")
    print("▶ Search Console")
    for k, v in search_console(a.days, out).items():
        print(f"  {k}: {v}")
    print("▶ Site search")
    n = posthog_zero_results(a.days, out)
    if n is not None:
        print(f"  zero-result queries: {n}")
    print("Read: gsc_*_zero_click.csv = pages to fix (title/answer), site_search_zero_results.csv = synonyms to add.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
