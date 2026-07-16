import { ImageResponse } from "next/og";

import { loadPatrimoineData } from "@/lib/fusion-data";

export const runtime = "nodejs";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "France Open Data — Dette & patrimoine de la Ville de Paris";

const fmtFr = (n: number) => n.toLocaleString("fr-FR");
const fmtBnFr = (n: number) =>
  (n / 1e9).toLocaleString("fr-FR", { maximumFractionDigits: 2, minimumFractionDigits: 2 });

const PARIS_POPULATION = 2_133_000;

export default async function DetteOG() {
  const d = loadPatrimoineData();
  const detteDisplay = `${fmtBnFr(d.detteFinanciere)} Md€`;
  const perHab = `${fmtFr(Math.round(d.detteFinanciere / PARIS_POPULATION))} €/hab`;

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
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: 32,
              height: 32,
              background: "#111",
              color: "#faf9f5",
              fontSize: 18,
              fontWeight: 800,
            }}
          >
            FO
          </div>
          <div style={{ display: "flex" }}>France Open Data · /dette</div>
        </div>

        <div
          style={{
            display: "flex",
            marginTop: 56,
            fontSize: 14,
            letterSpacing: 3,
            textTransform: "uppercase",
            color: "#666",
          }}
        >
          Dette & patrimoine · Ville de Paris · {d.year}
        </div>
        <div
          style={{
            display: "flex",
            marginTop: 14,
            fontSize: 78,
            fontWeight: 800,
            color: "#111",
            lineHeight: 1.05,
            letterSpacing: -2.5,
            maxWidth: 1040,
          }}
        >
          Combien Paris doit-il, à qui ?
        </div>

        <div style={{ display: "flex", flex: 1 }} />

        <div style={{ display: "flex", gap: 80, alignItems: "flex-end" }}>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div
              style={{
                display: "flex",
                fontSize: 13,
                color: "#666",
                letterSpacing: 2,
                textTransform: "uppercase",
              }}
            >
              Dette financière {d.year}
            </div>
            <div
              style={{
                display: "flex",
                fontSize: 96,
                fontWeight: 800,
                color: "#111",
                letterSpacing: -2.5,
                lineHeight: 1,
                marginTop: 6,
              }}
            >
              {detteDisplay}
            </div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", paddingBottom: 14 }}>
            <div
              style={{
                display: "flex",
                fontSize: 13,
                color: "#666",
                letterSpacing: 2,
                textTransform: "uppercase",
              }}
            >
              Par habitant
            </div>
            <div
              style={{
                display: "flex",
                fontSize: 56,
                fontWeight: 700,
                color: "#666",
                letterSpacing: -1.2,
                lineHeight: 1,
                marginTop: 6,
              }}
            >
              {perHab}
            </div>
          </div>
        </div>

        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            marginTop: 32,
            paddingTop: 16,
            borderTop: "2px solid #111",
            fontSize: 14,
            color: "#666",
            letterSpacing: 2,
            textTransform: "uppercase",
          }}
        >
          <div style={{ display: "flex" }}>Source Paris Open Data · Bilan M57</div>
          <div style={{ display: "flex" }}>franceopendata.org/fr/city/paris/dette</div>
        </div>
      </div>
    ),
    { ...size },
  );
}
