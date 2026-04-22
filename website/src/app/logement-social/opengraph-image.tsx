import { ImageResponse } from "next/og";

import { loadLogementSocialData } from "@/lib/fusion-data";

export const runtime = "nodejs";
export const alt = "Logement social à Paris — France Open Data";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const fr = (n: number) => new Intl.NumberFormat("fr-FR").format(n);
const frDec = (n: number, d = 1) =>
  new Intl.NumberFormat("fr-FR", {
    minimumFractionDigits: d,
    maximumFractionDigits: d,
  }).format(n);

/**
 * Social share card — /logement-social.
 * Production chiffres (year-aware) vs DRIHL demand pressure (fixed 2024).
 */
export default async function OG() {
  const d = loadLogementSocialData();

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
            marginTop: 28,
            fontSize: 16,
            letterSpacing: 3,
            textTransform: "uppercase",
            color: "#666",
            display: "flex",
          }}
        >
          Logement social · Ville de Paris · {d.year}
        </div>

        <div
          style={{
            marginTop: 16,
            fontSize: 62,
            fontWeight: 800,
            color: "#111",
            lineHeight: 1.05,
            letterSpacing: -2,
            maxWidth: 1060,
            display: "flex",
            flexWrap: "wrap",
            gap: "0 14px",
          }}
        >
          <span>{fr(d.nouveauxParAn)} logements produits face à</span>
          <span style={{ color: "#b8551c" }}>
            {fr(d.tension.demandesActives)}
          </span>
          <span>demandes.</span>
        </div>

        <div style={{ flex: 1 }} />

        <div style={{ display: "flex", alignItems: "flex-end", gap: 56 }}>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div
              style={{
                fontSize: 16,
                color: "#666",
                letterSpacing: 2,
                textTransform: "uppercase",
              }}
            >
              {`Logements financés · ${d.year}`}
            </div>
            <div
              style={{
                fontSize: 92,
                fontWeight: 800,
                color: "#111",
                letterSpacing: -2,
                lineHeight: 1,
              }}
            >
              {fr(d.nouveauxParAn)}
            </div>
          </div>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div
              style={{
                fontSize: 16,
                color: "#666",
                letterSpacing: 2,
                textTransform: "uppercase",
              }}
            >
              Ratio tension
            </div>
            <div
              style={{
                fontSize: 92,
                fontWeight: 800,
                color: "#b8551c",
                letterSpacing: -2,
                lineHeight: 1,
              }}
            >
              {`${d.tension.ratio}:1`}
            </div>
          </div>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div
              style={{
                fontSize: 16,
                color: "#666",
                letterSpacing: 2,
                textTransform: "uppercase",
              }}
            >
              Délai médian
            </div>
            <div
              style={{
                fontSize: 92,
                fontWeight: 800,
                color: "#111",
                letterSpacing: -2,
                lineHeight: 1,
                display: "flex",
                alignItems: "baseline",
                gap: 10,
              }}
            >
              {frDec(d.tension.delaiMedian)}
              <span style={{ fontSize: 36, fontWeight: 700, color: "#666" }}>ans</span>
            </div>
          </div>
        </div>

        <div
          style={{
            marginTop: 36,
            paddingTop: 18,
            borderTop: "2px solid #111",
            fontSize: 14,
            color: "#666",
            letterSpacing: 2,
            textTransform: "uppercase",
            display: "flex",
          }}
        >
          Sources · DRIHL Île-de-France · Comptes administratifs · franceopendata.org
        </div>
      </div>
    ),
    { ...size },
  );
}
