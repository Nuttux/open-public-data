import type { LieuIndexEntry, LieuxSection } from "@/lib/lieux-data";
import { loadPlacesFile, type PlaceIndexEntry, type PlaceObras } from "@/lib/br/recife-places-data";
import { loadContratos } from "@/lib/br/recife-data";
import { fmtBrlCompact, titleCasePt } from "@/lib/br/format";
import { readDataJson } from "@/lib/data/read";
import { isoDate, n as count, sourceSentence, type PageAnswer } from "@/lib/seo/page-answer";
import type { SiteLocale } from "@/lib/site-locale";
import { RECIFE_FAMILY_KEY } from "./recife-lieux";

/**
 * Recife's places on the Lieux section grammar (2026-09-18) : the same index
 * rows and section totals as Paris, computed from places.json (the City's
 * directory of 1 068 facilities) and place_obras.json (the works contracts
 * whose object names a place). The money is the value of those contracts :
 * signed, not paid, and only where the contract text names the place.
 *
 * A contract's year : its `ano` when the export has it, else the year its
 * term started (contratos.json), else the year in its number (5010.6005/2020).
 */

const slug = (s: string) => s.normalize("NFKD").replace(/[^\x00-\x7F]/g, "").replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-+|-+$/g, "").toLowerCase();

type Obras = Record<string, PlaceObras>;

function loadObras(): Obras {
  try {
    return readDataJson<{ items: Obras }>("br/recife/place_obras.json").items ?? {};
  } catch {
    return {};
  }
}

/** Year of each works contract, by contract id. */
function contractYears(obras: Obras): Map<string, number | null> {
  const ids = new Set<string>();
  for (const o of Object.values(obras)) for (const c of o.contratos) if (!c.ano) ids.add(c.contrato_id);
  const started = new Map<string, string | null>();
  if (ids.size > 0) {
    try {
      for (const c of loadContratos().contratos) if (ids.has(c.contrato_id)) started.set(c.contrato_id, c.vigencia_inicio ?? null);
    } catch {
      // Without contratos.json the number in the contract's id still gives a year.
    }
  }
  const out = new Map<string, number | null>();
  for (const o of Object.values(obras)) {
    for (const c of o.contratos) {
      if (c.ano) { out.set(c.contrato_id, c.ano); continue; }
      const start = started.get(c.contrato_id);
      const fromStart = start ? Number(start.slice(0, 4)) : NaN;
      const fromNumber = Number(c.numero.split("/").pop());
      out.set(c.contrato_id, Number.isFinite(fromStart) && fromStart > 1990 ? fromStart : Number.isFinite(fromNumber) && fromNumber > 1990 ? fromNumber : null);
    }
  }
  return out;
}

export type RecifeLieux = {
  lieux: LieuIndexEntry[];
  section: LieuxSection;
  generatedAt: string | null;
  source: { name: string | null; source_url: string | null };
};

let _cache: RecifeLieux | null = null;

export function loadRecifeLieux(): RecifeLieux {
  if (_cache) return _cache;
  const f = loadPlacesFile();
  const obras = loadObras();
  const years = contractYears(obras);
  const families = new Map<string, { key: string; count: number; amount: number }>();
  const areas = new Map<string, { key: string; label: string; count: number; amount: number }>();
  const byYear = new Map<number, number>();
  let total = 0;
  let withMoney = 0;
  const lieux: LieuIndexEntry[] = f.places.map((p: PlaceIndexEntry) => {
    const v = p.obras_total ?? 0;
    const fam = RECIFE_FAMILY_KEY[p.familia] ?? slug(p.familia);
    total += v;
    if (v > 0) withMoney += 1;
    const fr = families.get(fam) ?? { key: fam, count: 0, amount: 0 };
    fr.count += 1; fr.amount += v; families.set(fam, fr);
    const areaKey = p.bairro ? slug(p.bairro) : undefined;
    const areaLabel = p.bairro ? titleCasePt(p.bairro) : undefined;
    if (areaKey && areaLabel) {
      const a = areas.get(areaKey) ?? { key: areaKey, label: areaLabel, count: 0, amount: 0 };
      a.count += 1; a.amount += v; areas.set(areaKey, a);
    }
    for (const c of obras[p.slug]?.contratos ?? []) {
      const y = years.get(c.contrato_id);
      if (y && c.valor) byYear.set(y, (byYear.get(y) ?? 0) + c.valor);
    }
    // 1 068 rows travel to the browser : the area's label lives once in
    // section.areas, the client looks it up by key.
    return {
      slug: p.slug,
      name: titleCasePt(p.nome),
      kind_fr: titleCasePt(p.tipo || p.familia),
      famille: fam,
      arrondissement: 0,
      areaKey,
      lat: p.lat,
      lon: p.lon,
      n_lieu: null,
      n_moments: 0,
      argent_total_eur: v,
      photo: p.photo ?? null,
    };
  });
  const ys = [...byYear.keys()].sort((a, b) => a - b);
  const since = ys[0] ?? new Date().getFullYear();
  const lastYear = ys[ys.length - 1] ?? since;
  // A year without a works contract is a zero, not an unpublished year : the rail says so.
  const series: { year: number; amount: number }[] = [];
  for (let y = since; y <= lastYear; y++) series.push({ year: y, amount: byYear.get(y) ?? 0 });
  const generatedAt = (f as unknown as { generated_at?: string }).generated_at ?? null;
  _cache = {
    lieux,
    section: {
      count: f.places.length,
      withMoney,
      total,
      since,
      lastYear,
      oldestArchive: null,
      families: [...families.values()].sort((a, b) => b.amount - a.amount),
      arrondissements: [],
      areas: [...areas.values()].sort((a, b) => a.label.localeCompare(b.label, "pt-BR")),
      series,
    },
    generatedAt,
    source: f.source,
  };
  return _cache;
}

/** The title and the sentence of the section page, for robots (pt / en). */
export function recifeLugaresAnswer(r: RecifeLieux, locale: SiteLocale): PageAnswer {
  const s = r.section;
  const total = fmtBrlCompact(s.total);
  const date = isoDate(r.generatedAt, locale);
  const src = r.source.name ?? "Dados Abertos da Prefeitura do Recife";
  if (locale === "pt") {
    return {
      title: `Lugares do Recife: ${total} em obras contratadas em ${s.withMoney} equipamentos`,
      answer:
        `${count("equipamento", s.count, "pt")} da Prefeitura do Recife — unidades de saúde, escolas, cultura, esporte e praças — no mapa e com endereço; ` +
        `em ${s.withMoney} deles, ${total} em contratos de obras que citam o lugar, de ${s.since} a ${s.lastYear}. ` +
        sourceSentence("pt", src, date),
    };
  }
  return {
    title: `Recife places: ${total} in works contracted at ${s.withMoney} facilities`,
    answer:
      `${count("City of Recife facility", s.count, "en", "City of Recife facilities")} — health units, schools, culture, sport and squares — on the map, with their address; ` +
      `at ${s.withMoney} of them, ${total} in works contracts naming the place, ${s.since} to ${s.lastYear}. ` +
      sourceSentence("en", src, date),
  };
}
