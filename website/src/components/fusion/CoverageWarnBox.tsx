"use client";

import type { ReactNode } from "react";

/**
 * Ocre-bordered warning box used when a fiche section has no matched data
 * (partial coverage). Markup extracted verbatim from ProjetFiche /
 * ChapitreFiche (identical modulo strings).
 */
export default function CoverageWarnBox({
  title,
  children,
}: {
  title: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="fx-fiche-section">
      <div
        style={{
          padding: "16px 18px",
          border: "1px solid var(--rule)",
          background: "rgba(166, 118, 56, 0.04)",
          borderLeft: "3px solid var(--ocre)",
          fontFamily: "var(--f-ui)",
          fontSize: 13.5,
          lineHeight: 1.55,
          color: "var(--ink-2)",
        }}
      >
        <div
          style={{
            fontFamily: "var(--f-mono)",
            fontSize: 11,
            letterSpacing: 1,
            textTransform: "uppercase",
            color: "var(--ocre)",
            marginBottom: 8,
            fontWeight: 600,
          }}
        >
          {title}
        </div>
        <p style={{ margin: 0 }}>{children}</p>
      </div>
    </section>
  );
}
