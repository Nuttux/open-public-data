import { ImageResponse } from "next/og";

// US-surface OpenGraph card. Neutral working-title branding — the US brand
// is deliberately undecided (ADR-0010), so this must NOT carry the France
// Open Data name or domain. Applies to /us and every child route that does
// not define its own opengraph-image.
export const runtime = "nodejs";
export const alt = "US Public Data Explorer — public money, followed to the source";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OG() {
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
            color: "#1e45e4",
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
              fontSize: 16,
              fontWeight: 800,
            }}
          >
            US
          </div>
          Public Data Explorer · working title
        </div>

        <div
          style={{
            marginTop: 48,
            fontSize: 78,
            fontWeight: 800,
            color: "#111",
            lineHeight: 1.03,
            letterSpacing: -2.5,
            maxWidth: 1040,
          }}
        >
          Public money, followed to the source
        </div>

        <div style={{ flex: 1 }} />

        <div style={{ display: "flex", alignItems: "flex-end", gap: 64 }}>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div style={{ fontSize: 15, color: "#666", letterSpacing: 2, textTransform: "uppercase" }}>
              National
            </div>
            <div style={{ fontSize: 60, fontWeight: 800, color: "#111", letterSpacing: -1.5, lineHeight: 1 }}>
              The federal dollar
            </div>
          </div>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div style={{ fontSize: 15, color: "#666", letterSpacing: 2, textTransform: "uppercase" }}>
              City
            </div>
            <div style={{ fontSize: 60, fontWeight: 800, color: "#111", letterSpacing: -1.5, lineHeight: 1 }}>
              San Francisco
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
          <span>Sourced to official records + the Internet Archive</span>
          <span>One engine, many places</span>
        </div>
      </div>
    ),
    { ...size },
  );
}
