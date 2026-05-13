import { NextResponse } from "next/server";
import { findCommuneByAny, loadAllCommunesSource } from "@/lib/all-communes";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const entry = findCommuneByAny(slug);
  if (!entry) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  const src = loadAllCommunesSource();
  return NextResponse.json({
    slug,
    entry,
    year: src?.year ?? null,
    source: src?.source,
    source_url: src?.source_url,
  });
}
