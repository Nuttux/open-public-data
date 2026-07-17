"use client";

import { useT } from "@/lib/localeContext";

/**
 * Shared FY2018-break note (SF-BUILD-PLAN cross-cutting rule 1): San
 * Francisco migrated its financial system to PeopleSoft at FY2018 —
 * contract numbers, nonprofit flags, program detail and vendor granularity
 * all start or change there. Every kinked series must render this note or
 * readers will invent policy stories. Identical component path across SF
 * blocks; the orchestrator reconciles duplicates at merge.
 */
export default function Fy2018Note({ variant = "block" }: { variant?: "block" | "inline" }) {
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
    <div
      style={{
        margin: "14px 0 0",
        padding: "12px 16px",
        border: "1px solid var(--rule)",
        background: "var(--bg)",
        fontFamily: "var(--f-ui)",
        fontSize: 13,
        lineHeight: 1.55,
        color: "var(--ink-2)",
      }}
    >
      <span
        style={{
          fontFamily: "var(--f-mono)",
          fontSize: 10.5,
          letterSpacing: ".08em",
          textTransform: "uppercase",
          color: "var(--muted)",
          marginRight: 8,
        }}
      >
        {t("us.sf.fy2018.kicker")}
      </span>
      {t("us.sf.fy2018.body")}
    </div>
  );
}
