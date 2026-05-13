"use client";
/**
 * Carte « équivalent » individuelle — section §07 Synthèse de Daily Bread.
 *
 * Refonte 2026-05-07 — format éditorial presse (style Le Monde Décodeurs /
 * NYT The Upshot) anti « AI slop » :
 *   - 2 variants : `"hero"` (1 carte pleine largeur, big number 96-120px,
 *     editorial italic copy, source + via mono) et `"compact"` (4 cartes
 *     en grille, big number 40-56px, claim + source courte).
 *   - Plus de pictogramme line-icon (la valeur est dans la typo, pas dans
 *     l'icône). Le prop `picto` est conservé pour rétro-compatibilité mais
 *     n'est jamais rendu.
 *   - Border-left 3px signature institution (--p-secu / --p-etat / --p-local)
 *     sur fond paper neutre — pas de tinted background.
 *
 * Reveal cascade géré par le parent (`useRevealOnScroll`) ; ici on ajoute
 * juste un délai CSS via `--db-eq-delay` pour stagger les apparitions.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { useT } from "@/lib/localeContext";

type IconProps = {
  size?: number;
  color?: string;
  className?: string;
};

export type PictoColor = "secu" | "etat" | "local";

export type EquivCardVariant = "hero" | "compact";

type Props = {
  /** Variante d'affichage. `"hero"` = pleine largeur ; `"compact"` = grille. */
  variant?: EquivCardVariant;
  /**
   * Pictogramme — DEPRECATED. Conservé pour rétro-compatibilité mais
   * jamais rendu dans les variants éditoriaux. Le composant accepte
   * volontairement la prop pour ne pas casser les anciens call-sites.
   */
  picto?: React.ComponentType<IconProps>;
  pictoColor: PictoColor;
  /** Tag eyebrow institution + thématique, p.ex. "SANTÉ · SÉCURITÉ SOCIALE". */
  tag: string;
  /** Big number, p.ex. "5", "8 %", "1 jour", "27 €". */
  number: string;
  /**
   * Première ligne du claim (suit le big number). Hero : "consultations".
   * Compact : "d'une pension".
   */
  claimA: string;
  /**
   * Deuxième ligne du claim — optionnelle (hero seulement en général).
   * P.ex. "chez le généraliste."
   */
  claimB?: string;
  /**
   * Editorial copy — phrase italique Serif punchy. Hero seulement.
   * P.ex. "Soit presque un check-up par semaine."
   */
  editorialCopy?: string;
  /**
   * Source courte mono caps. P.ex. "CONVENTION MÉDICALE 2024 · 30 € la consultation".
   */
  sourceDetail: string;
  /**
   * Detail mono small (hero) — décrit la cotisation/contribution.
   * P.ex. "Ta cotisation à la branche maladie : 184 €/mois."
   */
  viaDetail?: string;
  /** Texte custom partagé pour cette carte. */
  shareText: string;
  /** Délai d'apparition (en ms) pour le stagger reveal. */
  revealDelayMs?: number;
};

