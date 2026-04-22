import { ImageResponse } from "next/og";

import { loadAssociation, loadSubventionVulgarization } from "@/lib/fusion-data";

export const runtime = "nodejs";
export const alt = "Association — France Open Data";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const fmtEur = (n: number) => {
  if (n >= 1e9) return `${(n / 1e9).toFixed(2).replace(".", ",")} Md€`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(1).replace(".", ",")} M€`;
  if (n >= 1e3) return `${Math.round(n / 1000).toLocaleString("fr-FR")} k€`;
  return `${n.toLocaleString("fr-FR")} €`;
};

/**
 * Social share card — rendered server-side via next/og.
 * Matches the 06-fusion visual language : warm off-white, heavy
 * display type, ocre accents, attribution at bottom.
 */
export default async function OG({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const asso = loadAssociation(slug);
  const vulg = asso ? loadSubventionVulgarization(asso.name) : null;

  const nom = asso?.name ?? "Association";
  const total = asso ? fmtEur(asso.totalAmount) : "—";
  const nb = asso?.subventionCount ?? 0;
  const years = asso?.yearsActive?.length
    ? `${Math.min(...asso.yearsActive)}–${Math.max(...asso.yearsActive)}`
    : "";
  const theme = asso?.theme ?? "";
  const hook = vulg?.activite_claire?.slice(0, 120) ?? "";

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
            marginTop: 30,
            fontSize: 16,
            letterSpacing: 3,
            textTransform: "uppercase",
            color: "#666",
            display: "flex",
          }}
        >
          Bénéficiaire de subventions · Ville de Paris
          {theme && <span style={{ marginLeft: 12, color: "#b8551c" }}>· {theme}</span>}
        </div>

        <div
          style={{
            marginTop: 18,
            fontSize: 68,
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

        {hook && (
          <div
            style={{
              marginTop: 18,
              fontSize: 24,
              lineHeight: 1.35,
              color: "#444",
              maxWidth: 1000,
              display: "-webkit-box",
              WebkitLineClamp: 2,
              WebkitBoxOrient: "vertical",
              overflow: "hidden",
            }}
          >
            {hook}
          </div>
        )}

        <div style={{ flex: 1 }} />

        <div style={{ display: "flex", alignItems: "flex-end", gap: 56 }}>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div style={{ fontSize: 16, color: "#666", letterSpacing: 2, textTransform: "uppercase" }}>
              Cumul reçu
            </div>
            <div style={{ fontSize: 96, fontWeight: 800, color: "#111", letterSpacing: -2, lineHeight: 1 }}>
              {total}
            </div>
          </div>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div style={{ fontSize: 16, color: "#666", letterSpacing: 2, textTransform: "uppercase" }}>
              Subventions
            </div>
            <div style={{ fontSize: 96, fontWeight: 800, color: "#111", letterSpacing: -2, lineHeight: 1 }}>
              {nb}
            </div>
          </div>
          {years && (
            <div style={{ display: "flex", flexDirection: "column" }}>
              <div style={{ fontSize: 16, color: "#666", letterSpacing: 2, textTransform: "uppercase" }}>
                Actif
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
            display: "flex",
          }}
        >
          Source · opendata.paris.fr / franceopendata.org
        </div>
      </div>
    ),
    { ...size },
  );
}
