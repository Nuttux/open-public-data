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
