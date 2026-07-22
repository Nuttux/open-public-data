import Link from "next/link";
import type { CSSProperties } from "react";

import type {
  CrossCuttingBucket,
  CrossCuttingTheme,
} from "@/lib/cross-cutting";

/**
 * CrossCuttingPanel — un panneau thématique (Santé / Éducation /
 * Solidarité) qui agrège des composantes provenant de plusieurs
 * institutions (Sécu + État + Local). Voix strictement impersonnelle.
 *
 * Layout :
 *   - SectionHead (eyebrow numéroté 07.X, titre, sous-titre)
 *   - hero number (chiffre Md€/an + part du total APU)
 *   - stack horizontale colorée par institution (bleu Sécu / noir État /
 *     rouge Local)
 *   - liste verticale : chaque composante = label + Md€ + % + lien drill
 *   - caveats discrets en mono small
 *   - source globale en footer
 *
 * Les couleurs reflètent les piliers du Budget Explorer :
 *   - secu          → #2a3680 (bleu encre)
 *   - etat          → #1a1d26 (noir)
 *   - local_*       → #c12323 (rouge)
 */

const COLOR_BY_BUCKET: Record<CrossCuttingBucket, string> = {
  secu: "#2a3680",
  etat: "#1a1d26",
  local_communal: "#c12323",
  local_dept: "#a01b1b",
  local_region: "#7a1414",
};

function fmtBnEur(amountEur: number, locale: "fr" | "en"): string {
  if (!Number.isFinite(amountEur) || amountEur <= 0) return "—";
  const md = amountEur / 1e9;
  const rounded = md >= 100 ? md.toFixed(0) : md.toFixed(1);
  return locale === "fr"
    ? `${rounded.replace(".", ",")} Md€`
    : `€${rounded} bn`;
}

function fmtPct(share: number, locale: "fr" | "en"): string {
  const v = share * 100;
  const r = v >= 10 ? v.toFixed(0) : v.toFixed(1);
  return locale === "fr" ? `${r.replace(".", ",")} %` : `${r}%`;
}

type Props = {
  number: string; // ex "07.1"
  theme: CrossCuttingTheme;
  locale: "fr" | "en";
  /** Label for the share-of-APU footnote ("of consolidated public spending"). */
  shareOfTotalLabel: string;
  /** Label for the caveats section ("Caveats" / "Mises en garde"). */
  caveatsLabel: string;
  /** Label for the institution legend column (sources). */
  sourcesLabel: string;
};

