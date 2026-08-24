"""Draw the proposed LOCATOR from the shipped chunk, and nothing but the chunk.

    python3 pipeline/scripts/us_sf_reach/reach_locator_figure.py

Writes pipeline/scripts/us_sf_reach/fig-locator.png

This is a picture of a recommendation, not a component. It matters that it reads
`website/public/data/us/sf/city/reach/geom.qc` and never the cache: if the
locator can be drawn from the chunk alone, the chunk is complete, and if it
cannot, the chunk is wrong. Every shape on it is a published one.

THE FORM BEING RECOMMENDED. Two fixed stops, not a zoom:

  THE PENINSULA   ~46 km across. Colma, SFO, Sharp Park, the Peninsula
                  watershed, Crystal Springs. San Francisco is a real shape.
  THE SYSTEM      ~250 km across. The whole water system, the aqueduct as its
                  spine, O'Shaughnessy Dam at the east end. San Francisco is a
                  thumbnail — and that is the argument, not a defect.

Each stop states its own scale and draws the city outline at that scale, so the
reader can measure the change instead of being walked through it. Nothing
between the two stops is offered, because a continuous pull-back is exactly the
thing REACH.md §5 rejected: at the scale that holds Hetch Hetchy, San Francisco
is 34 px wide, and there is no honest camera path between "a city" and "a
watershed" that does not spend most of its travel showing farmland.
"""
from __future__ import annotations

import json
import pathlib
import sys

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt                                   # noqa: E402
from matplotlib.patches import Polygon as MPoly                   # noqa: E402

HERE = pathlib.Path(__file__).resolve().parent
ROOT = HERE.parents[2]
sys.path.insert(0, str(HERE))
from _qc import read_qc                                            # noqa: E402

DATA = ROOT / "website/public/data/us/sf/reach"
OUT = HERE / "fig-locator.png"

INK = "#161310"
PAPER = "#faf9f5"
COL = {
    "county": "#161310", "watershed": "#9fb08a", "reservoir": "#5b7f9c",
    "aqueduct": "#b4462a", "airport": "#8a7a5c", "cemetery": "#7a6a8a",
    "cityland": "#c08a3e", "dam": "#b4462a",
}

# The two stops, in world metres, from the shipped data's own bounding boxes.
STOPS = [
    ("THE PENINSULA", ("sf-county", "sfo", "wb-lower-crystal-springs-reservoir",
                       "sfpuc-peninsula-watershed", "cityland-25"), 4000),
    ("THE WHOLE SYSTEM", None, 9000),
]


def load():
    head, f = read_qc((DATA / "geom.qc").read_bytes())
    idx = json.loads((DATA / "geom.json").read_text())
    classes = head["meta"]["classes"]
    feats = []
    for i, meta in enumerate(idx["features"]):
        r0, rn = int(f["fr0"][i]), int(f["frn"][i])
        rings = []
        for r in range(r0, r0 + rn):
            v0, vn = int(f["rv0"][r]), int(f["rvn"][r])
            rings.append((f["x"][v0:v0 + vn], f["y"][v0:v0 + vn],
                          bool(f["rhole"][r])))
        feats.append({
            "meta": meta, "cls": classes[int(f["fcls"][i])],
            "kind": head["meta"]["kinds"][int(f["fkind"][i])],
            "bb": [int(v) for v in f["fbb"][4 * i:4 * i + 4]], "rings": rings})
    return idx, feats


