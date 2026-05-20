import { ImageResponse } from "next/og";

export const runtime = "nodejs";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "France Open Data — Méthode";

export default async function MethodeOG() {
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
          <div style={{ display: "flex" }}>France Open Data · /methode</div>
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
          Méthode · D&apos;où viennent les chiffres
        </div>
        <div
          style={{
            display: "flex",
            marginTop: 14,
            fontSize: 70,
            fontWeight: 800,
            color: "#111",
            lineHeight: 1.05,
            letterSpacing: -2.5,
            maxWidth: 1040,
          }}
        >
          Chaque chiffre, sa source.
        </div>

        <div
          style={{
            display: "flex",
            marginTop: 28,
            fontSize: 24,
            color: "#333",
            lineHeight: 1.35,
            maxWidth: 1040,
          }}
        >
          Architecture pipeline ouverte : sources publiques → transformation dbt → vérification → publication. Tout est reproductible.
        </div>

        <div style={{ display: "flex", flex: 1 }} />

        <div
          style={{
            display: "flex",
            gap: 40,
            fontSize: 16,
            color: "#444",
            letterSpacing: 1,
          }}
        >
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div style={{ display: "flex", color: "#b8551c", fontSize: 12, letterSpacing: 2, textTransform: "uppercase" }}>01</div>
            <div style={{ display: "flex", marginTop: 4, fontWeight: 600 }}>Source</div>
            <div style={{ display: "flex", marginTop: 2, fontSize: 14, color: "#666" }}>OpenData Paris, Eurostat, INSEE</div>
          </div>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div style={{ display: "flex", color: "#b8551c", fontSize: 12, letterSpacing: 2, textTransform: "uppercase" }}>02</div>
            <div style={{ display: "flex", marginTop: 4, fontWeight: 600 }}>Transformation</div>
            <div style={{ display: "flex", marginTop: 2, fontSize: 14, color: "#666" }}>dbt · raw → stg → core → mart</div>
          </div>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div style={{ display: "flex", color: "#b8551c", fontSize: 12, letterSpacing: 2, textTransform: "uppercase" }}>03</div>
            <div style={{ display: "flex", marginTop: 4, fontWeight: 600 }}>Vérification</div>
            <div style={{ display: "flex", marginTop: 2, fontSize: 14, color: "#666" }}>tests dbt, audits manuels</div>
          </div>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div style={{ display: "flex", color: "#b8551c", fontSize: 12, letterSpacing: 2, textTransform: "uppercase" }}>04</div>
            <div style={{ display: "flex", marginTop: 4, fontWeight: 600 }}>Publication</div>
            <div style={{ display: "flex", marginTop: 2, fontSize: 14, color: "#666" }}>JSON ouverts, code AGPL</div>
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
          <div style={{ display: "flex" }}>Promesse · zéro chiffre hardcodé · zéro source masquée</div>
          <div style={{ display: "flex" }}>franceopendata.org/methode</div>
        </div>
      </div>
    ),
    { ...size },
  );
}
