import type { Metadata } from "next";
import "@/app/fusion.css";
import { readDataJson } from "@/lib/data/read";
import PayrollClient from "./PayrollClient";
import type {
  PayrollByYear,
  PayrollByDept,
  PayrollDistribution,
  PayrollOvertime,
  PayrollByFamilyCitywide,
  PayrollFamilyDistribution,
  PayrollFamilyDistRow,
} from "./payroll-types";
import { answerMetadata } from "@/lib/seo/page-answer";
import { readSiteLocale } from "@/lib/seo";
import { sfPayrollHub, SfHubJsonLd } from "@/lib/seo/sections/sf";

/**
 * /us/city/sf/payroll — server component. Loads the payroll exports from
 * public/data/us/sf/ at render time (same fs pattern as /us/national and
 * the France pages) and hands them to the client. EN-only (ADR-0010 D3).
 *
 * payroll_by_family_year.json (the dept × job-family drill grain, ~2.9MB)
 * is published alongside these files but deliberately NOT loaded here —
 * the v1 page renders citywide/department altitudes only; the drill file
 * exists for reuse and later fiches.
 *
 * `title.absolute` — no France brand template; the US side has no public
 * brand yet (working title only).
 */
export async function generateMetadata(): Promise<Metadata> {
  const locale = await readSiteLocale();
  const hub = sfPayrollHub();
  return answerMetadata(hub.answer, hub.path, locale);
}

function readJson<T>(file: string): T {
  return readDataJson<T>(`us/sf/${file}`);
}

export default function SfPayrollPage() {
  const byYear = readJson<PayrollByYear>("payroll_by_year.json");
  const byDept = readJson<PayrollByDept>("payroll_by_dept_year.json");
  const distribution = readJson<PayrollDistribution>("payroll_distribution.json");
  const overtime = readJson<PayrollOvertime>("payroll_overtime.json");
  // Citywide display_family × year roll-up (~72KB) — powers the families
  // section. The 2.9MB dept×family grain stays unloaded (fiches only).
  const byFamily = readJson<PayrollByFamilyCitywide>("payroll_by_family_citywide.json");

  // The distribution cut by job family (~420KB on disk) — the pay ladder and
  // the "who is paid in this band" panel. Slimmed here to the fields the
  // client actually renders: the file's notes and provenance stay on disk and
  // are linked from the source footer, not shipped in the RSC payload.
  const famDistFile = readJson<PayrollFamilyDistribution>(
    "payroll_family_distribution.json",
  );
  const familyDistribution: Record<string, PayrollFamilyDistRow[]> = {};
  for (const [fyKey, rows] of Object.entries(famDistFile.years)) {
    familyDistribution[fyKey] = rows.map((r) => ({
      display_family: r.display_family,
      is_pooled: r.is_pooled,
      n_people: r.n_people,
      total_compensation_usd: r.total_compensation_usd,
      p25_usd: r.p25_usd,
      p50_usd: r.p50_usd,
      p75_usd: r.p75_usd,
      p90_usd: r.p90_usd,
      n_in_histogram: r.n_in_histogram,
      histogram: r.histogram,
    }));
  }

  return (
    <>
    <SfHubJsonLd hub={sfPayrollHub()} />
    <PayrollClient
      byYear={byYear}
      byDept={byDept}
      distribution={distribution}
      overtime={overtime}
      byFamily={byFamily}
      familyDistribution={familyDistribution}
      familyDistNotes={{
        ladder: famDistFile.ladder_note,
        attribution: famDistFile.attribution_note,
      }}
    />
    </>
  );
}
