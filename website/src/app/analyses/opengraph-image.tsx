import { ImageResponse } from "next/og";
import { ogMark } from "@/components/og/OgMark";

import { getAllPosts } from "@/lib/blog";

export const runtime = "nodejs";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "Qipu — Analyses, enquêtes et portraits";

const fmtFr = (n: number) => n.toLocaleString("fr-FR");

export default async function AnalysesOG() {
  const posts = getAllPosts();
  const nb = fmtFr(posts.length);

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
          {ogMark()}
          <div style={{ display: "flex" }}>Qipu · /analyses</div>
        </div>

        <div
          style={{
            display: "flex",
            marginTop: 56,
            fontSize: 14,
            letterSpacing: 3,
            textTransform: "uppercase",
            color: "#666",
          }}
        >
          Analyses · Enquêtes · Portraits · Explications
        </div>
        <div
          style={{
            display: "flex",
            marginTop: 14,
            fontSize: 82,
            fontWeight: 800,
            color: "#111",
            lineHeight: 1.04,
            letterSpacing: -2.8,
            maxWidth: 1040,
          }}
        >
          Ce que les données publiques permettent de comprendre.
        </div>

        <div style={{ display: "flex", flex: 1 }} />

        <div style={{ display: "flex", gap: 80, alignItems: "flex-end" }}>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div
              style={{
                display: "flex",
                fontSize: 13,
                color: "#666",
                letterSpacing: 2,
                textTransform: "uppercase",
              }}
            >
              Articles publiés
            </div>
            <div
              style={{
                display: "flex",
                fontSize: 110,
                fontWeight: 800,
                color: "#111",
                letterSpacing: -3,
                lineHeight: 1,
                marginTop: 6,
              }}
            >
              {nb}
            </div>
          </div>
        </div>

        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            marginTop: 32,
            paddingTop: 16,
            borderTop: "2px solid #111",
            fontSize: 14,
            color: "#666",
            letterSpacing: 2,
            textTransform: "uppercase",
          }}
        >
          <div style={{ display: "flex" }}>Sourcé aux comptes officiels · M57</div>
          <div style={{ display: "flex" }}>qipu.org/analyses</div>
        </div>
      </div>
    ),
    { ...size },
  );
}
