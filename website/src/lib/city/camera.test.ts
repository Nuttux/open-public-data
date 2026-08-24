import { describe, expect, it } from "vitest";
import {
  BANDS,
  Camera,
  DETAIL_PXM,
  EXT_K_MAX,
  KEY_QUANTUM,
  LEDGER_W,
  MAXZ,
  M_DESK,
  M_PHONE,
  M_SETTLED,
  M_ZOOM,
  RERASTER_MIN,
  SNAP,
  ZOOM_K_MAX,
  ZOOM_LEAD,
  ZSTEPS,
  bandOf,
  cityBBox,
  cityBBoxByBand,
  clampAxis,
  covers,
  decideRaster,
  decideRasterExternal,
  easeZoom,
  fitCity,
  leadCentre,
  margin,
  place,
  planSlots,
  quantiseForKey,
  slotSize,
  wheelFactor,
  zoomLeadScale,
  type BBox,
  type CityExtent,
  type Rastered,
} from "./camera";
import { Projection, ZEX_BY_STEP } from "./projection";

/* A stand-in San Francisco: a 12 km square of ground with a hill on it, and a
   200 m tower. Roughly the peninsula's own extent, which matters for one
   clause — whether the ABSOLUTE detail ceiling or the fit-relative MAXZ binds
   — and is otherwise only there to make the box a real projected box. */
const CITY: CityExtent = {
  forEachGroundSample(visit) {
    for (let i = 0; i <= 60; i++) {
      for (let j = 0; j <= 60; j++) {
        const x = -6000 + i * 200;
        const y = -6000 + j * 200;
        const z = 180 * Math.exp(-((x + 800) ** 2 + (y - 1200) ** 2) / 9.6e6);
        visit(x, y, z);
      }
    }
  },
  maxBuiltHeightM: 200,
};

const W = 1440;
const H = 940;

function makeCam(p = new Projection(), w = W, h = H): Camera {
  const boxes = cityBBoxByBand(p, CITY);
  const fit = fitCity(boxes[0], w, h, LEDGER_W);
  const cam = new Camera();
  cam.base = fit.base;
  cam.bx = fit.bx;
  cam.by = fit.by;
  cam.bbox = boxes[0];
  cam.home(w, h, LEDGER_W);
  return cam;
}