export default function CrossCuttingPanel({
  number,
  theme,
  locale,
  shareOfTotalLabel,
  caveatsLabel,
  sourcesLabel,
}: Props) {
  const components = theme.components;
  const totalAnnual = theme.total_annual_eur;
  const totalMd = totalAnnual / 1e9;
  const totalRounded = totalMd >= 100 ? Math.round(totalMd) : totalMd.toFixed(1);
  const totalLabel =
    locale === "fr"
      ? typeof totalRounded === "number"
        ? totalRounded.toLocaleString("fr-FR")
        : String(totalRounded).replace(".", ",")
      : String(totalRounded);

  const heroUnit = locale === "fr" ? "Md€" : "bn";

  const themeLabel = locale === "en" ? theme.label_en : theme.label_fr;
  const themeSubtitle = locale === "en" ? theme.subtitle_en : theme.subtitle_fr;
  const caveats = locale === "en" ? theme.caveats_en : theme.caveats_fr;

  const stack = (
    <div style={stackWrapStyle} role="presentation" aria-hidden="true">
      {components.map((c) => {
        const pct = totalAnnual > 0 ? (c.annual_eur / totalAnnual) * 100 : 0;
        const segStyle: CSSProperties = {
          flex: `${c.annual_eur} 1 0`,
          background: COLOR_BY_BUCKET[c.bucket],
          minWidth: pct >= 1.2 ? undefined : 6,
        };
        return <div key={c.key} style={segStyle} />;
      })}
    </div>
  );

  return (
    <details className="fx-cct-details" style={panelStyle}>
      {/* Compact summary — always visible, expands to full detail */}
      <summary className="fx-cct-summary" style={summaryStyle}>
        <span style={summaryHeadStyle}>
          <span style={summaryEyebrowStyle}>{number}</span>
          <span style={summaryTitleStyle}>{themeLabel}</span>
          <span style={summaryAmountStyle}>
            <span className="tnum" style={{ fontWeight: 700, color: "var(--ink)" }}>
              {totalLabel} {heroUnit}
            </span>
            <span className="tnum" style={summaryPctStyle}>
              {fmtPct(theme.share_of_total_apu, locale)}
            </span>
            <span className="fx-cct-chev" aria-hidden="true" style={chevStyle}>
              ›
            </span>
          </span>
        </span>
        <span style={{ marginTop: 12, display: "block" }}>{stack}</span>
      </summary>

      {/* Expanded body */}
      <div style={bodyStyle}>
        <p style={subtitleStyle}>{themeSubtitle}</p>
        <p style={shareLineStyle}>
          ≈{" "}
          <span className="tnum" style={{ fontWeight: 600, color: "var(--ink-2)" }}>
            {fmtPct(theme.share_of_total_apu, locale)}
          </span>{" "}
          {shareOfTotalLabel}
        </p>

      {/* Vertical component list */}
      <ul style={componentListStyle}>
        {components.map((c) => {
          const label = locale === "en" ? c.label_en : c.label_fr;
          const note = c.note;
          const pctTheme = fmtPct(c.share_of_theme, locale);
          const amountLabel = fmtBnEur(c.annual_eur, locale);
          return (
            <li key={c.key} style={componentRowStyle}>
              <Link
                href={c.drill_url}
                scroll={false}
                style={componentLinkStyle}
              >
                <span style={componentLeftStyle}>
                  <span
                    aria-hidden="true"
                    style={{
                      width: 10,
                      height: 10,
                      background: COLOR_BY_BUCKET[c.bucket],
                      borderRadius: 2,
                      flex: "0 0 auto",
                      marginTop: 6,
                    }}
                  />
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span style={componentNameStyle}>{label}</span>
                    {c.fraction_applied !== 1 && (
                      <span style={fractionBadgeStyle}>
                        {locale === "en"
                          ? `× ${c.fraction_applied} (estimated share)`
                          : `× ${c.fraction_applied.toString().replace(".", ",")} (part estimée)`}
                      </span>
                    )}
                    {note && <span style={noteStyle}>{note}</span>}
                  </span>
                </span>
                <span style={componentAmountBlockStyle}>
                  <span className="tnum" style={amountStyle}>
                    {amountLabel}
                  </span>
                  <span style={pctStyle}>{pctTheme}</span>
                </span>
              </Link>
            </li>
          );
        })}
      </ul>

      {/* Caveats */}
      <div style={caveatsBlockStyle}>
        <p style={caveatsLabelStyle}>{caveatsLabel}</p>
        <p style={caveatsBodyStyle}>{caveats}</p>
      </div>

      {/* Sources rollup (deduped from components) */}
      <SourcesFootnote
        components={components}
        label={sourcesLabel}
        locale={locale}
      />
      </div>
    </details>
  );
}

