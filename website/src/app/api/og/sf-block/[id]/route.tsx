import { renderSfBlockOg } from "@/lib/og/us-sf-cards";

/**
 * The share card for one block of `/us/city/sf/the-city`.
 *
 * A ROUTE HANDLER rather than an `opengraph-image.tsx`, and that is forced
 * rather than chosen: the block is a QUERY PARAM (`?block=3752`), and Next's
 * `opengraph-image` file convention is only ever handed `params`, never
 * `searchParams`. The page's `generateMetadata` reads the query and points
 * `openGraph.images` here.
 *
 * The origin is taken from the REQUEST, because the card fetches its two JSON
 * files off this same deployment rather than reading them off disk — see
 * `renderSfBlockOg` for why a file read would 500 here and not in dev.
 */
export const runtime = "nodejs";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  return renderSfBlockOg(id, new URL(req.url).origin);
}
