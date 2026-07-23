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
