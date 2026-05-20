import { ImageResponse } from "next/og";

import { loadArrondissement } from "@/lib/fusion-data";

export const runtime = "nodejs";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "Arrondissement — investissements Ville de Paris";

const fmtEur = (n: number) => {
  if (n >= 1e9) return `${(n / 1e9).toFixed(2).replace(".", ",")} Md€`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(1).replace(".", ",")} M€`;
  if (n >= 1e3) return `${Math.round(n / 1000).toLocaleString("fr-FR")} k€`;
  return `${n.toLocaleString("fr-FR")} €`;
};

const suffix = (n: number) => (n === 1 ? "er" : "ᵉ");

export default async function ArrondissementInvestOG({ params }: { params: Promise<{ num: string }> }) {
  const { num } = await params;
  const arrNum = Number(num);
  const d = Number.isInteger(arrNum) ? loadArrondissement(arrNum) : null;
  const arrLabel = Number.isInteger(arrNum) ? `${arrNum}${suffix(arrNum)} arrondissement` : "Arrondissement";
  const total = d ? fmtEur(d.total) : "—";
  const nbProjets = d?.nbProjets ?? 0;
  const rank = d?.rank ?? null;
  const year = d?.year ?? "";

  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", background: "#faf9f5", padding: "64px 72px", fontFamily: "sans-serif" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14, fontSize: 18, letterSpacing: 4, textTransform: "uppercase", color: "#b8551c" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 32, height: 32, background: "#111", color: "#faf9f5", fontSize: 18, fontWeight: 800 }}>FO</div>
          <div style={{ display: "flex" }}>France Open Data · /investissements/arrondissement</div>
        </div>

        <div style={{ display: "flex", marginTop: 56, fontSize: 14, letterSpacing: 3, textTransform: "uppercase", color: "#666" }}>Investissements · Ville de Paris · {year}</div>
        <div style={{ display: "flex", marginTop: 14, fontSize: 78, fontWeight: 800, color: "#111", lineHeight: 1.05, letterSpacing: -2.5, maxWidth: 1040 }}>{arrLabel}</div>

        <div style={{ display: "flex", flex: 1 }} />

        <div style={{ display: "flex", gap: 60, alignItems: "flex-end" }}>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div style={{ display: "flex", fontSize: 13, color: "#666", letterSpacing: 2, textTransform: "uppercase" }}>Investi dans l&apos;arrondissement</div>
            <div style={{ display: "flex", fontSize: 92, fontWeight: 800, color: "#111", letterSpacing: -2.5, lineHeight: 1, marginTop: 6 }}>{total}</div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", paddingBottom: 14 }}>
            <div style={{ display: "flex", fontSize: 13, color: "#666", letterSpacing: 2, textTransform: "uppercase" }}>Projets</div>
            <div style={{ display: "flex", fontSize: 48, fontWeight: 700, color: "#666", letterSpacing: -1.2, lineHeight: 1, marginTop: 6 }}>{nbProjets.toLocaleString("fr-FR")}</div>
          </div>
          {rank ? (
            <div style={{ display: "flex", flexDirection: "column", paddingBottom: 14 }}>
              <div style={{ display: "flex", fontSize: 13, color: "#666", letterSpacing: 2, textTransform: "uppercase" }}>Rang sur 20</div>
              <div style={{ display: "flex", fontSize: 48, fontWeight: 700, color: "#b8551c", letterSpacing: -1.2, lineHeight: 1, marginTop: 6 }}>#{rank}</div>
            </div>
          ) : null}
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", marginTop: 32, paddingTop: 16, borderTop: "2px solid #111", fontSize: 14, color: "#666", letterSpacing: 2, textTransform: "uppercase" }}>
          <div style={{ display: "flex" }}>Source Paris Open Data · Annexes IL CA M57</div>
          <div style={{ display: "flex" }}>franceopendata.org/.../investissements/arrondissement</div>
        </div>
      </div>
    ),
    { ...size },
  );
}