def draw(ax, feats, box, title, scale_note, label_ids):
    x0, y0, x1, y1 = box
    ax.set_facecolor(PAPER)
    order = ["watershed", "cityland", "airport", "cemetery", "reservoir",
             "county", "aqueduct", "dam"]
    for cls in order:
        for ft in feats:
            if ft["cls"] != cls:
                continue
            b = ft["bb"]
            if b[2] < x0 or b[0] > x1 or b[3] < y0 or b[1] > y1:
                continue
            c = COL[cls]
            for rx, ry, hole in ft["rings"]:
                if ft["kind"] == "point":
                    ax.plot(rx, ry, marker="v", ms=7, color=c, zorder=9)
                elif ft["kind"] == "line":
                    ax.plot(rx, ry, color=c, lw=2.1, solid_capstyle="round",
                            zorder=8)
                else:
                    fc = PAPER if hole else c
                    a = 1.0 if cls == "county" else (0.30 if cls == "watershed"
                                                     else 0.78)
                    ax.add_patch(MPoly(list(zip(rx, ry)), closed=True,
                                       facecolor=fc, edgecolor=c,
                                       lw=0.45, alpha=a,
                                       zorder=5 if cls == "watershed" else 6))
    for fid, dx, dy, ha in label_ids:
        ft = next((g for g in feats if g["meta"]["id"] == fid), None)
        if ft is None:
            continue
        b = ft["bb"]
        cx, cy = (b[0] + b[2]) / 2, (b[1] + b[3]) / 2
        ax.annotate(ft["meta"]["name"], (cx, cy), (cx + dx, cy + dy),
                    ha=ha, va="center", fontsize=7.4, color=INK,
                    arrowprops=dict(arrowstyle="-", lw=0.6, color=INK,
                                    shrinkA=0, shrinkB=2), zorder=12)
    ax.set_xlim(x0, x1)
    ax.set_ylim(y0, y1)
    ax.set_aspect("equal")
    ax.set_xticks([])
    ax.set_yticks([])
    for s in ax.spines.values():
        s.set_color("#c9c5bb")
    # the scale bar: a locator that changes what a centimetre means has to say so
    span = x1 - x0
    bar = 10000 if span < 80000 else 50000
    bx = x1 - span * 0.05 - bar
    by = y0 + (y1 - y0) * 0.045
    ax.plot([bx, bx + bar], [by, by], color=INK, lw=2.4, zorder=20)
    ax.text(bx + bar / 2, by + (y1 - y0) * 0.018, f"{bar // 1000} km",
            fontsize=7.6, color=INK, zorder=20, ha="center")
    ax.text(x0 + span * 0.03, y1 - (y1 - y0) * 0.10, title, fontsize=10.5,
            color=INK, weight="bold", family="monospace", zorder=20)
    ax.text(x0 + span * 0.03, y1 - (y1 - y0) * 0.19, scale_note, fontsize=7.6,
            color="#5a5348", zorder=20)


