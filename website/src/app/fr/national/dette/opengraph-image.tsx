import { ImageResponse } from "next/og";
import { loadEurostatDette } from "@/lib/national-data";

export const runtime = "nodejs";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "Qipu — Dette publique";

const fmt = (n: number) =>
  n.toLocaleString("fr-FR", { maximumFractionDigits: 1, minimumFractionDigits: 1 });
const fmtBn = (mio: number) =>
  (mio / 1000).toLocaleString("fr-FR", { maximumFractionDigits: 0 });

export default async function DetteOG() {
  const data = loadEurostatDette();
  const s13 = data?.fr_series.find((s) => s.code === "S13");
  const lastPct = s13?.pc_gdp[s13.pc_gdp.length - 1]?.v ?? null;
  const lastEur = s13?.mio_eur[s13.mio_eur.length - 1]?.v ?? null;
  const quarter = data?.latest_quarter ?? "";

  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", background: "#faf9f5", padding: "64px 72px", fontFamily: "sans-serif" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14, fontSize: 18, letterSpacing: 4, textTransform: "uppercase", color: "#b8551c" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 32, height: 32, background: "#111", color: "#faf9f5", fontSize: 18, fontWeight: 800 }}>FO</div>
          <div style={{ display: "flex" }}>Qipu · /dette</div>
        </div>

        <div style={{ display: "flex", marginTop: 56, fontSize: 14, letterSpacing: 3, textTransform: "uppercase", color: "#666" }}>
          Dette publique · APU consolidé · {quarter}
        </div>
        <div style={{ display: "flex", marginTop: 14, fontSize: 78, fontWeight: 800, color: "#111", lineHeight: 1.05, letterSpacing: -2.5, maxWidth: 1040 }}>
          Dette publique française : qui doit quoi
        </div>

        <div style={{ display: "flex", flex: 1 }} />

        <div style={{ display: "flex", gap: 56, alignItems: "flex-end" }}>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div style={{ display: "flex", fontSize: 13, color: "#666", letterSpacing: 2, textTransform: "uppercase" }}>Encours total APU</div>
            <div style={{ display: "flex", fontSize: 110, fontWeight: 800, color: "#111", letterSpacing: -3, lineHeight: 1 }}>{lastPct != null ? `${fmt(lastPct)} %` : "—"}</div>
            <div style={{ display: "flex", fontSize: 18, color: "#666", marginTop: 4 }}>du PIB</div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", paddingBottom: 18 }}>
            <div style={{ display: "flex", fontSize: 13, color: "#666", letterSpacing: 2, textTransform: "uppercase" }}>≈</div>
            <div style={{ display: "flex", fontSize: 56, fontWeight: 700, color: "#666", letterSpacing: -1.5, lineHeight: 1, marginTop: 6 }}>{lastEur != null ? `${fmtBn(lastEur)} Mds €` : "—"}</div>
          </div>
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", marginTop: 32, paddingTop: 16, borderTop: "2px solid #111", fontSize: 14, color: "#666", letterSpacing: 2, textTransform: "uppercase" }}>
          <div style={{ display: "flex" }}>Source unique Eurostat · gov_10q_ggdebt</div>
          <div style={{ display: "flex" }}>qipu.org/dette</div>
        </div>
      </div>
    ),
    { ...size },
  );
}
