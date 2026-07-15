import { ImageResponse } from "next/og";

import { loadQuiRecoitData } from "@/lib/fusion-data";

export const runtime = "nodejs";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "France Open Data — Subventions de la Ville de Paris";

const fmtFr = (n: number) => n.toLocaleString("fr-FR");
const fmtBnFr = (n: number) =>
  (n / 1e9).toLocaleString("fr-FR", { maximumFractionDigits: 2, minimumFractionDigits: 2 });

export default async function SubventionsOG() {
  const d = loadQuiRecoitData();
  const totalDisplay = `${fmtBnFr(d.total)} Md€`;
  const nbDisplay = fmtFr(d.nbSubventions);

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
          <div style={{ display: "flex" }}>France Open Data · /subventions</div>
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
          Subventions · Ville de Paris · {d.year}
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
          Qui reçoit l'argent public ?
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
              Montant versé {d.year}
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
              {totalDisplay}
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
              Subventions versées
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
              {nbDisplay}
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
          <div style={{ display: "flex" }}>Source Paris Open Data · Comptes M57</div>
          <div style={{ display: "flex" }}>franceopendata.org/ville/paris/subventions</div>
        </div>
      </div>
    ),
    { ...size },
  );
}
