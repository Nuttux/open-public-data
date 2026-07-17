"use client";

import type { ReactNode } from "react";
import { useT } from "@/lib/localeContext";

/**
 * Shared FY2018 systems-break note (SF build plan, cross-cutting rule 1):
 * San Francisco migrated its financial system to PeopleSoft at FY2018 —
 * contract numbers, nonprofit flags, program detail and vendor granularity
 * all start or change shape that year. Every SF page whose series kink at
 * FY2018 renders this ONE note (copy lives in the shared us.sf.fy2018.*
 * keys), or readers will invent policy stories for a systems migration.
 *
 * `variant="inline"` is the one-line ⓘ form for fiches/drawers;
 * `extra` lets a page append its own dataset-specific breaks in the same
 * callout (e.g. payroll's FY2017 department-label break).
 */
export default function Fy2018Note({
  variant = "block",
  extra,
}: {
  variant?: "block" | "inline";
  extra?: ReactNode;
}) {
  const t = useT();

  if (variant === "inline") {
    return (
      <span
        style={{
          fontFamily: "var(--f-mono)",
          fontSize: 10.5,
          letterSpacing: ".06em",
          textTransform: "uppercase",
          color: "var(--muted)",
          cursor: "help",
        }}
        title={t("us.sf.fy2018.body")}
      >
        {t("us.sf.fy2018.short")} ⓘ
      </span>
    );
  }

  return (
    <div className="fx-callout">
      <b>{t("us.sf.fy2018.title")}</b> {t("us.sf.fy2018.body")}
      {extra}
    </div>
  );
}
