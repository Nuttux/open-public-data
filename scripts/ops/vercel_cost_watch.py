#!/usr/bin/env python3
"""
Daily watch on the Vercel bill: mail Daniel when yesterday's usage jumps.

Why: September 2026 cost about $348 against about $50 in a calm month, and
nobody saw it coming. Vercel's own Spend Management only mails the team Owner,
and only at 50/75/100 % of a monthly amount. This looks at one day at a time.

Run by .github/workflows/vercel-cost-watch.yml. Standard library only.

What counts: every metered line of the team (EffectiveCost, before the $20
monthly credit), not the plan and seat fees. A Vercel billing day runs from
07:00 UTC to 07:00 UTC (midnight in Los Angeles).

A day is a jump when it costs at least COST_ALERT_DAILY_USD, or at least
COST_ALERT_RATIO times the median of the seven days before it while also
reaching COST_ALERT_FLOOR_USD. Silent otherwise. FORCE=1 always mails.

Env: VERCEL_TOKEN, VERCEL_TEAM_ID, VERCEL_TEAM_SLUG, RESEND_API_KEY, MAIL_TO, MAIL_FROM,
     COST_ALERT_DAILY_USD (8), COST_ALERT_RATIO (2.5), COST_ALERT_FLOOR_USD (3),
     FORCE, DRY_RUN (print the mail, send nothing).
"""
from __future__ import annotations

import html
import json
import os
import statistics
import sys
import urllib.error
import urllib.parse
import urllib.request
from collections import defaultdict
from datetime import datetime, timedelta, timezone

API = "https://api.vercel.com"
PLAN_FEES = "Subscription Licenses"  # Pro plan, extra seats: fixed, not a jump


def env(key: str, default: str = "") -> str:
    return (os.environ.get(key) or default).strip()


def get(path: str, params: dict[str, str], token: str) -> bytes:
    url = f"{API}{path}?{urllib.parse.urlencode(params)}"
    req = urllib.request.Request(url, headers={"Authorization": f"Bearer {token}"})
    with urllib.request.urlopen(req, timeout=60) as res:
        return res.read()


def iso(dt: datetime) -> str:
    return dt.strftime("%Y-%m-%dT%H:%M:%S.000Z")


def last_closed_day(now: datetime) -> datetime:
    """Start of the most recent billing day that is over (they turn at 07:00 UTC)."""
    boundary = now.replace(hour=7, minute=0, second=0, microsecond=0)
    if now < boundary:
        boundary -= timedelta(days=1)
    return boundary - timedelta(days=1)


def daily_costs(token: str, team: str, first: datetime, end: datetime):
    raw = get("/v1/billing/charges", {"teamId": team, "from": iso(first), "to": iso(end)}, token)
    total: dict[str, float] = defaultdict(float)
    by_service: dict[str, dict[str, float]] = defaultdict(lambda: defaultdict(float))
    for line in raw.decode().splitlines():
        if not line.strip():
            continue
        row = json.loads(line)
        if row.get("ServiceCategory") == PLAN_FEES:
            continue
        cost = float(row.get("EffectiveCost") or 0)
        day = row["ChargePeriodStart"][:10]
        total[day] += cost
        by_service[day][row["ServiceName"]] += cost
    return total, by_service


def builds(token: str, team: str, start: datetime, end: datetime) -> tuple[int, int]:
    raw = get(
        "/v6/deployments",
        {"teamId": team, "since": str(int(start.timestamp() * 1000)), "until": str(int(end.timestamp() * 1000)), "limit": "100"},
        token,
    )
    deployments = json.loads(raw).get("deployments", [])
    prod = sum(1 for d in deployments if d.get("target") == "production")
    return prod, len(deployments) - prod


def whose_token(token: str, team: str) -> str:
    """Why the bill could not be read: a valid token on a team without costs answers
    404 costs_not_found, which is what a token scoped to the wrong team looks like."""
    try:
        user = json.loads(get("/v2/user", {}, token)).get("user", {}).get("username", "?")
        teams = [(t.get("slug"), t.get("id")) for t in json.loads(get("/v2/teams", {"limit": "50"}, token)).get("teams", [])]
    except urllib.error.HTTPError as err:
        return f"::error::the token cannot even name its owner ({err.code}): revoked, expired or mistyped."
    seen = ", ".join(slug for slug, _ in teams) or "none"
    if team not in [tid for _, tid in teams]:
        return (f"::error::the token belongs to {user} and sees these teams: {seen}. It does not see {team}. "
                "Create it again with the scope set to the team that pays the bill.")
    return f"::error::the token belongs to {user} and does see the team ({seen}); the billing API still refused."


