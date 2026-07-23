import { ImageResponse } from "next/og";
import { ogMark } from "@/components/og/OgMark";

import { loadFournisseur } from "@/lib/fusion-data";

export const runtime = "nodejs";
export const alt = "Fournisseur — Qipu";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const fmtEur = (n: number) => {
  if (n >= 1e9) return `${(n / 1e9).toFixed(2).replace(".", ",")} Md€`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(1).replace(".", ",")} M€`;
  if (n >= 1e3) return `${Math.round(n / 1000).toLocaleString("fr-FR")} k€`;
  return `${n.toLocaleString("fr-FR")} €`;
};

export default async function OG({ params }: { params: Promise<{ siren: string }> }) {
  const { siren } = await params;
  const f = loadFournisseur(siren);

  const nom = f?.nom || "Fournisseur";
  const total = f ? fmtEur(f.totalAmount) : "—";
  const nb = f?.contratCount ?? 0;
  const years = f?.yearsActive?.length
    ? `${Math.min(...f.yearsActive)}–${Math.max(...f.yearsActive)}`
    : "";

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
          Qipu
        </div>

        <div
          style={{
            marginTop: 30,
            fontSize: 16,
            letterSpacing: 3,
            textTransform: "uppercase",
            color: "#666",
          }}
        >
          Fournisseur de la Ville de Paris
        </div>

        <div
          style={{
            marginTop: 18,
            fontSize: 72,
            fontWeight: 800,
            color: "#111",
            lineHeight: 1.05,
            letterSpacing: -2,
            maxWidth: 1050,
            display: "-webkit-box",
            WebkitLineClamp: 2,
            WebkitBoxOrient: "vertical",
            overflow: "hidden",
          }}
        >
          {nom}
        </div>

        <div style={{ flex: 1 }} />

        <div style={{ display: "flex", alignItems: "flex-end", gap: 56 }}>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div style={{ fontSize: 16, color: "#666", letterSpacing: 2, textTransform: "uppercase" }}>
              Cumul Paris
            </div>
            <div style={{ fontSize: 92, fontWeight: 800, color: "#111", letterSpacing: -2, lineHeight: 1 }}>
              {total}
            </div>
          </div>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div style={{ fontSize: 16, color: "#666", letterSpacing: 2, textTransform: "uppercase" }}>
              Contrats
            </div>
            <div style={{ fontSize: 92, fontWeight: 800, color: "#111", letterSpacing: -2, lineHeight: 1 }}>
              {nb}
            </div>
          </div>
          {years && (
            <div style={{ display: "flex", flexDirection: "column" }}>
              <div style={{ fontSize: 16, color: "#666", letterSpacing: 2, textTransform: "uppercase" }}>
                Années actives
              </div>
              <div style={{ fontSize: 42, fontWeight: 700, color: "#111", letterSpacing: -0.5, lineHeight: 1 }}>
                {years}
              </div>
            </div>
          )}
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
          }}
        >
          Source DECP · data.gouv.fr
        </div>
      </div>
    ),
    { ...size },
  );
}
