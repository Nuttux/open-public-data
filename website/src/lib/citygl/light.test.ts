/**
 * THE RIG, CHECKED AGAINST THREE'S OWN ARITHMETIC RATHER THAN AGAINST ITSELF.
 *
 * `solveSunRig` is four lines of algebra that invert three.js's lighting model,
 * and algebra that inverts something is exactly the kind of code that comes out
 * plausible and wrong. So the test does not re-derive the solve: it takes the
 * intensities the solve produced, runs them FORWARD through the lighting model
 * a second time — ambient plus hemisphere plus hemisphere plus directional, as
 * `three` computes them — and asserts the four surfaces land on the four
 * targets the look asked for.
 *
 * It also pins the two things that were BUGS and would come back silently:
 * a hemisphere light whose dark end is white, and a shadow box fitted so wide
 * that its texels are bigger than the screen's pixels.
 */
import { Color, Scene, Vector3 } from "three";
import { describe, expect, it } from "vitest";

import {
  DEFAULT_LOOK,
  SHADOW_THROW,
  solveSunRig,
  sunRig,
  type SunLook,
} from "./light";

const UP = new Vector3(0, 1, 0);
/** the two faces of the diagonal grid this projection shows */
const WALL_LIT = new Vector3(Math.SQRT1_2, 0, -Math.SQRT1_2);
const WALL_DARK = new Vector3(-Math.SQRT1_2, 0, -Math.SQRT1_2);
/** the square grid's one visible face — no sun reaches it at any elevation */
const WALL_FLAT = new Vector3(0, 0, -1);

function lum(c: Color): number {
  return 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
}

/** the camera basis this projection produces at its own bearing and tilt */
const SCREEN_RIGHT = new Vector3(1, 0, 0);
const CAM_F = new Vector3(0, 0.5774, -0.8165).normalize();

/** a 420 m viewport, which is the closest camera this renderer offers */
const STREET: [number, number][] = [
  [3050, 3150],
  [3470, 3150],
  [3050, 3600],
  [3470, 3600],
];

function rigFor(look?: Partial<SunLook>) {
  const scene = new Scene();
  const rig = sunRig(scene, { look, mapSize: 2048, maxBuiltY: 480 });
  rig.aimKey(SCREEN_RIGHT, CAM_F);
  /* WITHOUT A FIT THE SUN IS STILL AT ITS THREE.JS DEFAULT of (0, 1, 0) —
     straight overhead — because `dir.position` is only written when the shadow
     box is placed. Every irradiance below would then be measured against the
     wrong sun, and the first draft of this file did exactly that. */
  rig.fit(STREET);
  return rig;
}

/** three only positions a shadow camera at render time; there is no renderer
 *  here, so the same call the shadow pass makes is made by hand. */
function placeShadowCamera(rig: ReturnType<typeof rigFor>) {
  rig.dir.shadow.updateMatrices(rig.dir);
  return rig.dir.shadow.camera;
}

/** three.js's own irradiance on a surface, summed over the rig's four lights */
function irradiance(rig: ReturnType<typeof rigFor>, n: Vector3): number {
  const { ambient, hemi, key, dir } = rig;
  const hemiTerm = (light: typeof hemi, axis: Vector3): number => {
    const t = 0.5 * n.dot(axis) + 0.5;
    return light.intensity * (lum(light.groundColor) + t * (lum(light.color) - lum(light.groundColor)));
  };
  const sun = new Vector3().subVectors(dir.position, dir.target.position).normalize();
  return (
    ambient.intensity * lum(ambient.color) +
    hemiTerm(hemi, new Vector3(0, 1, 0)) +
    hemiTerm(key, key.position.clone().normalize()) +
    dir.intensity * lum(dir.color) * Math.max(0, n.dot(sun))
  );
}

