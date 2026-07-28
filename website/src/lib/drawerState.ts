"use client";

import { useEffect, useState } from "react";

/**
 * Global "is an entity drawer open" signal. A DetailDrawer is an intercepting
 * route that layers over whatever page you were on, so `usePathname()` becomes
 * the entity URL — which would otherwise light up the matching section in the
 * top nav (e.g. opening a grant card from Home highlights "Grants"). That reads
 * as wrong: the drawer is a modal, not a section you navigated to. The chrome
 * subscribes to this and suppresses section highlighting while a drawer is open.
 *
 * A counter (not a boolean) so stacked drawers close correctly.
 */
let openCount = 0;
const listeners = new Set<() => void>();

function emit() {
  for (const l of listeners) l();
}

export function pushDrawer() {
  openCount += 1;
  emit();
}

export function popDrawer() {
  openCount = Math.max(0, openCount - 1);
  emit();
}

export function useDrawerOpen(): boolean {
  const [open, setOpen] = useState(openCount > 0);
  useEffect(() => {
    const sync = () => setOpen(openCount > 0);
    listeners.add(sync);
    sync();
    return () => {
      listeners.delete(sync);
    };
  }, []);
  return open;
}

/**
 * Body-scroll lock, refcounted at module level.
 *
 * Each DetailDrawer used to run its own `position:fixed; top:-scrollY` lock in
 * a mount effect. On a drawer→drawer navigation the incoming drawer mounts
 * while the body is STILL locked, so its `window.scrollY` reads 0 — it saves 0,
 * and closing the chain restores the page to the wrong offset (measured: open
 * at 1500px, close, land at 661px).
 *
 * Refcounting fixes both orderings: the offset is captured on the FIRST lock
 * and restored only on the LAST unlock, whether the outgoing drawer unmounts
 * before or after the incoming one mounts.
 */
let lockCount = 0;
let lockedY = 0;
let prevStyles: Record<string, string> | null = null;

/**
 * Where the page was when the user last clicked.
 *
 * The drawer is an intercepting route, so opening one is a real navigation and
 * the App Router scrolls the document before our mount effect runs. Reading
 * `window.scrollY` inside lockBodyScroll() therefore captures the POST-navigation
 * offset, not the one the user is looking at: measured on /us/city/sf, clicking a
 * card at scrollY 0 locked the body to `top: -1215px`, dropping the background to
 * the footer behind the drawer.
 *
 * Recording the offset in a capture-phase click listener beats the router to it.
 * Only a fresh reading is trusted — anything older than CLICK_FRESH_MS is assumed
 * unrelated to this open, and we fall back to the live value.
 */
const CLICK_FRESH_MS = 1200;
let clickY = 0;
let clickAt = 0;

if (typeof window !== "undefined") {
  window.addEventListener(
    "click",
    () => {
      clickY = window.scrollY;
      clickAt = Date.now();
    },
    true,
  );
}

export function lockBodyScroll() {
  lockCount += 1;
  if (lockCount > 1) return; // already locked — keep the original offset
  const body = document.body;
  lockedY =
    Date.now() - clickAt < CLICK_FRESH_MS && body.style.position !== "fixed"
      ? clickY
      : window.scrollY;
  prevStyles = {
    position: body.style.position,
    top: body.style.top,
    left: body.style.left,
    right: body.style.right,
    width: body.style.width,
    overflow: body.style.overflow,
  };
  body.style.position = "fixed";
  body.style.top = `-${lockedY}px`;
  body.style.left = "0";
  body.style.right = "0";
  body.style.width = "100%";
  body.style.overflow = "hidden";
}

export function unlockBodyScroll() {
  lockCount = Math.max(0, lockCount - 1);
  if (lockCount > 0 || !prevStyles) return; // another drawer still open
  const body = document.body;
  body.style.position = prevStyles.position;
  body.style.top = prevStyles.top;
  body.style.left = prevStyles.left;
  body.style.right = prevStyles.right;
  body.style.width = prevStyles.width;
  body.style.overflow = prevStyles.overflow;
  prevStyles = null;
  window.scrollTo(0, lockedY);
}
