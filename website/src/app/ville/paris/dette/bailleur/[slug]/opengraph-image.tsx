import { ImageResponse } from "next/og";

import { loadBailleur } from "@/lib/fusion-data";

export const runtime = "nodejs";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "Bailleur — Ville de Paris (engagements hors-bilan)";

const fmtEur = (n: number) => {
  if (n >= 1e9) return `${(n / 1e9).toFixed(2).replace(".", ",")} Md€`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(1).replace(".", ",")} M€`;
  if (n >= 1e3) return `${Math.round(n / 1000).toLocaleString("fr-FR")} k€`;
  return `${n.toLocaleString("fr-FR")} €`;
};

export default async function BailleurOG({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const d = loadBailleur(slug);
  const name = d?.name ?? "Bailleur";
  const type = d?.type ?? "";
  const share = typeof d?.share === "number" ? d.share : null;
  const garanties = d?.garanties;
  const capitalRestant = garanties?.capital_restant ?? 0;
  const nbEmprunts = garanties?.count_emprunts ?? 0;
  const yearGaranties = garanties?.year ?? "";

  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", background: "#faf9f5", padding: "64px 72px", fontFamily: "sans-serif" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14, fontSize: 18, letterSpacing: 4, textTransform: "uppercase", color: "#b8551c" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 32, height: 32, background: "#111", color: "#faf9f5", fontSize: 18, fontWeight: 800 }}>FO</div>
          <div style={{ display: "flex" }}>France Open Data · /dette/bailleur</div>
        </div>

        <div style={{ display: "flex", marginTop: 56, fontSize: 14, letterSpacing: 3, textTransform: "uppercase", color: "#666" }}>
          Engagements hors-bilan · Ville de Paris {yearGaranties ? `· ${yearGaranties}` : ""} {type ? `· ${type}` : ""}
        </div>
        <div style={{ display: "flex", marginTop: 14, fontSize: 72, fontWeight: 800, color: "#111", lineHeight: 1.05, letterSpacing: -2, maxWidth: 1040 }}>{name}</div>

        <div style={{ display: "flex", flex: 1 }} />

        <div style={{ display: "flex", gap: 60, alignItems: "flex-end" }}>
          {capitalRestant > 0 ? (
            <div style={{ display: "flex", flexDirection: "column" }}>
              <div style={{ display: "flex", fontSize: 13, color: "#666", letterSpacing: 2, textTransform: "uppercase" }}>Capital restant dû garanti</div>
              <div style={{ display: "flex", fontSize: 92, fontWeight: 800, color: "#111", letterSpacing: -2.5, lineHeight: 1, marginTop: 6 }}>{fmtEur(capitalRestant)}</div>
            </div>
          ) : null}
          {nbEmprunts > 0 ? (
            <div style={{ display: "flex", flexDirection: "column", paddingBottom: 14 }}>
              <div style={{ display: "flex", fontSize: 13, color: "#666", letterSpacing: 2, textTransform: "uppercase" }}>Emprunts garantis</div>
              <div style={{ display: "flex", fontSize: 48, fontWeight: 700, color: "#666", letterSpacing: -1.2, lineHeight: 1, marginTop: 6 }}>{nbEmprunts.toLocaleString("fr-FR")}</div>
            </div>
          ) : null}
          {share != null ? (
            <div style={{ display: "flex", flexDirection: "column", paddingBottom: 14 }}>
              <div style={{ display: "flex", fontSize: 13, color: "#666", letterSpacing: 2, textTransform: "uppercase" }}>Part du parc social</div>
              <div style={{ display: "flex", fontSize: 48, fontWeight: 700, color: "#b8551c", letterSpacing: -1.2, lineHeight: 1, marginTop: 6 }}>{share} %</div>
            </div>
          ) : null}
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", marginTop: 32, paddingTop: 16, borderTop: "2px solid #111", fontSize: 14, color: "#666", letterSpacing: 2, textTransform: "uppercase" }}>
          <div style={{ display: "flex" }}>Source Paris Open Data · Annexe IV-B dette garantie</div>
          <div style={{ display: "flex" }}>franceopendata.org/.../dette/bailleur</div>
        </div>
      </div>
    ),
    { ...size },
  );
}
