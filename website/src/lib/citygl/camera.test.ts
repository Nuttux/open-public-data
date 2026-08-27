import { describe, expect, it } from "vitest";
import { OrthographicCamera, Vector3 } from "three";

import { projection, SX, SY, ZEXB_DEFAULT, ZEX_BY_STEP } from "@/lib/city/projection";
import { applyAxonCamera, axonBasis, scenePoint, snapCameraToPixels } from "./camera";

/**
 * THE ONE TEST THE WHOLE PORT STANDS ON.
 *
 * If the GL camera and `projection.ts` disagree by so much as a pixel, every
 * parity screenshot afterwards is comparing two different cities and no
 * judgement made from one means anything. So this does not check the
 * derivation in `camera.ts` — it checks the PIXELS, over a grid of world
 * points, at several cameras, against the Canvas path's own `SX`/`SY`.
 */
describe("the GL camera reproduces projection.ts", () => {
  const W = 1440;
  const H = 900;
  const step = 0;
  const zex = ZEX_BY_STEP[step];

  function screensFor(cam: { cx: number; cy: number; scale: number }) {
    projection.setBand(step);
    const basis = axonBasis(projection);
    const camera = new OrthographicCamera();
    applyAxonCamera(camera, basis, cam, W, H, 200_000);

    const pts: {
      world: [number, number, number, number];
      canvas: [number, number];
      gl: [number, number];
    }[] = [];

    for (const x of [-4000, 0, 1500, 6000]) {
      for (const y of [-3000, 0, 2500, 7000]) {
        for (const [zg, h] of [
          [0, 0],
          [120, 0],
          [0, 260],
          [64, 91],
        ] as const) {
          const plane = projection.projb(x, y, zg, h);
          const canvas: [number, number] = [SX(plane, W, cam), SY(plane, H, cam)];

          const v = scenePoint(x, y, zg * zex + h * ZEXB_DEFAULT).project(camera);
          const gl: [number, number] = [
            ((v.x + 1) / 2) * W,
            ((1 - v.y) / 2) * H,
          ];
          pts.push({ world: [x, y, zg, h], canvas, gl });
        }
      }
    }
    return pts;
  }

  it("lands every point on the same pixel, at the whole-city camera", () => {
    for (const p of screensFor({ cx: 0, cy: 0, scale: 0.05 })) {
      expect(p.gl[0]).toBeCloseTo(p.canvas[0], 3);
      expect(p.gl[1]).toBeCloseTo(p.canvas[1], 3);
    }
  });

  it("lands every point on the same pixel, off-centre and zoomed in", () => {
    for (const p of screensFor({ cx: 3200, cy: 1800, scale: 1.4 })) {
      expect(p.gl[0]).toBeCloseTo(p.canvas[0], 3);
      expect(p.gl[1]).toBeCloseTo(p.canvas[1], 3);
    }
  });

  it("puts the nearer of two points in front", () => {
    projection.setBand(0);
    const basis = axonBasis(projection);
    const camera = new OrthographicCamera();
    applyAxonCamera(camera, basis, { cx: 0, cy: 0, scale: 0.05 }, W, H, 200_000);

    /* `projection.depth()` increases AWAY from the camera, so the point with
       the larger depth must come back with the larger NDC z (further). */
    const near = scenePoint(0, -3000, 0).project(camera);
    const far = scenePoint(0, 6000, 0).project(camera);
    expect(projection.depth(0, 6000)).toBeGreaterThan(projection.depth(0, -3000));
    expect(far.z).toBeGreaterThan(near.z);
  });

  it("keeps the up vector orthogonal to the right vector", () => {
    projection.setBand(0);
    const { R, U } = axonBasis(projection);
    expect(new Vector3().copy(R).dot(U)).toBeCloseTo(0, 12);
  });
});

/**
 * THE PIXEL SNAP.
 *
 * The property that matters is not that the numbers are rounded — it is that
 * a pan lands the city on the SAME sampling grid it was on before, so that
 * moving the map is a shift of the picture rather than a fresh rasterisation
 * of it. Measured on the block camera, a half-pixel pan changed 19.2% of the
 * frame by more than eight levels of 255 without this, and 1.0% with it; on
 * the district camera it went to 0.00%, the frame coming back byte for byte.
 */
