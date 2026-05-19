import { ImageResponse } from "next/og";
import { loadConversation } from "@/lib/chat/store";

export const runtime = "nodejs";

const FOLLOWUP_RE = /<followups>[\s\S]*?<\/followups>/g;

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const conv = loadConversation(id);
  if (!conv) {
    return new ImageResponse(
      (
        <div style={{ display: "flex", width: "100%", height: "100%", background: "#fafaf7", alignItems: "center", justifyContent: "center" }}>
          <div style={{ fontSize: 48, color: "#0a0a0a" }}>Conversation introuvable</div>
        </div>
      ),
      { width: 1200, height: 630 },
    );
  }

  // Strip non-Latin glyphs that next/og can't render without dynamic font fetch
  const sanitize = (s: string) =>
    s
      .replace(/≈/g, "~")
      .replace(/→/g, ">")
      .replace(/←/g, "<")
      // eslint-disable-next-line no-control-regex -- ASCII range \x00-\x7F is the intended whitelist
      .replace(/[^\x00-\x7Fà-ÿÀ-ŸœŒæÆ€\s\n.,;:!?()'"\-«»]/g, "");
  const question = sanitize(conv.title);
  const answer = sanitize(conv.preview).slice(0, 360);

  return new ImageResponse(
    (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          width: "100%",
          height: "100%",
          background: "#fafaf7",
          padding: "60px 70px",
          fontFamily: "Inter, sans-serif",
        }}
      >
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 40 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <div style={{ display: "flex", width: 44, height: 44, background: "#0a0a0a", borderRadius: 8, alignItems: "center", justifyContent: "center", color: "white", fontSize: 22, fontWeight: 800 }}>
              FOD
            </div>
            <div style={{ display: "flex", flexDirection: "column" }}>
              <div style={{ fontSize: 22, fontWeight: 700, color: "#0a0a0a" }}>France Open Data</div>
              <div style={{ fontSize: 14, color: "#5f6672" }}>Données publiques · Paris</div>
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 14px", background: "#2a3680", borderRadius: 999, color: "white", fontSize: 13, fontWeight: 600 }}>
            <div style={{ width: 8, height: 8, background: "#e11d1d", borderRadius: "50%" }} />
            Chat IA
          </div>
        </div>

        {/* Question */}
        <div style={{ display: "flex", flexDirection: "column", marginBottom: 28 }}>
          <div style={{ display: "flex", fontSize: 13, fontWeight: 700, color: "#5f6672", textTransform: "uppercase", letterSpacing: 1.2, marginBottom: 10 }}>Question</div>
          <div style={{ display: "flex", fontSize: 36, fontWeight: 700, color: "#0a0a0a", lineHeight: 1.2 }}>
            {question.length > 110 ? question.slice(0, 107) + "..." : question}
          </div>
        </div>

        {/* Answer preview */}
        <div style={{ display: "flex", flexDirection: "column", flex: 1, padding: "20px 22px", background: "white", border: "1px solid #e5e5e5", borderRadius: 14 }}>
          <div style={{ display: "flex", fontSize: 13, fontWeight: 700, color: "#5f6672", textTransform: "uppercase", letterSpacing: 1.2, marginBottom: 10 }}>Reponse</div>
          <div style={{ display: "flex", fontSize: 22, color: "#0a0a0a", lineHeight: 1.4 }}>{answer}...</div>
        </div>

        {/* Footer */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 28 }}>
          <div style={{ display: "flex", fontSize: 16, color: "#5f6672" }}>
            Source : open data Ville de Paris
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 16, fontWeight: 600, color: "#2a3680" }}>
            Pose ta question &gt;
          </div>
        </div>
      </div>
    ),
    { width: 1200, height: 630 },
  );
}
