import { describe, expect, it } from "vitest";
import { OrthographicCamera, Vector3 } from "three";

import { projection, SX, SY, ZEXB_DEFAULT, ZEX_BY_STEP } from "@/lib/city/projection";
import { applyAxonCamera, axonBasis, scenePoint } from "./camera";

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