def main() -> int:
    idx, feats = load()
    fig = plt.figure(figsize=(13.2, 8.4), dpi=150, facecolor=PAPER)

    # ── stop 1, the peninsula ────────────────────────────────────────────
    ids = STOPS[0][1]
    bs = [g["bb"] for g in feats if g["meta"]["id"] in ids]
    x0 = min(b[0] for b in bs) - 3000
    x1 = max(b[2] for b in bs) + 3000
    y0 = min(b[1] for b in bs) - 3000
    y1 = max(b[3] for b in bs) + 3000
    ax1 = fig.add_axes([0.045, 0.40, 0.40, 0.55])
    draw(ax1, feats, (x0, y0, x1, y1), "STOP 1 · THE PENINSULA",
         f"{(x1 - x0) / 1000:.0f} km across. San Francisco is still a shape.",
         [("sfo", 8500, 1500, "left"), ("cityland-25", -5000, -2500, "right"),
          ("cem-110413857999", 9000, -1000, "left"),
          ("sfpuc-peninsula-watershed", 9500, 0, "left"),
          ("wb-lower-crystal-springs-reservoir", -7000, 2000, "right"),
          ("sf-county", -5000, 3000, "right")])

    # ── stop 2, the whole system ─────────────────────────────────────────
    inb = [g["bb"] for g in feats
           if not g["meta"]["outside_locator"]]     # excludes the Kern oil land
    X0 = min(b[0] for b in inb) - 6000
    X1 = max(b[2] for b in inb) + 6000
    Y0 = min(b[1] for b in inb) - 6000
    Y1 = max(b[3] for b in inb) + 6000
    ax2 = fig.add_axes([0.045, 0.10, 0.91, 0.245])
    draw(ax2, feats, (X0, Y0, X1, Y1), "STOP 2 · THE WHOLE SYSTEM",
         f"{(X1 - X0) / 1000:.0f} km across — {(X1 - X0) / (x1 - x0):.1f}x stop 1. "
         f"San Francisco is the black thumbnail on the left.",
         [("hetch-hetchy-aqueduct", -20000, 17000, "center"),
          ("oshaughnessy-dam", -30000, 16000, "right"),
          ("sfpuc-alameda-watershed", -12000, -17000, "center"),
          ("farallon-islands", 4000, -16000, "center"),
          ("cityland-1200", 8000, -17000, "left")])

    # ── the argument, in the Board's own words ───────────────────────────
    led = json.loads((DATA / "ledger.json").read_text())
    row = next(r for r in led["rows"] if r["id"] == "mills-field-sfo")
    ev = row["evidence"]
    ax3 = fig.add_axes([0.49, 0.40, 0.47, 0.55])
    ax3.axis("off")
    ax3.set_xlim(0, 1)
    ax3.set_ylim(0, 1)
    ax3.text(0, 0.97, "WHY THERE ARE TWO STOPS AND NOT A ZOOM", fontsize=10.5,
             family="monospace", weight="bold", color=INK, va="top")
    body = (
        "A single frame that holds O'Shaughnessy Dam renders San Francisco\n"
        "34 px wide (REACH.md §5) — an 811x areal expansion, almost all of it\n"
        "ground where the city decided nothing. And the pull-back is blocked\n"
        "10 km short of the airport anyway: below z≈0.76 the surround plate's\n"
        "own rectangular edge enters the frame.\n\n"
        "So the reach is a SECOND REGISTER that announces its own scale, not a\n"
        "camera move. Two stops, each with a scale bar, each drawing the city\n"
        "at that stop's scale so the change can be measured by eye.\n\n"
        "AND WHAT IS STILL NOT DRAWN. NHD's named 'Hetch Hetchy Aqueduct'\n"
        "ends at MOCCASIN and its west end is on the peninsula, not in the\n"
        "city: the red line is 190 km of the system the city calls its\n"
        "150-mile aqueduct, and the reach above the reservoir is not in the\n"
        "named feature. Nothing here joins the two with a segment we drew.\n\n"
        "The reason for the reach is in the record, in the Board's own\n"
        f"words — Resolution No. 26816, {ev['year']}:")
    ax3.text(0, 0.92, body, fontsize=8.1, color="#3a352c", va="top",
             linespacing=1.55)
    ax3.text(0.02, 0.24, f"“{ev['fragment']}”", fontsize=9.6,
             color=INK, va="top", style="italic", wrap=True,
             family="serif", linespacing=1.5)
    ax3.text(0.02, 0.11, f"{ev['item']} · leaf {ev['leaf']}", fontsize=7.4,
             color="#5a5348", va="top", family="monospace")
    n = len(idx["features"])
    ax3.text(0, 0.02,
             f"{n} published shapes · {idx['chunk']['vertices']:,} vertices · "
             f"{idx['chunk']['bytes'] / 1024:.1f} KB · "
             f"{len(idx['sources'])} sources · nothing drawn that is not published",
             fontsize=7.2, color="#5a5348", va="bottom", family="monospace")

    fig.text(0.045, 0.965, "THE REACH LOCATOR — a recommendation",
             fontsize=13, color=INK, family="monospace", weight="bold")
    fig.savefig(OUT, facecolor=PAPER)
    print(f"wrote {OUT.relative_to(ROOT)}")
    print(f"  stop 1 {(x1 - x0) / 1000:.1f} km across, "
          f"stop 2 {(X1 - X0) / 1000:.1f} km across "
          f"({(X1 - X0) / (x1 - x0):.1f}x)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
