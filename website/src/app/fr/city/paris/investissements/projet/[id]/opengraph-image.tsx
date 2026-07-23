import { ImageResponse } from "next/og";
import { ogMark } from "@/components/og/OgMark";

import { loadProjet } from "@/lib/fusion-data";

export const runtime = "nodejs";
export const alt = "Projet d'investissement — Qipu";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const suf = (n: number) => (n === 1 ? "er" : "ᵉ");

const fmtEur = (n: number) => {
  if (n >= 1e9) return `${(n / 1e9).toFixed(2).replace(".", ",")} Md€`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(1).replace(".", ",")} M€`;
  if (n >= 1e3) return `${Math.round(n / 1000).toLocaleString("fr-FR")} k€`;
  return `${n.toLocaleString("fr-FR")} €`;
};

const TYPO_LABELS: Record<string, string> = {
  ecole: "École",
  college: "Collège",
  lycee: "Lycée",
  creche: "Crèche",
  gymnase: "Gymnase",
  piscine: "Piscine",
  bibliotheque: "Bibliothèque",
  "espace-vert": "Espace vert",
  voirie: "Voirie",
  "logement-social": "Logement social",
  "equipement-culturel": "Équipement culturel",
  "equipement-sante": "Équipement santé",
  administration: "Administration",
  autre: "Projet",
};

/**
 * Share card for a single investissement projet. Same visual language as
 * the association / fournisseur cards — warm background, heavy display
 * type, attribution at bottom.
 */
export default async function OG({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const p = loadProjet(id);

  const nom = p?.name ?? "Projet d'investissement";
  const total = p ? fmtEur(p.montant) : "—";
  const year = p?.year ?? "";
  const arr = p && p.arrondissement > 0 ? `${p.arrondissement}${suf(p.arrondissement)} arr.` : "Transverse";
  const typoSlug = p?.vulgarization?.typologie_normalisee ?? "";
  const typo = TYPO_LABELS[typoSlug] ?? p?.chapitre ?? "Projet";
  const hook = p?.vulgarization?.description_claire?.slice(0, 140) ?? "";

  // Photo : photo dédiée > photo générique typologique > null.
  // next/og charge l'image via fetch côté server, donc l'URL doit être
  // publiquement accessible (Wikimedia, Commons, asset local /public/).
  const photoUrl =
    p?.photo?.photo?.photo_url ?? p?.photo?.generic?.url ?? null;
  const photoCredit =
    p?.photo?.photo?.credit ?? p?.photo?.generic?.credit ?? null;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "row",
          background: "#faf9f5",
          fontFamily: "sans-serif",
        }}
      >
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          flex: photoUrl ? "1 1 60%" : "1",
          padding: "64px 56px",
          minWidth: 0,
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
            display: "flex",
            gap: 12,
          }}
        >
          <span>Investissement · Ville de Paris</span>
          <span style={{ color: "#b8551c" }}>· {typo}</span>
          <span>· {arr}</span>
        </div>

        <div
          style={{
            marginTop: 18,
            fontSize: 60,
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

        <div style={{ display: "flex", alignItems: "flex-end", gap: 64 }}>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div style={{ fontSize: 16, color: "#666", letterSpacing: 2, textTransform: "uppercase" }}>
              Montant voté
            </div>
            <div style={{ fontSize: 96, fontWeight: 800, color: "#111", letterSpacing: -2, lineHeight: 1 }}>
              {total}
            </div>
          </div>
          {year && (
            <div style={{ display: "flex", flexDirection: "column" }}>
              <div style={{ fontSize: 16, color: "#666", letterSpacing: 2, textTransform: "uppercase" }}>
                Exercice
              </div>
              <div style={{ fontSize: 96, fontWeight: 800, color: "#111", letterSpacing: -2, lineHeight: 1 }}>
                {year}
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
          Source · compte administratif M57 / qipu.org
        </div>
      </div>
      {photoUrl ? (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            flex: "0 0 40%",
            position: "relative",
            overflow: "hidden",
          }}
        >
          <img
            src={photoUrl}
            alt=""
            style={{
              width: "100%",
              height: "100%",
              objectFit: "cover",
            }}
          />
          {photoCredit ? (
            <div
              style={{
                position: "absolute",
                bottom: 10,
                right: 12,
                background: "rgba(0,0,0,0.55)",
                color: "#faf9f5",
                fontSize: 11,
                padding: "4px 8px",
                letterSpacing: 0.5,
                display: "flex",
                maxWidth: 380,
              }}
            >
              {String(photoCredit).slice(0, 80)}
            </div>
          ) : null}
        </div>
      ) : null}
      </div>
    ),
    { ...size },
  );
}
