"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useLocale } from "@/lib/localeContext";

type ChainStep = {
  layer: "mart" | "core" | "intermediate" | "staging" | "raw" | "source";
  name: string;
  github?: string;
  url?: string;
  role_fr?: string;
  role_en?: string;
};

type ChartLineage = {
  label_fr: string;
  label_en: string;
  page_fr: string;
  page_en: string;
  json_export: string;
  what_it_shows_fr: string;
  what_it_shows_en: string;
  chain: ChainStep[];
};

type LineagePayload = {
  schema_version: number;
  description?: string;
  github_blob: string;
  charts: Record<string, ChartLineage>;
};

const LAYER_LABEL_FR: Record<ChainStep["layer"], string> = {
  source: "Source officielle",
  raw: "Table raw (BigQuery)",
  staging: "Staging (typage, nettoyage)",
  intermediate: "Intermediate (enrichissement)",
  core: "Core (OBT row-level)",
  mart: "Mart (agrégation chart)",
};

const LAYER_LABEL_EN: Record<ChainStep["layer"], string> = {
  source: "Official source",
  raw: "Raw table (BigQuery)",
  staging: "Staging (typing, cleaning)",
  intermediate: "Intermediate (enrichment)",
  core: "Core (row-level OBT)",
  mart: "Mart (chart aggregation)",
};

const LAYER_ORDER: ChainStep["layer"][] = ["source", "raw", "staging", "intermediate", "core", "mart"];

export default function DataProvenance({ chartId, year }: { chartId: string; year?: number }) {
  const { locale } = useLocale();
  const isFr = locale === "fr";
  const [open, setOpen] = useState(false);
  const [payload, setPayload] = useState<LineagePayload | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();

  useEffect(() => {
    if (payload) return;
    fetch("/data/data_lineage.json")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => { if (data) setPayload(data); })
      .catch(() => {});
  }, [payload]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        triggerRef.current?.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    // Focus dialog on open
    dialogRef.current?.focus();
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open]);

  const chart = payload?.charts[chartId];

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className="fx-provenance-btn"
        onClick={() => setOpen(true)}
        aria-label={isFr ? "Voir la provenance des données" : "View data provenance"}
        aria-haspopup="dialog"
      >
        <span aria-hidden="true" style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" />
            <path d="M12 16v-4" />
            <path d="M12 8h.01" />
          </svg>
          <span>{isFr ? "Provenance" : "Provenance"}</span>
        </span>
      </button>

      {open && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          className="fx-provenance-overlay"
          onClick={(e) => { if (e.target === e.currentTarget) setOpen(false); }}
        >
          <div
            ref={dialogRef}
            tabIndex={-1}
            className="fx-provenance-dialog"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="fx-provenance-header">
              <div>
                <div className="fx-provenance-kicker">{isFr ? "— Provenance" : "— Provenance"}</div>
                <h2 id={titleId} className="fx-provenance-title">
                  {chart ? (isFr ? chart.label_fr : chart.label_en) : (isFr ? "Provenance des données" : "Data provenance")}
                </h2>
              </div>
              <button
                type="button"
                className="fx-provenance-close"
                onClick={() => setOpen(false)}
                aria-label={isFr ? "Fermer" : "Close"}
              >
                ×
              </button>
            </div>

            {!chart ? (
              <p className="fx-provenance-empty">
                {payload ? (isFr ? "Provenance non encore documentée pour ce chart." : "Provenance not yet documented for this chart.") : (isFr ? "Chargement…" : "Loading…")}
              </p>
            ) : (
              <>
                <p className="fx-provenance-what">
                  {isFr ? chart.what_it_shows_fr : chart.what_it_shows_en}
                </p>

                <div className="fx-provenance-export">
                  <span className="fx-provenance-label">{isFr ? "Le JSON brut consommé par ce chart" : "Raw JSON consumed by this chart"}</span>
                  <code>
                    {year ? (
                      <a
                        href={chart.json_export.replace("{year}", String(year))}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        {chart.json_export.replace("{year}", String(year))} ↗
                      </a>
                    ) : (
                      <span>{chart.json_export}</span>
                    )}
                  </code>
                </div>

                <ol className="fx-provenance-chain">
                  {[...chart.chain].sort((a, b) => LAYER_ORDER.indexOf(a.layer) - LAYER_ORDER.indexOf(b.layer)).map((step, i) => (
                    <li key={i} className="fx-provenance-step">
                      <div className="fx-provenance-step-layer">
                        {isFr ? LAYER_LABEL_FR[step.layer] : LAYER_LABEL_EN[step.layer]}
                      </div>
                      <div className="fx-provenance-step-name">
                        {step.url || step.github ? (
                          <a href={step.url || step.github} target="_blank" rel="noopener noreferrer">
                            <code>{step.name}</code> ↗
                          </a>
                        ) : (
                          <code>{step.name}</code>
                        )}
                      </div>
                      <div className="fx-provenance-step-role">
                        {(isFr ? step.role_fr : step.role_en) ?? ""}
                      </div>
                    </li>
                  ))}
                </ol>

                <div className="fx-provenance-footer">
                  <a href="/methode#audit">
                    {isFr ? "Audit data quality (16+ contrôles) →" : "Data quality audit (16+ checks) →"}
                  </a>
                  <a href="/methode#sources">
                    {isFr ? "Toutes les sources →" : "All sources →"}
                  </a>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