describe("the zoom ladder", () => {
  it("puts a band boundary at the geometric midpoint, so it never lands on a preset", () => {
    expect(BANDS[0]).toBeCloseTo(Math.sqrt(ZSTEPS[0] * ZSTEPS[1]), 12);
    expect(BANDS[1]).toBeCloseTo(Math.sqrt(ZSTEPS[1] * ZSTEPS[2]), 12);
    for (const z of ZSTEPS) {
      expect(Math.abs(Math.log(z / BANDS[0]))).toBeGreaterThan(0.2);
      expect(Math.abs(Math.log(z / BANDS[1]))).toBeGreaterThan(0.2);
    }
    expect([bandOf(1), bandOf(2.9), bandOf(7.2)]).toEqual([0, 1, 2]);
  });

  it("the snap can never skip a stop", () => {
    // 4.5 % is under a third of the gap between the closest pair of presets in
    // log space, so a scale can only ever be within SNAP of one of them.
    const gaps = [Math.log(ZSTEPS[1] / ZSTEPS[0]), Math.log(ZSTEPS[2] / ZSTEPS[1])];
    expect(SNAP).toBeLessThan(Math.min(...gaps) / 3);
    const cam = makeCam();
    cam.scale = cam.base * ZSTEPS[1] * 1.02;
    expect(cam.snapTarget()).toBe(1);
    cam.scale = cam.base * ZSTEPS[1] * 1.2;
    expect(cam.snapTarget()).toBe(-1);
  });

  it("freezes the band for the duration of a gesture — a band change is a projection change", () => {
    const cam = makeCam();
    cam.scale = cam.base * 1.0;
    cam.syncStep();
    expect(cam.step).toBe(0);
    cam.freezeBand();
    cam.scale = cam.base * 6; // the reader keeps zooming
    expect(cam.syncStep()).toBe(0); // ...and the projection does not move
    expect(cam.bandStale()).toBe(true);
    expect(cam.thawBand()).toBe(2);
    expect(cam.bandStale()).toBe(false);
  });

  it("the camera stops at the detail ceiling, and it is absolute", () => {
    const cam = makeCam();
    cam.zoomAt(cam.base * 1e4, W * 0.4, H * 0.5, W, H, LEDGER_W);
    expect(Math.abs(cam.scale - DETAIL_PXM)).toBeLessThan(1e-9);
    // absolute: the ceiling does not get finer on a wider screen
    const wide = makeCam(new Projection(), 2560, 1440);
    wide.zoomAt(wide.base * 1e4, 100, 100, 2560, 1440, LEDGER_W);
    expect(Math.abs(wide.scale - DETAIL_PXM)).toBeLessThan(1e-9);
    // ...and MAXZ survives only as a floor under it on a very small screen
    const tiny = new Camera();
    tiny.base = 1;
    expect(tiny.maxScale()).toBe(MAXZ);
  });

  it("...and the fourth named stop is that ceiling", () => {
    const cam = makeCam();
    expect(cam.presetCount()).toBe(4);
    expect(Math.abs(cam.presetScale(3) - cam.maxScale())).toBeLessThan(1e-9);
    expect(cam.presetScale(0)).toBeCloseTo(cam.base * ZSTEPS[0], 12);
  });

  it("the fourth stop is the same CLOSENESS on two viewports whose fit differs", () => {
    /* Block V1. The button says STREET on both screens, so it has to mean the
       same thing on both: the same px per world unit, and therefore a
       DIFFERENT multiple of the fit. Measured on the page at 1600 × 1000 and
       390 × 844: z 29.79× and z 100.22×, both at scale 2.0. */
    const wide = makeCam(new Projection(), 1600, 1000);
    const phone = makeCam(new Projection(), 390, 844);
    expect(phone.base).toBeLessThan(wide.base * 0.6); // the fits really differ
    expect(wide.presetScale(3)).toBeCloseTo(phone.presetScale(3), 12);
    const zWide = wide.presetScale(3) / wide.base;
    const zPhone = phone.presetScale(3) / phone.base;
    expect(zPhone / zWide).toBeCloseTo(wide.base / phone.base, 9);
  });

  it("says which stop the camera is standing on, on the absolute scale", () => {
    /* The test this replaces was `z > 11.5` in CityMap, left over from MAXZ:
       on a phone, where the ceiling is z 100, it called every scale from 11.5
       up "Street". */
    const cam = makeCam(new Projection(), 390, 844);
    for (let i = 0; i < cam.presetCount(); i++) {
      cam.scale = cam.presetScale(i);
      expect(cam.pressedPreset()).toBe(i);
    }
    cam.scale = cam.base * 12; // deep, and nowhere near the ceiling
    expect(cam.z()).toBeGreaterThan(11.5);
    expect(cam.pressedPreset()).toBe(-1);
    // and within the snap of a stop, it is that stop
    cam.scale = cam.base * ZSTEPS[1] * 1.02;
    expect(cam.pressedPreset()).toBe(1);
  });

  it("cuts to a stop without a glide, and lands where the glide would have", () => {
    const glided = makeCam();
    const cut = makeCam();
    glided.scale = glided.presetScale(2);
    glided.clamp(W, H, LEDGER_W);
    cut.cutTo(cut.presetScale(2), W, H, LEDGER_W);
    expect(cut.scale).toBeCloseTo(glided.scale, 12);
    expect(cut.cx).toBeCloseTo(glided.cx, 9);
    expect(cut.cy).toBeCloseTo(glided.cy, 9);
    // and it cannot be used to leave the ladder
    cut.cutTo(1e6, W, H, LEDGER_W);
    expect(cut.scale).toBeCloseTo(cut.maxScale(), 12);
  });
});

