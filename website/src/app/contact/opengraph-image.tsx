import { ImageResponse } from "next/og";

export const runtime = "nodejs";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "France Open Data — Contact";

export default async function ContactOG() {
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
          <div style={{ display: "flex" }}>France Open Data · /contact</div>
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
          Une remarque · une correction · une piste
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
          Écrivez-nous.
        </div>

        <div
          style={{
            display: "flex",
            marginTop: 28,
            fontSize: 28,
            color: "#333",
            lineHeight: 1.35,
            maxWidth: 1040,
          }}
        >
          Projet indépendant, ouvert aux contributions. Signalements, questions, presse : on répond dès que possible.
        </div>

        <div style={{ display: "flex", flex: 1 }} />

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
            Contact
          </div>
          <div
            style={{
              display: "flex",
              fontSize: 56,
              fontWeight: 700,
              color: "#111",
              letterSpacing: -1.2,
              lineHeight: 1,
              marginTop: 8,
            }}
          >
            daniel@franceopendata.org
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
          <div style={{ display: "flex" }}>Daniel Shavit · Projet indépendant</div>
          <div style={{ display: "flex" }}>franceopendata.org/contact</div>
        </div>
      </div>
    ),
    { ...size },
  );
}