function SourcesFootnote({
  components,
  label,
  locale,
}: {
  components: CrossCuttingTheme["components"];
  label: string;
  locale: "fr" | "en";
}) {
  // Dedupe by source + source_url
  const seen = new Set<string>();
  const unique: { source: string; source_url: string }[] = [];
  for (const c of components) {
    const key = `${c.source}|${c.source_url}`;
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push({ source: c.source, source_url: c.source_url });
  }
  return (
    <div style={sourcesBlockStyle}>
      <p style={sourcesLabelStyle}>{label}</p>
      <ul style={sourcesListStyle}>
        {unique.map((s, i) => (
          <li key={i} style={sourcesItemStyle}>
            <a
              href={s.source_url}
              target="_blank"
              rel="noopener noreferrer"
              style={sourcesLinkStyle}
            >
              {s.source}
              <span aria-hidden="true" style={{ marginLeft: 4 }}>
                {locale === "en" ? "↗" : "↗"}
              </span>
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const panelStyle: CSSProperties = {
  borderTop: "1px solid var(--rule)",
};

const summaryStyle: CSSProperties = {
  padding: "18px 2px",
  cursor: "pointer",
};

const summaryHeadStyle: CSSProperties = {
  display: "flex",
  alignItems: "baseline",
  gap: 14,
  flexWrap: "wrap",
};

const summaryEyebrowStyle: CSSProperties = {
  fontFamily: "'JetBrains Mono', ui-monospace, monospace",
  fontSize: 11,
  letterSpacing: "0.08em",
  color: "var(--ocre, #c89647)",
  flex: "0 0 auto",
};

const summaryTitleStyle: CSSProperties = {
  fontFamily: "'Inter Tight', Inter, sans-serif",
  fontSize: 20,
  fontWeight: 700,
  letterSpacing: "-0.015em",
  color: "var(--ink)",
  flex: 1,
  minWidth: 0,
};

const summaryAmountStyle: CSSProperties = {
  display: "flex",
  alignItems: "baseline",
  gap: 10,
  flex: "0 0 auto",
  fontSize: 18,
};

const summaryPctStyle: CSSProperties = {
  fontSize: 12,
  letterSpacing: "0.04em",
  color: "var(--muted)",
};

const chevStyle: CSSProperties = {
  fontSize: 20,
  lineHeight: 1,
  color: "var(--muted)",
  display: "inline-block",
};

const bodyStyle: CSSProperties = {
  paddingBottom: 24,
};

const subtitleStyle: CSSProperties = {
  fontSize: 14,
  lineHeight: 1.55,
  color: "var(--ink-2)",
  margin: "0 0 4px",
  maxWidth: "56ch",
};

const shareLineStyle: CSSProperties = {
  fontFamily: "'JetBrains Mono', ui-monospace, monospace",
  fontSize: 13,
  letterSpacing: "0.02em",
  color: "var(--muted)",
  marginTop: 10,
};

const stackWrapStyle: CSSProperties = {
  display: "flex",
  width: "100%",
  height: 22,
  borderRadius: 3,
  overflow: "hidden",
  margin: "10px 0 24px",
  background: "var(--rule)",
  gap: 1,
};

const componentListStyle: CSSProperties = {
  listStyle: "none",
  padding: 0,
  margin: 0,
  display: "flex",
  flexDirection: "column",
  gap: 0,
};

const componentRowStyle: CSSProperties = {
  borderTop: "1px solid var(--rule)",
};

const componentLinkStyle: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 18,
  padding: "14px 4px",
  textDecoration: "none",
  color: "inherit",
};

const componentLeftStyle: CSSProperties = {
  display: "flex",
  gap: 12,
  alignItems: "flex-start",
  flex: 1,
  minWidth: 0,
};

const componentNameStyle: CSSProperties = {
  display: "block",
  fontSize: 15,
  lineHeight: 1.4,
  color: "var(--ink)",
  fontWeight: 500,
};

const fractionBadgeStyle: CSSProperties = {
  display: "inline-block",
  marginLeft: 8,
  padding: "1px 6px",
  background: "var(--rule)",
  borderRadius: 3,
  fontFamily: "'JetBrains Mono', ui-monospace, monospace",
  fontSize: 10,
  letterSpacing: "0.02em",
  color: "var(--muted)",
  fontStyle: "normal",
  verticalAlign: "middle",
};

const noteStyle: CSSProperties = {
  display: "block",
  marginTop: 4,
  fontSize: 12,
  color: "var(--muted)",
  lineHeight: 1.45,
  fontStyle: "italic",
};

const componentAmountBlockStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  alignItems: "flex-end",
  flex: "0 0 auto",
  textAlign: "right",
};

const amountStyle: CSSProperties = {
  fontFamily: "'Inter Tight', Inter, sans-serif",
  fontSize: 18,
  fontWeight: 700,
  letterSpacing: "-0.015em",
  color: "var(--ink)",
  lineHeight: 1.1,
};

const pctStyle: CSSProperties = {
  fontFamily: "'JetBrains Mono', ui-monospace, monospace",
  fontSize: 11,
  letterSpacing: "0.04em",
  color: "var(--muted)",
  marginTop: 4,
};

const caveatsBlockStyle: CSSProperties = {
  marginTop: 22,
  padding: "16px 18px",
  background: "var(--bg-warm, #fbf7f1)",
  borderLeft: "2px solid var(--ocre, #c89647)",
};

const caveatsLabelStyle: CSSProperties = {
  fontFamily: "'JetBrains Mono', ui-monospace, monospace",
  fontSize: 10,
  letterSpacing: "0.1em",
  textTransform: "uppercase",
  color: "var(--ocre, #c89647)",
  margin: "0 0 6px",
};

const caveatsBodyStyle: CSSProperties = {
  fontSize: 13,
  lineHeight: 1.55,
  color: "var(--muted-2, #555)",
  margin: 0,
  fontStyle: "italic",
};

const sourcesBlockStyle: CSSProperties = {
  marginTop: 18,
  paddingTop: 16,
  borderTop: "1px dashed var(--rule)",
};

const sourcesLabelStyle: CSSProperties = {
  fontFamily: "'JetBrains Mono', ui-monospace, monospace",
  fontSize: 10,
  letterSpacing: "0.1em",
  textTransform: "uppercase",
  color: "var(--muted)",
  margin: "0 0 6px",
};

const sourcesListStyle: CSSProperties = {
  listStyle: "none",
  padding: 0,
  margin: 0,
  display: "flex",
  flexDirection: "column",
  gap: 4,
};

const sourcesItemStyle: CSSProperties = {
  fontSize: 12,
  lineHeight: 1.45,
};

const sourcesLinkStyle: CSSProperties = {
  fontFamily: "'JetBrains Mono', ui-monospace, monospace",
  fontSize: 11,
  letterSpacing: "0.02em",
  color: "var(--muted-2, #555)",
  textDecoration: "underline",
  textDecorationColor: "var(--rule)",
  textUnderlineOffset: 3,
};
