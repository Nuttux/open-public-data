"use client";

import { useEffect, useRef } from "react";
import { useTrack } from "@/lib/analyticsContext";

/**
 * Two small client probes for pages that are otherwise server-rendered.
 *
 * Clicks are already covered globally by AnalyticsProvider (any `[data-cta]`
 * fires `cta_click`, any mailto fires `external_link_click`), so these only
 * fill the two gaps it cannot see: that a page was opened, and that someone
 * stayed long enough to have actually read it.
 *
 * Both respect the opt-out, because `track` is a no-op when the visitor has
 * opted out or no PostHog key is set.
 */

/** Fires once when the page mounts. */
export function ViewPing({
  event,
  props,
}: {
  event: string;
  props?: Record<string, unknown>;
}) {
  const track = useTrack();
  const sent = useRef(false);
  useEffect(() => {
    if (sent.current) return;
    sent.current = true;
    track(event, props ?? {});
    // `props` is a fresh object each render; the ref guard is what makes this
    // fire once, so it deliberately stays out of the dependency list.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [event]);
  return null;
}

/**
 * Fires once after `seconds` on the page — the difference between a visitor
 * who bounced off a shared link and one who read what was there.
 */
export function DwellPing({
  event,
  seconds = 30,
  props,
}: {
  event: string;
  seconds?: number;
  props?: Record<string, unknown>;
}) {
  const track = useTrack();
  const sent = useRef(false);
  useEffect(() => {
    const id = setTimeout(() => {
      if (sent.current || document.visibilityState === "hidden") return;
      sent.current = true;
      track(event, { ...(props ?? {}), dwell_seconds: seconds });
    }, seconds * 1000);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [event, seconds]);
  return null;
}
