#!/usr/bin/env python3
"""
Prévenir les abonnés qu'il y a du neuf (2026-09-16).

Lu par le job `notify` de enrich-pipeline.yml, après le mail du lundi, quand le
refresh a PUBLIÉ de nouvelles données. Compose un message court à partir du
résumé produit par summarize_data_diff.py (quels index ont gagné une année),
puis l'envoie au segment Resend (l'ancienne « audience ») en un seul broadcast — c'est Resend qui
porte le lien de désinscription ({{{RESEND_UNSUBSCRIBE_URL}}}).

Rien n'est envoyé :
  - sans RESEND_API_KEY ou RESEND_AUDIENCE_ID (on le dit, exit 0) ;
  - si le résumé ne montre aucune nouvelle année (une correction de chiffre
    n'est pas « de nouvelles données ») ;
  - avec --dry-run : le message est imprimé, pas envoyé.

Env :
    SUMMARY_PATH        résumé markdown (défaut /tmp/refresh-summary.md)
    RESEND_API_KEY, RESEND_AUDIENCE_ID
    ALERTS_EMAIL_FROM   expéditeur sur un domaine vérifié (défaut : Qipu <alertes@qipu.org>)
    SITE_URL            défaut https://www.qipu.org
"""
from __future__ import annotations

import html
import json
import os
import re
import sys
import urllib.error
import urllib.request
from datetime import date
from pathlib import Path

# Un index de données → la section du site qu'il alimente.
SECTIONS: list[tuple[str, str, str]] = [
    ("budget_index.json", "Budget", "/fr/france/paris/budget"),
    ("marches-publics/index.json", "Marchés publics", "/fr/france/paris/marches"),
    ("investissement_tendances.json", "Investissements", "/fr/france/paris/investissements"),
    ("subventions/index.json", "Subventions", "/fr/france/paris/subventions"),
    ("logement", "Logement social", "/fr/france/paris/logement"),
    ("bilan_index.json", "Dette", "/fr/france/paris/dette"),
    ("hors_bilan_index.json", "Dette (garanties d'emprunt)", "/fr/france/paris/dette"),
]


def env(k: str, default: str = "") -> str:
    return (os.environ.get(k) or default).strip()


def new_years(summary: str) -> list[tuple[str, str, list[str]]]:
    """[(section, url, [années nouvelles])] lus dans le tableau « Années disponibles »."""
    out: list[tuple[str, str, list[str]]] = []
    for m in re.finditer(r"^\| `([^`]+)` \| ([^|]*) \| ([^|]*) \|$", summary, re.M):
        rel, before, after = m.group(1).strip(), m.group(2).strip(), m.group(3).strip()
        yb = set(re.findall(r"\d{4}", before))
        ya = re.findall(r"\d{4}", after)
        added = [y for y in ya if y not in yb]
        if not added:
            continue
        for key, label, url in SECTIONS:
            if key in rel:
                out.append((label, url, added))
                break
    # Une section une seule fois, ses années fusionnées.
    merged: dict[str, tuple[str, list[str]]] = {}
    for label, url, years in out:
        u, ys = merged.get(label, (url, []))
        merged[label] = (u, sorted(set(ys) | set(years)))
    return [(label, u, ys) for label, (u, ys) in merged.items()]


def compose(items: list[tuple[str, str, list[str]]], site: str) -> tuple[str, str, str]:
    today = date.today().strftime("%d/%m/%Y")
    first = items[0]
    subject = f"Qipu — {first[0]} : {', '.join(first[2])} en ligne" + (f" (+{len(items) - 1})" if len(items) > 1 else "")
    lines = ["La Ville de Paris a publié de nouvelles données, elles sont en ligne sur Qipu :", ""]
    for label, url, years in items:
        lines.append(f"  – {label} : {', '.join(years)} → {site}{url}")
    lines += ["", f"Mis en ligne le {today}. Un message par publication de la Ville, jamais plus d'un par semaine.",
              "Se désinscrire : {{{RESEND_UNSUBSCRIBE_URL}}}"]
    text = "\n".join(lines)
    rows = "".join(
        f'<li style="margin:6px 0"><a href="{html.escape(site + url)}" style="color:#2b2f8a">{html.escape(label)}</a> : {html.escape(", ".join(years))}</li>'
        for label, url, years in items
    )
    body = (
        '<div style="font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;max-width:560px;line-height:1.5;color:#111">'
        "<p>La Ville de Paris a publié de nouvelles données, elles sont en ligne sur Qipu :</p>"
        f'<ul style="padding-left:18px">{rows}</ul>'
        f'<p style="color:#555;font-size:14px">Mis en ligne le {today}. Un message par publication de la Ville, jamais plus d\'un par semaine.<br>'
        '<a href="{{{RESEND_UNSUBSCRIBE_URL}}}" style="color:#555">Se désinscrire</a></p></div>'
    )
    return subject, text, body


def resend(path: str, payload: dict | None, key: str) -> tuple[int, dict]:
    req = urllib.request.Request(
        f"https://api.resend.com{path}",
        data=json.dumps(payload).encode() if payload is not None else None,
        headers={"Authorization": f"Bearer {key}", "Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            return r.status, json.loads(r.read() or b"{}")
    except urllib.error.HTTPError as e:
        try:
            return e.code, json.loads(e.read() or b"{}")
        except json.JSONDecodeError:
            return e.code, {}


def main() -> int:
    dry = "--dry-run" in sys.argv
    summary_path = Path(env("SUMMARY_PATH", "/tmp/refresh-summary.md"))
    summary = summary_path.read_text(encoding="utf-8") if summary_path.is_file() else ""
    items = new_years(summary)
    if not items:
        print("Aucune nouvelle année dans le résumé : les abonnés ne sont pas prévenus.")
        return 0
    site = env("SITE_URL", "https://www.qipu.org")
    subject, text, body = compose(items, site)
    print("→", subject)
    print(text)
    if dry:
        return 0
    key, audience = env("RESEND_API_KEY"), env("RESEND_AUDIENCE_ID")
    if not key or not audience:
        print("::warning::RESEND_API_KEY ou RESEND_AUDIENCE_ID absent : abonnés non prévenus.")
        return 0
    sender = env("ALERTS_EMAIL_FROM", "Qipu <alertes@qipu.org>")
    code, created = resend("/broadcasts", {"segment_id": audience, "from": sender, "subject": subject, "text": text, "html": body, "name": subject}, key)
    if code != 200 and code != 201 or not created.get("id"):
        print(f"::warning::Resend a répondu {code} à la création du broadcast : {created}")
        return 0
    code, sent = resend(f"/broadcasts/{created['id']}/send", {}, key)
    if code not in (200, 201):
        print(f"::warning::Resend a répondu {code} à l'envoi : {sent}")
        return 0
    print(f"✓ abonnés prévenus (broadcast {created['id']})")
    return 0


if __name__ == "__main__":
    sys.exit(main())
