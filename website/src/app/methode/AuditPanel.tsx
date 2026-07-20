"use client";

import { useEffect, useState } from "react";

// Client leaf of the /methode page (the rest is server-rendered): the audit
// summary is fetched in the browser from the published JSON, exactly like the
// raw-JSON link next to it, so the panel always reflects the deployed file.

type AuditCheck = {
  id: string;
  category: string;
  label: string;
  status: "pass" | "warn" | "fail";
  threshold?: string;
  actual?: string;
  note?: string;
  sources?: string[];
};

type AuditPayload = {
  schema_version: number;
  generated_at: string;
  project: string;
  summary: { total: number; pass: number; warn: number; fail: number };
  checks: AuditCheck[];
};

export default function AuditPanel({ isFr }: { isFr: boolean }) {
  const [audit, setAudit] = useState<AuditPayload | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/data/data_quality_audit.json")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => { if (!cancelled && data) setAudit(data); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  return audit ? (
    <>
      <div className="fx-meth-stats" style={{ marginBottom: 16 }}>
        <div className="fx-meth-stat">
          <span className="n">{isFr ? "Contrôles" : "Checks"}</span>
          <span className="v">{audit.summary.total}</span>
          <span className="c">{isFr ? "rejoués à chaque update" : "replayed on every update"}</span>
        </div>
        <div className="fx-meth-stat">
          <span className="n">{isFr ? "Réussis" : "Passing"}</span>
          <span className="v" style={{ color: "var(--fx-ok, #1e7e34)" }}>{audit.summary.pass}</span>
          <span className="c">{isFr ? "dans les seuils" : "within thresholds"}</span>
        </div>
        <div className="fx-meth-stat">
          <span className="n">{isFr ? "Warnings" : "Warnings"}</span>
          <span className="v" style={{ color: "var(--fx-warn, #b97400)" }}>{audit.summary.warn}</span>
          <span className="c">{isFr ? "limitations source documentées" : "documented source limitations"}</span>
        </div>
        <div className="fx-meth-stat">
          <span className="n">{isFr ? "Échecs" : "Failures"}</span>
          <span className="v" style={{ color: audit.summary.fail === 0 ? "var(--fx-ok, #1e7e34)" : "var(--fx-fail, #c0392b)" }}>{audit.summary.fail}</span>
          <span className="c">{isFr ? "bloquant pour la publication" : "blocking publication"}</span>
        </div>
      </div>

      <p className="fx-note" style={{ marginBottom: 20 }}>
        {isFr
          ? <>Dernier rejeu : <b>{new Date(audit.generated_at).toLocaleString("fr-FR", { dateStyle: "long", timeStyle: "short" })}</b>.</>
          : <>Last run: <b>{new Date(audit.generated_at).toLocaleString("en-GB", { dateStyle: "long", timeStyle: "short" })}</b>.</>}
      </p>

      <details className="fx-collapsible">
        <summary>{isFr ? `Voir le détail des ${audit.summary.total} contrôles` : `View all ${audit.summary.total} checks`}</summary>
        <div className="fx-audit-table" style={{ marginTop: 12 }}>
          <div className="fx-audit-table-head">
            <span>{isFr ? "Contrôle" : "Check"}</span>
            <span>{isFr ? "Catégorie" : "Category"}</span>
            <span>{isFr ? "Seuil" : "Threshold"}</span>
            <span>{isFr ? "Statut · mesure" : "Status · value"}</span>
          </div>
          {audit.checks.map((c) => (
            <div key={c.id} className="fx-audit-table-row">
              <span className="check-label">{c.label}</span>
              <span className="check-category">{c.category}</span>
              <span className="check-threshold">{c.threshold ?? "—"}</span>
              <span className="check-status">
                <span
                  aria-label={c.status}
                  style={{
                    display: "inline-block",
                    padding: "2px 8px",
                    borderRadius: 4,
                    fontWeight: 600,
                    marginRight: 8,
                    color: c.status === "pass" ? "var(--fx-ok, #1e7e34)" : c.status === "warn" ? "var(--fx-warn, #b97400)" : "var(--fx-fail, #c0392b)",
                    background: c.status === "pass" ? "rgba(30, 126, 52, 0.10)" : c.status === "warn" ? "rgba(185, 116, 0, 0.10)" : "rgba(192, 57, 43, 0.10)",
                  }}
                >
                  {c.status === "pass" ? "✓" : c.status === "warn" ? "⚠" : "✗"} {c.status.toUpperCase()}
                </span>
                {c.actual}
              </span>
            </div>
          ))}
        </div>
      </details>
    </>
  ) : (
    <p className="fx-note">{isFr ? "Chargement de l'audit…" : "Loading audit…"}</p>
  );
}
