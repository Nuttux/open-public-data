import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { EVENTS, EVENT_NAMES } from "./events";

/** Every track("x") / trackEvent("x") / <ViewPing event="x"> literal in src. */
function collectEmittedEvents(): Map<string, string[]> {
  const root = path.resolve(__dirname, "..", "..");
  const found = new Map<string, string[]>();
  const re = /\b(?:track|trackEvent|trackDebounced|debouncedTrack)\(\s*["']([a-z_$]+)["']|<(?:ViewPing|DwellPing)[^>]*\bevent="([a-z_]+)"/g;
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const full = path.join(dir, name);
      if (name === "node_modules" || name.startsWith(".")) continue;
      if (statSync(full).isDirectory()) {
        walk(full);
        continue;
      }
      if (!/\.(tsx?|jsx?)$/.test(name) || name.endsWith(".test.ts")) continue;
      const src = readFileSync(full, "utf8");
      for (const m of src.matchAll(re)) {
        const ev = m[1] || m[2];
        if (!ev) continue;
        const list = found.get(ev) ?? [];
        list.push(path.relative(root, full));
        found.set(ev, list);
      }
    }
  };
  walk(root);
  return found;
}

describe("event catalog", () => {
  const emitted = collectEmittedEvents();

  it("lists every event the code emits", () => {
    const missing = [...emitted.keys()].filter((ev) => !(ev in EVENTS));
    expect(missing, `add these to lib/analytics/events.ts: ${missing.map((m) => `${m} (${emitted.get(m)?.[0]})`).join(", ")}`).toEqual([]);
  });

  it("does not list events nothing emits (global instruments excepted)", () => {
    const globalOnly = new Set(["$pageview", "section_view", "details_toggle", "link_click", "external_link_click", "toc_click", "cta_click"]);
    const dead = EVENT_NAMES.filter((ev) => !emitted.has(ev) && !globalOnly.has(ev));
    expect(dead, "remove from the catalog or emit it").toEqual([]);
  });

  it("every spec has a description, an emitter and a date", () => {
    for (const [name, spec] of Object.entries(EVENTS)) {
      expect(spec.desc.length, name).toBeGreaterThan(20);
      expect(spec.by, name).toBeTruthy();
      expect(spec.since, name).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });
});
