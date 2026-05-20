import { ImageResponse } from "next/og";

import { loadMarcheCategorie } from "@/lib/fusion-data";

export const runtime = "nodejs";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "Catégorie marchés — France Open Data";

const fmtEur = (n: number) => {
  if (n >= 1e9) return `${(n / 1e9).toFixed(2).replace(".", ",")} Md€`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(1).replace(".", ",")} M€`;
  if (n >= 1e3) return `${Math.round(n / 1000).toLocaleString("fr-FR")} k€`;
  return `${n.toLocaleString("fr-FR")} €`;
};

export default async function CategorieOG({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const d = loadMarcheCategorie(slug);
  const cat = d?.category ?? "Catégorie";
  const total = d ? fmtEur(d.total) : "—";
  const nbContrats = d?.nbContrats ?? 0;
  const nbTit = d?.nbTitulaires ?? 0;
  const year = d?.year ?? "";

  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", background: "#faf9f5", padding: "64px 72px", fontFamily: "sans-serif" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14, fontSize: 18, letterSpacing: 4, textTransform: "uppercase", color: "#b8551c" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 32, height: 32, background: "#111", color: "#faf9f5", fontSize: 18, fontWeight: 800 }}>FO</div>
          <div style={{ display: "flex" }}>France Open Data · /marchés/catégorie</div>
        </div>

        <div style={{ display: "flex", marginTop: 56, fontSize: 14, letterSpacing: 3, textTransform: "uppercase", color: "#666" }}>Marchés publics · Ville de Paris · {year}</div>
        <div style={{ display: "flex", marginTop: 14, fontSize: 72, fontWeight: 800, color: "#111", lineHeight: 1.05, letterSpacing: -2, maxWidth: 1040 }}>{cat}</div>

        <div style={{ display: "flex", flex: 1 }} />

        <div style={{ display: "flex", gap: 60, alignItems: "flex-end" }}>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div style={{ display: "flex", fontSize: 13, color: "#666", letterSpacing: 2, textTransform: "uppercase" }}>Enveloppe max {year}</div>
            <div style={{ display: "flex", fontSize: 92, fontWeight: 800, color: "#111", letterSpacing: -2.5, lineHeight: 1, marginTop: 6 }}>{total}</div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", paddingBottom: 14 }}>
            <div style={{ display: "flex", fontSize: 13, color: "#666", letterSpacing: 2, textTransform: "uppercase" }}>Contrats</div>
            <div style={{ display: "flex", fontSize: 48, fontWeight: 700, color: "#666", letterSpacing: -1.2, lineHeight: 1, marginTop: 6 }}>{nbContrats.toLocaleString("fr-FR")}</div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", paddingBottom: 14 }}>
            <div style={{ display: "flex", fontSize: 13, color: "#666", letterSpacing: 2, textTransform: "uppercase" }}>Titulaires</div>
            <div style={{ display: "flex", fontSize: 48, fontWeight: 700, color: "#666", letterSpacing: -1.2, lineHeight: 1, marginTop: 6 }}>{nbTit.toLocaleString("fr-FR")}</div>
          </div>
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", marginTop: 32, paddingTop: 16, borderTop: "2px solid #111", fontSize: 14, color: "#666", letterSpacing: 2, textTransform: "uppercase" }}>
          <div style={{ display: "flex" }}>Source DECP · Ville de Paris</div>
          <div style={{ display: "flex" }}>franceopendata.org/.../marchés/catégorie</div>
        </div>
      </div>
    ),
    { ...size },
  );
}