def compose(day: str, cost: float, usual: float, week: float, services: dict[str, float], prod: int, preview: int, why: str) -> dict:
    money = lambda v: f"${v:,.2f}"
    top = sorted(services.items(), key=lambda kv: -kv[1])[:4]
    lines = "".join(
        f"<div style=\"padding:6px 0;border-bottom:1px solid #eee\">{html.escape(name)} <b style=\"float:right\">{money(v)}</b></div>"
        for name, v in top
        if v >= 0.01
    )
    body = (
        "<div style=\"max-width:560px;font:16px/1.5 -apple-system,Segoe UI,Roboto,sans-serif;color:#111\">"
        f"<p style=\"margin:0 0 4px\">Vercel usage on {html.escape(day)}: <b>{money(cost)}</b></p>"
        f"<p style=\"margin:0 0 4px\">A usual day lately: <b>{money(usual)}</b></p>"
        f"<p style=\"margin:0 0 16px\">At this pace, a month of usage: <b>{money(cost * 30)}</b> on top of the plan</p>"
        f"<div style=\"margin:0 0 16px\">{lines}</div>"
        f"<p style=\"margin:0 0 16px\">Builds that day: <b>{prod}</b> production, <b>{preview}</b> preview. Last seven days of usage: <b>{money(week)}</b>.</p>"
        "<p style=\"margin:0 0 16px\">Builds high: too many pushes, or the build machine setting changed. "
        "Functions high: a crawler, check the user agents in the request logs.</p>"
        f"<p style=\"margin:0 0 16px\"><a href=\"https://vercel.com/{html.escape(env('VERCEL_TEAM_SLUG', 'dashboard'))}/~/usage\">Open the usage page</a></p>"
        f"<p style=\"margin:0;color:#888;font-size:13px\">Details: {html.escape(why)} Usage only, before the $20 monthly credit, plan and seats left out. "
        "Billing days run 07:00 to 07:00 UTC. Sent by the vercel-cost-watch workflow.</p>"
        "</div>"
    )
    return {
        "from": env("MAIL_FROM", "Qipu watch <onboarding@resend.dev>"),
        "to": [env("MAIL_TO", "daniel@qipu.org")],
        "subject": f"Vercel cost jump: {money(cost)} on {day} (usual {money(usual)})",
        "html": body,
    }


def send(payload: dict, key: str) -> None:
    req = urllib.request.Request(
        "https://api.resend.com/emails",
        data=json.dumps(payload).encode(),
        headers={"Authorization": f"Bearer {key}", "Content-Type": "application/json", "User-Agent": "qipu-cost-watch/1"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=60) as res:
        print(f"mail sent to {payload['to'][0]} ({res.status})")


def main() -> int:
    token, team = env("VERCEL_TOKEN"), env("VERCEL_TEAM_ID")
    if not token or not team:
        # A watch that cannot look is a failure, not a quiet day.
        print("::error::VERCEL_TOKEN or VERCEL_TEAM_ID missing: the cost watch cannot read the bill. "
              "gh secret set VERCEL_TOKEN --env pipeline -R <repo>")
        return 1

    daily_usd = float(env("COST_ALERT_DAILY_USD", "8"))
    ratio = float(env("COST_ALERT_RATIO", "2.5"))
    floor_usd = float(env("COST_ALERT_FLOOR_USD", "3"))

    now = datetime.now(timezone.utc)
    start = last_closed_day(now)
    end = start + timedelta(days=1)
    try:
        total, by_service = daily_costs(token, team, start - timedelta(days=7), end)
        prod, preview = builds(token, team, start, end)
    except urllib.error.HTTPError as err:
        print(f"::error::Vercel API answered {err.code} on {err.url.split('?')[0]}: {err.read().decode(errors='replace')[:200]}")
        print(whose_token(token, team))
        return 1

    day = start.strftime("%Y-%m-%d")
    cost = total.get(day, 0.0)
    before = [total.get((start - timedelta(days=n)).strftime("%Y-%m-%d"), 0.0) for n in range(1, 8)]
    usual = statistics.median(before)
    week = cost + sum(before[:6])

    reasons = []
    if cost >= daily_usd:
        reasons.append(f"the day reached the ${daily_usd:g} line.")
    if cost >= floor_usd and usual > 0 and cost >= ratio * usual:
        reasons.append(f"the day is {cost / usual:.1f} times the median of the seven days before.")
    print(f"{day}: ${cost:.2f} · median of the 7 days before ${usual:.2f} · builds {prod} production, {preview} preview")

    if not reasons and env("FORCE") not in ("1", "true"):
        print("no jump, no mail.")
        return 0

    payload = compose(day, cost, usual, week, by_service.get(day, {}), prod, preview, " ".join(reasons) or "test run, no jump.")
    if env("DRY_RUN") in ("1", "true"):
        print(json.dumps(payload, indent=2, ensure_ascii=False))
        return 0
    key = env("RESEND_API_KEY")
    if not key:
        print("::error::a jump was found but RESEND_API_KEY is missing, no mail sent.")
        return 1
    send(payload, key)
    return 0


if __name__ == "__main__":
    sys.exit(main())
