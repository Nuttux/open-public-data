import { ImageResponse } from "next/og";

import { loadRecettesApu } from "@/lib/recettes-apu";

export const runtime = "nodejs";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "Recette publique — France Open Data";

const fmtMdEur = (n: number) =>
  n.toLocaleString("fr-FR", { maximumFractionDigits: 1, minimumFractionDigits: 1 });

const subsectorLabel = (code: "S1311" | "S1313" | "S1314") =>
  code === "S1311" ? "État central (S1311)" : code === "S1313" ? "Collectivités locales (S1313)" : "Sécurité sociale (S1314)";

export default async function RecetteOG({ params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  const decoded = decodeURIComponent(key);
  const data = loadRecettesApu();

  let label = "Recette publique";
  let amountMd = 0;
  let parent = "";
  let source = "";
  if (data) {
    for (const code of ["S1311", "S1313", "S1314"] as const) {
      const found = data.institutions[code].items.find((it) => it.key === decoded);
      if (found) {
        label = found.label_fr;
        amountMd = found.annual_eur / 1e9;
        parent = subsectorLabel(code);
        source = found.source;
        break;
      }
    }
    if (decoded === "ue_fonds_recus" && data.europe) {
      label = "Fonds européens reçus";
      amountMd = data.europe.fonds_recus_md_eur;
      parent = "Union européenne";
      source = data.europe.fonds_source;
    }
  }

  const totalDisplay = `${fmtMdEur(amountMd)} Md€`;

  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", background: "#faf9f5", padding: "64px 72px", fontFamily: "sans-serif" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14, fontSize: 18, letterSpacing: 4, textTransform: "uppercase", color: "#b8551c" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 32, height: 32, background: "#111", color: "#faf9f5", fontSize: 18, fontWeight: 800 }}>FO</div>
          <div style={{ display: "flex" }}>France Open Data · /fr/national/budget/recettes</div>
        </div>

        <div style={{ display: "flex", marginTop: 56, fontSize: 14, letterSpacing: 3, textTransform: "uppercase", color: "#666" }}>
          Recette publique · {parent}
        </div>
        <div style={{ display: "flex", marginTop: 14, fontSize: 64, fontWeight: 800, color: "#111", lineHeight: 1.1, letterSpacing: -1.8, maxWidth: 1040 }}>
          {label}
        </div>

        <div style={{ display: "flex", flex: 1 }} />

        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", fontSize: 13, color: "#666", letterSpacing: 2, textTransform: "uppercase" }}>Montant annuel</div>
          <div style={{ display: "flex", fontSize: 110, fontWeight: 800, color: "#111", letterSpacing: -3, lineHeight: 1, marginTop: 8 }}>{totalDisplay}</div>
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", marginTop: 32, paddingTop: 16, borderTop: "2px solid #111", fontSize: 14, color: "#666", letterSpacing: 2, textTransform: "uppercase" }}>
          <div style={{ display: "flex", maxWidth: 800 }}>{source ? `Source · ${source.slice(0, 80)}` : "Source : pipeline France Open Data"}</div>
          <div style={{ display: "flex" }}>franceopendata.org/fr/national/budget/recettes</div>
        </div>
      </div>
    ),
    { ...size },
  );
}
