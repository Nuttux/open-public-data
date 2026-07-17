import type { Metadata } from "next";
import fs from "node:fs";
import path from "node:path";
import "@/app/fusion.css";
import PayrollClient from "./PayrollClient";
import type {
  PayrollByYear,
  PayrollByDept,
  PayrollDistribution,
  PayrollOvertime,
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
  title: { absolute: "San Francisco · Payroll — what city work pays" },
  description:
    "San Francisco's $6.9B city payroll: 13 years of compensation, the " +
    "overtime pattern in 24/7 services, and what city work pays from " +
    "custodian to chief — from the SF Controller's employee compensation " +
    "data, aggregates only (no group under 5 people).",
};

const DATA_DIR = path.join(process.cwd(), "public", "data", "us", "sf");

function readJson<T>(file: string): T {
  const raw = fs.readFileSync(path.join(DATA_DIR, file), "utf8");
  return JSON.parse(raw) as T;
}

export default function SfPayrollPage() {
  const byYear = readJson<PayrollByYear>("payroll_by_year.json");
  const byDept = readJson<PayrollByDept>("payroll_by_dept_year.json");
  const distribution = readJson<PayrollDistribution>("payroll_distribution.json");
  const overtime = readJson<PayrollOvertime>("payroll_overtime.json");

  return (
    <PayrollClient
      byYear={byYear}
      byDept={byDept}
      distribution={distribution}
      overtime={overtime}
    />
  );
}
