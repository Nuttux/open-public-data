"""
Shared foundation for the export scripts.

Centralises the plumbing every export repeats — the BigQuery connection, the
per-city output directory, the per-city marts dataset, and the JSON write — so
a NEW city's export reuses all of it and only writes its own (city-shaped)
queries. The query bodies stay per-city on purpose: a city's marts have that
city's schema (M57 vs fund/character, etc.), which no shared query can span
(ADR-0010) — so this module converges the *plumbing*, not the SQL.

Paris resolves to the historical flat paths (`website/public/data`, dataset
`dbt_paris_marts`), so existing Paris exports stay byte-identical.
"""

from __future__ import annotations

import json
import os
from pathlib import Path

from google.cloud import bigquery

PROJECT_ID = "open-data-france-484717"

# export/ -> scripts/ -> pipeline/ -> repo root
_REPO_ROOT = Path(__file__).resolve().parents[3]
_DATA_ROOT = _REPO_ROOT / "website" / "public" / "data"


def get_bigquery_client(project_id: str = PROJECT_ID, extra_cred_paths=()) -> bigquery.Client:
    """BigQuery client, resolving credentials from the
    GOOGLE_APPLICATION_CREDENTIALS env var, then gcloud ADC, then any
    caller-supplied fallback paths."""
    if not os.environ.get("GOOGLE_APPLICATION_CREDENTIALS"):
        candidates = [
            Path.home() / ".config" / "gcloud" / "application_default_credentials.json",
            *[Path(p) for p in extra_cred_paths],
        ]
        for p in candidates:
            if p.exists():
                os.environ["GOOGLE_APPLICATION_CREDENTIALS"] = str(p)
                break
    return bigquery.Client(project=project_id)


def data_dir(city: str = "paris") -> Path:
    """Output directory for a city's exported JSON, mirroring the read side's
    cityJsonPath: Paris writes flat to website/public/data (historical
    convention); every other city writes under website/public/data/<city>."""
    return _DATA_ROOT if city == "paris" else _DATA_ROOT / city


def marts_dataset(city: str = "paris") -> str:
    """BigQuery marts dataset for a city. Paris honours the PARIS_MARTS_DATASET
    env override (dev runs against dbt_paris_dev_<user>_marts); other cities
    follow the dbt_<city>_marts convention, overridable via <CITY>_MARTS_DATASET."""
    if city == "paris":
        return os.environ.get("PARIS_MARTS_DATASET", "dbt_paris_marts")
    return os.environ.get(f"{city.upper()}_MARTS_DATASET", f"dbt_{city}_marts")


def write_json(path: Path, payload) -> None:
    """Write JSON with the project's conventions (utf-8, indent 2), creating the
    parent directory. Centralised so every export serialises identically."""
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, indent=2)