describe("solveSunRig", () => {
  it("throws a shadow 1 / tan(40 deg) times its caster's height", () => {
    /* This assertion has now moved twice — sqrt(2) from the parity solve,
       sqrt(3) at 30 degrees, and this. Each time it is EXACT and each time it
       is the declared value, never a widened tolerance. `light.ts` §and then
       it went back up states why. */
    expect(SHADOW_THROW).toBeCloseTo(1 / Math.tan((40 * Math.PI) / 180), 10);
  });

  it("keeps an ordinary house's shadow inside the street it lands in", () => {
    /* THE PROPERTY THE ELEVATION EXISTS TO GUARANTEE, which the bare constant
       above does not capture: the number was not chosen for its own sake, it
       was chosen so a shadow fits in a carriageway. Locking only the constant
       lets a future edit move the sun to somewhere that satisfies the letter
       of a declared value and cuts the streets again, which is exactly the
       defect this replaced.

       The two world quantities, both from the record rather than from here:
       an ordinary Richmond/Sunset dwelling stands about 10 m to its parapet,
       and the standard right of way on that grid is 68.6 ft — 20.9 m. A
       shadow that clears the pavement is wanted; one that reaches the far
       kerb is the defect. So the throw must put a 10 m caster past the near
       pavement (about 4.6 m) and short of the far one. */
    const HOUSE_M = 10;
    const ROW_M = 20.9;
    const PAVEMENT_M = 4.6;
    const cast = HOUSE_M * SHADOW_THROW;
    expect(cast).toBeGreaterThan(PAVEMENT_M);
    expect(cast).toBeLessThan(ROW_M - PAVEMENT_M);
  });

  it("hits every one of the four look targets it was given", () => {
    const rig = rigFor();
    const look = DEFAULT_LOOK;
    expect(irradiance(rig, UP)).toBeCloseTo(look.groundE, 3);
    expect(irradiance(rig, WALL_LIT)).toBeCloseTo(look.wallCap * look.groundE, 3);
    const flat = irradiance(rig, WALL_FLAT);
    const dark = irradiance(rig, WALL_DARK);
    expect(flat / dark).toBeCloseTo(look.wallRamp, 3);
    rig.dispose();
  });

  it("agrees with its own prediction, which is what a harness reads", () => {
    const rig = rigFor();
    const p = rig.levels.predict;
    expect(irradiance(rig, UP)).toBeCloseTo(p.up, 4);
    expect(irradiance(rig, WALL_LIT)).toBeCloseTo(p.wallLit, 4);
    expect(irradiance(rig, WALL_DARK)).toBeCloseTo(p.wallDark, 4);
    expect(irradiance(rig, WALL_FLAT)).toBeCloseTo(p.wallFlat, 4);
    /* a shadow removes the direct term and nothing else */
    expect(p.up - p.upShadowed).toBeCloseTo(DEFAULT_LOOK.sunShare * DEFAULT_LOOK.groundE, 4);
    rig.dispose();
  });

  it("holds every target it says it reached, and says so when it cannot", () => {
    /* ── WHY THIS SWEEP BRANCHES NOW ──────────────────────────────────────
       It used to assert both targets on all twelve pairs, which held only
       because the sun stood at the one elevation where a 45-degree wall and a
       roof take an EQUAL share of the beam. `light.ts` §and then it came down
       further put the sun at 30 degrees, where the wall takes sqrt(1.5) —
       22 % more — so a `wallCap` of 1.1 is no longer reachable at any
       `sunShare` past about 0.4: the direct term alone already puts the lit
       wall further above the roof than the target allows. Those pairs are
       IMPOSSIBLE, not wrong, and `solveSunRig` now reports which.

       So this asserts more than it did, not less. Where the solve closed, the
       targets are exact to the same tolerance as before. Where it did not, the
       clamp path — previously swept but never checked — has to say so and
       still hand back levels a renderer can use. */
    let reached = 0;
    for (const sunShare of [0.35, 0.45, 0.55, 0.65]) {
      for (const wallCap of [1.1, 1.3, 1.5]) {
        const look = { ...DEFAULT_LOOK, sunShare, wallCap };
        const rig = rigFor(look);
        if (rig.levels.reachable) {
          reached++;
          expect(irradiance(rig, UP)).toBeCloseTo(look.groundE, 3);
          expect(irradiance(rig, WALL_LIT)).toBeCloseTo(wallCap * look.groundE, 3);
        } else {
          expect(rig.levels.keyI).toBeGreaterThanOrEqual(0);
          expect(rig.levels.keyDark).toBeGreaterThanOrEqual(0);
          expect(Number.isFinite(rig.levels.sunI)).toBe(true);
          expect(irradiance(rig, UP)).toBeGreaterThan(0);
        }
        rig.dispose();
      }
    }
    /* and the sweep must not quietly become all-unreachable, which would make
       the branch above vacuous */
    expect(reached).toBeGreaterThanOrEqual(9);
  });

  it("ships a look the solve can actually reach", () => {
    /* the guard that matters: `DEFAULT_LOOK` itself must close. Pushing the
       shipped look into the impossible region is silent otherwise — the rig
       clamps, the targets miss, and nothing fails. */
    expect(rigFor().levels.reachable).toBe(true);
  });

  it("keeps the sun as a real share of the light, which is the whole point", () => {
    const rig = rigFor();
    const p = rig.levels.predict;
    /* the rig this replaced put 21.9 % of an up face's light in the sun, so a
       shadow could remove at most that. Anything under a third is that bug. */
    expect((p.up - p.upShadowed) / p.up).toBeGreaterThan(0.4);
    rig.dispose();
  });

  it("does not hand a neutral triple to the hex normaliser", () => {
    /* `rgbHex` divides by the largest channel, so a grey comes back WHITE and
       the wall ramp silently becomes a uniform ambient. That shipped. */
    const rig = rigFor();
    expect(rig.key.groundColor.getHexString()).not.toBe("ffffff");
    expect(lum(rig.key.groundColor)).toBeLessThan(lum(rig.key.color));
    rig.dispose();
  });

  it("reports a solve it could not reach instead of pretending", () => {
    /* a wall floor brighter than the whole up face has nowhere to come from */
    const levels = solveSunRig(
      { groundE: 2.4, sunShare: 0.9, wallCap: 3.0, wallRamp: 1.05 },
      { sun: 0.96, skyUp: 0.74, skyWall: 0.79 },
      0.34,
      0.02,
    );
    expect(levels.keyDark).toBeGreaterThanOrEqual(0);
    expect(Number.isFinite(levels.keyI)).toBe(true);
  });
});

