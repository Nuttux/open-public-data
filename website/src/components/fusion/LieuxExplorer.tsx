"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import type { LieuIndexEntry } from "@/lib/lieux-data";
import { useT } from "@/lib/localeContext";
import { clearDrawerStack } from "./DetailDrawer";
import LieuxMap, { FAMILLES, COLOR } from "./LieuxMap";

/**
 * Explorateur des lieux — carte et liste sont deux vues du MÊME état :
 * les filtres de famille pilotent les deux, et survoler une carte-lieu
 * met en avant son marqueur. Sans cet état partagé, la liste n'est qu'un
 * doublon mort sous la carte.
 */
export default function LieuxExplorer({ lieux }: { lieux: LieuIndexEntry[] }) {
  const t = useT();
  const [actives, setActives] = useState<Set<string>>(() => new Set(FAMILLES.map((f) => f.key)));
  const [hovered, setHovered] = useState<string | null>(null);

  // On est sur la LISTE : aucune chaîne de drill-down en cours. On vide la pile
  // pour qu'une fiche ouverte d'ici n'affiche pas de pastille « ← Retour » (la
  // liste est déjà derrière le drawer : fermer suffit).
  useEffect(() => { clearDrawerStack(); }, []);

  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const l of lieux) c[l.famille] = (c[l.famille] ?? 0) + 1;
    return c;
  }, [lieux]);

  const visibles = useMemo(
    () => lieux.filter((l) => actives.has(l.famille)).sort((a, b) => (b.argent_total_eur ?? 0) - (a.argent_total_eur ?? 0) || (a.depuis ?? 9999) - (b.depuis ?? 9999)),
    [lieux, actives],
  );

  const toggle = (key: string) =>
    setActives((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next.size ? next : new Set(FAMILLES.map((f) => f.key));
    });

  return (
    <div>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 10 }} role="group" aria-label={t("fx.lieux.filtres_aria")}>
        {FAMILLES.filter((f) => counts[f.key]).map((f) => {
          const on = actives.has(f.key);
          return (
            <button
              key={f.key}
              onClick={() => toggle(f.key)}
              aria-pressed={on}
              style={{
                display: "inline-flex", alignItems: "center", gap: 6,
                fontFamily: "var(--f-mono)", fontSize: 10, letterSpacing: ".05em", textTransform: "uppercase",
                padding: "6px 9px", cursor: "pointer",
                border: `1px solid ${on ? "var(--ink)" : "var(--rule)"}`,
                background: "var(--bg)", color: on ? "var(--ink)" : "var(--muted)",
                opacity: on ? 1 : 0.55,
              }}
            >
              <span style={{ width: 9, height: 9, borderRadius: "50%", background: f.color, border: "1px solid var(--ink)" }} />
              {t(f.i18n)}
              <span className="tnum" style={{ color: "var(--muted)" }}>{counts[f.key]}</span>
            </button>
          );
        })}
      </div>

      <LieuxMap lieux={lieux} actives={actives} hovered={hovered} onHover={setHovered} />

      <div className="fx-lieux-grid">
        {visibles.map((l) => (
          <Link
            key={l.slug}
            href={`/fr/city/paris/lieu/${l.slug}`}
            scroll={false}
            className="fx-lieu-card"
            onMouseEnter={() => setHovered(l.slug)}
            onMouseLeave={() => setHovered(null)}
            onFocus={() => setHovered(l.slug)}
            onBlur={() => setHovered(null)}
          >
            <div className="fx-lieu-card-img">
              {l.photo ? (
                <img src={l.photo} alt="" loading="lazy" />
              ) : (
                <span className="fx-lieu-card-noimg" style={{ background: COLOR[l.famille] }} />
              )}
            </div>
            <div className="fx-lieu-card-body">
              <span className="fx-lieu-card-kicker">
                <span style={{ width: 7, height: 7, borderRadius: "50%", background: COLOR[l.famille], display: "inline-block", marginRight: 6 }} />
                {l.kind_fr}
                {l.arrondissement > 0 ? ` · ${l.arrondissement}${l.arrondissement === 1 ? "er" : "e"}` : ""}
              </span>
              <span className="fx-lieu-card-name">{l.name}</span>
              {(l.argent_total_eur ?? 0) > 0 ? (
                <span className="fx-lieu-card-n tnum">
                  {l.argent_total_eur! >= 1e6
                    ? `${(l.argent_total_eur! / 1e6).toLocaleString("fr-FR", { maximumFractionDigits: 1 })} M€`
                    : `${Math.round(l.argent_total_eur! / 1e3)} k€`}{" "}
                  <span>{t("fx.lieux.card_argent")}</span>
                </span>
              ) : l.depuis ? (
                <span className="fx-lieu-card-n tnum" style={{ color: "var(--ocre)" }}>
                  {t("fx.lieux.card_depuis")} {l.depuis}
                </span>
              ) : null}
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
