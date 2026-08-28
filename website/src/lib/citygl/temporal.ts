/* ═══════════════════════════════════════════════════════════════════════
   lib/citygl/temporal.ts — THE FRAME REMEMBERS THE FRAME BEFORE IT.

   ── THE DEFECT THIS EXISTS FOR ──────────────────────────────────────────
   Drag the map and the city sparkles: thousands of one- and two-pixel
   specks flickering on rooftops all over the frame. Daniel, many times:
   *"it still scintillates … whenever i move the map in any way."*

   ── AND THE MEASUREMENT THAT FOUND IT ───────────────────────────────────
   The same drag, driven by the same mouse events, on both renderers,
   aligned by the shift a search found rather than one assumed:

     published Canvas page   0.00 % of pixels fail to line up
     this renderer           0.51 % at max zoom, 0.82 % at the district

   The published page reads 0.00 % because it does not re-render while you
   drag — it rasterises once into a slot and BLITS that bitmap around
   (`rasters`, `curSlot`, `paintedStep` on that renderer). This one redraws
   every frame, and a re-render of a city this dense does not reproduce
   bit-for-bit at every edge, even from a camera that has moved by an exact
   whole number of device pixels.

   Ruled out first, each with its own measurement, so that this file is not
   another guess: the shadow map, the whole post chain, the ink outlines,
   the roof caps, the trees, `flatShading`, the polygon-offset slope term
   (the ground is WORSE without it, 1.06 % against 0.95 %), the transparent
   sort order (`sortObjects = false` changes nothing: 0.81 %), level-of-
   detail popping (zero spikes across a drag or a zoom) and supersampling
   (0.52 % at twice the pixels, 0.73 % at four times — not a fix).

   ── WHY NOT SIMPLY COPY THE PUBLISHED PAGE ──────────────────────────────
   Because freezing the picture during motion freezes everything IN it.
   Daniel: *"if i add effects on terrian, water, clouds etc those will just
   pause?"* — yes, they would, and a renderer that fights the things it is
   meant to grow is the wrong renderer. Games do not freeze; they accumulate.

   ── WHAT THIS DOES ──────────────────────────────────────────────────────
   The output of one frame is kept, and the next frame is mixed with it,
   with the kept frame slid over by however far the camera moved. A pixel
   that flips between two values on alternate frames settles to their
   average instead of sparkling, and anything that is genuinely moving keeps
   moving.

   ── AND WHY IT IS CHEAP HERE, WHERE IT USUALLY IS NOT ───────────────────
   Ordinary temporal antialiasing pays for reprojection with softness: the
   previous frame has to be resampled at fractional offsets, and resampling
   blurs. This camera is ORTHOGRAPHIC, at a fixed bearing, and already
   snapped to whole device pixels by `camera.ts` §THE CAMERA THE FRAME IS
   DRAWN FROM. So a pan reprojects by an EXACT INTEGER NUMBER OF TEXELS —
   the history is read at the same texel centres it was written at, and the
   accumulation costs nothing in sharpness.

   That exactness is a precondition, not a bonus. It is why `reprojectable`
   below refuses everything that is not a pure pan: a zoom, a change of
   band, a change of year, a resize. Those re-sample the picture whatever
   this file does, and blending across them would smear rather than settle.
   ═══════════════════════════════════════════════════════════════════════ */

import {
  FramebufferTexture,
  HalfFloatType,
  NearestFilter,
  NoColorSpace,
  RGBAFormat,
  SRGBColorSpace,
  Vector2,
} from "three";
import type { ShaderNodeObject } from "three/tsl";
import type { Node } from "three/webgpu";
import {
  colorSpaceToWorking,
  Fn,
  mix,
  step,
  texture,
  uniform,
  uv,
  vec4,
} from "three/tsl";

