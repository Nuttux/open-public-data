import { ImageResponse } from "next/og";
import { ogMark } from "@/components/og/OgMark";

import { loadCorrections } from "@/lib/corrections";

export const runtime = "nodejs";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "Qipu — Corrections publiques";

export default async function CorrectionsOG() {
  const doc = await loadCorrections();
  const nb = doc.entries.length;
  const latest = doc.entries[0]; // déjà trié antéchronologique
  const latestDate = latest
    ? new Intl.DateTimeFormat("fr-FR", { year: "numeric", month: "long", day: "numeric", timeZone: "UTC" }).format(
        new Date(latest.date + "T00:00:00Z"),
      )
    : null;

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
          {ogMark()}
          <div style={{ display: "flex" }}>Qipu · /corrections</div>
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
          Historique public · transparence éditoriale
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
          Tout ce qu&apos;on a corrigé.
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
              Corrections publiées
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
              {nb}
            </div>
          </div>
          {latestDate ? (
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
                Dernière en date
              </div>
              <div
                style={{
                  display: "flex",
                  fontSize: 40,
                  fontWeight: 700,
                  color: "#666",
                  lineHeight: 1.1,
                  marginTop: 6,
                  maxWidth: 600,
                }}
              >
                {latestDate}
              </div>
            </div>
          ) : null}
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
          <div style={{ display: "flex" }}>Chaque correction · datée · sourcée · publique</div>
          <div style={{ display: "flex" }}>qipu.org/corrections</div>
        </div>
      </div>
    ),
    { ...size },
  );
}
