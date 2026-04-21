"use client";

import type { GenericPhotoEntry, ProjetPhotoDecision } from "@/lib/projet-utils";
import { guessTypologieFromName } from "@/lib/projet-utils";
import { ProjetPictogram } from "./ProjetPictograms";

type Props = {
  /** Photo pré-résolue côté server (decision + url + credit). */
  photo?: ProjetPhotoDecision | null;
  /** Photo générique de la typologie (banque curée). */
  generic?: GenericPhotoEntry | null;
  /** Typologie normalisée — pictogramme de fallback. */
  typologie?: string | null;
  width?: number;
  height?: number;
  aspectRatio?: string;
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
  width,
  height,
  aspectRatio = "16 / 9",
  className,
  fallbackLabel,
}: Props) {
  const typologie = typologieProp ?? guessTypologieFromName(fallbackLabel) ?? null;

  const frame: React.CSSProperties =
    width != null && height != null
      ? { width, height }
      : { width: "100%", aspectRatio };

  if (photo?.decision === "photo_dediee" && photo.photo_url) {
    return (
      <figure className={className} style={{ ...frame, margin: 0, position: "relative", overflow: "hidden" }}>
        <img
          src={photo.photo_url}
          alt={fallbackLabel ?? "Illustration du projet"}
          loading="lazy"
          style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
        />
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
        <img
          src={generic.url}
          alt={`Illustration générique ${generic.label.toLowerCase()}`}
          loading="lazy"
          style={{ width: "100%", height: "100%", objectFit: "cover", display: "block", filter: "saturate(0.85)" }}
        />
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

function stripHtml(s: string): string {
  return s.replace(/<[^>]+>/g, "").trim();
}
