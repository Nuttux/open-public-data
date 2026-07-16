import { ImageResponse } from "next/og";

import { getCityOrNull } from "@/lib/cities";
import { loadCommune } from "@/lib/commune-data";

export const runtime = "nodejs";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "France Open Data — finances de la commune";

const fmtFr = (n: number) => n.toLocaleString("fr-FR");
const fmtBnFr = (n: number) =>
  (n / 1e9).toLocaleString("fr-FR", { maximumFractionDigits: 2, minimumFractionDigits: 2 });

export default async function CityOG({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const city = getCityOrNull(slug);
  const data = loadCommune(slug);

  const nom = city?.nom ?? "Commune";
  const region = city?.reg_name ?? "";
  const pop = city?.population ?? 0;

  const latest = data?.city.latest_year;
  const get = (key: string) => {
    if (!data || !latest) return null;
    const pts = data.city.series[key];
    return pts?.find((p) => p.year === latest);
  };
  const dep = get("depenses_totales");
  const dette = get("encours_dette");

  const depDisplay = dep
    ? dep.eur_hab != null
      ? `${fmtFr(Math.round(dep.eur_hab))} €/hab`
      : `${fmtBnFr(dep.montant)} Md€`
    : "—";
  const detteDisplay = dette
    ? dette.eur_hab != null
      ? `${fmtFr(Math.round(dette.eur_hab))} €/hab`
      : `${fmtBnFr(dette.montant)} Md€`
    : "—";

  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", background: "#faf9f5", padding: "64px 72px", fontFamily: "sans-serif" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14, fontSize: 18, letterSpacing: 4, textTransform: "uppercase", color: "#b8551c" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 32, height: 32, background: "#111", color: "#faf9f5", fontSize: 18, fontWeight: 800 }}>FO</div>
          <div style={{ display: "flex" }}>France Open Data</div>
        </div>

        <div style={{ display: "flex", marginTop: 36, fontSize: 14, letterSpacing: 3, textTransform: "uppercase", color: "#666" }}>Commune</div>
        <div style={{ display: "flex", marginTop: 8, fontSize: 110, fontWeight: 800, color: "#111", lineHeight: 1, letterSpacing: -3 }}>{nom}</div>
        <div style={{ display: "flex", marginTop: 14, fontSize: 22, color: "#666", gap: 12 }}>
          <div style={{ display: "flex" }}>{region}</div>
          <div style={{ display: "flex" }}>·</div>
          <div style={{ display: "flex" }}>{fmtFr(pop)} habitants</div>
        </div>

        <div style={{ display: "flex", flex: 1 }} />

        <div style={{ display: "flex", gap: 56 }}>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div style={{ display: "flex", fontSize: 13, color: "#666", letterSpacing: 2, textTransform: "uppercase" }}>Dépenses {latest ?? ""}</div>
            <div style={{ display: "flex", fontSize: 64, fontWeight: 800, color: "#111", letterSpacing: -1.8, lineHeight: 1, marginTop: 6 }}>{depDisplay}</div>
          </div>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div style={{ display: "flex", fontSize: 13, color: "#666", letterSpacing: 2, textTransform: "uppercase" }}>Dette {latest ?? ""}</div>
            <div style={{ display: "flex", fontSize: 64, fontWeight: 800, color: "#111", letterSpacing: -1.8, lineHeight: 1, marginTop: 6 }}>{detteDisplay}</div>
          </div>
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", marginTop: 32, paddingTop: 16, borderTop: "2px solid #111", fontSize: 14, color: "#666", letterSpacing: 2, textTransform: "uppercase" }}>
          <div style={{ display: "flex" }}>Source OFGL · M14/M57 harmonisé</div>
          <div style={{ display: "flex" }}>franceopendata.org/fr/city/{slug}</div>
        </div>
      </div>
    ),
    { ...size },
  );
}
