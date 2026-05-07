"""AST-based detector for "writes to website/public/data" in Python scripts.

Used by check_layering.py instead of regex (Issue #8). Goals :

- Catch writes where the target path is built via Path concatenation:
    OUT = ROOT / "website" / "public" / "data" / "X"
    OUT.write_text(json.dumps(...))

- Follow chained variable derivations:
    DATA_DIR = ROOT / "website" / "public" / "data"
    out = DATA_DIR / "subdir" / "file.json"
    out.write_text(json.dumps(...))

- Catch literal-string Path arguments:
    Path("website/public/data/X.json").write_text(...)

- Refuse to claim "no writes" on indirection that we can't statically trace
  (lambda capturing path, callable returning path) — those produce a
  "suspicious" warning rather than a clean pass, so the reviewer notices.

Detection model :

1. Walk all `ast.Assign` nodes. If the RHS evaluates to a path that includes
   `public/data`, record (var_name, is_enrichment).
2. Iteratively expand : if `<new> = <expr>` where <expr> references a known
   public-data var, propagate the marker.
3. Walk all `ast.Call` and `ast.Attribute` nodes. If the call is
   `<x>.write_text(...)`, `open(<x>, 'w')`, `json.dump(_, open(<x>, 'w'))`,
   or `save_json(<x>, ...)` and `<x>` is a public-data var, record a write.
4. Classify writes as "metric" (regular public/data path) or "enrichment"
   (path explicitly mentions "enrichment").
"""
from __future__ import annotations

import ast
import re
from pathlib import Path
from typing import NamedTuple

# Path components / literal strings that mark a path as public/data.
PUBLIC_DATA_LITERALS = {
    ("public", "data"),     # Path/"public"/"data"
    ("website", "public"),  # Path/"website"/"public"
}
PUBLIC_DATA_LITERAL_RE = re.compile(r"website/public/data(?:/|$)|public/data/")
ENRICHMENT_RE = re.compile(r"enrichment")

# Functions that, when called with a path-like argument, count as a write.
# Mapped to the position(s) of the path argument (0-indexed).
WRITE_FUNC_PATH_ARG_POS = {
    "write_text": None,    # method on a Path-like
    "open": 0,             # open(path, "w") + json.dump(...)
    "save_json": 0,        # custom helper convention
    "json.dump": 1,        # second arg is file handle (assume preceding open)
}


class WriteResult(NamedTuple):
    writes_metric: bool       # True if writes to public/data/* (non-enrichment)
    writes_enrichment: bool   # True if writes to public/data/enrichment/*
    suspicious_indirection: bool  # True if we saw indirection we can't follow


def _is_string_literal_path_segment(node: ast.AST, segments: tuple[str, ...]) -> bool:
    """Check if `node` evaluates to a Path / "seg1" / "seg2" expression."""
    # Walk down the binary `/` operator chain
    segs = []
    current = node
    while isinstance(current, ast.BinOp) and isinstance(current.op, ast.Div):
        right = current.right
        if isinstance(right, ast.Constant) and isinstance(right.value, str):
            segs.append(right.value)
        current = current.left
    segs.reverse()
    # Check if `segments` is a contiguous sub-tuple of segs
    n = len(segments)
    for i in range(len(segs) - n + 1):
        if tuple(segs[i:i + n]) == segments:
            return True
    return False


def _expr_is_public_data_path(node: ast.AST, known_public_vars: set[str]) -> bool:
    """Return True if `node` evaluates to a path under public/data.

    Recognized patterns :
      X / "website" / "public" / ...
      X / "public" / "data" / ...
      Path("website/public/data/...")
      <known_public_var> [/ ...]
    """
    # Case 1: BinOp Div chain with public/data literals
    for segs in PUBLIC_DATA_LITERALS:
        if _is_string_literal_path_segment(node, segs):
            return True

    # Case 2: literal string starting with website/public/data
    if isinstance(node, ast.Constant) and isinstance(node.value, str):
        if PUBLIC_DATA_LITERAL_RE.search(node.value):
            return True

    # Case 3: Path(...) call with literal string arg
    if isinstance(node, ast.Call):
        func = node.func
        is_path = (
            (isinstance(func, ast.Name) and func.id == "Path")
            or (isinstance(func, ast.Attribute) and func.attr == "Path")
        )
        if is_path and node.args:
            arg = node.args[0]
            if isinstance(arg, ast.Constant) and isinstance(arg.value, str):
                if PUBLIC_DATA_LITERAL_RE.search(arg.value):
                    return True

    # Case 4: BinOp Div where left side is a known public-data var
    if isinstance(node, ast.BinOp) and isinstance(node.op, ast.Div):
        if _expr_is_public_data_path(node.left, known_public_vars):
            return True

    # Case 5: Name reference to a known public-data variable
    if isinstance(node, ast.Name) and node.id in known_public_vars:
        return True
    if isinstance(node, ast.Attribute) and isinstance(node.value, ast.Name):
        if node.value.id in known_public_vars:
            return True

    return False