describe("zoom toward the pointer", () => {
  /* functional.py §27, split in two 2026-08-23 (Block TILT) and strictly
     stronger than the single number it replaced. zoomAt ENDS IN clamp(), and
     the clamp is not part of the promise being made here ("the thing under the
     cursor stays there") — it is the separate rule that the city cannot be lost
     off-screen. On the unpatched build, with nothing varied but the viewport,
     1440×940 and 1440×1100 held to 0.00 px and 1440×800 drifted 28.13 px at
     (520,560) against the BOTTOM bound. So: (a) the arithmetic with the bound
     taken out, at three viewports; (b) the residual is EXACTLY the clamp's own
     correction and no more — which the old clause could not say at all, because
     a residual of zero cannot distinguish "the clamp did not bind" from "the
     clamp moved the camera and something else moved it back". */
  const PTS: Array<[number, number]> = [
    [317, 222],
    [900, 140],
    [520, 560],
  ];
  const FACTORS = [1.7, 0.6, 2.4];

  function worstBefore(cam: Camera, w: number, h: number): number {
    const s0 = cam.scale;
    const cx0 = cam.cx;
    const cy0 = cam.cy;
    const bb = cam.bbox;
    cam.bbox = null; // clamp() returns early
    let worst = 0;
    for (const [px, py] of PTS) {
      for (const f of FACTORS) {
        cam.scale = s0;
        cam.cx = cx0;
        cam.cy = cy0;
        const wx = (px - w / 2) / cam.scale + cam.cx;
        const wy = cam.cy - (py - h / 2) / cam.scale;
        cam.zoomAt(cam.scale * f, px, py, w, h, LEDGER_W);
        const nx = (wx - cam.cx) * cam.scale + w / 2;
        const ny = h / 2 - (wy - cam.cy) * cam.scale;
        worst = Math.max(worst, Math.abs(nx - px), Math.abs(ny - py));
      }
    }
    cam.bbox = bb;
    cam.scale = s0;
    cam.cx = cx0;
    cam.cy = cy0;
    return worst;
  }

  it("zoom is toward the pointer, exactly — the thing under the cursor stays there, at every window, before the bound", () => {
    for (const vh of [940, 800, 1100]) {
      const cam = makeCam(new Projection(), W, vh);
      expect(worstBefore(cam, W, vh)).toBeLessThan(1e-6);
    }
  });

  it("...and where the bound does move it, the whole of that movement is the bound and nothing else", () => {
    const cam = makeCam(new Projection(), W, 800);
    const s0 = cam.scale;
    const cx0 = cam.cx;
    const cy0 = cam.cy;
    const bb = cam.bbox;
    let worst = 0;
    for (const [px, py] of PTS) {
      for (const f of FACTORS) {
        cam.scale = s0;
        cam.cx = cx0;
        cam.cy = cy0;
        cam.zoomAt(cam.scale * f, px, py, W, 800, LEDGER_W);
        const gx = cam.cx;
        const gy = cam.cy;
        const gs = cam.scale;
        cam.scale = s0;
        cam.cx = cx0;
        cam.cy = cy0;
        cam.bbox = null;
        cam.zoomAt(cam.scale * f, px, py, W, 800, LEDGER_W);
        cam.bbox = bb;
        cam.clamp(W, 800, LEDGER_W);
        worst = Math.max(
          worst,
          Math.abs(gx - cam.cx),
          Math.abs(gy - cam.cy),
          Math.abs(gs - cam.scale),
        );
      }
    }
    expect(worst).toBeLessThan(1e-9);
  });

  it("TI5 zoom is still toward the pointer once the camera has been tilted", () => {
    // The clause the stale clamp box broke, re-run AFTER a tilt change rather
    // than only at load — at load the stale box happened to be the right one and
    // the defect was invisible.
    const p = new Projection();
    p.setTilt(0.33);
    p.setTilt(0.42);
    const cam = makeCam(p);
    expect(worstBefore(cam, W, H)).toBeLessThan(1e-6);
  });
});

