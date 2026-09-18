import { NextResponse } from "next/server";
import { listMunicipios } from "@/lib/br/municipios";

const MAX_RESULTS = 12;
const TOP_RESULTS = 6;

/** Accent-insensitive search over the 5 570 municípios (the manifest), the
 *  same scoring as /api/search-communes : exact name, then prefix, then word,
 *  then substring ; ties by population. « olinda », « sao paulo », « ouro preto mg ». */
function norm(s: string): string {
  return s.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/[-']/g, " ").replace(/\s+/g, " ").trim();
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const qRaw = (url.searchParams.get("q") || "").trim();
  // Champ vide : les plus peuplés, pour que cliquer la recherche montre
  // quelque chose au lieu du vide (2026-09-18). Mêmes données, même forme.
  if (url.searchParams.get("top") && qRaw.length < 2) {
    const top = [...listMunicipios()]
      .sort((a, b) => (b.pop ?? 0) - (a.pop ?? 0))
      .slice(0, TOP_RESULTS)
      .map(({ slug, nome, uf, pop }) => ({ slug, nome, uf, pop: pop ?? null }));
    return NextResponse.json({ q: "", results: top, total: listMunicipios().length, top: true });
  }
  if (qRaw.length < 2) return NextResponse.json({ q: qRaw, results: [] });
  let q = norm(qRaw);
  // A trailing state code narrows : « belem pa ».
  let uf: string | null = null;
  const m = q.match(/^(.*\S)\s+([a-z]{2})$/);
  if (m) { q = m[1]; uf = m[2].toUpperCase(); }
  type Scored = { score: number; pop: number; slug: string; nome: string; uf: string };
  const matches: Scored[] = [];
  for (const c of listMunicipios()) {
    if (uf && c.uf !== uf) continue;
    const name = norm(c.nome);
    let score = 0;
    if (name === q) score = 5;
    else if (name.startsWith(q)) score = 3;
    else if (name.includes(` ${q}`)) score = 2;
    else if (name.includes(q)) score = 1;
    if (score > 0) matches.push({ score, pop: c.pop ?? 0, slug: c.slug, nome: c.nome, uf: c.uf });
  }
  matches.sort((a, b) => b.score - a.score || b.pop - a.pop);
  return NextResponse.json({ q: qRaw, results: matches.slice(0, MAX_RESULTS).map(({ slug, nome, uf, pop }) => ({ slug, nome, uf, pop })), total: matches.length });
}
