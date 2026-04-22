"""Tools exposés à Claude pour interroger les données enrichies du site."""
from __future__ import annotations

import json
from pathlib import Path
from typing import Any

DATA_DIR = Path(__file__).resolve().parents[3] / "website" / "public" / "data"


def _load(path: Path) -> Any:
    with path.open(encoding="utf-8") as f:
        return json.load(f)


# ---------- implementations ----------

def list_datasets() -> dict:
    """Inventaire de ce qui est disponible, avec années."""
    out: dict = {"data_dir": str(DATA_DIR), "datasets": {}}
    subv_idx = DATA_DIR / "subventions" / "index.json"
    march_idx = DATA_DIR / "marches-publics" / "index.json"
    budget_idx = DATA_DIR / "budget_index.json"
    bilan_idx = DATA_DIR / "bilan_index.json"
    hb_idx = DATA_DIR / "hors_bilan_index.json"

    if subv_idx.exists():
        d = _load(subv_idx)
        out["datasets"]["subventions"] = {
            "years": d.get("availableYears"),
            "totals": d.get("totalsByYear"),
            "source": d.get("source"),
        }
    if march_idx.exists():
        d = _load(march_idx)
        out["datasets"]["marches_publics"] = {
            "years": d.get("availableYears"),
            "totals": d.get("totalsByYear"),
            "note": d.get("note"),
        }
    if budget_idx.exists():
        d = _load(budget_idx)
        out["datasets"]["budget"] = {"years": d.get("availableYears"), "info": {k: v for k, v in d.items() if k != "availableYears"}}
    if bilan_idx.exists():
        out["datasets"]["bilan_patrimoine"] = {"years": _load(bilan_idx).get("availableYears")}
    if hb_idx.exists():
        out["datasets"]["hors_bilan"] = {"years": _load(hb_idx).get("availableYears")}
    return out


def get_subventions_summary(year: int, top_n: int = 10) -> dict:
    path = DATA_DIR / "subventions" / f"beneficiaires_{year}.json"
    if not path.exists():
        return {"error": f"Pas de données subventions pour {year}"}
    d = _load(path)
    rows = sorted(d["data"], key=lambda r: r.get("montant_total") or 0, reverse=True)[:top_n]
    return {
        "year": year,
        "total_montant": d["total_montant"],
        "nb_beneficiaires": d["nb_beneficiaires"],
        "top": [
            {
                "beneficiaire": r.get("beneficiaire"),
                "nature_juridique": r.get("nature_juridique"),
                "thematique": r.get("thematique"),
                "montant_total": r.get("montant_total"),
                "nb_subventions": r.get("nb_subventions"),
            }
            for r in rows
        ],
    }


def search_beneficiaire(query: str, year: int | None = None, limit: int = 15) -> dict:
    q = query.lower().strip()
    years = [year] if year else [2024, 2023, 2022, 2019, 2018]
    results = []
    for y in years:
        path = DATA_DIR / "subventions" / f"beneficiaires_{y}.json"
        if not path.exists():
            continue
        d = _load(path)
        for r in d["data"]:
            name = (r.get("beneficiaire") or "").lower()
            if q in name:
                results.append({
                    "year": y,
                    "beneficiaire": r.get("beneficiaire"),
                    "thematique": r.get("thematique"),
                    "montant_total": r.get("montant_total"),
                    "nb_subventions": r.get("nb_subventions"),
                })
    results.sort(key=lambda r: r["montant_total"] or 0, reverse=True)
    return {"query": query, "nb_matches": len(results), "results": results[:limit]}


def get_subventions_tendances(year: int | None = None) -> dict:
    """Ventilation par thématique pour une année donnée, ou évolution toutes années."""
    path = DATA_DIR / "subventions" / "subventions_tendances.json"
    if not path.exists():
        return {"error": "tendances subventions absentes"}
    d = _load(path)
    if year is None:
        return {
            "years_summary": [
                {"year": y["year"], "total_montant": y["total_montant"], "nb_subventions": y["nb_subventions"]}
                for y in d["years"]
            ]
        }
    match = next((y for y in d["years"] if y["year"] == year), None)
    if not match:
        return {"error": f"pas de tendances pour {year}", "annees_disponibles": [y["year"] for y in d["years"]]}
    return match


