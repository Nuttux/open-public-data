"use client";

import { useEffect, useState } from "react";
import type { DataFreshness, FreshnessSource } from "@/lib/data-freshness";

// Client leaf de /methode : la fraîcheur est lue dans le navigateur depuis le
// JSON publié (comme AuditPanel), donc toujours celle du déploiement en ligne.
// Vocabulaire fixé : « publié par la Ville le · mis à jour sur Qipu le ».

function fmtDate(iso: string | null | undefined, isFr: boolean): string {
  if (!iso) return "—";
  const d = new Date(iso + (iso.length === 10 ? "T00:00:00Z" : ""));
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(isFr ? "fr-FR" : "en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
}

/** « il y a 1 mois », « il y a 6 ans » — l'âge de la dernière publication de la Ville. */
function ageText(iso: string | null | undefined, now: Date, isFr: boolean): string {
  if (!iso) return "—";
  const d = new Date(iso.length === 10 ? `${iso}T00:00:00Z` : iso);
  if (Number.isNaN(d.getTime())) return "—";
  const days = Math.max(0, Math.round((now.getTime() - d.getTime()) / 86_400_000));
  if (days < 45) return isFr ? `il y a ${days} j` : `${days} d ago`;
  const months = Math.round(days / 30.4);
  if (months < 18) return isFr ? `il y a ${months} mois` : `${months} mo ago`;
  const years = Math.round(days / 365.25);
  return isFr ? `il y a ${years} ans` : `${years} yrs ago`;
}

function yearsText(s: FreshnessSource, isFr: boolean): string {
  const y = s.years;
  if (!y || y.min === null || y.max === null) return "—";
  const span = y.min === y.max ? String(y.min) : `${y.min}–${y.max}`;
  if (y.partial.length === 0) return span;
  const list = y.partial.map((p) => `${p.annee}`).join(", ");
  return isFr ? `${span} · ${list} en cours, non publiée` : `${span} · ${list} in progress, not published`;
}

export default function FreshnessPanel({ isFr }: { isFr: boolean }) {
  const [data, setData] = useState<DataFreshness | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/data/data_freshness.json")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (!cancelled && d) setData(d); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  if (!data) return null;

  // La plus récente publication de la Ville, toutes sources confondues.
  const latestCity = data.sources.map((s) => s.published_by_city_at).filter((d): d is string => !!d).sort().at(-1);
  // Âge relatif calculé à la date du refresh (pas « maintenant ») : stable
  // entre deux lundis, et fidèle à ce que le robot a vu.
  const asOf = new Date(`${data.updated_on_qipu_at}T00:00:00Z`);

  return (
    <>
      <p className="fx-note" style={{ marginBottom: 18 }}>
        {isFr
          ? <>Site <b>mis à jour le {fmtDate(data.updated_on_qipu_at, true)}</b>. Le robot relit chaque source de la Ville tous les lundis, rejoue les contrôles et ne publie que ce qui passe. Dernière publication de la Ville parmi ces sources : <b>{fmtDate(latestCity, true)}</b>.</>
          : <>Site <b>updated on {fmtDate(data.updated_on_qipu_at, false)}</b>. Every Monday the robot re-reads each City source, replays the checks and publishes only what passes. Latest City publication among these sources: <b>{fmtDate(latestCity, false)}</b>.</>}
      </p>
      <div className="fx-sources-table fx-fresh-table" lang={isFr ? "fr" : "en"} style={{ marginBottom: 8 }}>
        <div className="fx-sources-table-head">
          <span>{isFr ? "Source (Ville de Paris)" : "Source (City of Paris)"}</span>
          <span>{isFr ? "Publiée par la Ville le" : "Published by the City on"}</span>
          <span>{isFr ? "Années disponibles" : "Years available"}</span>
          <span>{isFr ? "Ancienneté" : "Age"}</span>
        </div>
        {data.sources.map((s) => (
          <div key={s.source_id} className="fx-sources-table-row">
            <span className="portal">
              {s.dataset_page_url ? (
                <a href={s.dataset_page_url} target="_blank" rel="noopener noreferrer">{isFr ? s.label_fr : s.label_en} ↗</a>
              ) : (isFr ? s.label_fr : s.label_en)}
            </span>
            <span className="url"><code>{fmtDate(s.published_by_city_at, isFr)}</code></span>
            <span className="datasets">{yearsText(s, isFr)}</span>
            <span className="fresh">{ageText(s.published_by_city_at, asOf, isFr)}</span>
          </div>
        ))}
      </div>
      <p className="fx-note" style={{ marginBottom: 28 }}>
        {isFr
          ? <>Une année « en cours » (quelques mois publiés) n&apos;est jamais affichée comme une année pleine : elle est écartée jusqu&apos;à ce que son volume rejoigne celui des années précédentes. <a href="/data/data_freshness.json" target="_blank" rel="noopener noreferrer">JSON brut ↗</a></>
          : <>A year &ldquo;in progress&rdquo; (a few months published) is never shown as a full year: it is held back until its volume matches previous years. <a href="/data/data_freshness.json" target="_blank" rel="noopener noreferrer">Raw JSON ↗</a></>}
      </p>
    </>
  );
}
