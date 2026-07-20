"use client";

import { useMemo, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import type { SfPlaceIndexEntry } from "@/lib/us/sf-places-data";
import { GROUPS, colorForFamily } from "./SfPlacesMap";

// Map is Leaflet — client-only, no SSR (matches the Paris LieuxExplorer).
const SfPlacesMap = dynamic(() => import("./SfPlacesMap"), { ssr: false });

const GROUP_OF: Record<string, string> = {
  park: "green", water: "green",
  library: "learning", culture: "learning",
  health: "health",
  civic: "civic",
  port: "infra", transit: "infra", fire: "infra",
};

export default function SfPlacesExplorer({ places }: { places: SfPlaceIndexEntry[] }) {
  const allGroups = useMemo(() => new Set(GROUPS.map((g) => g.key)), []);
  const [active, setActive] = useState<Set<string>>(allGroups);
  const [hover, setHover] = useState<string | null>(null);

  const toggle = (key: string) => {
    setActive((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      // never leave the map empty — re-enable all if the last one is removed
      return next.size === 0 ? new Set(allGroups) : next;
    });
  };

  const visible = places.filter((p) => active.has(GROUP_OF[p.family] ?? "civic"));

  return (
    <div className="fx-lieux-explorer">
      {/* Family filter */}
      <div className="fx-lieux-filters" role="group" aria-label="Filter places by kind">
        {GROUPS.map((g) => {
          const on = active.has(g.key);
          return (
            <button
              key={g.key}
              type="button"
              className="fx-lieux-fam-chip"
              aria-pressed={on}
              onClick={() => toggle(g.key)}
              style={{ opacity: on ? 1 : 0.4 }}
            >
              <span className="fx-fam-dot" style={{ background: g.color }} />
              {g.label}
            </button>
          );
        })}
      </div>

      <div className="fx-lieux-split">
        <div className="fx-lieux-map-col">
          <SfPlacesMap places={visible} active={active} onHover={setHover} />
        </div>
        <ul className="fx-lieux-list">
          {visible
            .slice()
            .sort((a, b) => a.name.localeCompare(b.name))
            .map((p) => (
              <li
                key={p.slug}
                className="fx-lieux-list-row"
                onMouseEnter={() => setHover(p.slug)}
                onMouseLeave={() => setHover(null)}
                style={{ outline: hover === p.slug ? "2px solid var(--ink)" : "none" }}
              >
                <Link href={`/us/city/sf/places/place/${p.slug}`} className="fx-row-link">
                  <span className="fx-fam-dot" style={{ background: colorForFamily(p.family) }} />
                  <span className="fx-lieux-list-name">{p.name}</span>
                  <span className="fx-lieux-list-meta">
                    {p.kind} · {p.n_documents} docs
                    {p.n_contracts > 0 ? ` · ${p.n_contracts} contracts` : ""}
                  </span>
                </Link>
              </li>
            ))}
        </ul>
      </div>
    </div>
  );
}
