/**
 * ── BREATHE: HAND THE MAIN THREAD BACK FOR ONE TURN ──────────────────────
 *
 * The boot builds every layer's geometry on the main thread, and an `await`
 * on a promise that has already settled is a MICROTASK — it does not let the
 * browser paint, scroll or answer a click. MEASURED on production
 * (2026-09-08, `scripts/probes/boot_gaps.mjs`, a setTimeout(0) heartbeat):
 * the boot held the thread for 4.8–5.2 s in bursts, the longest 2.4–2.7 s,
 * which was the 124 building chunks built back to back. The Long Tasks API
 * had reported that block as 0.8 s; it had simply missed it.
 *
 * `breathe()` is a real task boundary — a `MessageChannel` turn, which unlike
 * `setTimeout(0)` is not clamped to 4 ms after the fifth nesting. NOT
 * `scheduler.yield()`: its continuations outrank every other task, so a
 * loop that yields through it runs to the end ahead of the page's timers —
 * MEASURED on dev, a setTimeout heartbeat still read one 2.6 s gap while the
 * build was in 124 slices. A message turn is an ordinary task and takes its
 * turn among the others, which is the point.
 */
export function breathe(): Promise<void> {
  if (typeof requestAnimationFrame === "undefined" || typeof MessageChannel === "undefined") {
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    /* ── A FRAME FIRST, THEN A TURN ──────────────────────────────────────
       A message turn alone was measured NOT to let the page paint: Chrome's
       scheduler ran the boot's next turn ahead of both the frame and the
       timers (a rAF heartbeat still read 580 ms gaps across three breathed
       layers). Asking for the frame and continuing in a task after it is
       what makes the breath one the reader can see. */
    let done = false;
    const go = (): void => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      const ch = new MessageChannel();
      ch.port1.onmessage = () => {
        ch.port1.close();
        resolve();
      };
      ch.port2.postMessage(0);
    };
    /* a hidden tab gets no frames at all, and a boot that waited for one
       would stand under its veil until the reader looked — so the frame is
       asked for, and not waited on past `HIDDEN_BREATH_MS` */
    const timer = setTimeout(go, HIDDEN_BREATH_MS);
    requestAnimationFrame(go);
  });
}

/** how long a breath waits for a frame before going on without one */
const HIDDEN_BREATH_MS = 100;

/** the slice the boot lets itself run before a breath. A breath now costs a
 *  frame, so this is two frames of work for one of paint — the paint gaps
 *  it leaves are ~50 ms, and the boot is not a frame longer than it must be */
export const BOOT_SLICE_MS = 32;

export function paced(sliceMs: number = BOOT_SLICE_MS): () => Promise<void> {
  const now = () => (typeof performance !== "undefined" ? performance.now() : Date.now());
  let last = now();
  return async () => {
    if (now() - last < sliceMs) return;
    await breathe();
    last = now();
  };
}
