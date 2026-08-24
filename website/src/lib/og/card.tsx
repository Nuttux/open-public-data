import fs from "node:fs";
import path from "node:path";
import { ImageResponse } from "next/og";

/**
 * The share-card template.
 *
 * Left: what the fiche is about, and one figure with a line saying what that
 * figure counts — a number alone on a card reads as decoration. Right: an
 * illustration, in this order of preference:
 *
 *   the fiche's own photo  →  its theme's photo  →  its figures as bars  →  the mark
 *
 * Type is the site's own (Inter Tight + JetBrains Mono, embedded here because
 * next/og rasterises server-side and cannot use the page's webfonts).
 */

export const OG_CARD_SIZE = { width: 1200, height: 630 };

/* Straight from .theme-fusion in app/fusion.css — the card must be the same
   object as the page it links to, so these are copied, not approximated. */
const INK = "#0a0a0a";      /* --ink */
const PAPER = "#fafaf7";    /* --bg */
const WARM = "#f4efe3";     /* --bg-warm */
const OCRE = "#8c5e2a";     /* --ocre */
const MUTED = "#5f6672";    /* --muted */
const BLEU = "#2a3680";     /* --bleu — the mark's colour, per fusion.css */

const FONT_DIR = path.join(process.cwd(), "src", "lib", "og", "fonts");
const font = (f: string) => fs.readFileSync(path.join(FONT_DIR, f));

export type CardBar = { label: string; v: number };

export type CardInput = {
  /** Section shown next to the wordmark, e.g. "/places". */
  route: string;
  /** Small line above the title: type, department, contract number… */
  kicker: string;
  title: string;
  /** The one figure the card is about. `qualifier` is what makes it legible. */
  figure?: { label: string; value: string; qualifier?: string } | null;
  /** Data URI — the fiche's own photo, else its theme's. */
  image?: string | null;
  /** Set for a BORROWED theme photo: names the building and marks it as an
   *  illustration, so the card never implies a link the data does not have.
   *  `note` is the disclaimer in the card's own language. */
  imageCaption?: { text: string; note: string } | null;
  /** Drawn when there is no image and the fiche has a series worth showing. */
  bars?: CardBar[] | null;
  source: string;
  /** Shown bottom-left, without scheme: "qipu.org/us/city/sf/…". */
  url: string;
};

/** The Qipu mark — same geometry as components/fusion/BrandMark, and the same
 *  colour rule the site applies to it: the knotted cords render indigo while
 *  the wordmark beside them stays ink (see `.fx-brand svg` in fusion.css). */
function Mark({ size = 26 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" fill="none">
      <g transform="translate(0 -3)">
        <g stroke={BLEU} strokeWidth="3.2" strokeLinecap="round">
          <path d="M8 12 Q24 17 40 12" />
          <path d="M15 13.4 Q13.4 25 15 36" />
          <path d="M24 15 L24 44" />
          <path d="M33 13.4 Q34.6 22 33 30" />
        </g>
        <g fill={BLEU}>
          <circle cx="15" cy="24" r="3" />
          <circle cx="24" cy="26" r="3" />
          <circle cx="24" cy="36" r="3" />
          <circle cx="33" cy="23" r="3" />
        </g>
      </g>
    </svg>
  );
}

function Panel({
  image, bars, caption,
}: {
  image?: string | null;
  bars?: CardBar[] | null;
  caption?: { text: string; note: string } | null;
}) {
  if (image) {
    return (
      <div style={{ display: "flex", width: 430, height: "100%", position: "relative" }}>
        {/* next/og rasterises server-side: <img> is the only option here. */}
        <img src={image} width={430} height={630} style={{ objectFit: "cover" }} alt="" />
        {caption && (
          <div
            style={{
              position: "absolute", bottom: 0, left: 0, right: 0,
              display: "flex", flexDirection: "column", gap: 2,
              padding: "12px 16px 13px", background: "rgba(20,19,16,.72)",
              fontFamily: "JetBrainsMono", fontSize: 12, color: "#e8e5dc", lineHeight: 1.35,
            }}
          >
            <div style={{ display: "flex" }}>{caption.text}</div>
            <div style={{ display: "flex", color: "#b3afa4" }}>{caption.note}</div>
          </div>
        )}
      </div>
    );
  }
  if (bars && bars.length >= 3) {
    const max = Math.max(...bars.map((b) => b.v)) || 1;
    return (
      <div
        style={{
          display: "flex", width: 430, height: "100%", background: WARM,
          alignItems: "flex-end", padding: "0 34px 54px", gap: 10,
        }}
      >
        {bars.map((b, i) => (
          <div key={b.label} style={{ display: "flex", flexDirection: "column", alignItems: "center", flex: 1 }}>
            <div
              style={{
                display: "flex", width: "100%",
                height: Math.max(3, Math.round((b.v / max) * 330)),
                background: i === bars.length - 1 ? OCRE : INK,
              }}
            />
            <div style={{ display: "flex", fontFamily: "JetBrainsMono", fontSize: 13, color: MUTED, marginTop: 8 }}>
              {b.label}
            </div>
          </div>
        ))}
      </div>
    );
  }
  // No placeholder panel: every fiche resolves to a photo (its own, its
  // theme's, or its city's) before reaching here. An empty warm panel is the
  // only remaining case, and it means an image file is missing.
  return <div style={{ display: "flex", width: 430, height: "100%", background: WARM }} />;
}

