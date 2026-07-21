"use client";

import { useMemo, useState } from "react";
import dynamic from "next/dynamic";
import type { PlaceEntry, PlacesConfig, PlacesSort } from "./types";
import PlaceRow from "./PlaceRow";

// Map is Leaflet — client-only, no SSR.
const PlacesMap = dynamic(() => import("./PlacesMap"), { ssr: false });

/** Accent- and case-insensitive normalize; every query token must match. */
const norm = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

/**
 * City-agnostic places explorer: a filter bar (search · family chips · area ·
 * sort · count) over a sticky map + a scrolling column of compact media-rows.
 * Map and list are one state — filtering drives both, and hover is bidirectional
 * (hover a row → its marker rises; hover a marker → its row highlights). Hover
 * never scrolls the list; clicking a marker opens the fiche.
 */
export default function PlacesExplorer({
  entries,
  config,
}: {
  entries: PlaceEntry[];
  config: PlacesConfig;
}) {
  const s = config.strings;
  const [query, setQuery] = useState("");
  const [famActive, setFamActive] = useState<Set<string>>(() => new Set(config.families.map((f) => f.key)));
  const [areaSel, setAreaSel] = useState("");
  const [sortKey, setSortKey] = useState<PlacesSort>(config.sorts[0]?.key ?? "name-asc");
  const [hovered, setHovered] = useState<string | null>(null);

  const colorOf = useMemo(() => {
    const m: Record<string, string> = {};
    for (const f of config.families) m[f.key] = f.color;
    return (key: string) => m[key] ?? config.families[0]?.color ?? "#4a3aa7";
  }, [config.families]);

  // Only offer family chips / area options that actually occur in the data.
  const famCounts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const e of entries) c[e.familyKey] = (c[e.familyKey] ?? 0) + 1;
    return c;
  }, [entries]);

  const areaOptions = useMemo(() => {
    const m = new Map<string, { key: string; label: string; n: number }>();
    for (const e of entries) {
      if (!e.areaKey) continue;
      const cur = m.get(e.areaKey);
      if (cur) cur.n += 1;
      else m.set(e.areaKey, { key: e.areaKey, label: e.areaLabel, n: 1 });
    }
    const arr = [...m.values()];
    arr.sort((a, b) =>
      config.areaSort === "numeric" ? Number(a.key) - Number(b.key) : a.label.localeCompare(b.label),
    );
    return arr;
  }, [entries, config.areaSort]);

  const haystacks = useMemo(() => {
    const m: Record<string, string> = {};
    for (const e of entries) m[e.slug] = norm(`${e.name} ${e.kind} ${e.areaLabel}`);
    return m;
  }, [entries]);

  const filtered = useMemo(() => {
    const tokens = norm(query).split(/\s+/).filter(Boolean);
    return entries.filter((e) => {
      if (!famActive.has(e.familyKey)) return false;
      if (areaSel && e.areaKey !== areaSel) return false;
      if (tokens.length) {
        const hay = haystacks[e.slug];
        if (!tokens.every((tk) => hay.includes(tk))) return false;
      }
      return true;
    });
  }, [entries, famActive, areaSel, query, haystacks]);

  const visibleSlugs = useMemo(() => new Set(filtered.map((e) => e.slug)), [filtered]);

  const sorted = useMemo(() => {
    const arr = filtered.slice();
    if (sortKey === "metric-desc") {
      arr.sort((a, b) => (b.metric ?? -Infinity) - (a.metric ?? -Infinity) || a.name.localeCompare(b.name));
    } else {
      arr.sort((a, b) => a.name.localeCompare(b.name));
    }
    return arr;
  }, [filtered, sortKey]);

  const toggleFam = (key: string) =>
    setFamActive((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next.size ? next : new Set(config.families.map((f) => f.key));
    });

  // NB: hover only highlights (row background + marker dim). We deliberately do
  // NOT scroll the list to the hovered marker — moving the user's scroll on
  // hover/click reads as a disorienting "jump". Clicking a marker opens the
  // fiche; the list stays put.

  return (
    <div className="fx-places-explorer">
      <div className="fx-places-bar">
        <input
          type="search"
          className="fx-places-search"
          placeholder={s.searchPlaceholder}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label={s.searchPlaceholder}
        />

        <div className="fx-places-chips" role="group" aria-label={s.filtersAria}>
          {config.families.filter((f) => famCounts[f.key]).map((f) => {
            const on = famActive.has(f.key);
            return (
              <button
                key={f.key}
                type="button"
                className="fx-lieux-fam-chip"
                aria-pressed={on}
                onClick={() => toggleFam(f.key)}
                style={{ opacity: on ? 1 : 0.4 }}
              >
                <span className="fx-fam-dot" style={{ background: f.color }} />
                {f.label}
                <span className="tnum" style={{ color: "var(--muted)", marginLeft: 4 }}>{famCounts[f.key]}</span>
              </button>
            );
          })}
        </div>

        <div className="fx-places-selects">
          {areaOptions.length > 1 && (
            <label className="fx-places-select">
              <span className="fx-places-select-label">{s.areaLabel}</span>
              <select value={areaSel} onChange={(e) => setAreaSel(e.target.value)}>
                <option value="">{s.areaAll}</option>
                {areaOptions.map((a) => (
                  <option key={a.key} value={a.key}>{a.label} ({a.n})</option>
                ))}
              </select>
            </label>
          )}
          {config.sorts.length > 1 && (
            <label className="fx-places-select">
              <span className="fx-places-select-label">{s.sortLabel}</span>
              <select value={sortKey} onChange={(e) => setSortKey(e.target.value as PlacesSort)}>
                {config.sorts.map((so) => (
                  <option key={so.key} value={so.key}>{so.label}</option>
                ))}
              </select>
            </label>
          )}
          <span className="fx-places-count tnum">{s.count(sorted.length)}</span>
        </div>
      </div>

      <div className="fx-lieux-split">
        <div className="fx-lieux-map-col">
          <PlacesMap entries={entries} config={config} visibleSlugs={visibleSlugs} hovered={hovered} onHover={setHovered} />
        </div>
        {sorted.length ? (
          <ul className="fx-places-list" aria-label={s.listAria}>
            {sorted.map((e) => (
              <PlaceRow
                key={e.slug}
                entry={e}
                config={config}
                color={colorOf(e.familyKey)}
                hovered={hovered === e.slug}
                onHover={setHovered}
              />
            ))}
          </ul>
        ) : (
          <p className="fx-places-empty">{s.empty}</p>
        )}
      </div>
    </div>
  );
}
