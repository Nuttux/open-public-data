import { describe, expect, it } from "vitest";
import { ADAPT_WINDOW, SLOW_FRAME_MS, framesAreSlow, windowMedian } from "./quality";

describe("adaptive quality — the decision", () => {
  it("has no opinion before a full window", () => {
    expect(windowMedian(new Array(ADAPT_WINDOW - 1).fill(50))).toBeNull();
    expect(framesAreSlow(new Array(ADAPT_WINDOW - 1).fill(50))).toBe(false);
  });
  it("judges the median of the LAST window, not the whole history", () => {
    const gaps = [...new Array(ADAPT_WINDOW).fill(16.7), ...new Array(ADAPT_WINDOW).fill(SLOW_FRAME_MS + 10)];
    expect(windowMedian(gaps)).toBe(SLOW_FRAME_MS + 10);
    expect(framesAreSlow(gaps)).toBe(true);
  });
  it("is not moved by a few slow frames in a fast window", () => {
    const gaps = new Array(ADAPT_WINDOW).fill(16.7);
    for (let i = 0; i < ADAPT_WINDOW / 2 - 1; i++) gaps[i] = 200;
    expect(framesAreSlow(gaps)).toBe(false);
  });
  it("a 60 Hz frame that drops one vsync is not slow; two is", () => {
    expect(framesAreSlow(new Array(ADAPT_WINDOW).fill(33.4))).toBe(false);
    expect(framesAreSlow(new Array(ADAPT_WINDOW).fill(SLOW_FRAME_MS + 1))).toBe(true);
  });
});
