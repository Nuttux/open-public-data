"use client";

import Link from "next/link";
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


export default function MaterialityStrip({
  materiality,
  deptHrefs = {},
  vendorSlugMap = {},
}: {
  materiality: WgpFile["materiality"];
  /** dept code → budget fiche href, server-validated (missing = plain text). */
  deptHrefs?: Record<string, string>;
  /** raw vendor string → payee fiche slug, only for the keyed top ~200. */
  vendorSlugMap?: Record<string, string>;
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
                {/* The card named a vendor and a department in dead text.
                 *  Both now open their fiche when one exists — only 2 of the
                 *  6 vendors are keyed payees, so the link is conditional
                 *  rather than assumed. */}
                {(() => {
                  const deptCode = (it.department ?? "").match(/^([A-Z]{2,4})\s/)?.[1] ?? "";
                  const deptHref = deptHrefs[deptCode];
                  const payeeSlug = vendorSlugMap[it.vendor];
                  const vendorEl = payeeSlug ? (
                    <Link
                      href={`/us/city/sf/who-gets-paid/payee/${payeeSlug}`}
                      scroll={false}
                      style={{ color: "var(--bleu)", borderBottom: "1px solid var(--bleu)" }}
                    >
                      {it.vendor}
                    </Link>
                  ) : (
                    it.vendor
                  );
                  const deptEl = deptHref ? (
                    <Link
                      href={deptHref}
                      scroll={false}
                      style={{ color: "var(--bleu)", borderBottom: "1px solid var(--bleu)" }}
                    >
                      {deptDisplay(it.department)}
                    </Link>
                  ) : (
                    deptDisplay(it.department)
                  );
                  return (
                    <>
                      {vendorEl} · {deptEl}
                    </>
                  );
                })()}
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
