"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { Map as LMap, Marker as LMarker } from "leaflet";
import type { LieuIndexEntry } from "@/lib/lieux-data";
import { useT } from "@/lib/localeContext";
import "leaflet/dist/leaflet.css";

/** Cadrage constant sur Paris intra-muros : la carte est une carte de Paris,
 *  pas le rectangle englobant des lieux déjà couverts (sinon elle se recadre
 *  à chaque ajout, et prétend que l'échantillon remplit la ville). */
const PARIS_BOUNDS: [[number, number], [number, number]] = [
  [48.8156, 2.2241],
  [48.9022, 2.4699],
];

/** Couleur par famille — la taxonomie vient du seed (colonne `famille`), pas
 *  d'une regex ici. Palette validée par scripts/validate_palette.js du skill
 *  dataviz sur la surface #fafaf7 : tous les checks passent, pire écart
 *  adjacent ΔE 14,4 en deutéranopie (l'ancienne paire ocre/rouge tombait à
 *  2,1 — et à 13,6 même en vision normale). Rouge et bleu restent ceux de la
 *  marque ; le vert franc était impossible (ΔE 1,0 avec le rouge). */
export const FAMILLES: { key: string; color: string; i18n: string }[] = [
  { key: "sport", color: "#1e45e4", i18n: "fx.lieux.fam.sport" },
  { key: "vert", color: "#1baf7a", i18n: "fx.lieux.fam.vert" },
  { key: "culture", color: "#c12323", i18n: "fx.lieux.fam.culture" },
  { key: "urbain", color: "#eda100", i18n: "fx.lieux.fam.urbain" },
  { key: "services", color: "#4a3aa7", i18n: "fx.lieux.fam.services" },
];
export const COLOR: Record<string, string> = Object.fromEntries(FAMILLES.map((f) => [f.key, f.color]));

const esc = (s: unknown) =>
  String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c] as string));

/** Rayon du point : porté par l'ARGENT public (le sujet de la page), pas le
 *  nombre de délibérations — et sur une plage RESSERRÉE (4,5→7,5 px). Sizer par
 *  le comptage de délibs faisait des plus gros points là où ça se chevauche déjà
 *  le plus (centre de Paris) : illisible. Racine carrée = aire ∝ montant. Les
 *  lieux sans argent connu gardent le rayon de base. */
function radiusFor(v: number, max: number): number {
  return Math.round((4.5 + Math.sqrt(Math.max(v, 0) / Math.max(max, 1)) * 3) * 10) / 10;
}

