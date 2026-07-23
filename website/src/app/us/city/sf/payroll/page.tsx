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
} from "./payroll-types";

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
export const metadata: Metadata = {
  title: { absolute: "US · San Francisco — Payroll" },
  description:
    "San Francisco's $6.9B city payroll: 13 years of compensation, the " +
    "overtime pattern in 24/7 services, and what city work pays from " +
    "custodian to chief — from the SF Controller's employee compensation " +
    "data, aggregates only (no group under 5 people).",
};

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

  return (
    <PayrollClient
      byYear={byYear}
      byDept={byDept}
      distribution={distribution}
      overtime={overtime}
      byFamily={byFamily}
    />
  );
}
