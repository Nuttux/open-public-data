import { describe, expect, it } from "vitest";
import {
  AmbientLight,
  DirectionalLight,
  HemisphereLight,
  Mesh,
  Object3D,
  Scene,
} from "three";

import { upFaceTransfer } from "./up-face";

/**
 * WHAT THIS TEST IS FOR.
 *
 * `layers/buildings.ts` divides the roof's colour by this number. Get it
 * wrong and every roof in the city is wrong by the same factor — which is the
 * single most invisible kind of bug this renderer can have, because a city
 * uniformly 30 % dark still looks like a city.
 *
 * So the arithmetic is checked against three's own shader rather than against
 * a screenshot: an ambient light of intensity `I` contributes `I / PI` to a
 * Lambert surface of albedo 1, a hemisphere light aims by where it stands,
 * and a directional light carries `max(0, n . L)`.
 */
describe("upFaceTransfer", () => {
  const withLights = (...lights: Object3D[]): Object3D => {
    const s = new Scene();
    const m = new Mesh();
    s.add(m);
    for (const l of lights) s.add(l);
    s.updateMatrixWorld(true);
    return m;
  };

  it("returns null where there is no scene and where there is no light", () => {
    expect(upFaceTransfer(null)).toBeNull();
    expect(upFaceTransfer(new Mesh())).toBeNull();
    expect(upFaceTransfer(withLights())).toBeNull();
  });

  it("gives an ambient light its own intensity over PI", () => {
    const t = upFaceTransfer(withLights(new AmbientLight(0xffffff, 1)));
    expect(t).toBeCloseTo(1 / Math.PI, 9);
  });

  it("gives a directional light overhead its full term, and one at the horizon none", () => {
    const up = new DirectionalLight(0xffffff, 1);
    up.position.set(0, 100, 0);
    expect(upFaceTransfer(withLights(up))).toBeCloseTo(1 / Math.PI, 6);

    const flat = new DirectionalLight(0xffffff, 1);
    flat.position.set(100, 0, 0);
    expect(upFaceTransfer(withLights(flat))).toBeCloseTo(0, 9);

    /* and a light BELOW the surface is clamped away rather than subtracted */
    const under = new DirectionalLight(0xffffff, 1);
    under.position.set(0, -100, 0);
    expect(upFaceTransfer(withLights(under))).toBeCloseTo(0, 9);
  });

  it("takes a directional light's aim from its TARGET, not from its position", () => {
    /* the sun rig fits its light to the ground every frame, so the position
       moves and the direction does not: read the position alone and the
       transfer swings with the camera */
    const d = new DirectionalLight(0xffffff, 1);
    d.position.set(1000, 1000, 0);
    d.target.position.set(1000, 0, 0);
    const m = withLights(d, d.target);
    // straight down onto the surface, whatever the x offset says
    expect(upFaceTransfer(m)).toBeCloseTo(1 / Math.PI, 6);
  });

  it("aims a hemisphere light by where it stands", () => {
    /* three's `WebGLLights` normalises the light's world POSITION into the
       shader's `direction`, and the weight is `dot(n, direction) * .5 + .5` */
    const sky = new HemisphereLight(0xffffff, 0x000000, 1);
    sky.position.set(0, 1, 0);
    expect(upFaceTransfer(withLights(sky))).toBeCloseTo(1 / Math.PI, 6);

    const flipped = new HemisphereLight(0xffffff, 0x000000, 1);
    flipped.position.set(0, -1, 0);
    expect(upFaceTransfer(withLights(flipped))).toBeCloseTo(0, 6);

    const sideways = new HemisphereLight(0xffffff, 0x000000, 1);
    sideways.position.set(1, 0, 0);
    expect(upFaceTransfer(withLights(sideways))).toBeCloseTo(0.5 / Math.PI, 6);
  });

  it("skips a light that is switched off or has no intensity", () => {
    const off = new AmbientLight(0xffffff, 1);
    off.visible = false;
    expect(upFaceTransfer(withLights(off))).toBeNull();
    expect(upFaceTransfer(withLights(new AmbientLight(0xffffff, 0)))).toBeNull();
  });

  it("adds the terms, and finds the scene from a mesh nested under it", () => {
    const a = new AmbientLight(0xffffff, 0.5);
    const d = new DirectionalLight(0xffffff, 2);
    d.position.set(0, 100, 0);
    const s = new Scene();
    const parent = new Object3D();
    const m = new Mesh();
    parent.add(m);
    s.add(parent, a, d, d.target);
    s.updateMatrixWorld(true);
    expect(upFaceTransfer(m)).toBeCloseTo(2.5 / Math.PI, 6);
  });
});