def get_marches_tendances() -> dict:
    """Évolution annuelle de la commande publique + ventilation par nature."""
    path = DATA_DIR / "marches-publics" / "marches_tendances.json"
    if not path.exists():
        return {"error": "tendances marchés absentes"}
    d = _load(path)
    return {"note": d.get("note"), "years": d["years"]}


def get_marches_summary(year: int, top_n: int = 10) -> dict:
    path = DATA_DIR / "marches-publics" / f"marches_{year}.json"
    if not path.exists():
        return {"error": f"Pas de données marchés pour {year}"}
    d = _load(path)
    rows = sorted(d["data"], key=lambda r: r.get("montant_max") or 0, reverse=True)[:top_n]
    return {
        "year": year,
        "note": d.get("note"),
        "enveloppe_max_totale": d["enveloppe_max_totale"],
        "nb_marches": d["nb_marches"],
        "top": [
            {
                "objet": r.get("objet"),
                "nature": r.get("nature"),
                "fournisseur": r.get("fournisseur_nom"),
                "montant_max": r.get("montant_max"),
                "date_notification": r.get("date_notification"),
            }
            for r in rows
        ],
    }


def search_marches(query: str, year: int | None = None, min_montant: float = 0, limit: int = 15) -> dict:
    q = query.lower().strip()
    years = [year] if year else list(range(2024, 2012, -1))
    results = []
    for y in years:
        path = DATA_DIR / "marches-publics" / f"marches_{y}.json"
        if not path.exists():
            continue
        d = _load(path)
        for r in d["data"]:
            hay = f"{r.get('objet','')} {r.get('fournisseur_nom','')}".lower()
            if q in hay and (r.get("montant_max") or 0) >= min_montant:
                results.append({
                    "year": y,
                    "objet": r.get("objet"),
                    "fournisseur": r.get("fournisseur_nom"),
                    "nature": r.get("nature"),
                    "montant_max": r.get("montant_max"),
                    "date_notification": r.get("date_notification"),
                })
    results.sort(key=lambda r: r["montant_max"] or 0, reverse=True)
    return {"query": query, "nb_matches": len(results), "results": results[:limit]}


def get_budget_sankey(year: int, type_budget: str = "execute") -> dict:
    """type_budget: 'execute' (par défaut, via budget_sankey_YYYY.json) ou 'vote'."""
    path = DATA_DIR / f"budget_sankey_{year}.json"
    if not path.exists():
        return {"error": f"Pas de budget sankey pour {year}"}
    d = _load(path)
    # Simplifier : renvoyer totaux + liens agrégés par source→target
    return {
        "year": d.get("year"),
        "type_budget": d.get("type_budget"),
        "dataStatus": d.get("dataStatus"),
        "totals": d.get("totals"),
        "nb_nodes": len(d.get("nodes", [])),
        "nb_links": len(d.get("links", [])),
        "top_links": sorted(d.get("links", []), key=lambda l: l.get("value", 0), reverse=True)[:15],
    }


def get_patrimoine(year: int) -> dict:
    path = DATA_DIR / f"patrimoine_structure_{year}.json"
    if not path.exists():
        return {"error": f"Pas de patrimoine pour {year}"}
    d = _load(path)
    sd = d.get("structure_dette", {})
    return {
        "year": d.get("year"),
        "total_dette_financiere": sd.get("total_dette_financiere"),
        "instruments": [
            {"label": i.get("label"), "encours": i.get("encours"), "tag": i.get("tag")}
            for i in sd.get("instruments", [])
        ],
    }


# ---------- Anthropic tool schemas ----------

