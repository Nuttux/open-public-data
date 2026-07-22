import { ImageResponse } from "next/og";

import { loadContrat, loadMarcheVulgarization } from "@/lib/fusion-data";
import { normalizeObjet } from "@/lib/objet-normalizer";

export const runtime = "nodejs";
export const alt = "Marché public — Qipu";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const fmtEur = (n: number) => {
  if (n >= 1e9) return `${(n / 1e9).toFixed(2).replace(".", ",")} Md€`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(1).replace(".", ",")} M€`;
  if (n >= 1e3) return `${Math.round(n / 1000).toLocaleString("fr-FR")} k€`;
  return `${n.toLocaleString("fr-FR")} €`;
};

export default async function OG({ params }: { params: Promise<{ numero: string }> }) {
  const { numero } = await params;
  const c = loadContrat(numero);
  const v = c ? loadMarcheVulgarization(c.numero) : null;

  // Même précédence que la fiche : sans le repli `normalizeObjet`, la carte
  // sociale partait avec le libellé technique brut pour les ~93 % de contrats
  // qui n'ont pas de vulgarisation.
  const title = v?.objet_clair || (c ? normalizeObjet(c.objet) : "") || `Marché ${numero}`;
  const montant = c ? fmtEur(c.montantMax) : "—";
  const fournisseur = c?.fournisseur || "";
  const year = c?.year || "";
  const nature = c?.nature || "";

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
          Marché public · {nature} · {year}
        </div>

        <div
          style={{
            marginTop: 18,
            fontSize: 56,
            fontWeight: 800,
            color: "#111",
            lineHeight: 1.1,
            letterSpacing: -1.5,
            maxWidth: 1050,
            display: "-webkit-box",
            WebkitLineClamp: 3,
            WebkitBoxOrient: "vertical",
            overflow: "hidden",
          }}
        >
          {title}
        </div>

        <div style={{ flex: 1 }} />

        <div style={{ display: "flex", alignItems: "flex-end", gap: 48 }}>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div style={{ fontSize: 16, color: "#666", letterSpacing: 2, textTransform: "uppercase" }}>
              Enveloppe max
            </div>
            <div style={{ fontSize: 84, fontWeight: 800, color: "#111", letterSpacing: -2, lineHeight: 1 }}>
              {montant}
            </div>
          </div>
          {fournisseur && (
            <div style={{ display: "flex", flexDirection: "column", flex: 1 }}>
              <div style={{ fontSize: 16, color: "#666", letterSpacing: 2, textTransform: "uppercase" }}>
                Attribué à
              </div>
              <div
                style={{
                  fontSize: 32,
                  fontWeight: 700,
                  color: "#111",
                  letterSpacing: -0.5,
                  lineHeight: 1.1,
                  display: "-webkit-box",
                  WebkitLineClamp: 2,
                  WebkitBoxOrient: "vertical",
                  overflow: "hidden",
                }}
              >
                {fournisseur}
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
