"use client";

import type { ReactNode } from "react";
import { useT } from "@/lib/localeContext";

/**
 * THE shared FY2018 systems-break note (SF build plan, cross-cutting rule 1):
 * in FY2018 the City moved its financial system to PeopleSoft, and contract
 * numbers, nonprofit flags, program detail and vendor granularity all start
 * or change that year — the chart of accounts itself switched from legacy
 * numeric codes to the modern mnemonics. Every SF page whose series kink at
 * FY2018 renders this ONE component (copy lives in the shared us.sf.fy2018.*
 * keys), or readers will invent policy stories for a systems migration.
 *
 * `variant="inline"` is the one-line ⓘ form for fiches/drawers; `extra`
 * lets a page append its own dataset-specific breaks in the same callout
 * (e.g. payroll's FY2017 department-label break); `id` gives pages a
 * stable in-page anchor (defaults to "fy2018-note").
 */
export default function Fy2018Note({
  variant = "block",
  extra,
  id,
}: {
  variant?: "block" | "inline";
  extra?: ReactNode;
  id?: string;
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

  const bullets = [
    t("us.sf.fy2018.b.accounts"),
    t("us.sf.fy2018.b.programs"),
    t("us.sf.fy2018.b.contracts"),
    t("us.sf.fy2018.b.vendors"),
  ];

  return (
    <div id={id ?? "fy2018-note"} className="fx-callout" role="note" style={{ marginTop: 18 }}>
      <b>{t("us.sf.fy2018.title")}</b> {t("us.sf.fy2018.intro")}
      <ul style={{ margin: "10px 0 0", paddingLeft: 18, display: "grid", gap: 4 }}>
        {bullets.map((b, i) => (
          <li key={i} style={{ lineHeight: 1.5 }}>{b}</li>
        ))}
      </ul>
      <p style={{ margin: "10px 0 0" }}>{t("us.sf.fy2018.consequence")}</p>
      {extra}
    </div>
  );
}
