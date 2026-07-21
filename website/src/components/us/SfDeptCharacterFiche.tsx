"use client";

import Link from "next/link";
import type { SfDeptCharacterDetailData, SfDeptCharacterVendorRow } from "@/lib/us/sf-budget-data";
import { fmtUsd, fmtUsdCompact, fmtShare } from "@/lib/us/format";
import { useT } from "@/lib/localeContext";
import Tip from "@/components/fusion/Tip";
import { bucketColor, bucketLabelKey, UNCLASSIFIED_COLOR } from "@/app/us/city/sf/who-gets-paid/bucket";

const fill = (s: string, vars: Record<string, string | number>) => {
  let r = s;
  for (const [k, v] of Object.entries(vars)) r = r.split(`{${k}}`).join(String(v));
  return r;
};

function SourceCaption({ label, name, url }: { label: string; name: string; url: string }) {
  return (
    <p
      style={{
        fontFamily: "var(--f-mono)",
        fontSize: 11,
        color: "var(--muted)",
        letterSpacing: ".02em",
        marginTop: 10,
      }}
    >
      <b>{label}:</b>{" "}
      <a href={url} target="_blank" rel="noopener noreferrer" style={{ color: "var(--muted)" }}>
        {name} ↗
      </a>
    </p>
  );
}

function VendorRow({
  v,
  max,
  fy,
  slug,
}: {
  v: SfDeptCharacterVendorRow;
  max: number;
  fy: number;
  slug: string | null;
}) {
  const t = useT();
  const color = v.bucket ? bucketColor(v.bucket) : UNCLASSIFIED_COLOR;
  const inner = (
    <>
      <span style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 6, minWidth: 0 }}>
        <span
          aria-hidden
          style={{ width: 7, height: 7, borderRadius: "50%", background: color, flexShrink: 0 }}
        />
        <span style={{ flex: "1 1 auto", minWidth: "6em" }}>
          {v.vendor}
        </span>
        {v.bucket && (
          <span
            style={{
              fontFamily: "var(--f-mono)",
              fontSize: 9.5,
              color,
              border: `1px solid ${color}`,
              borderRadius: 3,
              padding: "1px 4px",
              flexShrink: 0,
            }}
          >
            {t(bucketLabelKey(v.bucket))}
          </span>
        )}
        {v.is_non_profit && v.bucket !== "nonprofit" && (
          <span
            style={{
              fontFamily: "var(--f-mono)",
              fontSize: 9.5,
              color: "var(--ink-2)",
              border: "1px solid var(--rule)",
              borderRadius: 3,
              padding: "1px 4px",
              flexShrink: 0,
            }}
          >
            {t("us.sf.wgp.row.np_chip")}
          </span>
        )}
      </span>
      <span style={{ position: "relative", height: 9, background: "var(--rule)" }}>
        <span
          style={{
            position: "absolute",
            inset: "0 auto 0 0",
            width: `${Math.max(0, Math.min(100, (v.amount_usd / max) * 100))}%`,
            background: color,
          }}
        />
      </span>
      <span className="tnum" style={{ fontFamily: "var(--f-mono)", fontSize: 12, fontWeight: 600 }}>
        {fmtUsdCompact(v.amount_usd)}
      </span>
    </>
  );

  const rowStyle = {
    display: "grid",
    gridTemplateColumns: "minmax(180px, 2.4fr) minmax(60px, 1fr) auto",
    alignItems: "center",
    gap: 10,
    padding: "6px 4px",
    borderBottom: "1px solid var(--rule)",
    fontFamily: "var(--f-ui)",
    fontSize: 12.5,
  };

  if (slug) {
    return (
      <Link
        href={`/us/city/sf/who-gets-paid/payee/${slug}?year=${fy}`}
        scroll={false}
        className="fx-row-link"
        style={{ ...rowStyle, textDecoration: "none", color: "inherit" }}
      >
        {inner}
      </Link>
    );
  }
  return <div style={rowStyle}>{inner}</div>;
}

/** One raw budget line item (object) row — label · bar · amount. */
function ObjectRow({ o, objMax }: { o: { code: string; label: string; amount_usd: number }; objMax: number }) {
  return (
    <div
      title={o.code}
      style={{
        display: "grid",
        gridTemplateColumns: "minmax(120px, 1fr) minmax(60px, 1.4fr) auto",
        alignItems: "center",
        gap: 10,
        padding: "6px 4px",
        borderBottom: "1px solid var(--rule)",
        fontFamily: "var(--f-ui)",
        fontSize: 12.5,
      }}
    >
      <span>{o.label}</span>
      <span style={{ position: "relative", height: 8, background: "var(--rule)" }}>
        <span
          style={{
            position: "absolute",
            inset: "0 auto 0 0",
            width: `${Math.max(0, Math.min(100, (Math.abs(o.amount_usd) / objMax) * 100))}%`,
            background: o.amount_usd < 0 ? "var(--ocre)" : "var(--ink-2)",
          }}
        />
      </span>
      <span className="tnum" style={{ fontFamily: "var(--f-mono)", fontSize: 11.5 }}>
        {fmtUsdCompact(o.amount_usd)}
      </span>
    </div>
  );
}

/**
 * Third drill level: department → character → this. Two source-distinct
 * blocks, never blended into one number: raw budget line items (objects,
 * same adopted-budget dataset as the rest of the page — no gloss
 * enrichment, shown as-is) and vendor payments (vouchers dataset) matched
 * to the same dept × character cell, the honest floor of the drill.
 */
