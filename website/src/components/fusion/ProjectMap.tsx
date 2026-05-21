"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import "leaflet/dist/leaflet.css";
import "leaflet.markercluster/dist/MarkerCluster.css";
import "leaflet.markercluster/dist/MarkerCluster.Default.css";
import { useT, useLocale } from "@/lib/localeContext";
import { TYPO_BUCKETS, type TypoBucket } from "@/lib/projet-utils";
import { useTrack } from "@/lib/analyticsContext";
import type { Map as LMap, MarkerClusterGroup } from "leaflet";

type Point = {
  id: string;
  lat: number;
  lon: number;
  name: string;
  amount: number;
  chapitre?: string;
  arr?: number;
  typo: TypoBucket;
  isJO: boolean;
};

type Preset = {
  key: string;
  label: string;
  availableYears?: number[];
  apply: (s: MapState) => MapState;
};

type MapState = {
  typos: Set<TypoBucket>;
  arr: string;
  minAmt: number;
  maxAmt: number;
  onlyJO: boolean;
  preset: string;
};

const ALL_TYPOS = new Set<TypoBucket>(TYPO_BUCKETS.map((t) => t.key));
const COLOR: Record<TypoBucket, string> = Object.fromEntries(
  TYPO_BUCKETS.map((t) => [t.key, t.color]),
) as Record<TypoBucket, string>;

function makeInitialState(): MapState {
  return {
    typos: new Set(ALL_TYPOS),
    arr: "",
    minAmt: 0,
    maxAmt: Infinity,
    onlyJO: false,
    preset: "all",
  };
}

function radiusFor(amount: number, maxAmt: number): number {
  const t = Math.log10(1 + amount) / Math.log10(1 + maxAmt);
  return 4 + t * 18;
}

type Props = {
  points: Point[];
  year: number;
  height?: number;
};

