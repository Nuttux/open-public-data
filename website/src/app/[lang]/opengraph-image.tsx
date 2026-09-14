import { ImageResponse } from "next/og";
import { ogMark } from "@/components/og/OgMark";

export const runtime = "nodejs";
export const alt = "Qipu — public money made legible";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

/**
 * Root share card for qipu.org. Brand-level, not city-specific: qipu.org is
 * shared internationally and the product is one platform across many cities, so
 * the card leads with the tagline rather than any single city's figures. Kept
 * data-independent on purpose (no loadLandingStats) so it renders even when the
 * per-city data isn't present at build time.
 */
export default async function OG() {
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
          {ogMark()}
          Qipu
        </div>

        <div style={{ flex: 1 }} />

        <div
          style={{
            display: "flex",
            flexDirection: "column",
            fontSize: 92,
            fontWeight: 800,
            color: "#111",
            lineHeight: 1.02,
            letterSpacing: -3,
          }}
        >
          <div style={{ display: "flex" }}>Public money,</div>
          <div style={{ display: "flex" }}>
            {/* marginRight (not a trailing space) — Satori collapses the space
                between adjacent flex spans, which glued "made" to "legible". */}
            <span style={{ marginRight: 24 }}>made</span>
            <span style={{ color: "#2a3680" }}>legible.</span>
          </div>
        </div>

        <div
          style={{
            marginTop: 30,
            fontSize: 34,
            color: "#555",
            letterSpacing: -0.5,
            maxWidth: 960,
          }}
        >
          Follow where it comes from and where it goes.
        </div>

        <div style={{ flex: 1 }} />

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
          <span>Sourced · verifiable · open-licensed</span>
          <span>qipu.org</span>
        </div>
      </div>
    ),
    { ...size },
  );
}
