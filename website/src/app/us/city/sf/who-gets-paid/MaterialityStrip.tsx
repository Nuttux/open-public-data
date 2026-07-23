"use client";

import SectionHead from "@/components/fusion/SectionHead";
import { useT } from "@/lib/localeContext";
import { fmtUsdCompact } from "@/lib/us/format";
import { deptDisplay } from "./bucket";
import type { WgpFile } from "./wgp-types";

/**
 * Section 03 — "what a payment actually buys": the six curated ledger
 * lines (jail meals, election interpreters, Port lumber, Fire uniforms,
 * Muni light-rail cars, homelessness building purchases). Amounts come
 * from the export, which computes them from the voucher data — the seed
 * only picks which lines to feature (zero-hardcode).
 */

const fill = (s: string, vars: Record<string, string | number>) => {
  let r = s;
  for (const [k, v] of Object.entries(vars)) r = r.split(`{${k}}`).join(String(v));
  return r;
};

export default function MaterialityStrip({
  materiality,
}: {
  materiality: WgpFile["materiality"];
}) {
  const t = useT();
  if (!materiality.items.length) return null;

  return (
    <section className="fx-section" id="sec-materiality">
      <div className="fx-wrap">
        <SectionHead
          title={
            <>
              {t("us.sf.wgp.s03.title.before")}
              <em>{t("us.sf.wgp.s03.title.em")}</em>
            </>
          }
          subtitle={t("us.sf.wgp.s03.sub")}
        />
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
            gap: 14,
          }}
        >
          {materiality.items.map((it) => (
            <div
              key={it.slug}
              style={{
                border: "1px solid var(--rule)",
                borderTop: "2px solid var(--ink)",
                background: "var(--bg)",
                padding: "16px 18px 14px",
                display: "flex",
                flexDirection: "column",
                gap: 8,
              }}
            >
              <div
                className="tnum"
                style={{ fontSize: 26, fontWeight: 700, letterSpacing: "-.01em" }}
              >
                {fmtUsdCompact(it.amount_usd)}
              </div>
              <div style={{ fontWeight: 600, fontSize: 14.5, lineHeight: 1.35 }}>
                {it.label}
              </div>
              {it.editorial_note && (
                <div style={{ fontSize: 12.5, color: "var(--muted-2)", lineHeight: 1.5 }}>
                  {it.editorial_note}
                </div>
              )}
              <div
                style={{
                  marginTop: "auto",
                  fontFamily: "var(--f-mono)",
                  fontSize: 10.5,
                  letterSpacing: ".03em",
                  color: "var(--muted)",
                  lineHeight: 1.55,
                }}
              >
                {fill(t("us.sf.wgp.s03.meta"), {
                  vendor: it.vendor,
                  department: deptDisplay(it.department),
                })}
                <br />
                {it.sub_object} · FY{it.fiscal_year}
                {it.execution_status !== "closed" && " · preliminary"}
              </div>
            </div>
          ))}
        </div>
        <p className="fx-note" style={{ marginTop: 14 }}>
          {materiality.note}
        </p>
      </div>
    </section>
  );
}