export default function ProjectMap({ points, year, height = 620 }: Props) {
  const t = useT();
  const { locale } = useLocale();
  const locStr = locale === "en" ? "en-GB" : "fr-FR";
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const track = useTrack();

  const fmtEur = (n: number) => {
    if (n >= 1e6) return new Intl.NumberFormat(locStr, { maximumFractionDigits: 1 }).format(n / 1e6) + " " + t("fx.s.m_eur");
    if (n >= 1e3) return new Intl.NumberFormat(locStr, { maximumFractionDigits: 0 }).format(n / 1e3) + " k €";
    return new Intl.NumberFormat(locStr).format(n) + " €";
  };

  // ─── Presets (déclaratifs, year-aware) ─────────────────────────────
  const presets: Preset[] = useMemo(() => [
    { key: "all", label: t("fx.pm.preset.all"), apply: () => makeInitialState() },
    {
      key: "top10", label: t("fx.pm.preset.big"),
      apply: (s) => ({ ...s, minAmt: 5_000_000 }),
    },
    {
      key: "jo", label: t("fx.pm.preset.jo"),
      availableYears: [2023, 2024],
      apply: (s) => ({ ...s, onlyJO: true }),
    },
    {
      key: "quartier", label: t("fx.pm.preset.local"),
      apply: (s) => ({ ...s, maxAmt: 500_000 }),
    },
    {
      key: "education", label: t("fx.pm.preset.education"),
      apply: (s) => ({ ...s, typos: new Set<TypoBucket>(["education"]) }),
    },
    {
      key: "vert", label: t("fx.pm.preset.vert"),
      apply: (s) => ({ ...s, typos: new Set<TypoBucket>(["vert"]) }),
    },
    {
      key: "voirie", label: t("fx.pm.preset.voirie"),
      apply: (s) => ({ ...s, typos: new Set<TypoBucket>(["voirie"]) }),
    },
    {
      key: "culture", label: t("fx.pm.preset.culture"),
      apply: (s) => ({ ...s, typos: new Set<TypoBucket>(["culture"]) }),
    },
  ], [t]);

  const visiblePresets = presets.filter(
    (p) => !p.availableYears || p.availableYears.includes(year),
  );

  // ─── State : même valeur par défaut sur serveur et client pour éviter
  //   un hydration mismatch (useSearchParams diffère selon le contexte).
  //   La restauration depuis l'URL se fait dans un useEffect post-mount.
  const [state, setState] = useState<MapState>(makeInitialState);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    // Restauration depuis l'URL — une fois, côté client.
    const init = makeInitialState();
    const presetName = searchParams.get("preset");
    if (presetName) {
      const p = presets.find((pp) => pp.key === presetName);
      if (p) {
        const applied = p.apply(makeInitialState());
        setState({ ...applied, preset: presetName });
        setHydrated(true);
        return;
      }
    }
    const typoParam = searchParams.get("typo");
    if (typoParam) init.typos = new Set(typoParam.split(",") as TypoBucket[]);
    const arrParam = searchParams.get("arr");
    if (arrParam) init.arr = arrParam;
    const amt = searchParams.get("amt");
    if (amt) init.minAmt = Number(amt);
    const amtmax = searchParams.get("amtmax");
    if (amtmax) init.maxAmt = Number(amtmax);
    if (searchParams.get("jo") === "1") init.onlyJO = true;
    setState(init);
    setHydrated(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // URL sync (replace, pas push — pas d'entrée d'historique par clic).
  // Ne déclenche qu'après l'hydratation pour ne pas écraser les params
  // de l'URL lors du premier render.
  useEffect(() => {
    if (!hydrated) return;
    const p = new URLSearchParams(Array.from(searchParams.entries()));
    const setOrDelete = (k: string, v: string | null) => {
      if (v == null || v === "") p.delete(k);
      else p.set(k, v);
    };
    setOrDelete("preset", state.preset !== "all" ? state.preset : null);
    setOrDelete("typo", state.typos.size !== ALL_TYPOS.size ? [...state.typos].join(",") : null);
    setOrDelete("arr", state.arr || null);
    setOrDelete("amt", state.minAmt ? String(state.minAmt) : null);
    setOrDelete("amtmax", state.maxAmt !== Infinity ? String(state.maxAmt) : null);
    setOrDelete("jo", state.onlyJO ? "1" : null);
    const s = p.toString();
    router.replace(s ? `${pathname}?${s}` : pathname, { scroll: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, hydrated]);

  // ─── Leaflet impératif ─────────────────────────────────────────────
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<LMap | null>(null);
  const clusterRef = useRef<MarkerClusterGroup | null>(null);
  const [mapReady, setMapReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const L = (await import("leaflet")).default;
      await import("leaflet.markercluster");
      if (cancelled || !containerRef.current || mapRef.current) return;

      const map = L.map(containerRef.current, {
        center: [48.8566, 2.3522],
        zoom: 12,
        scrollWheelZoom: false,
      });
      L.tileLayer("https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png", {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> · © CARTO',
      }).addTo(map);

      const cluster = (L as unknown as { markerClusterGroup: (opts: object) => MarkerClusterGroup }).markerClusterGroup({
        maxClusterRadius: 55,
        showCoverageOnHover: false,
        zoomToBoundsOnClick: true,
        spiderfyOnMaxZoom: true,
        iconCreateFunction: (c: { getChildCount: () => number }) => {
          const n = c.getChildCount();
          const cls = n < 10 ? "small" : n < 50 ? "medium" : "large";
          return L.divIcon({
            html: `<div><span>${n}</span></div>`,
            className: `marker-cluster marker-cluster-${cls}`,
            iconSize: L.point(40, 40),
          });
        },
      });
      map.addLayer(cluster);

      mapRef.current = map;
      clusterRef.current = cluster;
      setMapReady(true);
    })();

    // Leaflet rend avec les dimensions au moment du mount ; si le container
    // change de taille après coup (drawer intercepté qui recompose le layout,
    // resize window, etc.), sans `invalidateSize()` la carte reste figée sur
    // l'ancienne taille. On écoute le container et on invalide à chaque resize.
    let ro: ResizeObserver | null = null;
    if (containerRef.current && typeof ResizeObserver !== "undefined") {
      ro = new ResizeObserver(() => {
        if (mapRef.current) mapRef.current.invalidateSize();
      });
      ro.observe(containerRef.current);
    }

    return () => {
      cancelled = true;
      if (ro) ro.disconnect();
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
        clusterRef.current = null;
      }
    };
  }, []);

  // ─── Filtrage + rendu ─────────────────────────────────────────────
  const filtered = useMemo(() => {
    return points.filter((p) => {
      if (!state.typos.has(p.typo)) return false;
      if (state.arr && String(p.arr) !== state.arr) return false;
      if (p.amount < state.minAmt) return false;
      if (p.amount > state.maxAmt) return false;
      if (state.onlyJO && !p.isJO) return false;
      return true;
    });
  }, [points, state]);

  const bucketTotal = useMemo(() => {
    const out: Record<TypoBucket, number> = {
      education: 0, voirie: 0, vert: 0, culture: 0, logesante: 0, admin: 0, autre: 0,
    };
    for (const p of points) out[p.typo]++;
    return out;
  }, [points]);

  const presetCount: Record<string, number> = useMemo(() => ({
    top10: points.filter((p) => p.amount >= 5_000_000).length,
    jo: points.filter((p) => p.isJO).length,
    quartier: points.filter((p) => p.amount < 500_000).length,
    education: bucketTotal.education,
    vert: bucketTotal.vert,
    voirie: bucketTotal.voirie,
    culture: bucketTotal.culture,
  }), [points, bucketTotal]);

  const visibleSum = useMemo(() => filtered.reduce((s, p) => s + p.amount, 0), [filtered]);

  // Redraw markers lorsque la map est prête ou que les filtres changent.
  useEffect(() => {
    const cluster = clusterRef.current;
    if (!cluster || !mapReady) return;
    (async () => {
      const L = (await import("leaflet")).default;
      cluster.clearLayers();
      const maxAmt = Math.max(...filtered.map((p) => p.amount), 1);
      for (const p of filtered) {
        const r = radiusFor(p.amount, maxAmt);
        const color = COLOR[p.typo];
        const marker = L.circleMarker([p.lat, p.lon], {
          radius: r, color, fillColor: color, fillOpacity: 0.68, weight: 1,
        });
        marker.bindTooltip(
          `<div style="font:13px/1.3 Inter Tight, sans-serif"><b>${escapeHtml(p.name)}</b><br>
           <span style="font-family:JetBrains Mono,monospace;font-size:11px">
             ${fmtEur(p.amount)}${p.arr ? ` · ${p.arr}${p.arr === 1 ? "ᵉʳ" : "ᵉ"} arr.` : ""}${p.isJO ? " · JO" : ""}</span></div>`,
          { direction: "top", offset: [0, -4] },
        );
        marker.on("click", () => {
          track("map_marker_click", {
            page: "investissements",
            entity_id: p.id,
            entity_type: "projet",
            typo: p.typo,
            amount: p.amount,
            arr: p.arr,
            is_jo: p.isJO,
          });
          router.push(`/ville/paris/investissements/projet/${encodeURIComponent(p.id)}`, { scroll: false });
        });
        cluster.addLayer(marker);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtered, mapReady]);

  // ─── Handlers ─────────────────────────────────────────────────────
  const applyPreset = (key: string) => {
    const p = presets.find((pp) => pp.key === key);
    if (!p) return;
    track("filter_change", { page: "investissements", field: "map_preset", value: key });
    const applied = p.apply(makeInitialState());
    setState({ ...applied, preset: key });
  };
  const toggleTypo = (k: TypoBucket) => {
    setState((s) => {
      const next = new Set(s.typos);
      if (next.has(k)) next.delete(k); else next.add(k);
      track("filter_change", {
        page: "investissements",
        field: "map_typo",
        value: k,
        active: !s.typos.has(k),
      });
      return { ...s, typos: next, preset: "all" };
    });
  };
  const setArr = (v: string) => {
    track("filter_change", { page: "investissements", field: "map_arr", value: v || "all" });
    setState((s) => ({ ...s, arr: v, preset: "all" }));
  };
  const setMinAmt = (v: number) => {
    track("filter_change", { page: "investissements", field: "map_min_amt", value: v });
    setState((s) => ({ ...s, minAmt: v, preset: "all" }));
  };

  const [copied, setCopied] = useState(false);
  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
      track("share_click", { method: "copy", entity_type: "map_view", url: window.location.href });
    } catch {}
  };

  const resetView = () => {
    if (mapRef.current) mapRef.current.setView([48.8566, 2.3522], 12, { animate: true });
  };

  // ─── Render ───────────────────────────────────────────────────────
  return (
    <div className="fx-map-v2">
      <div className="fx-map-presets">
        {visiblePresets.map((p) => (
          <button
            key={p.key}
            className={`fx-map-preset${state.preset === p.key ? " is-active" : ""}`}
            onClick={() => applyPreset(p.key)}
          >
            {p.label}
            {presetCount[p.key] != null && (
              <span className="fx-map-preset-n">{presetCount[p.key]}</span>
            )}
          </button>
        ))}
      </div>

      <div className="fx-map-layout">
        <aside className="fx-map-panel">
          <h3>{t("fx.pm.typology")}</h3>
          <p>{t("fx.pm.typology_hint")}</p>
          <div className="fx-map-chips">
            {TYPO_BUCKETS.map((tb) => (
              <div
                key={tb.key}
                className={`fx-map-chip${state.typos.has(tb.key) ? "" : " is-off"}`}
                onClick={() => toggleTypo(tb.key)}
              >
                <span className="sw" style={{ background: tb.color }} />
                <span className="nm">{tb.label}</span>
                <span className="pc">{bucketTotal[tb.key]}</span>
              </div>
            ))}
          </div>

          <div className="fx-map-row">
            <label htmlFor="fx-map-arr">{t("fx.pm.arr_label")}</label>
            <select id="fx-map-arr" value={state.arr} onChange={(e) => setArr(e.target.value)}>
              <option value="">{t("fx.pm.all")}</option>
              {Array.from({ length: 20 }, (_, i) => i + 1).map((n) => (
                <option key={n} value={n}>
                  {n}{n === 1 ? "ᵉʳ" : "ᵉ"} {t("fx.pm.arr_suffix_noun")}
                </option>
              ))}
            </select>
          </div>

          <div className="fx-map-row">
            <label htmlFor="fx-map-amt">{t("fx.pm.min_amount")}</label>
            <input
              id="fx-map-amt"
              type="range"
              min={0}
              max={10_000_000}
              step={100_000}
              value={Math.min(state.minAmt, 10_000_000)}
              onChange={(e) => setMinAmt(Number(e.target.value))}
            />
            <div className="fx-map-vlabel">
              {state.minAmt ? `≥ ${fmtEur(state.minAmt)}` : "0 €"}
            </div>
          </div>
        </aside>

        <div className="fx-map-wrap" style={{ height, position: "relative" }}>
          <div ref={containerRef} style={{ height: "100%", width: "100%", background: "#fafaf7" }} />
          <div className="fx-map-meta">
            <b>{filtered.length}</b> / {points.length} {t("fx.pm.projects")} · <b>{fmtEur(visibleSum)}</b>
          </div>
          <div className="fx-map-actions">
            <button className="fx-map-reset" onClick={resetView} title={t("fx.pm.reset_view")}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <circle cx="12" cy="12" r="9" />
                <circle cx="12" cy="12" r="2.5" />
              </svg>
              {t("fx.pm.reset_view")}
            </button>
            <button className="fx-map-share" onClick={copyLink}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <circle cx="18" cy="5" r="3" />
                <circle cx="6" cy="12" r="3" />
                <circle cx="18" cy="19" r="3" />
                <line x1="8.6" y1="13.5" x2="15.4" y2="17.5" />
                <line x1="15.4" y1="6.5" x2="8.6" y2="10.5" />
              </svg>
              {copied ? `✓ ${t("fx.pm.copied")}` : t("fx.pm.copy_link")}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
}
