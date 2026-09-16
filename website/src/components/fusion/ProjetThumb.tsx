"use client";

import type { GenericPhotoEntry, ProjetPhotoDecision } from "@/lib/projet-utils";
import { guessTypologieFromName } from "@/lib/projet-utils";
import { ProjetPictogram } from "./ProjetPictograms";
import NextImage from "next/image";
import { isOptimizablePhoto } from "@/lib/photo-optimize";

type Props = {
  /** Photo pré-résolue côté server (decision + url + credit). */
  photo?: ProjetPhotoDecision | null;
  /** Photo générique de la typologie (banque curée). */
  generic?: GenericPhotoEntry | null;
  /** Typologie normalisée — pictogramme de fallback. */
  typologie?: string | null;
  /** Legacy prop: ID du projet — accepté mais ignoré par ce composant
   *  purement client. Les pages serveur doivent résoudre la photo avec
   *  `resolveProjetPhoto(id)` et passer le résultat via `photo`/`generic`. */
  projetId?: string;
  /** Legacy prop: override de typologie — accepté pour ne pas casser les
   *  appelants mais priorisé après `typologie` (qui est la source moderne). */
  typologieOverride?: string | null;
  width?: number;
  height?: number;
  aspectRatio?: string;
  /** What width the picture is drawn at, for the resizer (CSS `sizes`). */
  sizes?: string;
  className?: string;
  fallbackLabel?: string;
};

/**
 * Vignette projet — pur composant client, reçoit les données pré-résolues
 * côté serveur. Décision :
 *   1. photo dédiée (score ≥ 7)
 *   2. générique typologique
 *   3. pictogramme SVG fallback
 */
export default function ProjetThumb({
  photo,
  generic,
  typologie: typologieProp,
  typologieOverride,
  projetId: _projetId,
  width,
  height,
  aspectRatio = "16 / 9",
  sizes = "(max-width: 760px) 100vw, 480px",
  className,
  fallbackLabel,
}: Props) {
  void _projetId;
  const typologie = typologieProp ?? typologieOverride ?? guessTypologieFromName(fallbackLabel) ?? null;

  const frame: React.CSSProperties =
    width != null && height != null
      ? { width, height }
      : { width: "100%", aspectRatio };

  if (photo?.decision === "photo_dediee" && photo.photo_url) {
    return (
      <figure className={className} style={{ ...frame, margin: 0, position: "relative", overflow: "hidden" }}>
        <Picture src={photo.photo_url} alt={fallbackLabel ?? "Illustration du projet"} sizes={sizes} />
        {photo.credit && (
          <figcaption
            style={{
              position: "absolute", bottom: 0, right: 0,
              padding: "2px 6px", fontSize: 10,
              background: "rgba(0,0,0,0.55)", color: "#faf9f5",
              letterSpacing: 0.5,
            }}
            title={photo.source_label ?? ""}
          >
            © {stripHtml(photo.credit).slice(0, 40)}
          </figcaption>
        )}
      </figure>
    );
  }

  const wantGeneric =
    photo?.decision === "generique_typologique" ||
    photo?.decision === "pictogramme" ||
    !photo;
  if (wantGeneric && generic?.url) {
    return (
      <figure className={className} style={{ ...frame, margin: 0, position: "relative", overflow: "hidden" }}>
        <Picture src={generic.url} alt={`Illustration générique ${generic.label.toLowerCase()}`} sizes={sizes} style={{ filter: "saturate(0.85)" }} />
        <figcaption
          style={{
            position: "absolute", top: 8, left: 8,
            padding: "2px 6px", fontSize: 9,
            letterSpacing: 1, textTransform: "uppercase",
            background: "rgba(250,249,245,0.9)",
            color: "#5a3a10", fontWeight: 600,
          }}
        >
          Illustration
        </figcaption>
        {generic.credit && (
          <figcaption
            style={{
              position: "absolute", bottom: 0, right: 0,
              padding: "2px 6px", fontSize: 10,
              background: "rgba(0,0,0,0.55)", color: "#faf9f5",
              letterSpacing: 0.5,
            }}
            title={generic.source_label ?? ""}
          >
            © {stripHtml(generic.credit).slice(0, 40)}
          </figcaption>
        )}
      </figure>
    );
  }

  const pictoSize = width != null && height != null ? Math.min(width, height) * 0.5 : 80;
  return (
    <div
      className={className}
      style={{
        ...frame,
        display: "flex", alignItems: "center", justifyContent: "center",
        background: "#faf9f5",
        borderBottom: "1px solid rgba(10,10,10,0.08)",
        color: "#a67638",
      }}
      aria-label={fallbackLabel ?? "Pictogramme projet"}
    >
      <ProjetPictogram typologie={typologie} size={pictoSize} />
    </div>
  );
}

/**
 * The picture itself: resized by Next when its host is declared (the City's
 * CDN, Wikimedia…), a plain lazy <img> otherwise, so an unknown host still
 * shows its photo.
 */
function Picture({ src, alt, sizes, style }: { src: string; alt: string; sizes: string; style?: React.CSSProperties }) {
  const common: React.CSSProperties = { width: "100%", height: "100%", objectFit: "cover", display: "block", ...style };
  if (isOptimizablePhoto(src)) {
    return <NextImage src={src} alt={alt} fill sizes={sizes} style={common} unoptimized={false} />;
  }
  return <img src={src} alt={alt} loading="lazy" decoding="async" style={common} />;
}

function stripHtml(s: string): string {
  return s.replace(/<[^>]+>/g, "").trim();
}
