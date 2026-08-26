import type { Metadata } from "next";
import "@/app/fusion.css";
import TheCityGLClient from "./TheCityGLClient";
import { theCityPageData } from "@/app/us/city/sf/the-city/data";

/**
 * /us/city/sf/the-city-gl — THE SAME CITY, DRAWN BY THE GPU.
 *
 * The Canvas page at `/us/city/sf/the-city` does not move. This one exists so
 * the two can be opened side by side on the same machine, on a desktop and on
 * a phone, and judged against each other rather than against a memory. It is a
 * work surface, not a publication: `noindex`, and linked from nowhere.
 *
 * ── THE SERVER HALF IS THE CANVAS PAGE'S, LITERALLY ──────────────────────
 * `theCityPageData()`, the same call the published page makes. It used to be
 * the same *code*, pasted — and by 2026-08-26 the paste had lost three lines
 * out of the middle of a comment it copied. A port that computes its own
 * counts can differ from the published page by a number a reader can see,
 * which would make every comparison between the two pages an argument about
 * the data instead of about the renderer. Now it cannot: there is one server
 * half and two renderers.
 *
 * Everything San Francisco about the port lives in the CLIENT, as a
 * `CityDescriptor`. `lib/citygl/` has none of it — see that directory's
 * `PLAN.md` §0 rule 2 and `engine-is-city-free.test.ts`.
 */
export const metadata: Metadata = {
  title: "San Francisco — the city, drawn by the GPU (work in progress)",
  robots: { index: false, follow: false },
};

export default function SfTheCityGLPage() {
  return <TheCityGLClient data={theCityPageData()} />;
}
