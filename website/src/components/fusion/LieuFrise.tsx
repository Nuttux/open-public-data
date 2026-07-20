"use client";

import { useMemo, useState } from "react";
import type { LieuFicheData } from "@/lib/lieux-data";
import { useT } from "@/lib/localeContext";

/**
 * Frise « la mémoire d'un lieu » — la scène signature de la fiche. Sur un seul
 * axe 1880→aujourd'hui, trois couches que rien d'autre ne réunit :
 *   - archive (Bulletin municipal, ocre) — la mémoire profonde
 *   - décisions (délibérations du Conseil, rouge) — ce qui s'est voté
 *   - argent (subventions + investissements, bleu) — ce que la Ville paie
 * Le « trou » du milieu (fin BMO numérisé → début Débat-Délibs) est montré tel
 * quel : il dit où le registre numérisé manque. Palette validée (validate_palette).
 */

const MOIS: Record<string, number> = {
  JANVIER: 1, FEVRIER: 2, "FÉVRIER": 2, MARS: 3, AVRIL: 4, MAI: 5, JUIN: 6,
  JUILLET: 7, AOUT: 8, "AOÛT": 8, SEPTEMBRE: 9, OCTOBRE: 10, NOVEMBRE: 11, DECEMBRE: 12, "DÉCEMBRE": 12,
};

type Mark = { year: number; type: "archive" | "decision" | "argent"; label: string; sub?: string; href?: string };

const COL = { archive: "#eda100", decision: "#c12323", argent: "#1e45e4" } as const;

function seanceYear(s?: string | null): number | null {
  if (!s) return null;
  const m = s.trim().match(/(\d{4})/);
  return m ? parseInt(m[1], 10) : null;
}

export default function LieuFrise({ lieu }: { lieu: LieuFicheData }) {
  const t = useT();
  const [hover, setHover] = useState<{ m: Mark; x: number } | null>(null);

  const marks = useMemo<Mark[]>(() => {
    const out: Mark[] = [];
    for (const b of lieu.bmo_extraits) {
      const y = parseInt(b.date.slice(0, 4), 10);
      if (y) out.push({ year: y, type: "archive", label: t("fx.lieu.frise.archive"), sub: b.extrait.slice(0, 90), href: b.source_url });
    }
    for (const m of lieu.moments) {
      const y = seanceYear(m.seance);
      if (y) out.push({ year: y, type: "decision", label: m.pourquoi || m.fait.slice(0, 70), sub: m.fait.slice(0, 90), href: m.source_url ?? undefined });
    }
    for (const iv of lieu.invest) {
      const y = parseInt(String(iv.annee), 10);
      if (y) out.push({ year: y, type: "argent", label: `${iv.nom_projet.slice(0, 60)}`, sub: `${(iv.montant_eur / 1e6).toFixed(1)} M€` });
    }
    const sub = lieu.subventions_exploitant;
    if (sub) for (const r of sub.rows) {
      const y = parseInt(r.annee, 10);
      if (y) out.push({ year: y, type: "argent", label: sub.nom_fiche, sub: `${(r.montant_eur / 1e6).toFixed(1)} M€` });
    }
    return out.sort((a, b) => a.year - b.year);
  }, [lieu, t]);

  if (marks.length < 3) return null;

  const years = marks.map((m) => m.year);
  const minY = Math.min(1882, ...years);
  const maxY = Math.max(2026, ...years);
  const W = 1000, H = 88, padL = 4, padR = 4, baseY = 60;
  const x = (y: number) => padL + ((y - minY) / (maxY - minY)) * (W - padL - padR);

  // décennies pour l'axe
  const decades: number[] = [];
  for (let d = Math.ceil(minY / 20) * 20; d <= maxY; d += 20) decades.push(d);

  const counts = {
    archive: marks.filter((m) => m.type === "archive").length,
    decision: marks.filter((m) => m.type === "decision").length,
    argent: marks.filter((m) => m.type === "argent").length,
  };

  return (
    <section className="fx-frise">
      <div className="fx-frise-legend">
        {(["archive", "decision", "argent"] as const).filter((k) => counts[k]).map((k) => (
          <span key={k} className="fx-frise-leg">
            <span className="fx-frise-dot" style={{ background: COL[k] }} />
            {t(`fx.lieu.frise.${k}`)} <span className="fx-frise-n">{counts[k]}</span>
          </span>
        ))}
      </div>

      <div className="fx-frise-plot" style={{ position: "relative" }}>
        <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ width: "100%", height: H, display: "block", overflow: "visible" }} role="img" aria-label={t("fx.lieu.frise.aria")}>
          {/* spine */}
          <line x1={padL} y1={baseY} x2={W - padR} y2={baseY} stroke="var(--rule-hard)" strokeWidth="1" vectorEffect="non-scaling-stroke" />
          {/* décennies */}
          {decades.map((d) => (
            <g key={d}>
              <line x1={x(d)} y1={baseY} x2={x(d)} y2={baseY + 5} stroke="var(--muted)" strokeWidth="1" vectorEffect="non-scaling-stroke" />
              <text x={x(d)} y={baseY + 16} fontFamily="var(--f-mono)" fontSize="9" fill="var(--muted)" textAnchor="middle">{d}</text>
            </g>
          ))}
          {/* marks */}
          {marks.map((m, i) => {
            const yTop = m.type === "archive" ? 20 : m.type === "decision" ? 12 : 28;
            return (
              <g key={i}
                 onMouseEnter={() => setHover({ m, x: x(m.year) })}
                 onMouseLeave={() => setHover(null)}
                 style={{ cursor: m.href ? "pointer" : "default" }}
                 onClick={() => m.href && window.open(m.href, "_blank", "noopener")}>
                <line x1={x(m.year)} y1={yTop} x2={x(m.year)} y2={baseY} stroke={COL[m.type]} strokeWidth={hover?.m === m ? 2.4 : 1.4} vectorEffect="non-scaling-stroke" opacity={hover && hover.m !== m ? 0.35 : 0.85} />
                <circle cx={x(m.year)} cy={yTop} r={hover?.m === m ? 3.4 : 2.4} fill={COL[m.type]} opacity={hover && hover.m !== m ? 0.35 : 1} />
              </g>
            );
          })}
        </svg>
        {hover && (
          <div className="fx-frise-tip" style={{ left: `${(hover.x / W) * 100}%` }}>
            <span className="fx-frise-tip-y" style={{ color: COL[hover.m.type] }}>{hover.m.year}</span>
            <span className="fx-frise-tip-l">{hover.m.label}</span>
            {hover.m.sub && <span className="fx-frise-tip-s">{hover.m.sub}</span>}
          </div>
        )}
      </div>
    </section>
  );
}