export default function SfDeptCharacterFiche({
  d,
  vendorSlugMap,
}: {
  d: SfDeptCharacterDetailData;
  vendorSlugMap: Record<string, string>;
}) {
  const t = useT();
  const objMax = Math.max(...d.objects.map((o) => Math.abs(o.amount_usd)), 1);
  // Show the biggest line items by default; fold only the long tail.
  const OBJ_TOP = 8;
  const objectsSorted = [...d.objects].sort(
    (a, b) => Math.abs(b.amount_usd) - Math.abs(a.amount_usd),
  );
  const objTop = objectsSorted.slice(0, OBJ_TOP);
  const objRest = objectsSorted.slice(OBJ_TOP);
  const vendors = d.payments?.vendors ?? [];
  const vendorMax = Math.max(...vendors.map((v) => v.amount_usd), 1);

  return (
    <div>
      <div className="fx-fiche-kpis">
        <div className="fx-fiche-kpi">
          <div className="fx-fiche-kpi-label">
            {fill(t("us.sf.fiche.dc.kpi.amount"), { fy: d.fiscal_year })}
          </div>
          <div className="fx-fiche-kpi-value tnum">{fmtUsdCompact(d.amount_usd)}</div>
        </div>
        <div className="fx-fiche-kpi">
          <div className="fx-fiche-kpi-label">{t("us.sf.fiche.dc.kpi.dept")}</div>
          <div className="fx-fiche-kpi-value" style={{ fontSize: 15, lineHeight: 1.35 }}>
            {d.dept.display_name ?? d.dept.label}
          </div>
        </div>
        <div className="fx-fiche-kpi">
          <div className="fx-fiche-kpi-label">
            <Tip label={t("us.sf.fiche.dc.kpi.matched_tip")}>{t("us.sf.fiche.dc.kpi.matched")}</Tip>
          </div>
          <div className="fx-fiche-kpi-value tnum">
            {d.payments?.matched_pct != null ? fmtShare(d.payments.matched_pct) : "—"}
          </div>
        </div>
        <div className="fx-fiche-kpi">
          <div className="fx-fiche-kpi-label">{t("us.sf.fiche.dc.kpi.vendors")}</div>
          <div className="fx-fiche-kpi-value tnum">{d.payments?.n_vendors ?? 0}</div>
        </div>
      </div>

      {/* Who got paid — vendor payments (vouchers), the floor of the drill */}
      <section className="fx-fiche-section">
        <div className="fx-fiche-h">
          <Tip label={t("us.sf.fiche.dc.payments_expl")}>{t("us.sf.fiche.dc.payments_h")}</Tip>
        </div>
        {d.payments && vendors.length > 0 ? (
          <>
            <div>
              {vendors.map((v) => (
                <VendorRow
                  key={v.vendor}
                  v={v}
                  max={vendorMax}
                  fy={d.fiscal_year}
                  slug={vendorSlugMap[v.vendor] ?? null}
                />
              ))}
            </div>
            {d.payments.other_vendors_n > 0 && (
              <p className="fx-note" style={{ marginTop: 10 }}>
                {fill(t("us.sf.fiche.dc.payments_more"), {
                  n: d.payments.other_vendors_n,
                  usd: fmtUsdCompact(d.payments.other_vendors_usd),
                })}
              </p>
            )}
            <p className="fx-note" style={{ marginTop: 8 }}>
              {fill(t("us.sf.fiche.dc.payments_matched"), {
                paid: fmtUsd(d.payments.total_usd),
                budget: fmtUsd(d.amount_usd),
                pct: d.payments.matched_pct != null ? fmtShare(d.payments.matched_pct) : "—",
              })}
            </p>
            {d.vouchers_source && (
              <SourceCaption
                label={t("us.sf.fiche.dc.payments_src")}
                name={`${d.vouchers_source.name} (${d.vouchers_source.dataset_id})`}
                url={d.vouchers_source.source_url}
              />
            )}
          </>
        ) : (
          <p className="fx-note">
            {t("us.sf.fiche.dc.payments_empty")}{" "}
            <Link
              href="/us/city/sf/payroll"
              style={{ color: "var(--bleu)", borderBottom: "1px solid var(--bleu)", textDecoration: "none" }}
            >
              {t("us.sf.fiche.dc.payments_payroll_link")}
            </Link>
          </p>
        )}
      </section>

      {/* Raw budget line items — same dataset as the rest of the page, no gloss */}
      <section className="fx-fiche-section">
        <div className="fx-fiche-h">
          <Tip label={t("us.sf.fiche.dc.objects_expl")}>{t("us.sf.fiche.dc.objects_h")}</Tip>
        </div>
        <div>
          {objTop.map((o) => (
            <ObjectRow key={o.code} o={o} objMax={objMax} />
          ))}
        </div>
        {objRest.length > 0 && (
          <details style={{ marginTop: 6 }}>
            <summary
              style={{
                cursor: "pointer",
                fontFamily: "var(--f-mono)",
                fontSize: 12,
                color: "var(--ink-2)",
                padding: "8px 0",
              }}
            >
              {fill(t("us.sf.fiche.dc.objects_more"), { n: objRest.length })}
            </summary>
            <div>
              {objRest.map((o) => (
                <ObjectRow key={o.code} o={o} objMax={objMax} />
              ))}
            </div>
          </details>
        )}
        <SourceCaption
          label={t("us.sf.fiche.dc.objects_src")}
          name={`${d.budget_source.name} (${d.budget_source.dataset_id})`}
          url={d.budget_source.source_url}
        />
      </section>
    </div>
  );
}
