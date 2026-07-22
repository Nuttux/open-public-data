#!/usr/bin/env node
/**
 * Hydrate public/data from the PRIVATE site-data bucket.
 *
 * The site's JSON exports (~123 MB, 243 files) are NOT committed to the repo —
 * they live in gs://qipu-site-data. This runs at build time (package.json
 * `prebuild`) and can be run manually for local dev (`npm run hydrate:data`).
 *
 * Auth: Application Default Credentials — `gcloud auth application-default
 * login` locally, or GOOGLE_APPLICATION_CREDENTIALS / a service account on the
 * build host (e.g. Vercel env). Without credentials this fails loudly — a fork
 * cannot hydrate, which is the point: self-host is documented, not automatic.
 *
 * Flags/env:
 *   SITE_DATA_BUCKET   (default: qipu-site-data)
 *   SITE_DATA_PREFIX   (default: data)
 *   --if-missing       skip files already present locally (fast local re-runs)
 */
import { Storage } from "@google-cloud/storage";
import { mkdir, access } from "node:fs/promises";
import { constants } from "node:fs";
import { dirname, join } from "node:path";

const BUCKET = process.env.SITE_DATA_BUCKET ?? "qipu-site-data";
const PREFIX = process.env.SITE_DATA_PREFIX ?? "data";
const IF_MISSING = process.argv.includes("--if-missing");
const PUBLIC_DIR = join(process.cwd(), "public"); // objects `data/…` → public/data/…

const storage = new Storage({
  projectId: process.env.GCP_PROJECT ?? process.env.BQ_PROJECT ?? "open-data-france-484717",
});

async function exists(p) {
  try {
    await access(p, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

async function main() {
  const [files] = await storage.bucket(BUCKET).getFiles({ prefix: `${PREFIX}/` });
  const objs = files.filter((f) => !f.name.endsWith("/"));
  console.log(
    `→ Hydrating ${objs.length} objects from gs://${BUCKET}/${PREFIX} → public/${PREFIX}` +
      (IF_MISSING ? " (skipping existing)" : ""),
  );

  let done = 0;
  let skipped = 0;
  const CONCURRENCY = 24;
  for (let i = 0; i < objs.length; i += CONCURRENCY) {
    const batch = objs.slice(i, i + CONCURRENCY);
    await Promise.all(
      batch.map(async (f) => {
        const dest = join(PUBLIC_DIR, f.name);
        if (IF_MISSING && (await exists(dest))) {
          skipped++;
          return;
        }
        await mkdir(dirname(dest), { recursive: true });
        await f.download({ destination: dest });
        done++;
      }),
    );
  }
  console.log(`✓ hydrated ${done} file(s)${skipped ? `, skipped ${skipped} existing` : ""}`);
}

main().catch((err) => {
  console.error("✗ hydrate-data failed:", err?.message ?? err);
  console.error(
    "  Need GCP credentials with read access to the site-data bucket " +
      "(gcloud auth application-default login, or a service account). See ADDING-A-PLACE.md.",
  );
  process.exit(1);
});