export default function DailyBreadEquivalentCard({
  variant = "compact",
  pictoColor,
  tag,
  number,
  claimA,
  claimB,
  editorialCopy,
  sourceDetail,
  viaDetail,
  shareText,
  revealDelayMs = 0,
}: Props) {
  const t = useT();
  const [menuOpen, setMenuOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const btnRef = useRef<HTMLButtonElement | null>(null);

  // Close menu on outside click / Escape.
  useEffect(() => {
    if (!menuOpen) return;
    const onDoc = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        menuRef.current &&
        !menuRef.current.contains(target) &&
        btnRef.current &&
        !btnRef.current.contains(target)
      ) {
        setMenuOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenuOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [menuOpen]);

  const getUrl = () =>
    typeof window !== "undefined" ? window.location.href : "";

  const onShareClick = useCallback(async () => {
    // Web Share API (mobile) en priorité.
    if (
      typeof navigator !== "undefined" &&
      "share" in navigator &&
      typeof navigator.share === "function"
    ) {
      try {
        await navigator.share({ text: shareText, url: getUrl() });
        return;
      } catch {
        /* user cancelled — fallthrough vers menu */
      }
    }
    // Desktop / fallback : ouvre menu inline.
    setMenuOpen((v) => !v);
  }, [shareText]);

  const onShareX = useCallback(() => {
    const url = getUrl();
    window.open(
      `https://twitter.com/intent/tweet?text=${encodeURIComponent(
        shareText,
      )}&url=${encodeURIComponent(url)}`,
      "_blank",
      "noopener",
    );
    setMenuOpen(false);
  }, [shareText]);

  const onShareWhatsApp = useCallback(() => {
    const url = getUrl();
    window.open(
      `https://wa.me/?text=${encodeURIComponent(shareText + " " + url)}`,
      "_blank",
      "noopener",
    );
    setMenuOpen(false);
  }, [shareText]);

  const onShareMail = useCallback(() => {
    const url = getUrl();
    const subject = t("db.share_section.mail_subject");
    window.location.href = `mailto:?subject=${encodeURIComponent(
      subject,
    )}&body=${encodeURIComponent(shareText + "\n\n" + url)}`;
    setMenuOpen(false);
  }, [shareText, t]);

  const onCopy = useCallback(async () => {
    if (typeof navigator === "undefined" || !navigator.clipboard) return;
    try {
      await navigator.clipboard.writeText(`${shareText}\n${getUrl()}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      /* clipboard unavailable */
    }
  }, [shareText]);

  return (
    <article
      className="db-equiv-card"
      data-color={pictoColor}
      data-variant={variant}
      style={{ ["--db-eq-delay" as string]: `${revealDelayMs}ms` }}
    >
      <p className="db-equiv-card-tag">{tag}</p>

      <div className="db-equiv-card-claim">
        <span className="db-equiv-card-num tnum">{number}</span>
        <span className="db-equiv-card-claim-a">{claimA}</span>
        {claimB && <span className="db-equiv-card-claim-b">{claimB}</span>}
      </div>

      {variant === "hero" && editorialCopy && (
        <p className="db-equiv-card-editorial">{editorialCopy}</p>
      )}

      <div className="db-equiv-card-meta">
        <p className="db-equiv-card-source">{sourceDetail}</p>
        {variant === "hero" && viaDetail && (
          <p className="db-equiv-card-via">{viaDetail}</p>
        )}
      </div>

      <div className="db-equiv-card-share-wrap">
        <button
          ref={btnRef}
          type="button"
          className="db-equiv-card-share"
          onClick={onShareClick}
          aria-label={t("db.end.share_card_aria")}
          aria-expanded={menuOpen}
          aria-haspopup="menu"
        >
          <span aria-hidden="true">↗</span> {t("db.end.share_card_cta")}
        </button>

        {menuOpen && (
          <div
            ref={menuRef}
            className="db-equiv-card-menu"
            role="menu"
            aria-label={t("db.end.share_card_aria")}
          >
            <button
              type="button"
              className="db-equiv-card-menu-item"
              onClick={onShareX}
              role="menuitem"
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 16 16"
                fill="currentColor"
                aria-hidden="true"
              >
                <path d="M9.3 7.1L13.5 2h-1L8.8 6.4 5.9 2H2.5l4.4 6.4L2.5 14h1l3.9-4.6L10.5 14h3.4L9.3 7.1z" />
              </svg>
              <span>X</span>
            </button>
            <button
              type="button"
              className="db-equiv-card-menu-item"
              onClick={onShareWhatsApp}
              role="menuitem"
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="currentColor"
                aria-hidden="true"
              >
                <path d="M17.5 14.4c-.3-.1-1.7-.8-1.9-.9-.3-.1-.4-.1-.6.1-.2.3-.7.9-.8 1.1-.2.2-.3.2-.6.1-.3-.1-1.2-.5-2.4-1.5-.9-.8-1.5-1.8-1.6-2.1-.2-.3 0-.4.1-.6.1-.1.3-.3.4-.5.1-.2.2-.3.3-.5.1-.2 0-.4 0-.5-.1-.1-.6-1.5-.8-2-.2-.5-.4-.4-.6-.4h-.5c-.2 0-.5.1-.7.3-.3.3-1 .9-1 2.3 0 1.4 1 2.7 1.1 2.9.1.2 2 3.1 4.9 4.3.7.3 1.2.5 1.6.6.7.2 1.3.2 1.8.1.5-.1 1.7-.7 1.9-1.4.2-.7.2-1.2.2-1.4-.1-.1-.3-.2-.6-.4z M12 0C5.4 0 0 5.4 0 12c0 2.1.6 4.2 1.6 6L0 24l6.3-1.6c1.7.9 3.7 1.4 5.7 1.4 6.6 0 12-5.4 12-12S18.6 0 12 0zm0 21.6c-1.8 0-3.6-.5-5.1-1.4l-.4-.2-3.8 1 1-3.7-.2-.4c-1-1.6-1.5-3.4-1.5-5.3 0-5.5 4.5-10 10-10s10 4.5 10 10c0 5.5-4.5 10-10 10z" />
              </svg>
              <span>WhatsApp</span>
            </button>
            <button
              type="button"
              className="db-equiv-card-menu-item"
              onClick={onShareMail}
              role="menuitem"
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 16 16"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                aria-hidden="true"
              >
                <rect x="2" y="4" width="12" height="9" />
                <path d="M2 4l6 5 6-5" />
              </svg>
              <span>{t("db.share_section.mail")}</span>
            </button>
            <button
              type="button"
              className="db-equiv-card-menu-item"
              onClick={onCopy}
              role="menuitem"
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 16 16"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                aria-hidden="true"
              >
                <path d="M6 6V3.5A1.5 1.5 0 0 1 7.5 2h5A1.5 1.5 0 0 1 14 3.5v5A1.5 1.5 0 0 1 12.5 10H10" />
                <rect x="2" y="6" width="8" height="8" rx="1" />
              </svg>
              <span>
                {copied
                  ? t("db.share_section.copied")
                  : t("db.share_section.copy")}
              </span>
            </button>
          </div>
        )}
      </div>
    </article>
  );
}
