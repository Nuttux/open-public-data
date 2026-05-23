"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useT, useLocale } from "@/lib/localeContext";

/**
 * Bouton "Partager ce graphique" — ouvre un petit menu avec X, LinkedIn,
 * copy URL. L'URL générée inclut `?share={chartId}` ; la page d'origine
 * détecte ce param dans son `generateMetadata` et substitue og:image
 * vers `/api/og-chart?chart={chartId}` pour servir une carte custom au
 * crawler social.
 *
 * Position : compact (label + icône), à mettre dans un coin de section
 * (top-right via flex justify-between). Pas un CTA principal.
 */
type Props = {
  chartId: string;
  /** Optional label (défaut "Partager"). */
  label?: string;
  className?: string;
};

export default function ShareButton({ chartId, label, className }: Props) {
  const t = useT();
  const { locale } = useLocale();
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Close on outside click.
  useEffect(() => {
    if (!open) return;
    const handle = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, [open]);

  // URL avec ?share=chartId — la page-mère substitue og:image via
  // generateMetadata, donc Twitter/LinkedIn afficheront la card custom.
  const buildShareUrl = useCallback(() => {
    if (typeof window === "undefined") return "";
    const u = new URL(window.location.href);
    u.searchParams.set("share", chartId);
    return u.toString();
  }, [chartId]);

  const onCopy = useCallback(() => {
    if (typeof navigator === "undefined" || !navigator.clipboard) return;
    navigator.clipboard
      .writeText(buildShareUrl())
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1800);
      })
      .catch(() => {});
  }, [buildShareUrl]);

  const onShareX = useCallback(() => {
    if (typeof window === "undefined") return;
    const text = locale === "en" ? "Public finance data, sourced." : "Données finances publiques, sourcées.";
    window.open(
      `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(buildShareUrl())}`,
      "_blank",
      "noopener",
    );
    setOpen(false);
  }, [locale, buildShareUrl]);

  const onShareLi = useCallback(() => {
    if (typeof window === "undefined") return;
    window.open(
      `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(buildShareUrl())}`,
      "_blank",
      "noopener",
    );
    setOpen(false);
  }, [buildShareUrl]);

  const labelTxt = label ?? t("fx.share.btn") ?? "Partager";
  const labelCopied = locale === "en" ? "URL copied ✓" : "URL copiée ✓";
  const labelX = "X / Twitter";
  const labelLi = "LinkedIn";
  const labelCopy = locale === "en" ? "Copy link" : "Copier le lien";

  return (
    <div ref={ref} className={`fx-share-btn-root${className ? " " + className : ""}`} style={{ position: "relative", display: "inline-flex" }}>
      <button
        type="button"
        className="fx-share-btn"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="menu"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
          <circle cx="18" cy="5" r="3" />
          <circle cx="6" cy="12" r="3" />
          <circle cx="18" cy="19" r="3" />
          <path d="M8.59 13.51l6.83 3.98M15.41 6.51l-6.82 3.98" />
        </svg>
        <span>{copied ? labelCopied : labelTxt}</span>
      </button>
      {open ? (
        <div className="fx-share-menu" role="menu">
          <button type="button" role="menuitem" onClick={onShareX} className="fx-share-menu-item">
            {labelX}
          </button>
          <button type="button" role="menuitem" onClick={onShareLi} className="fx-share-menu-item">
            {labelLi}
          </button>
          <button type="button" role="menuitem" onClick={onCopy} className="fx-share-menu-item">
            {labelCopy}
          </button>
        </div>
      ) : null}
    </div>
  );
}