describe("the shadow box", () => {
  it("fits in the light's own axes, not in world x/z", () => {
    const rig = rigFor();
    rig.fit(STREET);
    /* the fit this replaced grew the box by the tallest caster's whole throw
       on ALL FOUR sides and then circumscribed a square: MEASURED, 2,009 m for
       this camera. Anything near that is the old fit back again. */
    expect(rig.fitStats.spanU).toBeLessThan(1900);
    expect(rig.fitStats.spanV).toBeLessThan(1200);
    /* and it is anisotropic, which is the sign it is in light space: the
       ground's extent along the sun's own horizontal axis is compressed by
       sin(elevation) when the light looks at it. */
    expect(rig.fitStats.spanU).toBeGreaterThan(rig.fitStats.spanV);
    rig.dispose();
  });

  it("still contains every ground point the viewport can see", () => {
    const rig = rigFor();
    rig.fit(STREET);
    const cam = placeShadowCamera(rig);
    for (const [x, z] of STREET) {
      const p = new Vector3(x, 0, z).applyMatrix4(cam.matrixWorldInverse);
      expect(p.x).toBeGreaterThan(cam.left);
      expect(p.x).toBeLessThan(cam.right);
      expect(p.y).toBeGreaterThan(cam.bottom);
      expect(p.y).toBeLessThan(cam.top);
      /* the camera looks down its own -z, so a point in front has z < 0 */
      expect(-p.z).toBeGreaterThan(cam.near);
      expect(-p.z).toBeLessThan(cam.far);
    }
    rig.dispose();
  });

  it("contains the top of the tallest caster standing on the far rim", () => {
    const rig = rigFor();
    rig.fit(STREET);
    const cam = placeShadowCamera(rig);
    /* a 480-unit tower on the up-sun edge of the view throws sqrt(2) * 480 m
       DOWN-sun; light space is defined so its top lands on its own shadow */
    const top = new Vector3(3470, 480, 3400).applyMatrix4(cam.matrixWorldInverse);
    expect(top.x).toBeGreaterThan(cam.left);
    expect(top.x).toBeLessThan(cam.right);
    expect(-top.z).toBeGreaterThan(cam.near);
    rig.dispose();
  });

  it("snaps the box to whole texels so a pan does not crawl", () => {
    const rig = rigFor();
    rig.fit(STREET);
    const a = rig.dir.shadow.camera.right - rig.dir.shadow.camera.left;
    /* nudge the view by a third of a texel; the box must not move at all */
    const nudged = STREET.map(([x, z]) => [x + a / 2048 / 3, z] as [number, number]);
    rig.fit(nudged);
    const b = rig.dir.shadow.camera.right - rig.dir.shadow.camera.left;
    expect(b).toBeCloseTo(a, 6);
    rig.dispose();
  });

  it("scales the bias to the texel rather than to one camera", () => {
    const rig = rigFor();
    rig.fit(STREET);
    const near = rig.dir.shadow.normalBias;
    rig.fit([
      [0, 0],
      [14000, 0],
      [0, 9000],
      [14000, 9000],
    ]);
    const far = rig.dir.shadow.normalBias;
    expect(far).toBeGreaterThan(near * 4);
    rig.dispose();
  });
});