/** what `engine.ts` holds on to */
export interface Temporal {
  /** the node to put on the glass — the composed frame, mixed with history */
  readonly node: ShaderNodeObject<Node>;
  /** the texture the last frame was copied into */
  readonly history: FramebufferTexture;
  /**
   * Tell it what the camera did. Returns true if this frame will blend —
   * which is also the answer to "is it worth copying the frame out again".
   */
  frame(shiftXdev: number, shiftYdev: number, reprojectable: boolean): boolean;
  /** the next frame starts from nothing: a zoom, a year, a resize */
  reset(): void;
  /** stop blending for good — the copy failed and the history is not real */
  disable(): void;
  /** the drawing buffer changed size; texels are the unit here */
  resize(w: number, h: number): void;
  dispose(): void;
}

/**
 * How much of the kept frame survives into the new one.
 *
 * MEASURED, over a forty-step drag at the district camera, as the share of
 * pixels that fail to line up with the frame before them:
 *
 *   keep 0    0.10 %      the renderer on its own
 *   keep 0.5  0.02 %
 *   keep 0.8  0.00 %
 *   keep 0.9  0.00 %
 *
 * 0.8 is where it reaches zero, and there is no reason to pay for 0.9. What
 * the number costs is how long something genuinely new takes to arrive at
 * full strength — 1 - 0.8^n, so about nine frames to 87 %, an eighth of a
 * second. For a pan that is only ever the narrow band at the leading edge,
 * because everything else in the frame is reprojected onto exactly the texels
 * it already occupied; it is not a lag over the picture.
 */
let KEEP = 0.8;

/** for the A/B only — `engine.setTemporal` */
export function setTemporalKeep(v: number): void {
  KEEP = Math.max(0, Math.min(0.95, v));
}

/**
 * `hdr` is the WebGPU backend's drawing buffer: `rgba16float`, and LINEAR.
 * Two things follow, and both were errors before they were arguments.
 *
 * The copy target has to carry the same format, or the copy is refused —
 * *"copyFramebufferToTexture: Source and destination formats do not match.
 * rgba16float bgra8unorm"*, once per frame, for ever.
 *
 * What does NOT follow is a different colour conversion, which was the first
 * guess and was wrong: a float buffer is not a linear one. The chain writes
 * the SAME encoded values there that it writes to an 8-bit buffer, it just
 * writes them with more precision — so the sample is brought back to linear
 * on both backends, and assuming otherwise blew the WebGPU frame out to 245
 * of 255 where the other backend read 176.
 */
