import {
  guessTypologieFromName,
  loadGenericPhoto,
  loadProjetPhoto,
  loadProjetVulgarization,
} from "@/lib/fusion-data";
import { ProjetPictogram } from "./ProjetPictograms";

type Props = {
  projetId: string;
  /** Largeur/hauteur CSS en px. Si absent, le composant prend 100 % largeur avec aspect-ratio. */
  width?: number;
  height?: number;
  /** Aspect ratio CSS quand width/height ne sont pas fixés (ex. "16 / 9", "4 / 3"). */
  aspectRatio?: string;
  className?: string;
  /** Nom affiché en overlay si pictogramme — sinon la vignette reste muette. */
  fallbackLabel?: string;
  /** Force une typologie (utile pour les listes quand on ne veut pas lookup). */
  typologieOverride?: string | null;
};

/**
 * Vignette projet — choisit entre :
 *   1. photo dédiée (score ≥ 7)
 *   2. photo générique par typologie (4 ≤ score < 7)
 *   3. pictogramme SVG (score < 4 ou pas de data)
 *
 * Design : server component, lit les caches via fusion-data.
 * Les photos sont servies via `<img>` natif (pas Next Image) car les URLs
 * sont externes (Wikimedia, Pexels, paris.fr…) et on ne veut pas gérer
 * remotePatterns pour chaque domaine.
 */
export default function ProjetThumb({
  projetId,
  width,
  height,
  aspectRatio = "16 / 9",
  className,
  fallbackLabel,
  typologieOverride,
}: Props) {
  const photo = loadProjetPhoto(projetId);
  const vulg = loadProjetVulgarization(projetId);
  // Pyramide : override explicite > vulgarisation LLM > heuristique nom (fallback)
  const typologie =
    typologieOverride ??
    vulg?.typologie_normalisee ??
    guessTypologieFromName(fallbackLabel) ??
    null;

  const frame: React.CSSProperties =
    width != null && height != null
      ? { width, height }
      : { width: "100%", aspectRatio };

  // Décision 1 : photo dédiée
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
              position: "absolute",
              bottom: 0,
              right: 0,
              padding: "2px 6px",
              fontSize: 10,
              background: "rgba(0,0,0,0.55)",
              color: "#faf9f5",
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

  // Décision 2 : photo générique par typologie
  // On tombe ici aussi quand la décision est "pictogramme" (score bas) :
  // mieux vaut montrer la générique typologique (si dispo) que le picto nu.
  const wantGeneric =
    photo?.decision === "generique_typologique" ||
    photo?.decision === "pictogramme" ||
    (photo === null && typologie);
  if (wantGeneric) {
    const generic = typologie ? loadGenericPhoto(typologie) : null;
    if (generic?.url) {
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
              position: "absolute",
              top: 8,
              left: 8,
              padding: "2px 6px",
              fontSize: 9,
              letterSpacing: 1,
              textTransform: "uppercase",
              background: "rgba(250,249,245,0.9)",
              color: "#5a3a10",
              fontWeight: 600,
            }}
          >
            Illustration
          </figcaption>
          {generic.credit && (
            <figcaption
              style={{
                position: "absolute",
                bottom: 0,
                right: 0,
                padding: "2px 6px",
                fontSize: 10,
                background: "rgba(0,0,0,0.55)",
                color: "#faf9f5",
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
  }

  // Décision 3 : pictogramme
  const pictoSize = width != null && height != null ? Math.min(width, height) * 0.5 : 80;
  return (
    <div
      className={className}
      style={{
        ...frame,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
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
