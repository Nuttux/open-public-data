import "server-only";
import { Storage } from "@google-cloud/storage";

/**
 * Shared authenticated GCS client for the private commune buckets
 * (qipu-communes-budget / -marches / -investissements / -evolution).
 *
 * Auth resolution, in order:
 *   1. GCP_SA_KEY_B64 — base64-encoded service-account JSON. For hosts WITHOUT
 *      Application Default Credentials (e.g. Vercel serverless): the key is
 *      decoded and passed as `credentials`. This is what makes the national
 *      bucket-backed pages work in production.
 *   2. Application Default Credentials — local dev (`gcloud auth
 *      application-default login`) or GOOGLE_APPLICATION_CREDENTIALS on a host.
 *
 * A malformed key falls back to ADC rather than crashing the render.
 */
let _storage: Storage | null = null;

export function communeStorage(): Storage {
  if (_storage) return _storage;
  const projectId =
    process.env.GCP_PROJECT ?? process.env.BQ_PROJECT ?? "open-data-france-484717";
  const b64 = process.env.GCP_SA_KEY_B64;
  if (b64) {
    try {
      const credentials = JSON.parse(Buffer.from(b64, "base64").toString("utf8"));
      _storage = new Storage({ projectId: credentials.project_id ?? projectId, credentials });
      return _storage;
    } catch {
      // Malformed key → fall through to ADC.
    }
  }
  _storage = new Storage({ projectId });
  return _storage;
}
