"use client";

import type { ReactNode } from "react";
import { useT } from "@/lib/localeContext";

/**
 * Shared FY2018 systems-break note (SF build plan, cross-cutting rule 1):
 * the City migrated its financial system to PeopleSoft in FY2018 —
 * contract numbers, nonprofit flags, program detail and vendor
 * granularity all start or change shape that year. Every SF page whose
 * series kink at FY2018 renders this ONE note (identical component path
 * across blocks; copy lives in the shared us.sf.fy2018.* keys), or
 * readers will invent policy stories for what is a systems migration.
 *
 * `extra` lets a page append its own dataset-specific breaks in the same
 * callout (e.g. payroll's FY2017 department-label break).
 */
export default function Fy2018Note({ extra }: { extra?: ReactNode }) {
  const t = useT();
  return (
    <div className="fx-callout">
      <b>{t("us.sf.fy2018.title")}</b> {t("us.sf.fy2018.body")}
      {extra}
    </div>
  );
}