describe("the clamp", () => {
  it("the city cannot be dragged off the screen", () => {
    const cam = makeCam();
    const cx = cam.cx;
    const cy = cam.cy;
    cam.panBy(-9000, -9000, W, H, LEDGER_W);
    cam.clamp(W, H, LEDGER_W);
    expect(Math.hypot(cam.cx - cx, cam.cy - cy)).toBeLessThan(4000);
  });

  it("...but at whole-city zoom it can still be dragged", () => {
    // The first version locked the axis at whole-city zoom, and the measured
    // consequence was that dragging did nothing at all. A control that does
    // nothing is worse than one that does a little.
    const cam = makeCam();
    const cx = cam.cx;
    cam.panBy(90, 0, W, H, LEDGER_W);
    cam.clamp(W, H, LEDGER_W);
    expect(Math.abs(cam.cx - cx)).toBeGreaterThan(1);
  });

  it("clamps to the visible STRIP, not the canvas — the ledger is opaque", () => {
    const cam = makeCam();
    cam.scale = cam.base * 6;
    const s = cam.strip(W, H, LEDGER_W);
    expect(s.halfW).toBeCloseTo((W - LEDGER_W) / (2 * cam.scale), 12);
    expect(s.offX).toBeCloseTo(LEDGER_W / (2 * cam.scale), 12);
    // on a phone the ledger stacks below, so the whole canvas is the strip
    const phone = cam.strip(390, 700, LEDGER_W);
    expect(phone.offX).toBe(0);
    expect(phone.halfW).toBeCloseTo(390 / (2 * cam.scale), 12);
  });

  it("clampAxis is two rules, one for fits and one for does-not-fit", () => {
    // fits (2*half >= hi-lo) → every part of the city stays inside the frame,
    // and the camera roams only in the slack between the two bounds
    expect(clampAxis(1e6, 0, 100, 200, 8)).toBe(200); // lo + half
    expect(clampAxis(-1e6, 0, 100, 60, 8)).toBe(40); // hi - half
    expect(clampAxis(50, 0, 100, 60, 8)).toBe(50); // inside the slack: untouched
    // does not fit → the city must still cover the frame, plus PAD of overshoot
    expect(clampAxis(1e6, 0, 1000, 100, 80)).toBe(1000 + 80 - 100);
    expect(clampAxis(-1e6, 0, 1000, 100, 80)).toBe(0 - 80 + 100);
  });
});

