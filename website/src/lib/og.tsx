import { ImageResponse } from "next/og";

/**
 * Shared OG-image card. Every route-level `opengraph-image.tsx` renders this
 * exact layout: brand chip + route, kicker line, big headline, bottom stat
 * row (first stat is the hero number), source + canonical URL footer.
 * Route files stay as thin stubs because Next.js requires one per route.
 */

export const OG_SIZE = { width: 1200, height: 630 };

/** "5 495" — fr-FR integer, OG-side (no client hooks here). */
export const ogFmtFr = (n: number) => n.toLocaleString("fr-FR");

/** "11,72" — billions with exactly 2 decimals, for "x,xx Md€" hero numbers. */
export const ogFmtBnFr = (n: number) =>
  (n / 1e9).toLocaleString("fr-FR", { maximumFractionDigits: 2, minimumFractionDigits: 2 });

/** "312" / "312,4" — millions, for "xxx M€" hero numbers. */
export const ogFmtMnFr = (n: number, digits = 0) =>
  (n / 1e6).toLocaleString("fr-FR", { maximumFractionDigits: digits });

/** "1,25 Md€" / "312,4 M€" / "46 k€" / "950 €" — the entity-OG string form. */
export const ogFmtEur = (n: number) => {
  if (n >= 1e9) return `${(n / 1e9).toFixed(2).replace(".", ",")} Md€`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(1).replace(".", ",")} M€`;
  if (n >= 1e3) return `${Math.round(n / 1000).toLocaleString("fr-FR")} k€`;
  return `${n.toLocaleString("fr-FR")} €`;
};

export type OgStat = {
  label: string;
  value: string;
  /** Render the value in the ocre accent color (#b8551c). */
  accent?: boolean;
};

export function ogCard(opts: {
  /** Path shown next to the brand chip, e.g. "/marches". */
  route: string;
  /** Small uppercase context line, e.g. "Marchés publics · Ville de Paris · 2024". */
  kicker: string;
  /** Big headline. */
  title: string;
  /** First entry renders as the 96px hero number, the rest at 56px. */
  stats: OgStat[];
  /** Footer left, e.g. "Source Paris Open Data · DECP". */
  source: string;
  /** Footer right, e.g. "franceopendata.org/fr/city/paris/marches". */
  url: string;
  /** Override headline size for long titles (default per variant). */
  titleSize?: number;
  /** Override headline letter-spacing (default per variant). */
  titleSpacing?: number;
  /** 0 renders every stat at secondary size (no 92/96px hero). Default 1. */
  heroCount?: 0 | 1;
  /**
   * "hub" (default): title 78/ls −2.5, hero 96, secondaries 56, gap 80.
   * "detail": title 72/ls −2, hero 92, secondaries 48, gap 60 — the shared
   * layout of the entity fiches (thème, catégorie, chapitre, bailleur…).
   */
  variant?: "hub" | "detail";
}) {
  const { route, kicker, title, stats, source, url, variant = "hub" } = opts;
  const detail = variant === "detail";
  const titleSize = opts.titleSize ?? (detail ? 72 : 78);
  const titleSpacing = opts.titleSpacing ?? (detail ? -2 : -2.5);
  const heroSize = detail ? 92 : 96;
  const secondarySize = detail ? 48 : 56;
  const statGap = detail ? 60 : 80;
  const [hero, ...rest] =
    (opts.heroCount ?? 1) === 0 ? [null, ...stats] : [stats[0] ?? null, ...stats.slice(1)];

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
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: 32,
              height: 32,
              background: "#111",
              color: "#faf9f5",
              fontSize: 18,
              fontWeight: 800,
            }}
          >
            FO
          </div>
          <div style={{ display: "flex" }}>France Open Data · {route}</div>
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
          {kicker}
        </div>
        <div
          style={{
            display: "flex",
            marginTop: 14,
            fontSize: titleSize,
            fontWeight: 800,
            color: "#111",
            lineHeight: 1.05,
            letterSpacing: titleSpacing,
            maxWidth: 1040,
          }}
        >
          {title}
        </div>

        <div style={{ display: "flex", flex: 1 }} />

        <div style={{ display: "flex", gap: statGap, alignItems: "flex-end" }}>
          {hero ? (
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
                {hero.label}
              </div>
              <div
                style={{
                  display: "flex",
                  fontSize: heroSize,
                  fontWeight: 800,
                  color: hero.accent ? "#b8551c" : "#111",
                  letterSpacing: -2.5,
                  lineHeight: 1,
                  marginTop: 6,
                }}
              >
                {hero.value}
              </div>
            </div>
          ) : null}
          {rest.map((s) => (
            <div
              key={s.label}
              style={{ display: "flex", flexDirection: "column", paddingBottom: 14 }}
            >
              <div
                style={{
                  display: "flex",
                  fontSize: 13,
                  color: "#666",
                  letterSpacing: 2,
                  textTransform: "uppercase",
                }}
              >
                {s.label}
              </div>
              <div
                style={{
                  display: "flex",
                  fontSize: secondarySize,
                  fontWeight: 700,
                  color: s.accent ? "#b8551c" : "#666",
                  letterSpacing: -1.2,
                  lineHeight: 1,
                  marginTop: 6,
                }}
              >
                {s.value}
              </div>
            </div>
          ))}
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
          <div style={{ display: "flex" }}>{source}</div>
          <div style={{ display: "flex" }}>{url}</div>
        </div>
      </div>
    ),
    { ...OG_SIZE },
  );
}
