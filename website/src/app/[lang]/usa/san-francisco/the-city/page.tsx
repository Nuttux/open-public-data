import type { Metadata } from "next";
import "@/app/fusion.css";
import TheCityGLClient from "./TheCityGLClient";
import { theCityPageData } from "./data";

/**
 * /us/city/sf/the-city — server component (ADR-0010 D3, EN-only), on the same
 * shape as every other page in this section: the server reads the export, does
 * the arithmetic that is not a render, and hands a SLIM payload to the client.
 *
 * The slim payload matters more here than anywhere else on the site. The map's
 * own record is 12.5 MB of binary chunks and it does NOT come through the
 * page: it is fetched by the camera from `public/data/us/sf/city/`. What is
 * read here is the manifest's own catalogue — the counts and the provenance —
 * so the page can say what it is drawn from without fetching any of it.
 *
 * ── ONE RENDERER, AND THIS IS THE ONE ────────────────────────────────────
 * This page drew on a 2D Canvas until 2026-08-30 and the GPU port lived beside
 * it at `/the-city-gl`, `noindex`, so the two could be judged side by side.
 * That comparison is over: the Canvas renderer and its shell — `scene.ts`,
 * `renderer.ts`, `CityMap.tsx`, `CityScrub.tsx`, `CityFilm.tsx`, `film-draw.ts`
 * — are deleted, and the GPU renderer serves this URL.
 *
 * It is worth recording WHY, because the parity that held the two together was
 * also holding the picture back. The port's facade tiles were flattened until
 * their close frames matched the Canvas page's luminance; measured, that put
 * every window on every building at roughly a fifth of the contrast a real
 * opening has. Parity with a renderer that no longer exists is not a
 * constraint, and `facade.ts` is now free of it.
 *
 * Everything San Francisco about the renderer lives in the CLIENT, as a
 * `CityDescriptor`. `lib/citygl/` has none of it — see that directory's
 * `PLAN.md` §0 rule 2 and `engine-is-city-free.test.ts`.
 */
const BASE_METADATA: Metadata = {
  title: "San Francisco: the city, drawn from its own records",
  description:
    "San Francisco drawn from the record the city publishes: every building at the height the city measured, and for every block what the Board of Supervisors decided there, linked to the page of the scan.",
};

/**
 * A LINK TO ONE BLOCK PREVIEWS AS THAT BLOCK.
 *
 * `?block=3752` pasted into Slack, WhatsApp or X used to show the site-wide
 * card, so a link to one block and a link to the whole map looked the same.
 * The card is rendered by `/api/og/sf-block/[id]` — a route handler and not an
 * `opengraph-image.tsx`, because the block is a query param and that file
 * convention is never handed `searchParams`.
 *
 * THE COST, STATED: reading `searchParams` here opts this page out of static
 * rendering. It already reads three JSON files per request and hands the
 * client a slim payload, so what changes is when that happens, not how much.
 * The map's own 12.5 MB is fetched by the camera and never came through here.
 */
export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<{ block?: string }>;
}): Promise<Metadata> {
  const { block } = await searchParams;
  // Block ids are short and alphanumeric ("3752", "0247C", "4591A"). Anything
  // else is not a link we wrote, and it falls back rather than reaching the
  // card route.
  if (!block || !/^[0-9A-Za-z]{1,8}$/.test(block)) return BASE_METADATA;
  return {
    ...BASE_METADATA,
    title: `Block ${block} — what the Board of Supervisors decided here`,
    openGraph: { images: [`/api/og/sf-block/${block}`] },
    twitter: { card: "summary_large_image", images: [`/api/og/sf-block/${block}`] },
  };
}

export default function SfTheCityPage() {
  return <TheCityGLClient data={theCityPageData()} />;
}
