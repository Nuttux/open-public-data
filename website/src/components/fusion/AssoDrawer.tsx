"use client";

import { useEffect, useRef } from "react";

export type AssoFiche = {
  name: string;
  theme: string | null;
  amount: number;
  nb: number;
  history: { year: number; amount: number }[];
  currentYear: number;
};

type Props = {
  fiche: AssoFiche | null;
  onClose: () => void;
};

const fmtEur = (n: number) => {
  if (n >= 1e9) return new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 2 }).format(n / 1e9) + " Md €";
  if (n >= 1e6) return new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 1 }).format(n / 1e6) + " M €";
  if (n >= 1e3) return new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 }).format(n / 1e3) + " k €";
  return new Intl.NumberFormat("fr-FR").format(n) + " €";
};

/**
 * Slide-over drawer for the "fiche" pattern — matches the mockup's modal
 * (right-anchored side panel, dim backdrop, close on Esc / outside click).
 * Fully controlled : the parent owns `fiche` state and passes a close handler.
 */
export default function AssoDrawer({ fiche, onClose }: Props) {
  const panelRef = useRef<HTMLDivElement>(null);
  const open = fiche !== null;

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open, onClose]);

  // Focus the panel when opened
  useEffect(() => {
    if (open) panelRef.current?.focus();
  }, [open]);

  if (!fiche) return null;

  const histMax = Math.max(...fiche.history.map((h) => h.amount), 1);
  const filled = fiche.history.filter((h) => h.amount > 0);
  const first = filled[0];
  const last = filled[filled.length - 1];
  const globalDelta = first && last && first.amount > 0 && first.year !== last.year
    ? ((last.amount - first.amount) / first.amount) * 100
    : null;
  const totalAllYears = fiche.history.reduce((s, h) => s + h.amount, 0);

  return (
    <>
      <div className="fx-drawer-backdrop" onClick={onClose} aria-hidden="true" />
      <div
        ref={panelRef}
        className="fx-drawer"
        role="dialog"
        aria-modal="true"
        aria-labelledby="fx-drawer-title"
        tabIndex={-1}
      >
        <div className="fx-drawer-head">
          <div className="fx-drawer-kind">
            Fiche bénéficiaire · {fiche.theme ?? "—"}
          </div>
          <button
            type="button"
            className="fx-drawer-close"
            aria-label="Fermer"
            onClick={onClose}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <line x1="6" y1="6" x2="18" y2="18" />
              <line x1="18" y1="6" x2="6" y2="18" />
            </svg>
          </button>
        </div>

        <div className="fx-drawer-body">
          <h2 id="fx-drawer-title" className="fx-drawer-name">{fiche.name}</h2>

          <div className="fx-drawer-kpis">
            <div>
              <div className="fx-drawer-kpi-label">Subvention {fiche.currentYear}</div>
              <div className="fx-drawer-kpi-value tnum">{fmtEur(fiche.amount)}</div>
            </div>
            <div>
              <div className="fx-drawer-kpi-label">Nombre de lignes</div>
              <div className="fx-drawer-kpi-value tnum">{fiche.nb}</div>
            </div>
            <div>
              <div className="fx-drawer-kpi-label">Cumul historique</div>
              <div className="fx-drawer-kpi-value tnum">{fmtEur(totalAllYears)}</div>
            </div>
            <div>
              <div className="fx-drawer-kpi-label">{first?.year ?? "—"}→{last?.year ?? "—"}</div>
              <div className="fx-drawer-kpi-value tnum" style={{ color: globalDelta == null ? "var(--muted)" : globalDelta > 0 ? "var(--rouge)" : "var(--bleu)" }}>
                {globalDelta == null
                  ? "—"
                  : (globalDelta >= 0 ? "+ " : "− ") +
                    new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 1 }).format(Math.abs(globalDelta)) +
                    " %"}
              </div>
            </div>
          </div>

          <div className="fx-drawer-section-label">Historique des subventions</div>
          <div className="fx-drawer-history">
            {fiche.history.map((h, i) => {
              const prev = fiche.history[i - 1];
              const delta = prev && prev.amount > 0 && h.amount > 0 ? ((h.amount - prev.amount) / prev.amount) * 100 : null;
              const isCurrent = h.year === fiche.currentYear;
              return (
                <div key={h.year} className={isCurrent ? "fx-drawer-hrow fx-drawer-hrow-on" : "fx-drawer-hrow"}>
                  <span className="year">{h.year}</span>
                  <span className="bar">
                    {h.amount > 0 && (
                      <span
                        className="fill"
                        style={{
                          width: `${(h.amount / histMax) * 100}%`,
                          background: isCurrent ? "var(--rouge)" : "var(--ink)",
                        }}
                      />
                    )}
                  </span>
                  <span className="amount tnum">
                    {h.amount > 0 ? fmtEur(h.amount) : <span className="muted">—</span>}
                  </span>
                  <span className="delta">
                    {delta == null ? "" : (
                      <span style={{ color: delta >= 0 ? "var(--rouge)" : "var(--bleu)" }}>
                        {delta >= 0 ? "↑" : "↓"} {new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 1 }).format(Math.abs(delta))} %
                      </span>
                    )}
                  </span>
                </div>
              );
            })}
          </div>

          <p className="fx-drawer-note">
            Les montants sont agrégés depuis le jeu open data « Subventions accordées ».
            Une asso peut recevoir plusieurs subventions la même année (reconductions, avenants).
          </p>
        </div>

        <div className="fx-drawer-foot">
          <a
            className="fx-btn fx-btn-small"
            href={`https://opendata.paris.fr/explore/dataset/subventions-accordees-et-refusees-ville-de-paris/table/?q=${encodeURIComponent(fiche.name)}`}
            target="_blank"
            rel="noopener noreferrer"
          >
            Voir sur opendata.paris.fr ↗
          </a>
          <button type="button" className="fx-btn fx-btn-small" onClick={onClose}>
            Fermer
          </button>
        </div>
      </div>
    </>
  );
}