describe("where San Francisco is", () => {
  it("TI4 the pan clamp's box is the box the projection actually draws — at every LOD band, after a tilt change", () => {
    /* nav/glue.js computed this in an IIFE at load. It is per-band because it
       depends on ZEX, and it depends on sA and ZEXB in exactly the same way,
       which an IIFE cannot express. Left stale it did not throw and it did not
       draw wrong: it made clamp() pull the camera toward a city that was no
       longer there, and the only symptom was §27's zoom-toward-the-pointer
       clause missing by 67 px. */
    const p = new Projection();
    const before = cityBBoxByBand(p, CITY);
    p.setTilt(0.33);
    p.setTilt(0.42);
    const after = cityBBoxByBand(p, CITY);
    for (let b = 0; b < ZEX_BY_STEP.length; b++) {
      for (let k = 0; k < 4; k++) {
        expect(Math.abs(after[b][k] - before[b][k])).toBeLessThan(1e-6);
      }
      // and it really is the box the projection draws at that band
      const want = cityBBox(
        new Projection({ sA: p.sA, zexb: p.zexb, zex: ZEX_BY_STEP[b] }),
        CITY,
      );
      for (let k = 0; k < 4; k++) {
        expect(Math.abs(after[b][k] - want[k])).toBeLessThan(1e-6);
      }
    }
  });

  it("...and a tilt change really does move the box, so a stale one would be wrong", () => {
    const a = cityBBoxByBand(new Projection({ sA: 0.42 }), CITY)[0];
    const b = cityBBoxByBand(new Projection({ sA: 0.5 }), CITY)[0];
    expect(Math.abs(a[3] - b[3])).toBeGreaterThan(1);
    // but the horizontal extent is untouched — sA is not in screen x
    expect(a[0]).toBeCloseTo(b[0], 9);
    expect(a[2]).toBeCloseTo(b[2], 9);
  });

  it("the fit leaves the city in the visible strip and fills it to 86 %", () => {
    const box: BBox = cityBBox(new Projection(), CITY);
    const fit = fitCity(box, W, H, LEDGER_W);
    const cam = new Camera();
    cam.base = fit.base;
    cam.bx = fit.bx;
    cam.by = fit.by;
    cam.bbox = box;
    cam.home(W, H, LEDGER_W);
    const cityW = (box[2] - box[0]) * cam.scale;
    const cityH = (box[3] - box[1]) * cam.scale;
    expect(Math.max(cityW / (W - LEDGER_W), cityH / H)).toBeCloseTo(0.86, 6);
    // and the whole of it lands left of the ledger
    const left = (box[0] - cam.cx) * cam.scale + W / 2;
    const right = (box[2] - cam.cx) * cam.scale + W / 2;
    expect(left).toBeGreaterThan(-1);
    expect(right).toBeLessThan(W - LEDGER_W + 1);
  });
});

