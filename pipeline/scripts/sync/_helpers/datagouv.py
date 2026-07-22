"""
data.gouv.fr API helper.

Resolves a dataset slug to its CSV resource URL, downloads the CSV,
and returns its bytes. Used by `sync_datagouv_dataset.py`.

Reference docs: https://doc.data.gouv.fr/api/reference/
"""

from __future__ import annotations

import json
import urllib.error
import urllib.request
from typing import Optional

DATAGOUV_API_BASE = "https://www.data.gouv.fr/api/1"


class DataGouvError(Exception):
    """Raised when a data.gouv.fr operation fails."""


def _http_get(url: str, timeout: int = 30) -> bytes:
    req = urllib.request.Request(url, headers={"User-Agent": "qipu-pipeline/1.0"})
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return resp.read()


def fetch_dataset_metadata(slug: str) -> dict:
    """Fetch a dataset's metadata from its slug.

    Raises DataGouvError if the dataset is not found or archived without
    accessible resources.
    """
    url = f"{DATAGOUV_API_BASE}/datasets/{slug}/"
    try:
        raw = _http_get(url)
    except urllib.error.HTTPError as e:
        raise DataGouvError(f"dataset '{slug}' not found ({e.code})") from e
    except urllib.error.URLError as e:
        raise DataGouvError(f"network error fetching '{slug}': {e}") from e

    try:
        return json.loads(raw)
    except json.JSONDecodeError as e:
        raise DataGouvError(f"invalid JSON for '{slug}': {e}") from e


def find_csv_resource(metadata: dict) -> Optional[dict]:
    """Find the most relevant CSV resource in a dataset's metadata.

    Strategy: prefer format 'csv' over alternatives, prefer the most recently
    modified resource. Returns None if no CSV resource is available.
    """
    candidates = []
    for r in metadata.get("resources", []):
        fmt = (r.get("format") or "").lower()
        if "csv" in fmt:
            candidates.append(r)
    if not candidates:
        return None
    candidates.sort(key=lambda r: r.get("last_modified") or "", reverse=True)
    return candidates[0]


def download_csv_for_slug(slug: str) -> tuple[bytes, dict]:
    """Resolve a slug to its CSV resource and download the bytes.

    Returns (csv_bytes, resource_metadata).
    Raises DataGouvError on any failure (404, no CSV, network, etc.).
    """
    meta = fetch_dataset_metadata(slug)
    res = find_csv_resource(meta)
    if not res:
        raise DataGouvError(f"no CSV resource in dataset '{slug}'")
    url = res.get("url")
    if not url:
        raise DataGouvError(f"resource for '{slug}' has no url")
    try:
        body = _http_get(url, timeout=120)
    except (urllib.error.HTTPError, urllib.error.URLError) as e:
        raise DataGouvError(f"download failed for '{slug}': {e}") from e
    return body, res
