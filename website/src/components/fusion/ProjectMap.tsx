"use client";

import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { useMemo } from "react";
import "leaflet/dist/leaflet.css";

type Point = {
  id: string;
  lat: number;
  lon: number;
  name: string;
  amount: number;
  chapitre?: string;
  arr?: number;
};

const MapContainer = dynamic(() => import("react-leaflet").then((m) => m.MapContainer), { ssr: false });
const TileLayer = dynamic(() => import("react-leaflet").then((m) => m.TileLayer), { ssr: false });
const CircleMarker = dynamic(() => import("react-leaflet").then((m) => m.CircleMarker), { ssr: false });
const Tooltip = dynamic(() => import("react-leaflet").then((m) => m.Tooltip), { ssr: false });

const fmt = (n: number) => {
  if (n >= 1e6) return new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 1 }).format(n / 1e6) + " M €";
  if (n >= 1e3) return new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 }).format(n / 1e3) + " k €";
  return new Intl.NumberFormat("fr-FR").format(n) + " €";
};

type Props = {
  points: Point[];
  /** Max amount for scaling marker radius. */
  maxAmount?: number;
  height?: number;
};

/**
 * Simple dot-map built on Leaflet + OSM. Circle radius scales with amount.
 * The mockup asks for MapLibre with clustering — this is the pragmatic
 * alternative using the libraries already in package.json.
 */
export default function ProjectMap({ points, maxAmount, height = 480 }: Props) {
  const router = useRouter();
  const max = maxAmount ?? Math.max(...points.map((p) => p.amount), 1);

  const safePoints = useMemo(
    () => points.filter((p) => typeof p.lat === "number" && typeof p.lon === "number" && Math.abs(p.lat) > 1),
    [points],
  );

  const center: [number, number] = [48.8566, 2.3522];

  return (
    <div className="fx-map-wrap" style={{ height }}>
      <MapContainer
        center={center}
        zoom={12}
        style={{ height: "100%", width: "100%", background: "#fafaf7" }}
        scrollWheelZoom={false}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
        />
        {safePoints.map((p) => {
          const r = Math.max(4, Math.min(26, Math.sqrt((p.amount / max) * 640) + 4));
          const color = p.amount >= 1e7 ? "#c12323" : p.amount >= 1e6 ? "#1e45e4" : "#0a0a0a";
          return (
            <CircleMarker
              key={p.id}
              center={[p.lat, p.lon]}
              radius={r}
              pathOptions={{
                color,
                fillColor: color,
                fillOpacity: 0.55,
                weight: 1,
                className: "fx-map-marker",
              }}
              eventHandlers={{
                click: () => {
                  router.push(`/investissements/projet/${encodeURIComponent(p.id)}`);
                },
              }}
            >
              <Tooltip direction="top" offset={[0, -4]}>
                <div style={{ fontFamily: "Inter Tight, sans-serif", fontSize: 13 }}>
                  <div style={{ fontWeight: 600, maxWidth: 260, lineHeight: 1.25 }}>{p.name}</div>
                  <div style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 11, marginTop: 4 }}>
                    {fmt(p.amount)}
                    {p.chapitre ? ` · ${p.chapitre}` : ""}
                    {p.arr != null && p.arr > 0 ? ` · ${p.arr}e arr.` : ""}
                  </div>
                  <div style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 10, marginTop: 6, color: "#b8551c", letterSpacing: 0.5, textTransform: "uppercase" }}>
                    Cliquer pour ouvrir la fiche ↗
                  </div>
                </div>
              </Tooltip>
            </CircleMarker>
          );
        })}
      </MapContainer>
    </div>
  );
}
