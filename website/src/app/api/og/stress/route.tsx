import { ImageResponse } from "next/og";
import { NextRequest } from "next/server";
import {
  LEVERAGE_RECETTES_MAX,
  BORROW_RATIO_MAX,
  CAPACITE_DESENDETTEMENT_ALERTE_ANS,
  CAPACITE_DESENDETTEMENT_CRITIQUE_ANS,
} from "@/lib/methodology";

export const runtime = "nodejs";

const LEVERAGE_RECETTES = LEVERAGE_RECETTES_MAX;
const BORROW_RATIO = BORROW_RATIO_MAX;
const THRESHOLD = CAPACITE_DESENDETTEMENT_ALERTE_ANS;
const CRITICAL = CAPACITE_DESENDETTEMENT_CRITIQUE_ANS;

// Baselines Paris 2024 (cohérent avec le simulateur — ces valeurs sont aussi
// utilisées pour la page /dette-patrimoine/stress-test).
const BASELINE = {
  dette: 11_700_000_000,
  epargne: 1_080_000_000,
  taux: 2.4,
  capacite: 10.83,
};

const fmt1 = (n: number) => n.toFixed(1).replace(".", ",");

function compute(taux: number, recettesDelta: number, investMult: number) {
  const recettesEffect = (recettesDelta * LEVERAGE_RECETTES) / 100;
  const extraInterest = BASELINE.dette * ((taux - BASELINE.taux) / 100);
  const epargneNew = BASELINE.epargne * (1 + recettesEffect) - extraInterest;
  const detteNew = BASELINE.dette * (1 + (investMult - 1) * BORROW_RATIO);
  if (epargneNew <= 0) return { capacite: Infinity, status: "tutelle" as const };
  const capacite = detteNew / epargneNew;
  const status =
    capacite >= CRITICAL
      ? ("critique" as const)
      : capacite >= THRESHOLD
      ? ("alerte" as const)
      : capacite >= THRESHOLD - 3
      ? ("attention" as const)
      : ("confortable" as const);
  return { capacite, status };
}

const STATUS_LABELS: Record<string, string> = {
  confortable: "Zone confortable",
  attention: "Zone de vigilance",
  alerte: "Seuil d'alerte franchi",
  critique: "Zone critique — redressement probable",
  tutelle: "Mise sous tutelle préfectorale",
};

const STATUS_COLORS: Record<string, string> = {
  confortable: "#0a0a0a",
  attention: "#a67638",
  alerte: "#a67638",
  critique: "#e11d1d",
  tutelle: "#e11d1d",
};

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const parseNum = (k: string, fallback: number) => {
    const v = searchParams.get(k);
    if (v == null) return fallback;
    const n = Number(v);
    return Number.isFinite(n) ? n : fallback;
  };

  const taux = parseNum("t", BASELINE.taux);
  const recettesDelta = parseNum("r", 0);
  const investMult = parseNum("i", 1);

  const { capacite, status } = compute(taux, recettesDelta, investMult);
  const isCollapsed = !Number.isFinite(capacite);

  const bigValue = isCollapsed ? "∞" : fmt1(capacite);
  const statusLabel = STATUS_LABELS[status];
  const statusColor = STATUS_COLORS[status];

  // Description des déviations vs baseline
  const parts: string[] = [];
  if (Math.abs(taux - BASELINE.taux) > 0.05) {
    parts.push(`Taux ${fmt1(taux)} %`);
  }
  if (Math.abs(recettesDelta) > 0.5) {
    parts.push(`Recettes ${recettesDelta >= 0 ? "+" : ""}${Math.round(recettesDelta)} %`);
  }
  if (Math.abs(investMult - 1) > 0.02) {
    parts.push(`Invest × ${investMult.toFixed(2).replace(".", ",")}`);
  }
  const scenario = parts.length ? parts.join(" · ") : "Baseline 2024";

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
            marginTop: 32,
            fontSize: 16,
            letterSpacing: 3,
            textTransform: "uppercase",
            color: "#666",
            display: "flex",
          }}
        >
          Stress-test · soutenabilité de la dette
        </div>

        <div
          style={{
            marginTop: 8,
            fontSize: 64,
            fontWeight: 800,
            color: "#111",
            lineHeight: 1.05,
            letterSpacing: -2,
            display: "flex",
          }}
        >
          Paris peut-elle <span style={{ color: "#b8551c", fontStyle: "italic", marginLeft: 16 }}>faire faillite</span> ?
        </div>

        <div
          style={{
            marginTop: 24,
            fontSize: 22,
            letterSpacing: 2,
            textTransform: "uppercase",
            color: "#666",
            display: "flex",
          }}
        >
          Scénario · {scenario}
        </div>

        <div style={{ flex: 1 }} />

        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "flex-start",
          }}
        >
          <div
            style={{
              fontSize: 18,
              letterSpacing: 3,
              textTransform: "uppercase",
              color: "#666",
              marginBottom: 4,
              display: "flex",
            }}
          >
            Années pour rembourser la dette
          </div>
          <div
            style={{
              fontSize: 220,
              fontWeight: 800,
              color: statusColor,
              letterSpacing: -6,
              lineHeight: 0.95,
              display: "flex",
              alignItems: "baseline",
            }}
          >
            {bigValue}
            {!isCollapsed && (
              <span style={{ fontSize: 48, color: "#666", marginLeft: 16, fontWeight: 500 }}>
                ans
              </span>
            )}
          </div>
          <div
            style={{
              marginTop: 18,
              fontSize: 28,
              fontWeight: 700,
              color: statusColor,
              letterSpacing: 1,
              textTransform: "uppercase",
              display: "flex",
            }}
          >
            {statusLabel}
          </div>
        </div>

        <div style={{ flex: 1 }} />

        {/* Jauge horizontale 0 → 30 ans */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            marginTop: 20,
          }}
        >
          <div
            style={{
              position: "relative",
              height: 24,
              display: "flex",
            }}
          >
            <div
              style={{
                position: "absolute",
                left: 0,
                top: 0,
                bottom: 0,
                width: "40%",
                background: "rgba(10,10,10,0.12)",
              }}
            />
            <div
              style={{
                position: "absolute",
                left: "40%",
                top: 0,
                bottom: 0,
                width: "26.6%",
                background: "rgba(166,118,56,0.35)",
              }}
            />
            <div
              style={{
                position: "absolute",
                left: "66.6%",
                top: 0,
                bottom: 0,
                width: "33.4%",
                background: "rgba(225,29,29,0.35)",
              }}
            />
            <div
              style={{
                position: "absolute",
                left: `calc(${Math.min(1, Number.isFinite(capacite) ? capacite / 30 : 1) * 100}% - 4px)`,
                top: -4,
                bottom: -4,
                width: 8,
                background: statusColor,
                display: "flex",
              }}
            />
          </div>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              marginTop: 6,
              fontSize: 14,
              color: "#666",
              letterSpacing: 1,
            }}
          >
            <span>0</span>
            <span style={{ marginLeft: "34%" }}>12 seuil alerte</span>
            <span>20 critique</span>
            <span>30+</span>
          </div>
        </div>

        <div
          style={{
            marginTop: 28,
            paddingTop: 18,
            borderTop: "2px solid #111",
            fontSize: 14,
            color: "#666",
            letterSpacing: 2,
            textTransform: "uppercase",
            display: "flex",
            justifyContent: "space-between",
          }}
        >
          <span>Méthodologie Moody's/Fitch · données Ville de Paris 2024</span>
          <span>qipu.org/dette-patrimoine/stress-test</span>
        </div>
      </div>
    ),
    { width: 1200, height: 630 },
  );
}
