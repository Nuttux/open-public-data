#!/usr/bin/env node
/**
 * Hydrate public/data from the PRIVATE site-data bucket.
 *
 * The site's JSON exports (~123 MB, 243 files) are NOT committed to the repo —
 * they live in gs://qipu-site-data. This runs at build time (package.json
 * `prebuild`) and can be run manually for local dev (`npm run hydrate:data`).
 *
 * Auth, in priority order:
 *   1. GCP_SA_KEY_B64 — base64-encoded service-account JSON key. Used on build
 *      hosts with no filesystem creds (e.g. Vercel env var). Read-only SA on the
 *      site-data bucket.
 *   2. Application Default Credentials — `gcloud auth application-default login`
 *      locally, or GOOGLE_APPLICATION_CREDENTIALS pointing at a key file.
 * Without any of these it fails loudly — a fork cannot hydrate, which is the
 * point: self-host is documented, not automatic.
 *
 * Flags/env:
 *   SITE_DATA_BUCKET   (default: qipu-site-data)
 *   SITE_DATA_PREFIX   (default: data)
 *   GCP_SA_KEY_B64     base64 service-account JSON (build hosts w/o file creds)
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

// Prefer an explicit SA key from the env (Vercel has no ADC / metadata server);
// fall back to Application Default Credentials for local dev.
const projectId = process.env.GCP_PROJECT ?? process.env.BQ_PROJECT ?? "open-data-france-484717";
let credentials;
if (process.env.GCP_SA_KEY_B64) {
  try {
    credentials = JSON.parse(Buffer.from(process.env.GCP_SA_KEY_B64, "base64").toString("utf8"));
  } catch (e) {
    console.error("✗ GCP_SA_KEY_B64 is set but not valid base64-encoded JSON:", e?.message ?? e);
    process.exit(1);
  }
}
const storage = new Storage(credentials ? { projectId, credentials } : { projectId });

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
