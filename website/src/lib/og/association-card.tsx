import { ImageResponse } from "next/og";

import { getCity } from "@/lib/cities";
import { loadAssociation, loadSubventionVulgarization } from "@/lib/fusion-data";

/** Coupe un texte au dernier mot entier avant `n` caractères. Satori plante sur
 *  `display: -webkit-box` dès que le texte se découpe en plusieurs morceaux
 *  (glyphe absent de la police par défaut) : la coupe se fait donc ici, et le
 *  bloc reste en flex. */
const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1).replace(/\s+\S*$/, "")}…` : s);

export const ogSize = { width: 1200, height: 630 };

const fmtEur = (n: number) => {
  if (n >= 1e9) return `${(n / 1e9).toFixed(2).replace(".", ",")} Md€`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(1).replace(".", ",")} M€`;
  if (n >= 1e3) return `${Math.round(n / 1000).toLocaleString("fr-FR")} k€`;
  return `${n.toLocaleString("fr-FR")} €`;
};

/**
 * Association social-share card (next/og) — city-parametrized. Warm off-white,
 * heavy display type, ocre accents. "Ville de X" and the source host derive
 * from `city` so every city's beneficiary shares a consistent, correct card.
 */
export async function renderAssociationOg(city: string, slug: string) {
  const cityNom = getCity(city)?.nom ?? "Paris";
  const sourceHost = city === "paris" ? "opendata.paris.fr" : "data.gouv.fr";
  const asso = loadAssociation(slug, city);
  const vulg = asso ? loadSubventionVulgarization(asso.name, city) : null;

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
            Q
          </div>
          Qipu
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
          Bénéficiaire de subventions · Ville de {cityNom}
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
            display: "flex",
            overflow: "hidden",
          }}
        >
          {clip(nom, 70)}
        </div>

        {hook && (
          <div
            style={{
              marginTop: 18,
              fontSize: 24,
              lineHeight: 1.35,
              color: "#444",
              maxWidth: 1000,
              display: "flex",
            overflow: "hidden",
            }}
          >
            {clip(hook, 150)}
          </div>
        )}

        <div style={{ display: "flex", flex: 1 }} />

        <div style={{ display: "flex", alignItems: "flex-end", gap: 56 }}>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div style={{ display: "flex", fontSize: 16, color: "#666", letterSpacing: 2, textTransform: "uppercase" }}>
              Cumul reçu
            </div>
            <div style={{ display: "flex", fontSize: 96, fontWeight: 800, color: "#111", letterSpacing: -2, lineHeight: 1 }}>
              {total}
            </div>
          </div>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div style={{ display: "flex", fontSize: 16, color: "#666", letterSpacing: 2, textTransform: "uppercase" }}>
              Subventions
            </div>
            <div style={{ display: "flex", fontSize: 96, fontWeight: 800, color: "#111", letterSpacing: -2, lineHeight: 1 }}>
              {nb}
            </div>
          </div>
          {years && (
            <div style={{ display: "flex", flexDirection: "column" }}>
              <div style={{ display: "flex", fontSize: 16, color: "#666", letterSpacing: 2, textTransform: "uppercase" }}>
                Actif
              </div>
              <div style={{ display: "flex", fontSize: 42, fontWeight: 700, color: "#111", letterSpacing: -0.5, lineHeight: 1 }}>
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
          Source · {sourceHost} / qipu.org
        </div>
      </div>
    ),
    { ...ogSize },
  );
}