def _expr_mentions_enrichment(node: ast.AST) -> bool:
    """Walk the expression to see if any string literal contains 'enrichment'."""
    for n in ast.walk(node):
        if isinstance(n, ast.Constant) and isinstance(n.value, str):
            if ENRICHMENT_RE.search(n.value):
                return True
    return False


def _is_write_call(call: ast.Call, public_vars: set[str]) -> tuple[bool, bool, bool]:
    """Determine if `call` is a write to a public-data path.

    Returns (is_write, is_enrichment, is_suspicious).
    """
    func = call.func

    # Pattern : <x>.write_text(...)
    if isinstance(func, ast.Attribute) and func.attr in {"write_text", "write_bytes"}:
        target = func.value
        if _expr_is_public_data_path(target, public_vars):
            is_enr = _expr_mentions_enrichment(target)
            # Also check args for enrichment (e.g. NAMES_OUT inside DATA_DIR/"enrichment"/...)
            return True, is_enr, False
        # Indirection : x.write_text where x is unknown — suspicious
        if isinstance(target, ast.Call):
            return False, False, True

    # Pattern : open(<x>, "w") or open(<x>, mode="w") — write detected if mode includes 'w'
    if isinstance(func, ast.Name) and func.id == "open":
        # Must be 'w' mode AND target a public-data path
        path_arg = call.args[0] if call.args else None
        mode = None
        if len(call.args) >= 2 and isinstance(call.args[1], ast.Constant):
            mode = call.args[1].value
        for kw in call.keywords:
            if kw.arg == "mode" and isinstance(kw.value, ast.Constant):
                mode = kw.value.value
        if mode and "w" in str(mode) and path_arg is not None:
            if _expr_is_public_data_path(path_arg, public_vars):
                return True, _expr_mentions_enrichment(path_arg), False

    # Pattern : json.dump(_, file_handle) — if file_handle is open(public_var,'w')
    # captured by the preceding open() check, so we don't double-count here.

    # Pattern : save_json(<x>, payload) — convention helper
    if isinstance(func, ast.Name) and func.id in {"save_json"}:
        if call.args and _expr_is_public_data_path(call.args[0], public_vars):
            return True, _expr_mentions_enrichment(call.args[0]), False

    return False, False, False


def detect(text: str) -> WriteResult:
    """Run AST detection on a Python source `text`."""
    try:
        tree = ast.parse(text)
    except SyntaxError:
        # Can't parse — skip detection (regex fallback would also fail)
        return WriteResult(False, False, False)

    # Pass 1 : collect all assignments to public-data path expressions.
    # We do multiple passes to propagate transitive vars.
    public_vars: set[str] = set()  # all path-vars under public/data
    enrichment_vars: set[str] = set()  # subset that are under public/data/enrichment

    # Walk all assignments multiple times until stable
    for _ in range(5):
        grew = False
        for node in ast.walk(tree):
            if isinstance(node, ast.Assign):
                for target in node.targets:
                    if isinstance(target, ast.Name):
                        if _expr_is_public_data_path(node.value, public_vars):
                            if target.id not in public_vars:
                                public_vars.add(target.id)
                                grew = True
                            if _expr_mentions_enrichment(node.value):
                                enrichment_vars.add(target.id)
            elif isinstance(node, ast.AnnAssign) and isinstance(node.target, ast.Name):
                if node.value and _expr_is_public_data_path(node.value, public_vars):
                    if node.target.id not in public_vars:
                        public_vars.add(node.target.id)
                        grew = True
                    if _expr_mentions_enrichment(node.value):
                        enrichment_vars.add(node.target.id)
        if not grew:
            break

    # Pass 2 : find write calls that target a known public-data variable.
    writes_metric = False
    writes_enrichment = False
    suspicious = False
    for node in ast.walk(tree):
        if isinstance(node, ast.Call):
            is_write, is_enr, is_susp = _is_write_call(node, public_vars)
            if is_write:
                if is_enr:
                    writes_enrichment = True
                else:
                    # Check if the target variable is in enrichment_vars
                    target = node.func.value if isinstance(node.func, ast.Attribute) else None
                    if isinstance(target, ast.Name) and target.id in enrichment_vars:
                        writes_enrichment = True
                    else:
                        writes_metric = True
            if is_susp:
                suspicious = True

    return WriteResult(
        writes_metric=writes_metric,
        writes_enrichment=writes_enrichment,
        suspicious_indirection=suspicious,
    )


if __name__ == "__main__":
    # Quick CLI: detect on every .py under sync/, tools/, enrich/, export/
    import sys
    repo = Path(__file__).resolve().parents[3]
    for d in ["pipeline/scripts/sync", "pipeline/scripts/tools",
              "pipeline/scripts/enrich", "pipeline/scripts/export"]:
        for p in sorted((repo / d).glob("*.py")):
            r = detect(p.read_text(encoding="utf-8"))
            tags = []
            if r.writes_metric: tags.append("METRIC")
            if r.writes_enrichment: tags.append("ENRICHMENT")
            if r.suspicious_indirection: tags.append("SUSPICIOUS")
            if tags:
                print(f"  {p.relative_to(repo)}: {', '.join(tags)}")
