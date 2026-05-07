import { NextResponse } from "next/server";
import { listAllCommunesMeta } from "@/lib/all-communes";

const MAX_RESULTS = 12;

/** Normalize for accent-insensitive substring search. */
function norm(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[-']/g, " ")
    .trim();
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const qRaw = (url.searchParams.get("q") || "").trim();
  if (qRaw.length < 2) {
    return NextResponse.json({ q: qRaw, results: [] });
  }

  const q = norm(qRaw);
  const all = listAllCommunesMeta();

  // Score: 3 = startsWith, 2 = word boundary match, 1 = substring
  type Scored = { score: number; pop: number; entry: (typeof all)[number] };
  const matches: Scored[] = [];
  for (const c of all) {
    const name = norm(c.nom);
    let score = 0;
    if (name.startsWith(q)) score = 3;
    else if (name.includes(` ${q}`)) score = 2;
    else if (name.includes(q)) score = 1;
    // Match on INSEE code too (5 digits)
    if (q.length === 5 && /^\d{5}$/.test(qRaw) && c.insee === qRaw) score = 4;
    if (score > 0) matches.push({ score, pop: c.pop, entry: c });
  }

  // Sort: highest score first, then biggest population
  matches.sort((a, b) => b.score - a.score || b.pop - a.pop);

  const results = matches.slice(0, MAX_RESULTS).map((m) => ({
    insee: m.entry.insee,
    slug: m.entry.slug,
    nom: m.entry.nom,
    dep_name: m.entry.dep_name,
    pop: m.entry.pop,
  }));

  return NextResponse.json({ q: qRaw, results, total: matches.length });
}