TOOL_SCHEMAS = [
    {
        "name": "list_datasets",
        "description": "Inventaire des datasets disponibles (subventions, marchés, budget, patrimoine, hors-bilan) avec années couvertes. À appeler en premier quand tu ne sais pas ce qui est dispo.",
        "input_schema": {"type": "object", "properties": {}, "required": []},
    },
    {
        "name": "get_subventions_summary",
        "description": "Totaux subventions pour une année donnée + top N bénéficiaires par montant.",
        "input_schema": {
            "type": "object",
            "properties": {
                "year": {"type": "integer", "description": "Année (2018, 2019, 2022, 2023 ou 2024)"},
                "top_n": {"type": "integer", "default": 10},
            },
            "required": ["year"],
        },
    },
    {
        "name": "search_beneficiaire",
        "description": "Cherche un bénéficiaire de subventions par nom (sous-chaîne, insensible à la casse). Retourne tous les matches cross-années sauf si year précisé.",
        "input_schema": {
            "type": "object",
            "properties": {
                "query": {"type": "string"},
                "year": {"type": "integer"},
                "limit": {"type": "integer", "default": 15},
            },
            "required": ["query"],
        },
    },
    {
        "name": "get_subventions_tendances",
        "description": "Ventilation des subventions par thématique pour une année (ex: Social, Culture, Logement, Sport...) + totaux. Si year omis, renvoie juste les totaux par année. À PRÉFÉRER quand la question porte sur 'quels secteurs', 'par thématique', 'par domaine'.",
        "input_schema": {
            "type": "object",
            "properties": {"year": {"type": "integer", "description": "Année (2018, 2019, 2022, 2023, 2024)"}},
            "required": [],
        },
    },
    {
        "name": "get_marches_tendances",
        "description": "Évolution annuelle des marchés publics 2013-2024 + ventilation par nature (TRAVAUX/SERVICES/FOURNITURES) chaque année.",
        "input_schema": {"type": "object", "properties": {}, "required": []},
    },
    {
        "name": "get_marches_summary",
        "description": "Totaux marchés publics pour une année + top N marchés par enveloppe max. ATTENTION: montants = enveloppes pluriannuelles, pas dépenses annuelles.",
        "input_schema": {
            "type": "object",
            "properties": {
                "year": {"type": "integer", "description": "Année (2013-2024)"},
                "top_n": {"type": "integer", "default": 10},
            },
            "required": ["year"],
        },
    },
    {
        "name": "search_marches",
        "description": "Cherche des marchés publics par mot-clé dans l'objet ou le fournisseur. Filtre optionnel par année et montant minimum.",
        "input_schema": {
            "type": "object",
            "properties": {
                "query": {"type": "string"},
                "year": {"type": "integer"},
                "min_montant": {"type": "number", "default": 0},
                "limit": {"type": "integer", "default": 15},
            },
            "required": ["query"],
        },
    },
    {
        "name": "get_budget_sankey",
        "description": "Flux budgétaires (recettes/dépenses) agrégés d'une année, avec les plus gros liens source→target.",
        "input_schema": {
            "type": "object",
            "properties": {"year": {"type": "integer"}},
            "required": ["year"],
        },
    },
    {
        "name": "get_patrimoine",
        "description": "Structure de la dette financière de la Ville pour une année (total + instruments: obligataire, bancaire, etc.).",
        "input_schema": {
            "type": "object",
            "properties": {"year": {"type": "integer", "description": "Année (2019-2024)"}},
            "required": ["year"],
        },
    },
]

DISPATCH = {
    "list_datasets": list_datasets,
    "get_subventions_summary": get_subventions_summary,
    "get_subventions_tendances": get_subventions_tendances,
    "get_marches_tendances": get_marches_tendances,
    "search_beneficiaire": search_beneficiaire,
    "get_marches_summary": get_marches_summary,
    "search_marches": search_marches,
    "get_budget_sankey": get_budget_sankey,
    "get_patrimoine": get_patrimoine,
}


def run_tool(name: str, args: dict) -> Any:
    fn = DISPATCH.get(name)
    if not fn:
        return {"error": f"tool inconnu: {name}"}
    try:
        return fn(**args)
    except Exception as e:
        return {"error": f"{type(e).__name__}: {e}"}
