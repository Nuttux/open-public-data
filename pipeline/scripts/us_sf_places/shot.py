"""Three prod frames, before and after, at the same three cameras.

    python3 pipeline/scripts/us_sf_places/shot.py before
    python3 pipeline/scripts/us_sf_places/shot.py after

Drives `website/.parity/capture.py` rather than re-implementing it: that file
already enforces NIGHT.md's traps — the film is handed the camera back before
the shutter (`filmOn` asserted false), the stage size is asserted at the
shutter, the tier counts have to stop moving, two identical frames 700 ms apart
are required, and a flat frame raises. Re-deriving any of that here would be
re-deriving the mistakes.

Only the PROD side is shot: this block changes data the mock does not have, so
a mock frame would be a control that cannot move.
"""
from __future__ import annotations

import asyncio
import json
import os
import pathlib
import sys

HERE = pathlib.Path(__file__).resolve().parent
ROOT = HERE.parents[2]
PARITY = ROOT / "website" / ".parity"
sys.path.insert(0, str(PARITY))

from cameras import ANCHOR, scale_for  # noqa: E402


def _load_capture():
    """`website/.parity/capture.py` ENDS IN A BARE `asyncio.run(main())`.

    It has no `if __name__ == "__main__"` guard, so `import capture` does not
    give you its functions — it runs the whole sixteen-camera sweep against
    both builds first, writes `out/ledger.dpr2.json` and every `*.mock.png` /
    `*.prod.png`, and only then returns. Measured the hard way: a twenty-minute
    stall with two lines of somebody else's output in this script's log, and a
    sweep that overwrote a ledger another agent may have been reading.

    So the source is compiled with that one line removed. Nothing in the
    harness is edited — another agent is using it — and every function comes
    from the file as it stands.
    """
    import types

    src = (PARITY / "capture.py").read_text()
    tail = "\nasyncio.run(main())"
    if tail not in src:
        raise SystemExit("capture.py no longer ends in asyncio.run(main()) — re-read it")
    mod = types.ModuleType("parity_capture")
    mod.__file__ = str(PARITY / "capture.py")
    exec(compile(src.replace(tail, "\n"), mod.__file__, "exec"), mod.__dict__)
    return mod


C = _load_capture()

SHOTS = HERE / "shots"
CAMS = [
    ("whole", 2018, 0, "home"),
    ("district", 2018, 1, "embarcadero"),
    ("block", 2018, 2, "downtown"),
]


PROBE = """(async()=>{
  const R=RR();
  const proto=CanvasRenderingContext2D.prototype;
  const realFill=proto.fillText, realMeas=proto.measureText;
  const seen=[];
  proto.fillText=function(t,x,y,...r){
    try{ const w=realMeas.call(this,t).width;
         // THE FONT STRING STARTS WITH THE WEIGHT. parseFloat('600 11.5px
         // Inter') is 600, not 11.5, and an ink figure computed from it comes
         // out forty times too large — 0.955 of the frame, which is absurd on
         // its face and was caught for exactly that reason. Take the px size.
         const m=/([0-9.]+)px/.exec(this.font); const fs=m?parseFloat(m[1]):10;
         seen.push({t:String(t),x,y,w,h:fs,f:this.font}); }
    catch(e){}
    return realFill.call(this,t,x,y,...r);
  };
  R.cur=null; R.invalidate();
  await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
  const cv=R.canvas||document.querySelector('canvas.fx-city-canvas');
  cv.getContext('2d').getImageData(0,0,1,1);
  proto.fillText=realFill;
  const area=R.W*R.H;
  let ink=0; for(const s of seen) ink += s.w*(s.h+5);
  return {count:seen.length, labels:R.lastStats.labels,
          ink:+(ink/area).toFixed(4),
          names:seen.map(s=>s.t)};
})()"""


