import { ImageResponse } from "next/og";

import { loadThemeSubventions } from "@/lib/fusion-data";

export const runtime = "nodejs";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "Thème subventions — France Open Data";

const fmtEur = (n: number) => {
  if (n >= 1e9) return `${(n / 1e9).toFixed(2).replace(".", ",")} Md€`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(1).replace(".", ",")} M€`;
  if (n >= 1e3) return `${Math.round(n / 1000).toLocaleString("fr-FR")} k€`;
  return `${n.toLocaleString("fr-FR")} €`;
};

const fmtPct = (n: number) =>
  n.toLocaleString("fr-FR", { maximumFractionDigits: 1, minimumFractionDigits: 1 });

export default async function ThemeOG({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const d = loadThemeSubventions(slug);

  const themeName = d?.theme ?? "Thème";
  const total = d ? fmtEur(d.total) : "—";
  const nb = d?.nbSubventions ?? 0;
  const pct = d ? fmtPct(d.shareOfTotalPct) : "—";
  const year = d?.year ?? "";

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
        <div style={{ display: "flex", alignItems: "center", gap: 14, fontSize: 18, letterSpacing: 4, textTransform: "uppercase", color: "#b8551c" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 32, height: 32, background: "#111", color: "#faf9f5", fontSize: 18, fontWeight: 800 }}>FO</div>
          <div style={{ display: "flex" }}>France Open Data · /subventions/thème</div>
        </div>

        <div style={{ display: "flex", marginTop: 56, fontSize: 14, letterSpacing: 3, textTransform: "uppercase", color: "#666" }}>
          Thème · Ville de Paris · {year}
        </div>
        <div style={{ display: "flex", marginTop: 14, fontSize: 72, fontWeight: 800, color: "#111", lineHeight: 1.05, letterSpacing: -2, maxWidth: 1040 }}>
          {themeName}
        </div>

        <div style={{ display: "flex", flex: 1 }} />

        <div style={{ display: "flex", gap: 60, alignItems: "flex-end" }}>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div style={{ display: "flex", fontSize: 13, color: "#666", letterSpacing: 2, textTransform: "uppercase" }}>Montant versé {year}</div>
            <div style={{ display: "flex", fontSize: 92, fontWeight: 800, color: "#111", letterSpacing: -2.5, lineHeight: 1, marginTop: 6 }}>{total}</div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", paddingBottom: 14 }}>
            <div style={{ display: "flex", fontSize: 13, color: "#666", letterSpacing: 2, textTransform: "uppercase" }}>Subventions</div>
            <div style={{ display: "flex", fontSize: 48, fontWeight: 700, color: "#666", letterSpacing: -1.2, lineHeight: 1, marginTop: 6 }}>{nb.toLocaleString("fr-FR")}</div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", paddingBottom: 14 }}>
            <div style={{ display: "flex", fontSize: 13, color: "#666", letterSpacing: 2, textTransform: "uppercase" }}>Part du total</div>
            <div style={{ display: "flex", fontSize: 48, fontWeight: 700, color: "#b8551c", letterSpacing: -1.2, lineHeight: 1, marginTop: 6 }}>{pct} %</div>
          </div>
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", marginTop: 32, paddingTop: 16, borderTop: "2px solid #111", fontSize: 14, color: "#666", letterSpacing: 2, textTransform: "uppercase" }}>
          <div style={{ display: "flex" }}>Source Paris Open Data · Comptes M57</div>
          <div style={{ display: "flex" }}>franceopendata.org/.../subventions/theme</div>
        </div>
      </div>
    ),
    { ...size },
  );
}
