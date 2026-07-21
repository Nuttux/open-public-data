"""
Shared helpers for the budget-sankey exports (Paris + Marseille).

Per ADR-0011, the two city exports keep their own classification and output
shape (Paris groups by functional chapter with fonction imputation; Marseille
groups by ode_categorie_flux) — those genuinely differ because the source data
differs. What they share, and what lives here, is the *mechanical* skeleton
that is byte-for-byte identical between them:

  - get_bigquery_client(): the credential-resolution + client boilerplate
    (copy-pasted across the export layer).
  - sankey_nodes_and_links(): the ECharts (R)/(D) collision disambiguation and
    the nodes/links assembly from per-category revenue/expense totals.

Keeping these here removes the duplication without forcing the divergent
drilldown/bySection/output-dict code together (which would be less legible and
risk a silent regression). Output is unchanged — proven by byte-diff parity.
"""

from __future__ import annotations

import os
from pathlib import Path

from google.cloud import bigquery


def get_bigquery_client(project_id: str, extra_cred_paths=()) -> bigquery.Client:
    """BigQuery client, resolving credentials from (in order): the
    GOOGLE_APPLICATION_CREDENTIALS env var, gcloud ADC, then any caller-supplied
    fallback paths (e.g. a local credentials.json)."""
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


def sankey_nodes_and_links(revenue_by: dict, expense_by: dict, central_name: str):
    """Build the Sankey nodes + links from per-category totals.

    Args:
      revenue_by / expense_by: {category_name: amount} (amounts already
        aggregated). Only positive amounts become nodes/links; link order
        follows each dict's insertion order (matches the legacy scripts).
      central_name: the central node label ("Budget Paris" / "Budget Marseille").

    Returns (nodes, links, rev_display, exp_display). The two display functions
    apply the " (R)" / " (D)" suffix when a category name appears on both sides
    (ECharts needs unique node names); callers reuse them for drilldown/section
    display names so the suffixing stays consistent.
    """
    rev_names = {n for n, v in revenue_by.items() if v > 0}
    exp_names = {n for n, v in expense_by.items() if v > 0}
    collisions = rev_names & exp_names

    def rev_display(name: str) -> str:
        return f"{name} (R)" if name in collisions else name

    def exp_display(name: str) -> str:
        return f"{name} (D)" if name in collisions else name

    nodes = []
    for name in sorted(rev_names):
        nodes.append({"name": rev_display(name), "category": "revenue"})
    nodes.append({"name": central_name, "category": "central"})
    for name in sorted(exp_names):
        nodes.append({"name": exp_display(name), "category": "expense"})

    links = []
    for name, value in revenue_by.items():
        if value > 0:
            links.append({"source": rev_display(name), "target": central_name, "value": value})
    for name, value in expense_by.items():
        if value > 0:
            links.append({"source": central_name, "target": exp_display(name), "value": value})

    return nodes, links, rev_display, exp_display
