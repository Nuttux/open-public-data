#!/usr/bin/env python3
"""
Compose le mail du lundi : ce que le refresh a fait, en français simple, et
quoi faire s'il y a quelque chose à faire.

Lu par le job `notify` de enrich-pipeline.yml. Tout vient de variables
d'environnement (résultats des jobs) + du résumé markdown produit par
summarize_data_diff.py. Sort un JSON prêt pour l'API Resend sur stdout.

Env attendues :
    REFRESH_RESULT   success | failure | cancelled | skipped
    GATE_RESULT      success | failure | skipped
    PUBLISH_RESULT   success | failure | skipped
    CHANGED          true | false
    PUBLISH_WANTED   true | false          (input publish, ou true sur cron)
    TITLE            titre court du refresh (summarize --title), peut être vide
    RUN_URL, PR_URL, BRANCH, SUMMARY_PATH
    MAIL_FROM, MAIL_TO
"""
from __future__ import annotations

import html
import json
import os
import sys
from datetime import date
from pathlib import Path


def env(k: str, default: str = "") -> str:
    return (os.environ.get(k) or default).strip()


def main() -> int:
    refresh = env("REFRESH_RESULT")
    gate = env("GATE_RESULT")
    publish = env("PUBLISH_RESULT")
    changed = env("CHANGED") == "true"
    wanted = env("PUBLISH_WANTED") == "true"
    title = env("TITLE")
    run_url = env("RUN_URL")
    pr_url = env("PR_URL")
    branch = env("BRANCH")
    summary = ""
    p = Path(env("SUMMARY_PATH", "/tmp/refresh-summary.md"))
    if p.is_file():
        summary = p.read_text(encoding="utf-8").strip()

    today = date.today().strftime("%d/%m/%Y")

    # ── Verdict en une ligne, puis « quoi faire » ────────────────────────────
    if refresh != "success":
        icon, verdict = "🔴", "Le refresh a échoué avant de produire des données"
        todo = [
            "Le site n'a pas bougé (aucune donnée n'a été exportée).",
            "Ouvrir le run pour voir l'étape rouge : sync, dbt run, dbt test, export ou audit.",
            "Cas fréquents : une source de la Ville a changé de forme, un test dbt tombe, "
            "un check d'audit passe en fail.",
        ]
    elif not changed:
        icon, verdict = "⚪", "Rien de nouveau cette semaine"
        todo = ["La Ville n'a rien publié de nouveau depuis le dernier refresh. Rien à faire."]
    elif gate != "success":
        icon, verdict = "🔴", "Nouvelles données trouvées, mais le site ne construit pas avec"
        todo = [
            "Le site en ligne n'a pas bougé.",
            "Une PR d'inspection contient le diff et le lien vers le run (lint, typecheck, "
            "tests, build ou parcours Playwright en rouge).",
            "Si la cause est dans le code de main (pas dans les données), la corriger sur main "
            "puis relancer le workflow.",
        ]
    elif publish == "success" and wanted:
        icon, verdict = "✅", "Nouvelles données publiées sur le site"
        todo = ["Rien à faire. Vercel a déployé main ; vérifier www.qipu.org si tu veux voir."]
    elif publish == "failure":
        icon, verdict = "🟠", "Gates verts, mais la publication a échoué"
        todo = ["Ouvrir le run : le fast-forward de main ou la création de PR a échoué."]
    elif not wanted:
        icon, verdict = "🟡", "Test à blanc : données prêtes, volontairement non publiées"
        todo = [
            f"Les nouvelles données sont sur la branche {branch or 'data/refresh-*'}.",
            "Rien n'a touché main (publish=false). Pour publier : relancer avec publish=true, "
            "ou merger la branche.",
        ]
    else:
        icon, verdict = "🟠", "Gates verts, main a bougé pendant le refresh → PR ouverte"
        todo = ["Relire la PR et la merger (ou relancer le workflow pour un fast-forward propre)."]

    subject = f"{icon} Qipu · refresh du {today} — {verdict}"
    if title and changed:
        subject += f" · {title.replace('data: auto-refresh ', '')}"

    # ── Texte brut (le mail doit se lire sans HTML) ──────────────────────────
    lines = [f"{icon} {verdict}", ""]
    lines.append("QUOI FAIRE")
    lines += [f"  – {t}" for t in todo]
    lines.append("")
    if pr_url:
        lines.append(f"PR : {pr_url}")
    lines.append(f"Run : {run_url}")
    lines.append("")
    lines.append("ÉTAPES")
    lines.append(f"  refresh (sync → dbt → tests → export → audit) : {refresh or '—'}")
    lines.append(f"  gate-site (build + Playwright)                : {gate or 'skipped'}")
    lines.append(f"  publish                                       : {publish or 'skipped'}")
    if summary:
        lines += ["", "CE QUI A CHANGÉ", "", summary]
    text = "\n".join(lines)

    body_html = (
        "<div style=\"font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;"
        "max-width:680px;line-height:1.45\">"
        f"<h2 style=\"margin:0 0 12px\">{html.escape(icon + ' ' + verdict)}</h2>"
        "<p style=\"margin:0 0 4px;font-weight:600\">Quoi faire</p><ul style=\"margin-top:0\">"
        + "".join(f"<li>{html.escape(t)}</li>" for t in todo)
        + "</ul>"
        + (f"<p><a href=\"{html.escape(pr_url)}\">Ouvrir la PR</a> · " if pr_url else "<p>")
        + f"<a href=\"{html.escape(run_url)}\">Voir le run</a></p>"
        + "<pre style=\"font-family:ui-monospace,monospace;white-space:pre-wrap;background:#f6f6f4;"
        "padding:12px;border-radius:6px\">"
        + html.escape("\n".join(lines[lines.index("ÉTAPES"):]))
        + "</pre></div>"
    )

    payload = {
        "from": env("MAIL_FROM", "Qipu refresh <onboarding@resend.dev>"),
        "to": [env("MAIL_TO")],
        "subject": subject,
        "text": text,
        "html": body_html,
    }
    json.dump(payload, sys.stdout, ensure_ascii=False)
    return 0


if __name__ == "__main__":
    sys.exit(main())