export function cityTemporal(
  colour: ShaderNodeObject<Node>,
  hdr = false,
  encoded = false,
): Temporal {
  /* A FRAMEBUFFER TEXTURE, which is what `copyFramebufferToTexture` will
     accept — an ordinary Texture is rejected by the renderer. */
  const history = new FramebufferTexture(1, 1);
  history.name = "citygl.temporal.history";
  /* NEAREST, and it is the whole argument of this file. The offset is a
     whole number of texels, so there is nothing to interpolate; asking for
     LINEAR here would soften every accumulated frame for no reason. */
  history.minFilter = NearestFilter;
  history.magFilter = NearestFilter;
  history.generateMipmaps = false;
  /* ── THE COLOUR SPACE IS NOT A DETAIL, IT IS THE WHOLE PICTURE ────────
     What is copied is the DRAWING BUFFER, and that has already been encoded
     for the glass, while everything this node mixes it with is linear. Get
     that wrong and the exposure goes with it — measured on a settled frame
     that should read 140.3: sampled raw and mixed as if it were linear it
     read 226.5, a pale veil over the city, which is what Daniel saw within
     minutes of it shipping.

     The conversion is done HERE, in the shader, and not by handing the
     texture a `colorSpace` for three to honour: on this backend that produced
     a frame at 64.9, darker than either honest answer, which is what a sample
     coming back empty looks like. `colorSpaceToWorking` is explicit, it is
     the same conversion the renderer would do, and it is visible in this file
     rather than in a property somebody has to remember. */
  history.colorSpace = NoColorSpace;
  if (hdr) {
    /* ── ASKING FOR THE TYPE DOES NOTHING HERE, AND THIS IS WHY ──────────
       three creates the GPU texture for a `FramebufferTexture` by OVERRIDING
       the format with the canvas's preferred one and ignoring the texture's
       own type:

         if ( texture.isFramebufferTexture ) {
           options.format = …getPreferredCanvasFormat();   // bgra8unorm
         }
         const format = texture.internalFormat || options.format || …

       So `HalfFloatType` was set, and set again, and the copy went on being
       refused against a `bgra8unorm` destination — because the type was never
       consulted. `internalFormat` is the one thing that outranks the
       override, so that is what is set, and the type and format go with it so
       nothing else reading this texture is misled about what is in it. */
    /* CAST, because the declared type of `internalFormat` is the WebGL 2 set
       ("RGBA16F" and friends) and this string is a `GPUTextureFormat`. The
       same field carries both: the WebGPU backend hands it straight to
       `createTexture`, which is exactly why it outranks the override. */
    (history as unknown as { internalFormat: string }).internalFormat =
      "rgba16float";
    history.type = HalfFloatType;
    history.format = RGBAFormat;
  }

  /* in TEXELS, set per frame; the shader turns it into uv */
  const shift = uniform(new Vector2(0, 0));
  const size = uniform(new Vector2(1, 1));
  const keep = uniform(0);

  const node = Fn(() => {
    const off = uv().add(shift.div(size));
    /* ── A SAMPLE FROM OUTSIDE THE FRAME IS NOT HISTORY ──────────────────
       The reprojected point is only inside the kept frame while the camera
       has moved less than a frame. Sample past the edge and the texture
       clamps, so the outermost row of pixels gets smeared across everything
       that asked for it — which is not a subtle artifact: jumping the camera
       across the city put a pale veil over the whole picture, the second time
       this file has done that to Daniel.

       So each pixel decides for itself. Inside, it blends; outside — the
       strip a pan newly reveals, and the whole frame after a jump — it takes
       the render as drawn, which is exactly what it would have been with no
       accumulation at all. The band this costs is a few pixels at the leading
       edge, and it is the correct few pixels. */
    const inside = step(0, off.x)
      .mul(step(off.x, 1))
      .mul(step(0, off.y))
      .mul(step(off.y, 1));
    /* ── AND THE SPACE DEPENDS ON THE BACKEND, WHICH COST A DARK CITY ────
       WebGL 2 draws into an 8-bit buffer that is already encoded for the
       glass, so a copy of it has to be brought back to linear before it can
       be mixed with linear light. That is this path, it is measured, and it
       is why the accumulation only runs there.

       ── AND ON WEBGPU THE SPACE IS NOT THE PROBLEM, WHICH TOOK THREE GOES ──
       That backend draws into `rgba16float`, and the accumulation comes back
       wrong there: over six real drags the frame settles at 81.8 of 255 where
       it belongs at 155. The obvious story was the colour space, and it was
       told twice — once as a veil over the city, once as an overcast — before
       it was tested properly. It is WRONG. Forcing the sRGB conversion and
       forcing the raw sample give the SAME 81.7, so the conversion is not the
       variable at all; something about copying a float buffer means the
       history is not the frame. `hdr` is kept because the copy target does
       need the format, but the reading of it is unsolved.

       The lesson is the test, not the theory: a feedback error converges to a
       fixed point, so it reads as fine in a two-second capture. It only shows
       in a SOAK — ten drags with the exposure sampled throughout. */
    const raw = texture(history, off);
    /* ── AND `encoded` IS THE FIX FOR A FEEDBACK THAT DIVERGED ────────────
       The history is a copy of the FRAMEBUFFER, so it holds whatever the
       output transform last wrote. Undoing only the sRGB encode is exact if
       that transform IS only an sRGB encode — which it was, while the chain
       ended at `NoToneMapping`.

       `engine.ts` §and a tone curve put ACES in front of it, and the round
       trip stopped being the identity: a LINEAR scene colour was being mixed
       with an ACES-mapped history and the sum tone-mapped again, every frame,
       into itself. MEASURED with the camera held still at the Twin Peaks
       district camera, asking for a frame every second:

           t =  0 s   mean 117.4   p05 5.5      <- the frame as drawn
           t =  4 s   mean 124.4   p05 2.0
           t = 30 s   mean 128.5   p05 2.0      <- what a reader sees

       The mid-tones climb eleven levels while the darkest twentieth crushes to
       black, and it RESETS the moment the camera moves, because a move rejects
       the history. Daniel: *"whenever im static this crazy light is everywhere
       and fucked up it hides everything, when im zooming in and the camera
       moves that effect leaves then immediately goes back."*

       So the caller now applies the output transform BEFORE this mix and says
       so with `encoded`. Both sides are then in the same display space and the
       loop is stable — a fixed point at the frame itself, which is what an
       accumulation is supposed to converge to.

       This is also the likely cause of the WebGPU failure recorded below,
       which was never solved: `rgba16float` plus an output transform this
       could not invert. */
    const past = hdr || encoded ? raw : colorSpaceToWorking(raw, SRGBColorSpace);
    /* `keep` is zero on the first frame after any reset, so the first frame
       after a zoom is exactly the frame the renderer drew */
    return vec4(mix(colour.rgb, past.rgb, keep.mul(inside)), colour.a);
  })();

  let live = false;
  let dead = false;

  return {
    node,
    history,
    frame(shiftXdev, shiftYdev, reprojectable) {
      const ok =
        !dead &&
        reprojectable &&
        live &&
        Number.isInteger(shiftXdev) &&
        Number.isInteger(shiftYdev) &&
        /* a move of a whole frame or more shares no pixel with what came
           before, so there is nothing to carry and the per-pixel test below
           would reject all of it anyway — this saves the sample */
        Math.abs(shiftXdev) < size.value.x &&
        Math.abs(shiftYdev) < size.value.y;
      /* ── BOTH COMPONENTS ARE NEGATED, AND THE SECOND ONE COST A ROUND ──
         The history is READ where the picture used to be, which is the
         opposite of the way the picture moved — that is the first minus. The
         second is that uv runs UP the texture while the screen shift is
         measured DOWN it, so the y component flips again on its way into
         texture space.

         The y sign was wrong for a full round of measurement because every
         sweep that checked it panned along x ONLY, and an x-only test cannot
         see a y-only mistake: it read 0.00 % while a real diagonal drag —
         which is what a hand actually does — read 24 to 43 %. */
      shift.value.set(-shiftXdev, -shiftYdev);
      keep.value = ok ? KEEP : 0;
      live = true;
      return true;
    },
    reset() {
      live = false;
      keep.value = 0;
    },
    /* ── A FAILURE HAS TO TURN THE BLEND OFF, NOT JUST LET GO OF IT ──────
       If the frame cannot be copied out, the history stops being refreshed —
       and a blend that keeps running against a stale or empty history is a
       grey wash over the city. Dropping the engine's reference is not enough,
       because the shader holds its own; this is what actually stops it. */
    disable() {
      dead = true;
      live = false;
      keep.value = 0;
    },
    resize(w, h) {
      const W = Math.max(1, Math.round(w));
      const H = Math.max(1, Math.round(h));
      size.value.set(W, H);
      /* the copy target has to be the drawing buffer's own size, or the
         history is read at the wrong texels and the accumulation smears */
      if (history.image.width !== W || history.image.height !== H) {
        history.image.width = W;
        history.image.height = H;
        history.dispose();
      }
      live = false;
      keep.value = 0;
    },
    dispose() {
      history.dispose();
    },
  };
}
