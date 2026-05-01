"""Extract mermaid blocks from 01-pipeline-diagram.md into .mmd files.

Labels each block by its nearest preceding H2 (## N. Title) so filenames stay
stable and human-scannable.
"""
from __future__ import annotations

import re
import unicodedata
from pathlib import Path

HERE = Path(__file__).resolve().parent
SRC = HERE.parent / "01-pipeline-diagram.md"
OUT = HERE / "mmd"
OUT.mkdir(exist_ok=True)


def slugify(s: str) -> str:
    s = unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode("ascii")
    s = re.sub(r"[^a-zA-Z0-9]+", "-", s).strip("-").lower()
    return s


def main() -> None:
    text = SRC.read_text(encoding="utf-8")
    lines = text.splitlines()

    current_section: tuple[str, str] | None = None  # (num, slug)
    in_block = False
    block_lines: list[str] = []
    blocks: list[tuple[str, str, list[str]]] = []  # (num, slug, lines)
    block_idx_in_section = 0

    h2_re = re.compile(r"^##\s+(\d+)\.\s+(.+?)\s*$")

    for line in lines:
        m = h2_re.match(line)
        if m:
            num = m.group(1).zfill(2)
            slug = slugify(m.group(2))
            current_section = (num, slug)
            block_idx_in_section = 0
            continue
        if line.strip() == "```mermaid":
            in_block = True
            block_lines = []
            continue
        if in_block and line.strip() == "```":
            in_block = False
            if current_section is None:
                num, slug = "xx", "unknown"
            else:
                num, slug = current_section
            block_idx_in_section += 1
            suffix = "" if block_idx_in_section == 1 else f"-{block_idx_in_section}"
            blocks.append((f"{num}{suffix}", slug, block_lines))
            continue
        if in_block:
            block_lines.append(line)

    for num, slug, body in blocks:
        path = OUT / f"{num}-{slug}.mmd"
        path.write_text("\n".join(body) + "\n", encoding="utf-8")
        print(f"wrote {path.relative_to(HERE.parent)} ({len(body)} lines)")


if __name__ == "__main__":
    main()
