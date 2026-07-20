"use client";

import type { CSSProperties, ReactNode } from "react";

/**
 * The blue-underline mono "Voir les N autres" expander. Style extracted
 * verbatim from the four inline copies (AssociationFiche ×2,
 * FournisseurFiche, BailleurFiche).
 */
export default function ShowMoreButton({
  onClick,
  children,
  style,
}: {
  onClick: () => void;
  children: ReactNode;
  style?: CSSProperties;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        marginTop: 10,
        background: "transparent",
        border: "none",
        padding: "8px 0",
        cursor: "pointer",
        fontFamily: "var(--f-mono)",
        fontSize: 12.5,
        color: "var(--bleu)",
        borderBottom: "1px solid var(--bleu)",
        letterSpacing: "0.02em",
        ...style,
      }}
    >
      {children}
    </button>
  );
}