describe("the raster-and-blit path", () => {
  const DPR = 2;

  function buffer(cam: Camera, m: number, key = "k"): Rastered {
    const s = slotSize(W, H, m);
    return { W: s.W, H: s.H, scale: cam.scale, cx: cam.cx, cy: cam.cy, step: cam.step, key };
  }

  it("a buffer painted at camera A, blitted for camera B, lands every world point where B would have drawn it", () => {
    // THE ONE EQUATION, run backwards. This is the whole claim the architecture
    // rests on: the blit is not an approximation of the frame, it IS the frame.
    const cam = makeCam();
    const b = buffer(cam, M_DESK);
    cam.panBy(-120, 66, W, H, LEDGER_W);
    cam.zoomAt(cam.scale * 1.31, 700, 400, W, H, LEDGER_W);
    const p = place(b, cam, W, H, DPR, false);
    for (const [wx, wy] of [
      [b.cx, b.cy],
      [b.cx + 300, b.cy - 220],
      [b.cx - 80, b.cy + 15],
    ]) {
      // where the buffer drew it, in buffer px from the buffer's top-left
      const bxPx = (wx - b.cx) * b.scale + b.W / 2;
      const byPx = b.H / 2 - (wy - b.cy) * b.scale;
      // where the blit puts that buffer pixel on the canvas
      const blitX = p.dx + bxPx * p.k;
      const blitY = p.dy + byPx * p.k;
      // where a direct render at the current camera would have drawn it
      const wantX = (wx - cam.cx) * cam.scale + W / 2;
      const wantY = H / 2 - (wy - cam.cy) * cam.scale;
      expect(blitX).toBeCloseTo(wantX, 9);
      expect(blitY).toBeCloseTo(wantY, 9);
    }
  });

  it("the margin is forced EVEN, so a settled buffer lands on the device-pixel grid", () => {
    // Half a pixel of offset would make drawImage resample the entire city
    // through a bilinear filter — every hairline street edge softened, on a
    // still frame, for nothing.
    for (const [w, h] of [[1440, 940], [1439, 941], [391, 701], [1281, 833]]) {
      for (const m of [M_SETTLED, M_DESK, M_PHONE, M_ZOOM]) {
        const s = slotSize(w, h, m);
        expect((s.W - w) % 2).toBe(0);
        expect((s.H - h) % 2).toBe(0);
      }
    }
  });

  it("the settled buffer has no margin and the motion buffer does", () => {
    // The margin's only job is to absorb MOTION, and the first pointer move of
    // any gesture switches to the motion buffer anyway. MEASURED: dropping it
    // took the settle rasterisation at district zoom from 92 ms to 40 ms.
    expect(M_SETTLED).toBe(1);
    expect(slotSize(W, H, M_SETTLED)).toEqual({ W, H });
    expect(slotSize(W, H, M_DESK).W).toBeGreaterThan(W);
    expect(margin(1440)).toBe(M_DESK);
    expect(margin(390)).toBe(M_PHONE);
    // and the zoom buffer keeps only a thin ring, because a wheel zoom is
    // anchored under the pointer, not at the centre
    expect(M_ZOOM).toBeLessThan(M_DESK);
  });

  it("a settled buffer at native scale covers the viewport exactly", () => {
    const cam = makeCam();
    const b = buffer(cam, M_SETTLED);
    const p = place(b, cam, W, H, DPR, true);
    expect(p.k).toBeCloseTo(1, 12);
    expect(covers(p, W, H)).toBe(true);
    expect(p.dx).toBe(0);
    expect(p.dy).toBe(0);
  });

  it("a pan eats the motion margin, and the blit stops being the truth when it does", () => {
    const cam = makeCam();
    const b = buffer(cam, M_DESK);
    const base = {
      cur: b,
      camStep: cam.step,
      key: "k",
      moving: true,
      lowRes: true,
      isHiSlot: false,
      mode: "drag" as const,
      now: 1000,
      lastRaster: 0,
      W,
      H,
    };
    /* The clamp has its own tests above; here it is taken out so the pan is
       the buffer's pan and not the bound's. */
    cam.bbox = null;
    // a small drag still blits
    cam.panBy(-40, 0, W, H, LEDGER_W);
    expect(
      decideRaster({ ...base, placement: place(b, cam, W, H, DPR, false) }).need,
    ).toBe(false);
    // a big one uncovers the frame
    cam.panBy(-4000, 0, W, H, LEDGER_W);
    expect(decideRaster({ ...base, placement: place(b, cam, W, H, DPR, false) })).toEqual({
      need: true,
      why: "margin",
    });
  });

  it("a band change always costs a raster — it is the one thing a blit cannot represent", () => {
    const cam = makeCam();
    const b = buffer(cam, M_DESK);
    expect(
      decideRaster({
        cur: b,
        placement: place(b, cam, W, H, DPR, false),
        camStep: b.step + 1,
        key: "k",
        moving: true,
        lowRes: true,
        isHiSlot: false,
        mode: "zoom",
        now: 1000,
        lastRaster: 999,
        W,
        H,
      }),
    ).toEqual({ need: true, why: "band" });
  });

  it("a settle sharpens; a gesture is held to one raster per RERASTER_MIN", () => {
    const cam = makeCam();
    const b = buffer(cam, M_DESK);
    const p = place(b, cam, W, H, DPR, true);
    // settled: a low-resolution buffer is no longer good enough
    expect(
      decideRaster({
        cur: b, placement: p, camStep: cam.step, key: "k", moving: false,
        lowRes: false, isHiSlot: false, mode: "idle", now: 1e4, lastRaster: 0, W, H,
      }),
    ).toEqual({ need: true, why: "sharpen" });
    // mid-gesture, content moved on but the floor has not elapsed
    expect(
      decideRaster({
        cur: b, placement: p, camStep: cam.step, key: "later", moving: true,
        lowRes: true, isHiSlot: false, mode: "drag",
        now: 1000, lastRaster: 1000 - RERASTER_MIN / 2, W, H,
      }).need,
    ).toBe(false);
    expect(
      decideRaster({
        cur: b, placement: p, camStep: cam.step, key: "later", moving: true,
        lowRes: true, isHiSlot: false, mode: "drag",
        now: 1000, lastRaster: 1000 - RERASTER_MIN * 2, W, H,
      }),
    ).toEqual({ need: true, why: "content" });
  });

  it("a magnified blit is repainted once it has stretched past what it can carry", () => {
    const cam = makeCam();
    const b = buffer(cam, M_ZOOM);
    cam.scale *= ZOOM_K_MAX * 1.1; // zoomed in past the ceiling
    const p = place(b, cam, W, H, DPR, false);
    expect(p.k).toBeGreaterThan(ZOOM_K_MAX);
    expect(
      decideRaster({
        cur: b, placement: p, camStep: cam.step, key: "k", moving: true,
        lowRes: true, isHiSlot: false, mode: "zoom",
        now: 1e4, lastRaster: 0, W, H,
      }),
    ).toEqual({ need: true, why: "zoomlod" });
  });

  it("the film's buffer is repainted on magnification, not on velocity", () => {
    const cam = makeCam();
    const b = buffer(cam, M_DESK);
    const held = decideRasterExternal({
      cur: b, placement: place(b, cam, W, H, DPR, false),
      camStep: cam.step, key: "k", W, H,
    });
    expect(held.need).toBe(false);
    cam.scale *= EXT_K_MAX * 1.05;
    expect(
      decideRasterExternal({
        cur: b, placement: place(b, cam, W, H, DPR, false),
        camStep: cam.step, key: "k", W, H,
      }),
    ).toEqual({ need: true, why: "sharpen" });
  });

  it("the pan lead is capped at 45 % of the margin's own slack", () => {
    // Uncapped, a fast flick moved the buffer's centre further than the
    // buffer's own overhang, so the freshly-painted buffer did not cover the
    // viewport it was painted for — 19 fps with 35 rasterisations in 1.8 s.
    const cam = makeCam();
    const slot = slotSize(W, H, M_DESK);
    const slackX = ((slot.W - W) / 2) * 0.45;
    const wild = leadCentre(cam, slot, W, H, 999_999, 0);
    expect(Math.abs(wild.cx - cam.cx) * cam.scale).toBeCloseTo(slackX, 6);
    const gentle = leadCentre(cam, slot, W, H, 100, 0);
    expect(Math.abs(gentle.cx - cam.cx) * cam.scale).toBeCloseTo(13, 6);
  });

  it("the scale lead leads on DIRECTION, not on distance to target", () => {
    // Keying it to zTarget/cam.scale looked right and did nothing: the ease
    // keeps the camera within a few per cent of its target, so the lead was 3 %.
    expect(zoomLeadScale(1, 0.5)).toBeCloseTo(ZOOM_LEAD, 12); // zooming out
    expect(zoomLeadScale(1, 0.99)).toBeCloseTo(ZOOM_LEAD, 12); // barely out, same lead
    expect(zoomLeadScale(1, 2)).toBe(1); // zooming in: a magnified buffer covers
    expect(zoomLeadScale(1, 0)).toBe(1); // no target
  });
});

