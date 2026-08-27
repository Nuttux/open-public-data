/**
 * THE PARITY HARNESS — one camera, two renderers, one pair of pixels.
 *
 * The only comparison that means anything is the same camera on both pages.
 * The GL page is asked to fit a stop; its camera is read back; the Canvas page
 * is pinned to exactly those numbers through `driveFilm`, which is the one
 * public way to set that renderer's camera outright.
 *
 * ── WHY THE GL SIDE IS NOT A SCREENSHOT ──────────────────────────────────
 * Playwright's screenshot goes through the page compositor, and a WebGPU
 * canvas's swapchain texture is not there to be captured: the frame comes
 * back BLANK while `renderer.info` reports 283 draw calls and 4.9 M
 * triangles. `canvas.toDataURL()` snapshots the canvas itself and is correct
 * on both backends. Cost an hour; written here so it costs nobody else one.
 *
 * usage: node parity.mjs <outdir> [tag]
 */
import { chromium } from "playwright";
import { execSync } from "node:child_process";
import { writeFileSync } from "node:fs";

const OUT = process.argv[2];
const TAG = process.argv[3] ?? "parity";
const W = 1440;
const H = 900;

/** world-metre spans the four stops look across, wide first */
const STOPS = [
  { name: "city", spanM: 14000, at: null, step: 0 },
  { name: "district", spanM: 4200, at: [3000, 3000], step: 1 },
  { name: "block", spanM: 1400, at: [3256, 3339], step: 2 },
  { name: "street", spanM: 420, at: [3256, 3339], step: 2 },
];

const b = await chromium.launch({
  args: ["--enable-unsafe-webgpu", "--enable-features=Vulkan,WebGPU"],
});

/**
 * BOTH canvases, separately, composited offline.
 *
 * The GPU canvas and the 2D overlay are two elements. `drawImage(gpuCanvas)`
 * into a 2D context returns nothing for a WebGPU swapchain — the same reason
 * a screenshot does — so they cannot be flattened in the page. Each is read
 * with `toDataURL` and Pillow stacks them.
 */
async function grabCanvas(page, path) {
  const data = await page.evaluate(async () => {
    const e = globalThis.__cityGL;
    await new Promise((r) =>
      requestAnimationFrame(() => {
        e.invalidate();
        requestAnimationFrame(r);
      }),
    );
    const gpu = document.querySelector(".fx-city-canvas");
    const ov = document.querySelector(".fx-city-overlay-2d");
    return [gpu.toDataURL("image/png"), ov ? ov.toDataURL("image/png") : null];
  });
  writeFileSync(path, Buffer.from(data[0].split(",")[1], "base64"));
  if (data[1]) {
    writeFileSync(path.replace(/\.png$/, "-ov.png"), Buffer.from(data[1].split(",")[1], "base64"));
  }
}

// ── 1. the GL page: fit each stop, read the camera back ────────────────────
const gl = await b.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
gl.setDefaultTimeout(180000);
gl.on("pageerror", (e) => console.log("GL PAGEERR", String(e).slice(0, 200)));
gl.on("console", (m) => {
  if (m.type() === "error") console.log("GL ERR", m.text().slice(0, 160));
});
await gl.goto("http://localhost:3000/us/city/sf/the-city-gl", { waitUntil: "domcontentloaded" });
await gl.waitForFunction(() => !!globalThis.__cityGL, null, { timeout: 180000 });
await gl.waitForTimeout(11000);
console.log("backend", await gl.evaluate(() => globalThis.__cityGL.backend));

const cams = [];
for (const s of STOPS) {
  const cam = await gl.evaluate(
    ({ spanM, at, step }) => {
      const e = globalThis.__cityGL;
      const p = globalThis.__cityGLProj;
      e.setStep(step);
      const centre = at ?? p.centre;
      const c = p.proj(centre[0], centre[1], 0);
      const across =
        p.proj(centre[0] + spanM, centre[1], 0)[0] - p.proj(centre[0], centre[1], 0)[0];
      const out = { cx: c[0], cy: c[1], scale: (e.viewport.W * 0.94) / Math.abs(across) };
      e.setCamera(out);
      return { ...out, step };
    },
    { spanM: s.spanM, at: s.at, step: s.step },
  );
  await gl.waitForTimeout(2200);
  await grabCanvas(gl, `${OUT}/${TAG}-gl-${s.name}.png`);
  cams.push({ ...cam, name: s.name });
}
console.log("cameras", JSON.stringify(cams));

// ── 2. the Canvas page, pinned to exactly those cameras ────────────────────
const cv = await b.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
cv.setDefaultTimeout(120000);
cv.on("pageerror", (e) => console.log("CV PAGEERR", String(e).slice(0, 200)));
await cv.goto("http://localhost:3000/us/city/sf/the-city", { waitUntil: "domcontentloaded" });
await cv.waitForSelector(".fx-city-preset");
await cv.waitForTimeout(7000);
await cv.locator(".fx-city-entry button", { hasText: "Explore" }).click({ force: true });
await cv.waitForTimeout(2500);

for (const cam of cams) {
  await cv.evaluate((c) => {
    globalThis.__cityRenderer.driveFilm({
      cx: c.cx, cy: c.cy, scale: c.scale, step: c.step,
      year: undefined, running: false, plan: null, hide: null,
      underlay: null, overlay: null,
    });
  }, cam);
  await cv.waitForTimeout(6000);
  await cv.locator(".fx-city-canvas").screenshot({ path: `${OUT}/${TAG}-cv-${cam.name}.png` });
}

await b.close();

// ── 3. the pairs ───────────────────────────────────────────────────────────
const py = [
  "from PIL import Image, ImageDraw",
  "import os",
  `OUT = ${JSON.stringify(OUT)}`,
  `TAG = ${JSON.stringify(TAG)}`,
  "D = os.path.expanduser('~/Desktop/sf-city-ab')",
  "os.makedirs(D, exist_ok=True)",
  `for name in ${JSON.stringify(STOPS.map((s) => s.name))}:`,
  "    a = Image.open(f'{OUT}/{TAG}-cv-{name}.png').convert('RGB')",
  "    b = Image.open(f'{OUT}/{TAG}-gl-{name}.png').convert('RGB')",
  "    ovp = f'{OUT}/{TAG}-gl-{name}-ov.png'",
  "    if os.path.exists(ovp):",
  "        ov = Image.open(ovp).convert('RGBA')",
  "        if ov.size != b.size: ov = ov.resize(b.size)",
  "        b = b.convert('RGBA'); b.alpha_composite(ov); b = b.convert('RGB')",
  "    if b.size != a.size: b = b.resize(a.size)",
  "    w, h = a.size",
  "    s = Image.new('RGB', (w * 2 + 12, h + 30), 'white')",
  "    s.paste(a, (0, 30)); s.paste(b, (w + 12, 30))",
  "    d = ImageDraw.Draw(s)",
  "    d.text((10, 9), name.upper() + ' - CANVAS (today)', fill='black')",
  "    d.text((w + 22, 9), name.upper() + ' - GPU (port)', fill='black')",
  "    s.save(f'{D}/GL-{name}.png')",
  "    Image.blend(a, b, 0.5).save(f'{D}/GL-overlay-{name}.png')",
  "print('pairs ->', D)",
].join("\n");
writeFileSync(`${OUT}/_pair.py`, py);
execSync(`python3 ${OUT}/_pair.py`, { stdio: "inherit" });
