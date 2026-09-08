#!/usr/bin/env python3
"""
Résume en clair ce qu'un refresh a changé dans website/public/data.

Compare le working tree à une ref git (défaut HEAD) et produit un markdown :
fichiers touchés, années disponibles avant → après pour chaque index, totaux
par année qui ont bougé, état de l'audit qualité. C'est ce qu'on lit le lundi
pour savoir ce que le site a reçu — message de commit, corps de PR, résumé du
run GitHub.

Usage :
    summarize_data_diff.py [--base HEAD] [--data website/public/data]
    summarize_data_diff.py --title        # une ligne, pour le titre du commit

Stdlib uniquement : tourne dans le job CI sans dépendance.
"""
from __future__ import annotations

import argparse
import json
import subprocess
import sys
from datetime import date
from pathlib import Path

REPO = Path(subprocess.check_output(["git", "rev-parse", "--show-toplevel"], text=True).strip())

# Clés d'index qui disent « quelles années le site propose » et « combien ».
YEAR_KEYS = ("availableYears", "years")
TOTAL_KEYS = ("totalsByYear",)


def git_show(ref: str, rel: str) -> dict | None:
    try:
        raw = subprocess.check_output(["git", "-C", str(REPO), "show", f"{ref}:{rel}"],
                                      text=True, stderr=subprocess.DEVNULL)
    except subprocess.CalledProcessError:
        return None
    try:
        d = json.loads(raw)
    except json.JSONDecodeError:
        return None
    return d if isinstance(d, dict) else None


def changed_files(ref: str, data_rel: str) -> tuple[list[str], list[str], list[str]]:
    """(modifiés, ajoutés, supprimés) sous data_rel, vs ref. Inclut l'index
    (le workflow fait `git add` avant) et les fichiers non suivis."""
    out = subprocess.check_output(
        ["git", "-C", str(REPO), "status", "--porcelain", "--untracked-files=all", "--", data_rel],
        text=True)
    modified, added, deleted = [], [], []
    for line in out.splitlines():
        code, path = line[:2], line[3:]
        if "D" in code:
            deleted.append(path)
        elif "A" in code or "?" in code:
            added.append(path)
        else:
            modified.append(path)
    return modified, added, deleted


def fmt_amount(v) -> str:
    try:
        v = float(v)
    except (TypeError, ValueError):
        return str(v)
    if abs(v) >= 1e9:
        return f"{v / 1e9:.2f} Md€"
    if abs(v) >= 1e6:
        return f"{v / 1e6:.1f} M€"
    return f"{v:,.0f} €".replace(",", " ")


def years_of(d: dict | None) -> list | None:
    if not d:
        return None
    for k in YEAR_KEYS:
        if isinstance(d.get(k), list):
            return sorted(d[k])
    return None


def totals_of(d: dict | None) -> dict:
    if not d:
        return {}
    for k in TOTAL_KEYS:
        if isinstance(d.get(k), dict):
            return d[k]
    return {}


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--base", default="HEAD")
    ap.add_argument("--data", default="website/public/data")
    ap.add_argument("--title", action="store_true", help="une ligne pour le titre du commit")
    args = ap.parse_args()

    modified, added, deleted = changed_files(args.base, args.data)
    touched = modified + added + deleted

    # Index dont les années / totaux ont bougé.
    year_changes: list[tuple[str, list | None, list | None]] = []
    total_changes: list[tuple[str, str, object, object]] = []
    for rel in sorted(p for p in touched if "index" in Path(p).name.lower() and p.endswith(".json")):
        after = None
        fp = REPO / rel
        if fp.exists():
            try:
                after = json.loads(fp.read_text())
            except json.JSONDecodeError:
                after = None
        before = git_show(args.base, rel)
        yb, ya = years_of(before), years_of(after)
        if yb != ya:
            year_changes.append((rel, yb, ya))
        tb, ta = totals_of(before), totals_of(after)
        for y in sorted(set(tb) | set(ta), key=str):
            b = (tb.get(y) or {}).get("montant_total") if isinstance(tb.get(y), dict) else tb.get(y)
            a = (ta.get(y) or {}).get("montant_total") if isinstance(ta.get(y), dict) else ta.get(y)
            if b != a:
                total_changes.append((rel, str(y), b, a))

    today = date.today().isoformat()
    if args.title:
        bits = [f"{len(touched)} fichier{'s' if len(touched) > 1 else ''}"]
        new_years = sorted({str(y) for _, yb, ya in year_changes for y in (ya or []) if y not in (yb or [])})
        if new_years:
            bits.append("+" + "/".join(new_years))
        print(f"data: auto-refresh {today} ({', '.join(bits)})")
        return 0

    lines = [f"## Refresh data du {today}", ""]
    lines.append(f"**{len(modified)} modifié(s), {len(added)} ajouté(s), {len(deleted)} supprimé(s)** sous `{args.data}` (vs `{args.base}`).")
    lines.append("")

    if year_changes:
        lines += ["### Années disponibles", "", "| index | avant | après |", "|---|---|---|"]
        for rel, yb, ya in year_changes:
            short = rel.replace(args.data + "/", "")
            lines.append(f"| `{short}` | {', '.join(map(str, yb)) if yb else '—'} | {', '.join(map(str, ya)) if ya else '—'} |")
        lines.append("")
    else:
        lines += ["### Années disponibles", "", "Inchangées sur tous les index.", ""]

    if total_changes:
        lines += ["### Totaux par année qui ont bougé", "", "| index | année | avant | après |", "|---|---|---|---|"]
        for rel, y, b, a in total_changes[:40]:
            short = rel.replace(args.data + "/", "")
            lines.append(f"| `{short}` | {y} | {fmt_amount(b) if b is not None else '—'} | {fmt_amount(a) if a is not None else '—'} |")
        if len(total_changes) > 40:
            lines.append(f"| … | | | {len(total_changes) - 40} autre(s) |")
        lines.append("")

    audit_rel = f"{args.data}/data_quality_audit.json"
    audit_fp = REPO / audit_rel
    if audit_fp.exists():
        try:
            audit = json.loads(audit_fp.read_text())
            checks = audit.get("checks", [])
            counts = {s: sum(1 for c in checks if c.get("status") == s) for s in ("pass", "warn", "fail")}
            lines += ["### Audit qualité", "",
                      f"{counts['pass']} pass · {counts['warn']} warn · {counts['fail']} fail "
                      f"(généré {str(audit.get('generated_at', ''))[:16]})"]
            for c in checks:
                if c.get("status") in ("warn", "fail"):
                    lines.append(f"- {'🔴' if c['status'] == 'fail' else '🟠'} {c.get('label', c.get('id'))} — {c.get('actual', '')}")
            lines.append("")
        except json.JSONDecodeError:
            pass

    if added or deleted:
        lines += ["### Fichiers ajoutés / supprimés", ""]
        lines += [f"- ➕ `{p}`" for p in added[:30]]
        lines += [f"- ➖ `{p}`" for p in deleted[:30]]
        lines.append("")

    sys.stdout.write("\n".join(lines))
    return 0


if __name__ == "__main__":
    sys.exit(main())