export function shareCard(input: CardInput) {
  const { route, kicker, title, figure, image, imageCaption, bars, source, url } = input;
  const titleSize = title.length > 76 ? 38 : title.length > 38 ? 46 : 60;

  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", background: PAPER }}>
        <div style={{ display: "flex", flexDirection: "column", width: 770, padding: "54px 46px 40px 64px" }}>
          <div
            style={{
              display: "flex", fontFamily: "JetBrainsMono", fontSize: 14, letterSpacing: 2.4,
              color: OCRE, textTransform: "uppercase",
            }}
          >
            {kicker}
          </div>

          <div
            style={{
              marginTop: 12, fontFamily: "InterTight", fontWeight: 800, fontSize: titleSize,
              letterSpacing: -1.9, lineHeight: 1.03, color: INK,
              display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical", overflow: "hidden",
            }}
          >
            {title}
          </div>

          <div style={{ flex: 1 }} />

          {figure && (
            /* The site draws its KPI bands as a grid with 1px gaps over an ink
               ground, so the hairlines ARE the gaps (.fx-fiche-kpis). Same
               device here, in one cell. */
            <div
              style={{
                display: "flex", flexDirection: "column",
                border: `1px solid ${INK}`, background: PAPER, padding: "16px 20px 18px",
              }}
            >
              <div
                style={{
                  display: "flex", fontFamily: "JetBrainsMono", fontSize: 13.5, letterSpacing: 2.2,
                  color: OCRE, textTransform: "uppercase",
                }}
              >
                {figure.label}
              </div>
              <div
                style={{
                  display: "flex", fontFamily: "InterTight", fontWeight: 800, fontSize: 92,
                  letterSpacing: -3.4, lineHeight: 1.02, color: INK,
                }}
              >
                {figure.value}
              </div>
              {figure.qualifier && (
                <div style={{ display: "flex", fontFamily: "InterTight", fontSize: 20, color: MUTED, marginTop: 6, maxWidth: 600 }}>
                  {figure.qualifier}
                </div>
              )}
            </div>
          )}

          <div
            style={{
              display: "flex", justifyContent: "space-between", alignItems: "center",
              marginTop: 30, paddingTop: 16, borderTop: `1px solid ${INK}`,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <Mark size={26} />
              <div style={{ display: "flex", fontFamily: "InterTight", fontWeight: 800, fontSize: 21, letterSpacing: -0.7, color: INK }}>
                Qipu
              </div>
              <div style={{ display: "flex", fontFamily: "JetBrainsMono", fontSize: 13, color: OCRE }}>{route}</div>
            </div>
            <div style={{ display: "flex", fontFamily: "JetBrainsMono", fontSize: 13, color: MUTED }}>{source}</div>
          </div>
          <div style={{ display: "flex", fontFamily: "JetBrainsMono", fontSize: 13, color: BLEU, marginTop: 8 }}>{url}</div>
        </div>

        <Panel image={image} bars={bars} caption={imageCaption} />
      </div>
    ),
    {
      ...OG_CARD_SIZE,
      fonts: [
        { name: "InterTight", data: font("InterTight-400.ttf"), weight: 400, style: "normal" },
        { name: "InterTight", data: font("InterTight-800.ttf"), weight: 800, style: "normal" },
        { name: "JetBrainsMono", data: font("JetBrainsMono-400.ttf"), weight: 400, style: "normal" },
      ],
    },
  );
}