describe("the buffer plan", () => {
  it("is four slots, sized once per viewport, and every one lands on the device grid", () => {
    // The first version sized ONE canvas on demand, so every motion↔settle
    // transition reassigned canvas.width on a 4320×1978 surface. MEASURED:
    // ~77 ms per rasterisation at EVERY zoom level, including 11×, where a full
    // render of the whole frame is 5.3 ms. A cost that does not vary with the
    // amount of work is not the work.
    const plan = planSlots(W, H, 2);
    expect(plan.map((s) => s.name)).toEqual(["hi", "lo", "fi", "zo"]);
    for (const s of plan) {
      expect((s.W - W) % 2).toBe(0);
      expect((s.H - H) % 2).toBe(0);
      expect(s.dpr).toBeGreaterThanOrEqual(1);
    }
    const [hi, lo, fi, zo] = plan;
    expect(hi.W).toBe(W); // the settled buffer has no margin at all
    expect(lo.W).toBeGreaterThan(W);
    expect(lo.dpr).toBeLessThan(hi.dpr); // LOD during motion
    // the film is watched, not scrubbed: same world, full device resolution
    expect(fi.W).toBe(lo.W);
    expect(fi.dpr).toBe(hi.dpr);
    // and a zoom does not slide, so it keeps only a thin ring
    expect(zo.W).toBeLessThan(lo.W);
  });

  it("never asks for a buffer below one device sample per pixel", () => {
    for (const dpr of [1, 1.5, 2, 3]) {
      for (const s of planSlots(W, H, dpr)) expect(s.dpr).toBeGreaterThanOrEqual(1);
    }
    // a phone gets the smaller motion margin
    expect(planSlots(390, 700, 3)[1].W).toBeLessThan(390 * M_DESK);
  });
});

