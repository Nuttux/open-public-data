"use client";

/**
 * A search field that is a button: it opens the commune search that lives on
 * every page (SearchModal, event fx:open-search). Used where a page wants the
 * reader to start from their own commune (« Pour les mairies », 2026-09-16).
 * Clicks are measured as cta_click through data-cta.
 */
export default function FindCommuneButton({ label, cta }: { label: string; cta: string }) {
  return (
    <button
      type="button"
      className="fx-cities-find"
      data-cta={cta}
      onClick={() => window.dispatchEvent(new CustomEvent("fx:open-search"))}
    >
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
        <circle cx="11" cy="11" r="7" />
        <line x1="20" y1="20" x2="16.5" y2="16.5" />
      </svg>
      <span>{label}</span>
    </button>
  );
}
