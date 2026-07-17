"use client";

import { useT } from "@/lib/localeContext";

/**
 * THE shared FY2018-break méthode note (SF-BUILD-PLAN cross-cutting rule 1).
 *
 * Every SF page whose series kink at FY2018 renders this ONE component, or
 * readers will invent policy stories where there is only a system migration:
 * in FY2018 the City moved its financial system to PeopleSoft, and contract
 * numbers, nonprofit flags, program detail and vendor granularity all start
 * or change that year — the chart of accounts itself switched from legacy
 * numeric codes to the modern mnemonics.
 *
 * Blocks 2-4 import this same path (components/us/Fy2018Note.tsx); copy
 * changes are reconciled at merge by the orchestrator.
 */
export default function Fy2018Note({ id = "fy2018-note" }: { id?: string }) {
  const t = useT();
  const bullets = [
    t("us.sf.fy2018.b.accounts"),
    t("us.sf.fy2018.b.programs"),
    t("us.sf.fy2018.b.contracts"),
    t("us.sf.fy2018.b.vendors"),
  ];
  return (
    <div
      id={id}
      className="fx-callout"
      role="note"
      style={{ marginTop: 18 }}
    >
      <b>{t("us.sf.fy2018.title")}</b> {t("us.sf.fy2018.intro")}
      <ul style={{ margin: "10px 0 0", paddingLeft: 18, display: "grid", gap: 4 }}>
        {bullets.map((b, i) => (
          <li key={i} style={{ lineHeight: 1.5 }}>{b}</li>
        ))}
      </ul>
      <p style={{ margin: "10px 0 0" }}>{t("us.sf.fy2018.consequence")}</p>
    </div>
  );
}
