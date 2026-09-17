import "server-only";
import manifest from "@/data/br-municipios-manifest.json";
import { communeStorage } from "@/lib/commune-gcs";
import type { BudgetData } from "@/lib/br/recife-data";

/**
 * Every Brazilian município (2026-09-18): the manifest the site ships
 * (slug → identity, years, latest totals) and the budget file read from the
 * private bucket, in the same shape as Recife's budget.json (BudgetData) so
 * the Recife budget page renders any município.
 * Pipeline: sync_br_siconfi.py → dbt (stg/core/mart_br_municipio_*) → export_br_municipios.py.
 */

export type MunicipioMeta = {
  id: string;
  nome: string;
  uf: string;
  pop: number | null;
  anos: number[];
  pago: number;
  hab: number | null;
  /** A state capital. */
  cap?: boolean;
  /** Net revenue of the latest year that has one (SICONFI Anexo I-C), and that year. */
  rec?: number;
  rec_ano?: number;
};

type Manifest = { generated_at: string; source: string; municipios: Record<string, MunicipioMeta> };
const M = manifest as Manifest;

const BUCKET_NAME = process.env.COMMUNE_DATA_BUCKET ?? "qipu-communes-budget";
const PREFIX = "br-municipios";

/** When the manifest was generated : the pages' date for the sitemap. */
export function brMunicipiosGeneratedAt(): string {
  return M.generated_at;
}

export function findMunicipio(slug: string): (MunicipioMeta & { slug: string }) | null {
  const m = M.municipios[slug];
  return m ? { ...m, slug } : null;
}

export function listMunicipios(): (MunicipioMeta & { slug: string })[] {
  return Object.entries(M.municipios).map(([slug, m]) => ({ ...m, slug }));
}

/** The municípios of the same state with the closest population, for the peers block. */
export function municipioPeers(slug: string, n = 5): (MunicipioMeta & { slug: string })[] {
  const me = findMunicipio(slug);
  if (!me || !me.pop) return [];
  return listMunicipios()
    .filter((m) => m.slug !== slug && m.uf === me.uf && m.pop && m.hab)
    .sort((a, b) => Math.abs(Math.log((a.pop as number) / (me.pop as number))) - Math.abs(Math.log((b.pop as number) / (me.pop as number))))
    .slice(0, n);
}

export type MunicipioBudget = BudgetData & { municipio: { id: string; nome: string; uf: string; nome_uf: string; regiao: string; slug: string } };

const memo = new Map<string, MunicipioBudget | null>();

/** The município's budget file from the bucket ; `COMMUNE_DATA_LOCAL_DIR` reads
 *  `<dir>/br-municipios/<id>.json` instead (a local copy of a few files). */
export async function loadMunicipioBudget(id: string): Promise<MunicipioBudget | null> {
  const key = `${PREFIX}/${id}.json`;
  if (memo.has(key)) return memo.get(key) ?? null;
  const localDir = process.env.COMMUNE_DATA_LOCAL_DIR;
  try {
    let text: string;
    if (localDir) {
      const fs = await import("node:fs/promises");
      text = await fs.readFile(`${localDir}/${key}`, "utf8");
    } else {
      const [buf] = await communeStorage().bucket(BUCKET_NAME).file(key).download();
      text = buf.toString("utf8");
    }
    const val = JSON.parse(text) as MunicipioBudget;
    memo.set(key, val);
    return val;
  } catch {
    memo.set(key, null);
    return null;
  }
}
