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
};

/**
 * Hook partageable d'une page thématique. Format PullQuote éditorial (italique
 * display, chiffres bolded bleu-vif), source datée dessous, bouton Partager
 * (navigator.share sur mobile, clipboard fallback sur desktop).
 *
 * À placer juste sous `<section className="fx-page-header">` et avant la
 * première `<section className="fx-section">` numérotée.
 */
export default function PageHook({ children, cite, shareText, shareUrl }: Props) {
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

  return (
    <section className="fx-page-hook" aria-label={t("fx.pagehook.aria")}>
      <div className="fx-wrap">
        <blockquote className="fx-pull-quote fx-page-hook-quote">
          <p>{children}</p>
          <cite>{cite}</cite>
        </blockquote>
        <div className="fx-page-hook-actions">
          <button
            type="button"
            className="fx-page-hook-share"
            onClick={onShare}
            aria-live="polite"
          >
            {copied ? t("fx.pagehook.copied") : t("fx.pagehook.share")}
          </button>
        </div>
      </div>
    </section>
  );
}
