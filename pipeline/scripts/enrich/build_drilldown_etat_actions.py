#!/usr/bin/env python3
"""
Build the level4 (PLF actions) layer of the `etat` bucket of
daily_bread_drilldown.json.

Source:
    data.economie.gouv.fr — plf25-depenses-2025-selon-destination
    Same dataset already used by sync_etat_lfi.py for missions+programmes ;
    it also exposes `action` / `libelle_action` columns at sub-programme
    grain. We aggregate by (mission, programme, action) summing CP, then
    publish each action's share_of_parent against its parent programme.

Output (in-memory, consumed by build_drilldown_etat.py):
    {
      "<mission_code>": {
        "<programme_code>": [
          { "key": "ec_140_01",
            "label_fr": "Action 01 — Enseignement préélémentaire",
            "label_en": "Action 01 — Pre-elementary teaching",
            "share_of_parent": 0.32,
            "source": "...", "source_url": "..."
          },
          ...
        ]
      }
    }

Note: the dataset is also fetched by `sync_etat_lfi.py`. To avoid a second
network round-trip when both run in the same pipeline session, this module
exposes `build_etat_actions_index(rows=None)` which can take a pre-fetched
record list. When `rows is None`, it falls back to its own paginated fetch.

Usage (standalone):
    python pipeline/scripts/enrich/build_drilldown_etat_actions.py
"""

from __future__ import annotations

import json
import re
import sys
from collections import defaultdict
from pathlib import Path
from urllib.parse import urlencode
from urllib.request import Request, urlopen

ROOT = Path(__file__).parent.parent.parent.parent

DATASET_ID = "plf25-depenses-2025-selon-destination"
DATASET_PAGE_SLUG = "plf-2025-depenses-2025-selon-destination"
SOURCE_LABEL = f"data.economie.gouv.fr — {DATASET_ID}"
SOURCE_URL = f"https://www.data.gouv.fr/datasets/{DATASET_PAGE_SLUG}/"

API_BASE = (
    f"https://data.economie.gouv.fr/api/explore/v2.1/catalog/datasets/{DATASET_ID}/records"
)

_KEY_OK = re.compile(r"^[a-z0-9_]+$")


# Curated EN translations for high-frequency PLF action verb stems.
# This is intentionally small : we don't try to translate every action
# label (~600 unique). For unknown stems we fall back to a templated
# "Action NN — <fr_label>" so `label_en` is always non-empty (parity
# contract with the rest of the drilldown). Programme-grain has the same
# fallback behavior in build_drilldown_etat.py.
ACTION_LABEL_EN_HINTS: dict[str, str] = {
    "Enseignement préélémentaire": "Pre-elementary teaching",
    "Enseignement élémentaire": "Elementary teaching",
    "Enseignement en collège": "Lower-secondary teaching",
    "Enseignement général et technologique en lycée":
        "General & technological upper-secondary teaching",
    "Enseignement professionnel sous statut scolaire":
        "Vocational upper-secondary teaching",
    "Enseignement post-baccalauréat en lycée":
        "Post-baccalaureate teaching in lycée",
    "Personnels en situation diverse": "Personnel — various situations",
    "Remplacement": "Substitute teachers",
    "Pilotage et encadrement pédagogique": "Pedagogical leadership",
    "Politique sociale": "Social policy",
    "Soutien": "Support functions",
    "Formation continue": "Continuous training",
    "Formation initiale": "Initial training",
    "Aide aux étudiants": "Student aid",
    "Vie étudiante": "Student life",
    "Recherche": "Research",
    "Recherche universitaire": "University research",
    "Diffusion de la culture scientifique": "Public scientific outreach",
    "Action sociale": "Social action",
    "Inclusion sociale": "Social inclusion",
    "Logement": "Housing",
    "Hébergement": "Emergency lodging",
    "Santé publique": "Public health",
    "Prévention": "Prevention",
    "Accès et qualité des soins": "Access & quality of care",
    "Justice judiciaire": "Judicial justice",
    "Administration pénitentiaire": "Prison administration",
    "Protection judiciaire de la jeunesse": "Youth judicial protection",
    "Police nationale": "National police",
    "Gendarmerie nationale": "National gendarmerie",
    "Sécurité civile": "Civil safety",
    "Sécurité routière": "Road safety",
    "Préparation et emploi des forces": "Force readiness & employment",
    "Équipement des forces": "Force equipment",
    "Soutien de la politique de la défense": "Defence policy support",
    "Environnement et prospective": "Environment & foresight",
    "Charge de la dette": "Debt service",
    "Trésorerie de l'État": "State cash management",
    "Fonction publique": "Civil service",
    "Conduite et pilotage": "Leadership & steering",
    "Soutien des politiques": "Policy support",
}


