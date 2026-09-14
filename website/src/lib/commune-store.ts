import { communeStorage } from "@/lib/commune-gcs";

/**
 * Lecture d'un objet JSON du bucket privé des communes, par chemin d'objet
 * (`communes-budget/pantin/budget_index.json`…), mémoïsée par instance.
 *
 * Confort de développement : avec `COMMUNE_DATA_LOCAL_DIR`, le même chemin est
 * lu dans ce dossier local (`<dir>/<slug>/<fichier>`, le préfixe de bucket
 * retiré) — quelques communes copiées suffisent, sans identifiants GCS. Une
 * seule implémentation pour le budget, l'évolution, l'investissement et les
 * marchés, pour que le mode local couvre toute la page ville.
 */
const BUCKET_NAME = process.env.COMMUNE_DATA_BUCKET ?? "qipu-communes-budget";
const memo = new Map<string, unknown>();

export async function readCommuneJson<T>(objectPath: string): Promise<T | null> {
  if (memo.has(objectPath)) return memo.get(objectPath) as T | null;
  const localDir = process.env.COMMUNE_DATA_LOCAL_DIR;
  if (localDir) {
    try {
      const fs = await import("node:fs/promises");
      // `communes-budget/pantin/x.json` → `pantin/x.json` (tous les préfixes
      // partagent le même dossier local, un sous-dossier par commune).
      const rel = objectPath.replace(/^communes-[a-z]+\//, "");
      const val = JSON.parse(await fs.readFile(`${localDir}/${rel}`, "utf8")) as T;
      memo.set(objectPath, val);
      return val;
    } catch {
      memo.set(objectPath, null);
      return null;
    }
  }
  try {
    const [buf] = await communeStorage().bucket(BUCKET_NAME).file(objectPath).download();
    const val = JSON.parse(buf.toString("utf8")) as T;
    memo.set(objectPath, val);
    return val;
  } catch {
    memo.set(objectPath, null); // objet absent ou accès refusé → traité comme absent
    return null;
  }
}

/**
 * Lecture d'un objet texte du bucket (les segments du sitemap des contrats,
 * une adresse par ligne), mêmes règles que readCommuneJson : dossier local
 * avec COMMUNE_DATA_LOCAL_DIR, sinon le bucket ; absent → null.
 */
export async function readCommuneText(objectPath: string): Promise<string | null> {
  const key = `text:${objectPath}`;
  if (memo.has(key)) return memo.get(key) as string | null;
  const localDir = process.env.COMMUNE_DATA_LOCAL_DIR;
  let val: string | null = null;
  try {
    if (localDir) {
      const fs = await import("node:fs/promises");
      val = await fs.readFile(`${localDir}/${objectPath.replace(/^communes-[a-z]+\//, "")}`, "utf8");
    } else {
      const [buf] = await communeStorage().bucket(BUCKET_NAME).file(objectPath).download();
      val = buf.toString("utf8");
    }
  } catch {
    val = null;
  }
  memo.set(key, val);
  return val;
}
