import type { Metadata } from "next";
import "@/app/fusion.css";
import { readDataJson } from "@/lib/data/read";
import UsNationalClient from "./UsNationalClient";
import type { UsDailyBread, UsDebtSeriesFile, UsDebtSlim } from "./us-types";

/**
 * /us/national — server component. Loads the pipeline exports from
 * public/data/us/national/ at render time (same fs pattern as the France
 * pages) and hands a slimmed payload to the client. EN-only (ADR-0010).
 *
 * `title.absolute` — this page must not inherit the "· Qipu"
 * template from the root layout; the US side has no public brand yet
 * (working title only).
 */
export const metadata: Metadata = {
  title: "United States — Federal budget",
  description:
    "Federal receipts by source, outlays by budget function, the deficit and the national debt since 1790 — from the U.S. Treasury's Monthly Treasury Statement, Debt to the Penny and Census Bureau population estimates.",
};

function readJson<T>(file: string): T {
  return readDataJson<T>(`us/national/${file}`);
}

export default function UsNationalPage() {
  const db = readJson<UsDailyBread>("daily_bread.json");
  const debtFile = readJson<UsDebtSeriesFile>("debt_series.json");

  // Drop the 400-point month_end series — the page shows the annual arc
  // plus the latest daily observation (the export's notes forbid splicing).
  const debt: UsDebtSlim = {
    as_of: debtFile.as_of,
    latest: debtFile.latest,
    annual: {
      description: debtFile.series.annual_fy_end.description,
      source: debtFile.series.annual_fy_end.source,
      points: debtFile.series.annual_fy_end.points,
    },
    notes: debtFile.notes,
  };

  return <UsNationalClient db={db} debt={debt} />;
}
