"""Merge per-section PDFs into one pipeline-diagram.pdf in section order."""
from __future__ import annotations

from pathlib import Path

from pypdf import PdfWriter

HERE = Path(__file__).resolve().parent
SRC = HERE / "pdf"
OUT = HERE / "pipeline-diagram.pdf"

SECTION_TITLES = {
    "0a": "0a. L0 — Conceptual view",
    "0b": "0b. L1 — Master overview",
    "01": "1. Budget domain",
    "02": "2. Subventions domain",
    "03": "3. Marchés publics domain",
    "04": "4. Investments / Autorisations de Programme",
    "05": "5. Logement social domain",
    "06": "6. Balancesheet / debt domain",
    "07": "7. Metadata & methodology channel",
    "08": "8. Enrichment subsystem (cross-domain)",
}


def _sort_key(p: Path) -> tuple:
    """Order: 0a, 0b, 01, 02, ..., 08."""
    name = p.name
    prefix = name[:2]
    # 0a, 0b sort before 01..09 → use a tuple where letter beats digit
    if len(prefix) >= 2 and prefix[0] == "0" and prefix[1].isalpha():
        return (0, prefix[1])
    return (1, prefix)


def main() -> None:
    writer = PdfWriter()
    files = sorted(SRC.glob("*.pdf"), key=_sort_key)
    page_counter = 0
    for f in files:
        num = f.name[:2]
        title = SECTION_TITLES.get(num, f.stem)
        before = page_counter
        writer.append(str(f))
        after = len(writer.pages)
        page_counter = after
        writer.add_outline_item(title, before)
        print(f"  added {f.name} → pages {before + 1}..{after} ({title})")

    with OUT.open("wb") as fh:
        writer.write(fh)
    print(f"\nwrote {OUT.relative_to(HERE.parent)} ({OUT.stat().st_size // 1024} KB, {page_counter} pages)")


if __name__ == "__main__":
    main()
