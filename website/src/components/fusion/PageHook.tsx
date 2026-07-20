"use client";

import { useState } from "react";
import type { ReactNode } from "react";
import { useT } from "@/lib/localeContext";

type Props = {
  /** Claim éditorial avec chiffres `<b>` embeddés. */
  children: ReactNode;
  /** Source datée (affichée sous la quote, en caps mono). */
  cite: ReactNode;
  /** Texte copié dans le presse-papier ou partagé via navigator.share. */
  shareText: string;
  /** URL jointe au share ; défaut = window.location.href. */
  shareUrl?: string;
  /**
   * "card" : carte partageable compacte à placer DANS la première section
   * de données, sous la viz (fx-wrap parent requis). Par défaut (interlude
   * pleine largeur), réservé aux rares pages sans viz d'ouverture.
   */
  variant?: "card";
};

/**
 * Hook partageable d'une page thématique — mêmes chiffres calculés, bouton
 * Partager (navigator.share sur mobile, clipboard fallback desktop).
 * Depuis l'audit « temps-avant-la-donnée », le format nominal est la carte
 * (`variant="card"`) sous la première visualisation, pas l'interlude.
 */
export default function PageHook({ children, cite, shareText, shareUrl, variant }: Props) {
  const t = useT();
  const [copied, setCopied] = useState(false);

  const onShare = async () => {
    const url =
      shareUrl ??
      (typeof window !== "undefined" ? window.location.href : "");
    if (typeof navigator !== "undefined" && "share" in navigator) {
      try {
        await navigator.share({ text: shareText, url });
        return;
      } catch {
        /* user cancelled or share unavailable */
      }
    }
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      try {
        await navigator.clipboard.writeText(`${shareText}\n${url}`);
        setCopied(true);
        setTimeout(() => setCopied(false), 1800);
      } catch {
        /* clipboard unavailable */
      }
    }
  };

  const share = (
    <button
      type="button"
      className="fx-page-hook-share"
      onClick={onShare}
      aria-live="polite"
    >
      {copied ? t("fx.pagehook.copied") : t("fx.pagehook.share")}
    </button>
  );

  if (variant === "card") {
    return (
      <aside className="fx-hook-card" aria-label={t("fx.pagehook.aria")}>
        <blockquote className="fx-pull-quote fx-hook-card-quote">
          <p>{children}</p>
          <cite>{cite}</cite>
        </blockquote>
        <div className="fx-hook-card-actions">{share}</div>
      </aside>
    );
  }

  return (
    <section className="fx-page-hook" aria-label={t("fx.pagehook.aria")}>
      <div className="fx-wrap">
        <blockquote className="fx-pull-quote fx-page-hook-quote">
          <p>{children}</p>
          <cite>{cite}</cite>
        </blockquote>
        <div className="fx-page-hook-actions">{share}</div>
      </div>
    </section>
  );
}
