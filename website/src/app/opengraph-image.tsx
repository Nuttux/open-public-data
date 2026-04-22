import { ImageResponse } from "next/og";

import { loadLandingStats } from "@/lib/fusion-data";

export const runtime = "nodejs";
export const alt = "France Open Data — où va l'argent public";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const fmtFr = (n: number) => n.toLocaleString("fr-FR");
const fmtBnFr = (n: number) => (n / 1e9).toFixed(1).replace(".", ",");

export default async function OG() {
  const stats = loadLandingStats();
  const budget = fmtBnFr(stats.totalDepenses);
  const nbMarches = fmtFr(Math.floor(stats.nbMarchesCumul / 1000) * 1000);
  const nbSubventions = fmtFr(Math.floor(stats.nbSubventionsCumul / 1000) * 1000);

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          background: "#faf9f5",
          padding: "72px 80px",
          fontFamily: "sans-serif",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 14,
            fontSize: 18,
            letterSpacing: 4,
            textTransform: "uppercase",
            color: "#b8551c",
          }}
        >
          <div
            style={{
              width: 32,
              height: 32,
              background: "#111",
              color: "#faf9f5",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 18,
              fontWeight: 800,
            }}
          >
            FO
          </div>
          France Open Data
        </div>

        <div
          style={{
            marginTop: 48,
            fontSize: 82,
            fontWeight: 800,
            color: "#111",
            lineHeight: 1.02,
            letterSpacing: -2.5,
            maxWidth: 1040,
          }}
        >
          Où va l'argent public à Paris ?
        </div>

        <div style={{ flex: 1 }} />

        <div style={{ display: "flex", alignItems: "flex-end", gap: 64 }}>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div style={{ fontSize: 15, color: "#666", letterSpacing: 2, textTransform: "uppercase" }}>
              {`Budget ${stats.year}`}
            </div>
            <div style={{ fontSize: 86, fontWeight: 800, color: "#111", letterSpacing: -2, lineHeight: 1 }}>
              {`${budget} Md€`}
            </div>
          </div>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div style={{ fontSize: 15, color: "#666", letterSpacing: 2, textTransform: "uppercase" }}>
              Marchés
            </div>
            <div style={{ fontSize: 64, fontWeight: 800, color: "#111", letterSpacing: -1.5, lineHeight: 1 }}>
              {nbMarches}
            </div>
          </div>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div style={{ fontSize: 15, color: "#666", letterSpacing: 2, textTransform: "uppercase" }}>
              Subventions
            </div>
            <div style={{ fontSize: 64, fontWeight: 800, color: "#111", letterSpacing: -1.5, lineHeight: 1 }}>
              {nbSubventions}
            </div>
          </div>
        </div>

        <div
          style={{
            marginTop: 38,
            paddingTop: 18,
            borderTop: "2px solid #111",
            fontSize: 14,
            color: "#666",
            letterSpacing: 2,
            textTransform: "uppercase",
            display: "flex",
            justifyContent: "space-between",
          }}
        >
          <span>Sourcé aux comptes officiels · M57</span>
          <span>franceopendata.fr</span>
        </div>
      </div>
    ),
    { ...size },
  );
}