describe("the rasterisation camera lands on the pixel grid", () => {
  const cam = { cx: 3987.769301, cy: 1201.5, scale: 0.78944 };

  it("puts the centre on a whole device pixel, at either ratio", () => {
    for (const dpr of [1, 2, 3]) {
      const s = snapCameraToPixels(cam, dpr);
      const q = cam.scale * dpr;
      expect(Math.abs(s.cx * q - Math.round(s.cx * q))).toBeLessThan(1e-9);
      expect(Math.abs(s.cy * q - Math.round(s.cy * q))).toBeLessThan(1e-9);
    }
  });

  it("never moves the camera by as much as half a device pixel", () => {
    for (const dpr of [1, 2]) {
      const s = snapCameraToPixels(cam, dpr);
      const px = 1 / (cam.scale * dpr);
      expect(Math.abs(s.cx - cam.cx)).toBeLessThanOrEqual(px / 2 + 1e-12);
      expect(Math.abs(s.cy - cam.cy)).toBeLessThanOrEqual(px / 2 + 1e-12);
    }
  });

  it("turns a fractional pan into a whole number of pixels — the point of it", () => {
    const dpr = 2;
    const px = 1 / (cam.scale * dpr);
    const a = snapCameraToPixels(cam, dpr);
    /* every tenth of a pixel across two whole pixels */
    for (let k = 0; k <= 20; k++) {
      const b = snapCameraToPixels({ ...cam, cx: cam.cx + (px * k) / 10 }, dpr);
      const steps = (b.cx - a.cx) / px;
      expect(Math.abs(steps - Math.round(steps))).toBeLessThan(1e-9);
    }
  });

  it("leaves the scale alone, because a zoom re-samples whatever the centre does", () => {
    expect(snapCameraToPixels(cam, 2).scale).toBe(cam.scale);
  });

  it("hands back a degenerate camera untouched rather than a NaN one", () => {
    for (const bad of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      const s = snapCameraToPixels({ ...cam, scale: bad }, 2);
      expect(s.cx).toBe(cam.cx);
      expect(s.cy).toBe(cam.cy);
    }
  });

  it("snaps to a coarse cell when one is asked for, and the cell is whole pixels", () => {
    const dpr = 2;
    const cell = 128 * dpr;
    const s = snapCameraToPixels(cam, dpr, cell);
    const q = cam.scale * dpr;
    /* on the coarse grid … */
    expect(Math.abs((s.cx * q) / cell - Math.round((s.cx * q) / cell))).toBeLessThan(1e-9);
    /* … and therefore on the device grid too, which is what lets the type's
       sheet be blitted as a copy rather than resampled */
    expect(Math.abs(s.cx * q - Math.round(s.cx * q))).toBeLessThan(1e-6);
  });

  /* THE PROPERTY THE TYPE ACTUALLY NEEDS. Not "it rounds" — that a drag of a
     whole cell re-places the type ONCE and no more, so panning moves the
     names instead of re-deciding them. Measured on the page at the Sunset
     camera: across a 320-pixel drag in 8-pixel steps, 13 of 40 steps changed
     the type before this and 1 of 40 after, that one being the first frame. */
  it("re-places the type once per cell of pan, and not once per pixel", () => {
    const dpr = 2;
    const cell = 128 * dpr;
    const px = 1 / (cam.scale * dpr);
    const seen = new Set<number>();
    for (let k = 0; k <= cell; k++) {
      seen.add(snapCameraToPixels({ ...cam, cx: cam.cx + px * k }, dpr, cell).cx);
    }
    /* a pan of exactly one cell crosses exactly one boundary */
    expect(seen.size).toBe(2);
  });

  it("gives every camera inside one cell the same sheet", () => {
    const dpr = 1;
    const cell = 64;
    const px = 1 / cam.scale;
    /* start from a camera already on a cell corner, then walk short of the next */
    const base = snapCameraToPixels(cam, dpr, cell);
    for (let k = 0; k < cell / 2; k++) {
      const s = snapCameraToPixels({ ...base, cx: base.cx + px * k }, dpr, cell);
      expect(s.cx).toBeCloseTo(base.cx, 9);
    }
  });
});
