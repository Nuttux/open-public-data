import { ImageResponse } from "next/og";
import { loadEtatLFI } from "@/lib/national-data";

export const runtime = "nodejs";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "Qipu — Budget de l'État";

const fmtBn = (eur: number) =>
  (eur / 1e9).toLocaleString("fr-FR", { maximumFractionDigits: 1, minimumFractionDigits: 1 });

export default async function EtatOG() {
  const data = loadEtatLFI();
  const totalNet = data?.totals.bg_net_cp ?? 0;
  const totalBrut = data?.totals.bg_brut_cp ?? 0;
  const exercice = data?.exercice ?? "";
  const nMissions = data?.totals.n_missions ?? 0;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          background: "#faf9f5",
          padding: "64px 72px",
          fontFamily: "sans-serif",
        }}
      >
        {/* Brand strip */}
        <div style={{ display: "flex", alignItems: "center", gap: 14, fontSize: 18, letterSpacing: 4, textTransform: "uppercase", color: "#b8551c" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 32, height: 32, background: "#111", color: "#faf9f5", fontSize: 18, fontWeight: 800 }}>FO</div>
          <div style={{ display: "flex" }}>Qipu · /etat</div>
        </div>

        {/* Kicker */}
        <div style={{ display: "flex", marginTop: 56, fontSize: 14, letterSpacing: 3, textTransform: "uppercase", color: "#666" }}>
          Budget Général de l'État · PLF {exercice}
        </div>

        {/* Title */}
        <div style={{ display: "flex", marginTop: 14, fontSize: 78, fontWeight: 800, color: "#111", lineHeight: 1.05, letterSpacing: -2.5, maxWidth: 1040 }}>
          Où va l'argent de l'État
        </div>

        <div style={{ display: "flex", flex: 1 }} />

        {/* KPI row */}
        <div style={{ display: "flex", gap: 56, alignItems: "flex-end" }}>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div style={{ display: "flex", fontSize: 13, color: "#666", letterSpacing: 2, textTransform: "uppercase" }}>Dépenses nettes</div>
            <div style={{ display: "flex", fontSize: 100, fontWeight: 800, color: "#111", letterSpacing: -3, lineHeight: 1 }}>{fmtBn(totalNet)} Mds €</div>
            <div style={{ display: "flex", fontSize: 18, color: "#666", marginTop: 4 }}>hors remboursements & dégrèvements</div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", paddingBottom: 18 }}>
            <div style={{ display: "flex", fontSize: 13, color: "#666", letterSpacing: 2, textTransform: "uppercase" }}>Missions</div>
            <div style={{ display: "flex", fontSize: 56, fontWeight: 700, color: "#666", letterSpacing: -1.5, lineHeight: 1, marginTop: 6 }}>{nMissions}</div>
            <div style={{ display: "flex", fontSize: 14, color: "#999", marginTop: 4 }}>{fmtBn(totalBrut)} Md€ brut</div>
          </div>
        </div>

        {/* Footer */}
        <div style={{ display: "flex", justifyContent: "space-between", marginTop: 32, paddingTop: 16, borderTop: "2px solid #111", fontSize: 14, color: "#666", letterSpacing: 2, textTransform: "uppercase" }}>
          <div style={{ display: "flex" }}>Source data.gouv.fr · PLF {exercice}</div>
          <div style={{ display: "flex" }}>qipu.org/etat</div>
        </div>
      </div>
    ),
    { ...size },
  );
}