async def run(tag: str) -> None:
    from playwright.async_api import async_playwright

    SHOTS.mkdir(exist_ok=True)
    out = {}
    async with async_playwright() as pw:
        b = await pw.chromium.launch()
        pg, info = await C.prod_open(b)
        print(f"prod ready: base={info['base']:.10f} W={info['W']} H={info['H']} "
              f"DPR={info['DPR']}")
        for cid, year, step, anch in CAMS:
            # RE-READ cam.base BEFORE EVERY CAMERA. `prod_open` forces the
            # stage and waits, but a refit can still land afterwards, and then
            # the base read at open is stale: the first camera of a run came
            # back at z = 1.461 while its ABSOLUTE scale was exactly what was
            # asked for, because the scale had been computed from the stale
            # base. Two runs an hour apart then sit at two different absolute
            # scales and look directly comparable. NIGHT.md trap 7, met head
            # on: the shot is only accepted when BOTH the absolute scale and
            # the preset multiple come back right.
            info = await pg.evaluate("({base:RR().cam.base})")
            scale = scale_for(info["base"], step)
            # THE TREE IS BEING EDITED UNDER THIS SCRIPT. Five other agents are
            # in the render modules tonight, so a Fast Refresh can destroy the
            # canvas between the poke and the shutter ("no canvas"), and a
            # remount can hand back a renderer sitting at the home camera —
            # measured: a district frame that came out at z = 1.000 with the
            # whole-city label set, which is a duplicate frame wearing the
            # right filename. So the camera is re-opened and re-shot until the
            # ABSOLUTE SCALE that comes back is the one that was asked for.
            for attempt in range(6):
                try:
                    await C.prod_ready(b, pg)
                    q = await C.prod_shoot(pg, f"t2-{tag}-{cid}", year, step, scale,
                                           ANCHOR[anch], False, "")
                    want_z = [1.0, 2.9, 7.2][min(step, 2)]
                    if (abs(q["scale"] - scale) / scale < 1e-6
                            and q["step"] == min(step, 2)
                            and abs(q["z"] - want_z) < 1e-4):
                        break
                    print(f"    !! {cid} came back at scale {q['scale']:.6f} z {q['z']:.4f} "
                          f"step {q['step']}, asked {scale:.6f} z {want_z} "
                          f"step {min(step, 2)} — again")
                except Exception as ex:
                    print(f"    !! {cid} attempt {attempt + 1}: {str(ex)[:90]}")
                await pg.close()
                pg, info = await C.prod_open(b)
            else:
                raise RuntimeError(f"{cid} never held the camera")
            src = C.OUT + f"/t2-{tag}-{cid}.prod.png"
            dst = SHOTS / f"t2-{tag}-{cid}.png"
            dst.write_bytes(pathlib.Path(src).read_bytes())
            os.remove(src)
            st = q["stats"]
            # WHICH NAMES ARE ON THE FRAME, AND WHAT THEY COST.
            # `lastStats.labels` is the count `placeNames` returns. The names
            # themselves and their ink are measured the way BLOCK-N measured
            # them: hook `fillText`, force ONE full re-render (the label pass
            # runs into the CACHED layer, so a blit would collect nothing), and
            # read back what was written. Canvas 2D is deferred, so a pixel is
            # read back inside the timed region to force the flush.
            pr = await pg.evaluate(PROBE)
            out[cid] = {
                "z": round(q["z"], 4), "step": q["step"], "scale": q["scale"],
                "year": q["year"], "cells": st.get("cells"),
                "buildings": st.get("buildings"), "streets": st.get("streets"),
                "labels": st.get("labels"), "place": pr,
                "frameMean": q["frame"]["mean"], "frameSd": q["frame"]["sd"],
            }
            out[cid]["src"] = C.src_stamp()
            print(f"  {cid:9s} src={out[cid]['src']} z={q['z']:.3f} step={q['step']} labels={st.get('labels')} "
                  f"place={pr} -> {dst.name}")
        await b.close()
    (SHOTS / f"t2-{tag}.json").write_text(json.dumps(out, indent=1))


if __name__ == "__main__":
    tag = sys.argv[1] if len(sys.argv) > 1 else "after"
    if len(sys.argv) > 2:
        only = sys.argv[2].split(",")
        CAMS[:] = [c for c in CAMS if c[0] in only]
    asyncio.run(run(tag))