def _slug(value: str) -> str:
    s = value.strip().lower()
    s = re.sub(r"[^a-z0-9]+", "_", s)
    s = re.sub(r"_+", "_", s).strip("_")
    return s


def _action_suffix(action_code: str) -> str:
    """Extract NN from "PROG-NN" or "PROG-NN-MM"."""
    parts = (action_code or "").split("-")
    if len(parts) >= 2:
        return parts[1]
    return _slug(action_code)


def _en_action_label(fr_label: str, action_suffix: str) -> str:
    """Best-effort EN label for an action.

    Strategy:
      1. exact match in ACTION_LABEL_EN_HINTS
      2. heuristic: known stem prefix
      3. fallback: "Action NN — <fr_label>" (template, never empty).
    """
    if fr_label in ACTION_LABEL_EN_HINTS:
        return ACTION_LABEL_EN_HINTS[fr_label]
    for stem, en in ACTION_LABEL_EN_HINTS.items():
        if fr_label.startswith(stem):
            tail = fr_label[len(stem):].strip()
            if tail.startswith("(") or tail.startswith("—") or not tail:
                return en + (" " + tail if tail else "")
            return en
    return f"Action {action_suffix} — {fr_label}"


def fetch_all() -> list[dict]:
    """Page through the full PLF dataset (BG + others, all sub-action grain).

    Mirrors sync_etat_lfi.fetch_all but scoped to this module so the
    actions builder can run standalone without importing the sync.
    """
    out: list[dict] = []
    offset = 0
    limit = 100
    while True:
        params = {"limit": str(limit), "offset": str(offset)}
        url = f"{API_BASE}?{urlencode(params)}"
        req = Request(url, headers={"User-Agent": "FranceOpenData/1.0"})
        with urlopen(req, timeout=60) as resp:
            data = json.loads(resp.read().decode("utf-8"))
        results = data.get("results", [])
        out.extend(results)
        if len(results) < limit:
            break
        offset += limit
        if offset > 5000:
            break
    return out


def _aggregate_actions(rows: list[dict]) -> dict[str, dict[str, list[dict]]]:
    """Group BG rows by (mission, programme, action) summing CP.

    Returns a nested index ``{mission_code: {programme_code: [action,...]}}``.
    Action labels picked from the first non-empty libelle_action seen for
    each (mission, programme, action) triple — they are stable per row in
    the published dataset.
    """
    # key: (mission_code, programme_code, action_code) -> aggregate
    agg: dict[tuple, dict] = {}
    for r in rows:
        if r.get("typebudget") != "BG":
            continue
        m = str(r.get("mission") or "").strip()
        p = str(r.get("programme") or "").strip()
        a = str(r.get("action") or "").strip()
        if not m or not p or not a:
            continue
        cp = float(r.get("credit_de_paiement") or 0)
        ae = float(r.get("autorisation_engagement") or 0)
        key = (m, p, a)
        if key not in agg:
            agg[key] = {
                "mission": m,
                "programme": p,
                "action": a,
                "label_fr": (r.get("libelle_action") or "").strip(),
                "cp": 0.0,
                "ae": 0.0,
            }
        agg[key]["cp"] += cp
        agg[key]["ae"] += ae
        # Late rows occasionally have a non-empty libelle_action when an
        # earlier one was empty: prefer the first non-empty seen.
        if not agg[key]["label_fr"]:
            lbl = (r.get("libelle_action") or "").strip()
            if lbl:
                agg[key]["label_fr"] = lbl

    # Build nested index: mission -> programme -> [actions...]
    index: dict[str, dict[str, list[dict]]] = defaultdict(lambda: defaultdict(list))
    for (m, p, _a), entry in agg.items():
        index[m][p].append(entry)

    # Sort actions within each programme by CP desc.
    for m, by_prog in index.items():
        for p, lst in by_prog.items():
            lst.sort(key=lambda x: x["cp"], reverse=True)
    return index


