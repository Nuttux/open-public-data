import { ImageResponse } from "next/og";

import { loadArrondissementLogement } from "@/lib/fusion-data";

export const runtime = "nodejs";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "Arrondissement — logement social Paris";

export default async function ArrondissementLogementOG({ params }: { params: Promise<{ arr: string }> }) {
  const { arr } = await params;
  const d = loadArrondissementLogement(arr);
  const label = d?.label ?? "Arrondissement";
  const nbLogements = d?.totalLogements ?? 0;
  const nbOperations = d?.nbOperations ?? 0;
  const rank = d?.rank ?? null;
  const year = d?.year ?? "";

  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", background: "#faf9f5", padding: "64px 72px", fontFamily: "sans-serif" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14, fontSize: 18, letterSpacing: 4, textTransform: "uppercase", color: "#b8551c" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 32, height: 32, background: "#111", color: "#faf9f5", fontSize: 18, fontWeight: 800 }}>FO</div>
          <div style={{ display: "flex" }}>France Open Data · /logement/arrondissement</div>
        </div>

        <div style={{ display: "flex", marginTop: 56, fontSize: 14, letterSpacing: 3, textTransform: "uppercase", color: "#666" }}>Logement social · Ville de Paris · {year}</div>
        <div style={{ display: "flex", marginTop: 14, fontSize: 78, fontWeight: 800, color: "#111", lineHeight: 1.05, letterSpacing: -2.5, maxWidth: 1040 }}>{label}</div>

        <div style={{ display: "flex", flex: 1 }} />

        <div style={{ display: "flex", gap: 60, alignItems: "flex-end" }}>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div style={{ display: "flex", fontSize: 13, color: "#666", letterSpacing: 2, textTransform: "uppercase" }}>Logements financés {year}</div>
            <div style={{ display: "flex", fontSize: 92, fontWeight: 800, color: "#111", letterSpacing: -2.5, lineHeight: 1, marginTop: 6 }}>{nbLogements.toLocaleString("fr-FR")}</div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", paddingBottom: 14 }}>
            <div style={{ display: "flex", fontSize: 13, color: "#666", letterSpacing: 2, textTransform: "uppercase" }}>Opérations</div>
            <div style={{ display: "flex", fontSize: 48, fontWeight: 700, color: "#666", letterSpacing: -1.2, lineHeight: 1, marginTop: 6 }}>{nbOperations.toLocaleString("fr-FR")}</div>
          </div>
          {rank ? (
            <div style={{ display: "flex", flexDirection: "column", paddingBottom: 14 }}>
              <div style={{ display: "flex", fontSize: 13, color: "#666", letterSpacing: 2, textTransform: "uppercase" }}>Rang</div>
              <div style={{ display: "flex", fontSize: 48, fontWeight: 700, color: "#b8551c", letterSpacing: -1.2, lineHeight: 1, marginTop: 6 }}>#{rank}</div>
            </div>
          ) : null}
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", marginTop: 32, paddingTop: 16, borderTop: "2px solid #111", fontSize: 14, color: "#666", letterSpacing: 2, textTransform: "uppercase" }}>
          <div style={{ display: "flex" }}>Source Paris Open Data · DDT Paris</div>
          <div style={{ display: "flex" }}>franceopendata.org/.../logement/arrondissement</div>
        </div>
      </div>
    ),
    { ...size },
  );
}