/** Distance haversine en km. */
function dist(a: [number, number], b: [number, number]): number {
  const R = 6371;
  const dLat = ((b[0] - a[0]) * Math.PI) / 180;
  const dLon = ((b[1] - a[1]) * Math.PI) / 180;
  const la1 = (a[0] * Math.PI) / 180;
  const la2 = (b[0] * Math.PI) / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/**
 * Carte des lieux — même socle Leaflet/CARTO que ProjectMap.
 * Couleur = famille (seed), taille = nombre de délibérations, clic → fiche en
 * drawer. La liste sous la carte est le chemin clavier et le repli sans JS ;
 * les marqueurs sont donc hors du tab order (`keyboard: false`).
 */
export default function LieuxMap({
  lieux,
  actives,
  hovered,
  onHover,
}: {
  lieux: LieuIndexEntry[];
  actives: Set<string>;
  hovered: string | null;
  onHover: (slug: string | null) => void;
}) {
  const t = useT();
  const router = useRouter();
  const divRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<LMap | null>(null);
  const markersRef = useRef<Record<string, LMarker>>({});
  // La carte est un objet impératif : elle doit être construite UNE fois. Si
  // l'effet dépend de `t`/`router`/`onHover` (identités non garanties stables),
  // le moindre re-rendu du parent (un survol de carte suffit) détruisait et
  // reconstruisait la carte → rejeu de fitBounds : ça scintillait et ça
  // re-centrait de force dès qu'on essayait de se déplacer. On passe par des
  // refs pour garder l'effet à [lieux, maxArgent].
  const onHoverRef = useRef(onHover);
  const tRef = useRef(t);
  const routerRef = useRef(router);
  useEffect(() => { onHoverRef.current = onHover; tRef.current = t; routerRef.current = router; });
  const [geo, setGeo] = useState<{ state: "idle" | "loading" | "error" | "ok"; msg?: string }>({ state: "idle" });
  // Le pointeur grossier (tactile) ne fait ni ⌘+molette ni double-clic souris :
  // la consigne de zoom doit dire « pincez ». Lu au montage (évite l'hydratation).
  const [isTouch, setIsTouch] = useState(false);
  useEffect(() => { setIsTouch(window.matchMedia("(pointer: coarse)").matches); }, []);

  const maxArgent = useMemo(() => Math.max(...lieux.map((l) => l.argent_total_eur ?? 0), 1), [lieux]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!divRef.current || mapRef.current) return;
      const L = (await import("leaflet")).default;
      if (cancelled || !divRef.current) return;

      const isTouch = typeof window !== "undefined" && window.matchMedia("(pointer: coarse)").matches;
      const map = L.map(divRef.current, {
        // Molette Leaflet native OFF : elle avalerait le scroll de page. Le zoom
        // molette/trackpad est géré à la main ci-dessous (uniquement ⌘/pinch).
        // Double-clic pour zoomer = actif (défaut Leaflet).
        scrollWheelZoom: false,
        dragging: !isTouch,
        // Zoom fractionnaire : sans lui, fitBounds ne peut que descendre au
        // zoom entier inférieur — Paris « rentre » au 12 et on affiche
        // Montreuil et Boulogne pour rien.
        zoomSnap: 0.25,
        zoomDelta: 0.5,
        minZoom: 11,
        maxZoom: 17,
        // Le « scintillement » au zoom n'était PAS une désynchro marqueurs/fond
        // (indice décisif : ça saute au premier clic, c'est propre si on reclique
        // tout de suite, ça resaute après une pause — signature d'un CHARGEMENT
        // de tuiles, pas d'une animation). Leaflet agrandit les anciennes tuiles
        // pendant qu'il télécharge les nouvelles, puis les fait APPARAÎTRE EN
        // FONDU : c'est ce fondu qu'on voit clignoter. On le coupe.
        fadeAnimation: false,
        // Marge GÉNÉREUSE : à pad(0.08) le cadre de départ remplissait déjà les
        // bornes, donc le moindre glissement tapait la limite et revenait en
        // élastique — on ne pouvait pas se déplacer dans la ville. On garde des
        // bornes (la carte reste une carte de Paris) mais avec du mou.
        maxBounds: L.latLngBounds(PARIS_BOUNDS).pad(0.5),
        // Bord FERME plutôt qu'élastique. Par défaut (viscosité 0) on peut tirer
        // au-delà des bornes et la carte revient toute seule : mesuré, un
        // glissement jusqu'au bord se replaçait de quelques pixels une seconde
        // plus tard — d'où la sensation que « ça se recentre tout seul ». À 1,
        // on ne dépasse simplement pas : rien ne bouge après le geste.
        maxBoundsViscosity: 1.0,
      });
      mapRef.current = map;

      // Zoom molette/trackpad, pattern Mapbox/Google : molette simple → scroll
      // de page ; ⌘/Ctrl+molette OU pinch trackpad (que le navigateur envoie
      // avec ctrlKey) → zoom centré sur le curseur. Jamais de hijack du scroll.
      //
      // MESURÉ (instrumentation Playwright, positions marqueur vs tuiles) :
      //  - le bouton +/- de Leaflet est PARFAIT : marqueurs et tuiles avancent
      //    ensemble sur ~200 ms (échelle 0,79 → 1,0) et se posent en même temps ;
      //  - `setZoomAround(..., {animate:false})` était le VRAI bug : le marqueur
      //    se téléporte pendant que la couche de tuiles retombe sur une échelle
      //    périmée (0,707) et n'y revient jamais → l'effet « ça saute ».
      // On emprunte donc exactement le chemin du bouton + (zoom animé standard),
      // et on COALESCE la rafale : un trackpad émet des dizaines d'événements,
      // on accumule le delta et on ne déclenche qu'un zoom par frame.
      // On appelle EXACTEMENT ce qu'appelle le contrôle +/- (zoomIn/zoomOut),
      // seul chemin dont la mesure montre que marqueurs et tuiles avancent
      // ensemble. `setZoomAround` (ancrage curseur) et `setZoom` posaient tous
      // deux le marqueur à la frame 1 en laissant le fond arriver 225 ms plus
      // tard. Un trackpad émettant des dizaines d'événements, on garde un pas
      // par geste : tant qu'un zoom est en cours, on ignore la suite.
      let zoomEnCours = false;
      map.on("zoomend", () => { zoomEnCours = false; });
      divRef.current.addEventListener(
        "wheel",
        (e: WheelEvent) => {
          if (!(e.ctrlKey || e.metaKey)) return;
          e.preventDefault();
          if (zoomEnCours) return;
          zoomEnCours = true;
          if (e.deltaY < 0) map.zoomIn(0.5);
          else map.zoomOut(0.5);
        },
        { passive: false },
      );

      map.fitBounds(PARIS_BOUNDS, { padding: [2, 2] });
      L.tileLayer("https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png", {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> · © CARTO',
        maxZoom: 19,
        // keepBuffer : garder une couronne de tuiles hors écran évite de tout
        // retélécharger au moindre déplacement (c'est le retéléchargement qui
        // fait « re-bugger » après une pause, quand le cache a été purgé).
        keepBuffer: 4,
        // Ne pas relancer de requêtes À CHAQUE frame du zoom : on attend la fin
        // du geste, une seule vague de tuiles au lieu d'une par palier.
        updateWhenZooming: false,
      }).addTo(map);

      const BOX = 26; // cible ≥ 24px (WCAG 2.5.8) — le point visuel reste fin
      for (const l of lieux) {
        const r = radiusFor(l.argent_total_eur ?? 0, maxArgent);
        const icon = L.divIcon({
          className: "fx-lieu-pin",
          html: `<span style="display:block;width:${r * 2}px;height:${r * 2}px;margin:${BOX / 2 - r}px;
                 border-radius:50%;background:${COLOR[l.famille] ?? "#4a3aa7"};
                 border:2px solid #fafaf7;box-shadow:0 0 0 1px #0a0a0a"></span>`,
          iconSize: [BOX, BOX],
          iconAnchor: [BOX / 2, BOX / 2],
        });
        const m = L.marker([l.lat, l.lon], {
          icon,
          title: l.name, // nom accessible : sans lui, un role=button anonyme (WCAG 4.1.2)
          keyboard: false,
          riseOnHover: true,
        }).addTo(map);
        // Métadonnée du tooltip : le type, l'arrondissement, et l'ARGENT public
        // (le sujet de la page) — pas le comptage de délibérations (jargon).
        const arrTip = l.arrondissement > 0 ? ` · ${l.arrondissement}${l.arrondissement === 1 ? "er" : "e"}` : "";
        const argentTip = (l.argent_total_eur ?? 0) >= 1e6
          ? ` · ${(l.argent_total_eur! / 1e6).toLocaleString("fr-FR", { maximumFractionDigits: 1 })} M€`
          : "";
        m.bindTooltip(
          `<div style="font-family:ui-monospace,monospace;font-size:11px;letter-spacing:.03em">
             <b>${esc(l.name)}</b><br/>${esc(l.kind_fr)}${arrTip}${argentTip}
             <br/><span style="opacity:.7">${esc(tRef.current("fx.lieux.tooltip_cta"))}</span>
           </div>`,
          { direction: "top", offset: [0, -8] },
        );
        m.on("click", () => routerRef.current.push(`/fr/city/paris/lieu/${l.slug}`, { scroll: false }));
        m.on("mouseover", () => onHoverRef.current(l.slug));
        m.on("mouseout", () => onHoverRef.current(null));
        markersRef.current[l.slug] = m;
      }
    })();

    // Leaflet fige la taille du conteneur à la construction. Le drawer
    // (DetailDrawer) verrouille le scroll du <body> en `position: fixed`,
    // ce qui retire la scrollbar et élargit la page derrière lui — la carte
    // ne le sait pas tant qu'on ne le lui dit pas, d'où un décalage
    // marqueurs/tuiles qui ne se corrige qu'au prochain geste (le « saut »
    // ressenti au clic). ProjectMap a ce correctif ; LieuxMap ne l'avait pas.
    let ro: ResizeObserver | null = null;
    if (divRef.current && typeof ResizeObserver !== "undefined") {
      ro = new ResizeObserver(() => { mapRef.current?.invalidateSize(); });
      ro.observe(divRef.current);
    }

    return () => {
      cancelled = true;
      ro?.disconnect();
      mapRef.current?.remove();
      mapRef.current = null;
      markersRef.current = {};
    };
  }, [lieux, maxArgent]);

  // Filtres : on masque l'élément DOM du marqueur (pas de retrait de couche —
  // le clic et le tooltip restent branchés au retour).
  useEffect(() => {
    for (const l of lieux) {
      const el = markersRef.current[l.slug]?.getElement();
      if (el) el.style.display = actives.has(l.famille) ? "" : "none";
    }
  }, [actives, lieux]);

  // Survol partagé avec la liste : le marqueur du lieu survolé passe devant et
  // les autres s'effacent — c'est ce qui fait de la liste et de la carte deux
  // vues du même état.
  useEffect(() => {
    for (const l of lieux) {
      const el = markersRef.current[l.slug]?.getElement();
      if (!el) continue;
      const dim = hovered !== null && hovered !== l.slug;
      el.style.opacity = dim ? "0.25" : "1";
      el.style.zIndex = hovered === l.slug ? "1000" : "";
      el.style.transition = "opacity .15s";
    }
  }, [hovered, lieux]);

  /** « Autour de moi » doit RÉPONDRE (combien, lequel, à quelle distance), pas
   *  seulement bouger la caméra — et dire ce qui se passe en cas de refus ou
   *  hors zone couverte. */
  const locateMe = () => {
    if (!navigator.geolocation) {
      setGeo({ state: "error", msg: t("fx.lieux.geo_indispo") });
      return;
    }
    setGeo({ state: "loading" });
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const me: [number, number] = [pos.coords.latitude, pos.coords.longitude];
        const near = lieux
          .map((l) => ({ l, d: dist(me, [l.lat, l.lon]) }))
          .sort((a, b) => a.d - b.d);
        if (!near.length) return;
        const inParis =
          me[0] >= PARIS_BOUNDS[0][0] && me[0] <= PARIS_BOUNDS[1][0] &&
          me[1] >= PARIS_BOUNDS[0][1] && me[1] <= PARIS_BOUNDS[1][1];
        if (!inParis) {
          // On ne téléporte pas la caméra hors de la zone couverte.
          setGeo({
            state: "ok",
            msg: t("fx.lieux.geo_hors_zone").replace("{km}", Math.round(near[0].d).toLocaleString("fr-FR")),
          });
          return;
        }
        const proches = near.filter((n) => n.d <= 1);
        setGeo({
          state: "ok",
          msg: proches.length
            ? t("fx.lieux.geo_proches").replace("{n}", String(proches.length)).replace("{nom}", near[0].l.name)
            : t("fx.lieux.geo_aucun")
                .replace("{nom}", near[0].l.name)
                .replace("{km}", near[0].d.toLocaleString("fr-FR", { maximumFractionDigits: 1 })),
        });
        const map = mapRef.current;
        if (!map) return;
        import("leaflet").then(({ default: L }) => {
          L.circleMarker(me, { radius: 6, color: "#0a0a0a", fillColor: "#fafaf7", fillOpacity: 1, weight: 2 }).addTo(map);
          map.setView(me, 14);
        });
      },
      () => setGeo({ state: "error", msg: t("fx.lieux.geo_refus") }),
      { timeout: 8000, maximumAge: 60000 },
    );
  };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 10 }}>
        <button
          onClick={locateMe}
          disabled={geo.state === "loading"}
          style={{ border: "1px solid var(--ink)", background: "var(--bg)", fontFamily: "var(--f-mono)", fontSize: 10, letterSpacing: ".07em", textTransform: "uppercase", padding: "7px 12px", cursor: "pointer" }}
        >
          ◎ {geo.state === "loading" ? t("fx.lieux.geo_chargement") : t("fx.lieux.autour_de_moi")}
        </button>
      </div>

      {geo.msg && (
        <p aria-live="polite" style={{ fontFamily: "var(--f-mono)", fontSize: 10.5, margin: "0 0 8px", color: geo.state === "error" ? "var(--rouge)" : "var(--ink-2)" }}>
          {geo.msg}
        </p>
      )}

      <section aria-label={t("fx.lieux.map_aria")} ref={divRef} className="fx-lieux-map" style={{ border: "1px solid var(--ink)" }} />
      <p className="fx-chart-source" style={{ marginTop: 10 }}>
        <b>{t(isTouch ? "fx.lieux.map_note_touch" : "fx.lieux.map_note")}</b>
      </p>
    </div>
  );
}