def build_etat_actions_index(rows: list[dict] | None = None) -> dict:
    """Public entrypoint.

    Returns ``{ "<mission_lower>": { "<programme_lower>": [
        { key, label_fr, label_en, share_of_parent, source, source_url,
          cp_eur, ae_eur }, ...
    ]}}`` — keys are slug-safe lowercase, ready to graft onto level3 entries
    in build_drilldown_etat.

    Pass `rows` if you have already paginated the dataset (sync_etat_lfi
    does the same fetch); otherwise this module fetches itself.
    """
    if rows is None:
        rows = fetch_all()

    raw_index = _aggregate_actions(rows)

    out: dict[str, dict[str, list[dict]]] = {}
    for mission_code, by_prog in raw_index.items():
        m_key = _slug(mission_code)
        if not _KEY_OK.match(m_key):
            raise ValueError(f"Bad mission key {m_key!r}")
        out[m_key] = {}
        for programme_code, actions in by_prog.items():
            p_key = f"{m_key}_{_slug(programme_code)}"
            if not _KEY_OK.match(p_key):
                raise ValueError(f"Bad programme key {p_key!r}")

            total_cp = sum(a["cp"] for a in actions)
            entries: list[dict] = []
            seen_keys: set[str] = set()
            for a in actions:
                suffix = _action_suffix(a["action"])
                action_key = f"{p_key}_{_slug(suffix)}"
                if not _KEY_OK.match(action_key):
                    raise ValueError(f"Bad action key {action_key!r} from {a['action']!r}")
                # Defensive: enforce uniqueness within programme.
                if action_key in seen_keys:
                    # Prefix with full action code to disambiguate.
                    action_key = f"{p_key}_{_slug(a['action'])}"
                seen_keys.add(action_key)

                share = (a["cp"] / total_cp) if total_cp > 0 else 0.0
                fr_label = a["label_fr"] or f"Action {suffix}"
                # Prefix fr label with "Action NN —" only if not already there.
                if not fr_label.lower().startswith("action "):
                    fr_label_display = f"Action {suffix} — {fr_label}"
                else:
                    fr_label_display = fr_label
                en_label = _en_action_label(a["label_fr"] or fr_label, suffix)

                entries.append({
                    "key": action_key,
                    "label_fr": fr_label_display,
                    "label_en": en_label,
                    "share_of_parent": round(share, 6),
                    "source": SOURCE_LABEL,
                    "source_url": SOURCE_URL,
                    "cp_eur": round(a["cp"]),
                    "ae_eur": round(a["ae"]),
                })

            out[m_key][p_key] = entries

    return out


def main() -> int:
    """Standalone debug: prints an action-count summary."""
    print(f"→ Fetching PLF dataset {DATASET_ID} ...")
    rows = fetch_all()
    print(f"  Fetched {len(rows)} rows")
    index = build_etat_actions_index(rows=rows)

    n_missions = len(index)
    n_programmes = sum(len(p) for p in index.values())
    n_actions = sum(len(actions) for p in index.values() for actions in p.values())
    print(
        f"[etat_actions] missions={n_missions} programmes={n_programmes} "
        f"actions={n_actions}"
    )
    if "-v" in sys.argv:
        json.dump(index, sys.stdout, ensure_ascii=False, indent=2)
        print()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