describe("no continuous camera term in a cache key", () => {
  it("a whole zoom inside one band crosses only a handful of key values", () => {
    /* Anything continuous in cam.scale inside a layer cache key invalidates the
       buffer mid-gesture and makes zoom jumpy — the bug this renderer shipped
       with twice. Quantised to a 32nd, a full sweep of a continuous ramp is a
       few dozen keys and not a few hundred frames of them. */
    const keys = new Set<number>();
    for (let i = 0; i <= 600; i++) {
      const t = i / 600; // a continuous tier ramp over the band
      keys.add(quantiseForKey(t * t * (3 - 2 * t)));
    }
    expect(keys.size).toBeLessThanOrEqual(KEY_QUANTUM + 1);
    expect(keys.size).toBeGreaterThan(1); // and it is not frozen either
  });

  it("...but what is DRAWN stays continuous — only the key is stepped", () => {
    // A pixel floor is a step in the first derivative. The quantisation is on
    // the string used to look up the cache, never on the quantity drawn.
    const cam = makeCam();
    const b: Rastered = {
      ...slotSize(W, H, M_DESK), scale: cam.scale, cx: cam.cx, cy: cam.cy,
      step: cam.step, key: "k",
    };
    let prev = place(b, cam, W, H, 2, false).k;
    let worstJump = 0;
    for (let i = 1; i <= 400; i++) {
      cam.scale = b.scale * (1 + i * 0.005);
      const k = place(b, cam, W, H, 2, false).k;
      worstJump = Math.max(worstJump, Math.abs(k - prev));
      prev = k;
    }
    expect(worstJump).toBeLessThan(0.01); // no step, anywhere
  });
});

describe("the wheel", () => {
  it("takes its gain from the SIZE of the delta, not from the ctrl modifier", () => {
    // A trackpad pinch and a Ctrl+wheel are indistinguishable by modifier — the
    // browser sends ctrlKey for both — but not by magnitude. Keying the gain off
    // ctrlKey meant two wheel events took the camera from 1.6× to 11.5×.
    const pinch = wheelFactor(-8); // many small deltas
    const notch = wheelFactor(-100); // one mouse notch
    expect(pinch).toBeGreaterThan(1);
    expect(notch).toBeGreaterThan(1);
    expect(notch).toBeLessThan(1.35); // one notch is not a whole band
    expect(pinch).toBeLessThan(1.1);
    // and one violent flick cannot cross the whole range either
    expect(wheelFactor(-1e6)).toBeCloseTo(wheelFactor(-260), 12);
    expect(wheelFactor(1e6)).toBeCloseTo(wheelFactor(260), 12);
  });

  it("the ease is continuous in dt, so a dropped frame lands where a smooth one would", () => {
    const one = easeZoom(1, 4, 0.032);
    let many = 1;
    for (let i = 0; i < 32; i++) many = easeZoom(many, 4, 0.001);
    expect(many).toBeCloseTo(one, 6);
  });
});
