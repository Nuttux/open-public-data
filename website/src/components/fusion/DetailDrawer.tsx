"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { useT } from "@/lib/localeContext";
import { useTrack } from "@/lib/analyticsContext";

type DrawerReferrer = { url: string; label: string };

const STORAGE_KEY = "fx-drawer-stack";

function readStack(): DrawerReferrer[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function writeStack(stack: DrawerReferrer[]) {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(stack));
  } catch {
    /* storage disabled */
  }
}

type Props = {
  /** Shown in mono kicker above the title. */
  kicker?: ReactNode;
  title: ReactNode;
  /** URL this drawer represents — used for the "copy permalink" button. */
  shareUrl?: string;
  /** Optional one-line hook used as tweet/share text. */
  shareText?: string;
  /** Where the close button navigates when drawer was opened via in-app link. */
  backHref?: string;
  /** Sticky footer — usually a set of export/action buttons. */
  footer?: ReactNode;
  /** Short label for this entity (used by the next drawer's breadcrumb). */
  breadcrumbLabel?: string;
  children: ReactNode;
};

export default function DetailDrawer({
  kicker,
  title,
  shareUrl,
  shareText,
  backHref,
  footer,
  breadcrumbLabel,
  children,
}: Props) {
  const t = useT();
  const router = useRouter();
  const track = useTrack();
  const [copied, setCopied] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [previous, setPrevious] = useState<DrawerReferrer | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const openedAtRef = useRef<number>(Date.now());
  const entityType = (() => {
    if (!shareUrl) return "unknown";
    const seg = shareUrl.split("/").filter(Boolean)[1];
    return seg || "unknown";
  })();

  // Scroll lock that actually preserves the user's scroll position. Plain
  // `overflow: hidden` on body loses scrollY when the page behind reflows
  // (especially across drawer↔drawer transitions). The `position: fixed`
  // + `top: -scrollY` trick keeps the visible frame stable and restores
  // scroll on close.
  useEffect(() => {
    const y = window.scrollY;
    const body = document.body;
    const prev = {
      position: body.style.position,
      top: body.style.top,
      left: body.style.left,
      right: body.style.right,
      width: body.style.width,
      overflow: body.style.overflow,
    };
    body.style.position = "fixed";
    body.style.top = `-${y}px`;
    body.style.left = "0";
    body.style.right = "0";
    body.style.width = "100%";
    body.style.overflow = "hidden";
    return () => {
      body.style.position = prev.position;
      body.style.top = prev.top;
      body.style.left = prev.left;
      body.style.right = prev.right;
      body.style.width = prev.width;
      body.style.overflow = prev.overflow;
      window.scrollTo(0, y);
    };
  }, []);

  // Track the drawer stack across same-tab navigations. If we arrive on this
  // drawer from another one, remember the previous so we can render a back
  // pill. On mount, peek; on unmount (when user keeps navigating), push self.
  useEffect(() => {
    if (!shareUrl) return;
    const stack = readStack();
    const top = stack[stack.length - 1];
    if (top && top.url !== shareUrl) {
      setPrevious(top);
    }
    const selfEntry: DrawerReferrer = {
      url: shareUrl,
      label: breadcrumbLabel || (typeof title === "string" ? title : ""),
    };
    const filtered = stack.filter((e) => e.url !== shareUrl);
    writeStack([...filtered, selfEntry]);
    openedAtRef.current = Date.now();
    track("drawer_open", {
      entity_type: entityType,
      url: shareUrl,
      has_parent: Boolean(top && top.url !== shareUrl),
      parent_url: top?.url || null,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shareUrl]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (menuOpen) setMenuOpen(false);
        else close("esc");
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [menuOpen]);

  useEffect(() => {
    if (!menuOpen) return;
    const onDown = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [menuOpen]);

  const close = (method: "x" | "backdrop" | "esc" = "x") => {
    track("drawer_close", {
      entity_type: entityType,
      url: shareUrl || null,
      method,
      dwell_ms: Date.now() - openedAtRef.current,
    });
    if (previous) {
      const stack = readStack().slice(0, -1);
      writeStack(stack);
      router.back();
      return;
    }
    writeStack([]);
    if (typeof window !== "undefined" && window.history.length > 1) {
      router.back();
    } else if (backHref) {
      router.replace(backHref);
    }
  };

  const goBackToPrevious = () => {
    if (!previous) return;
    track("drawer_back", {
      from_type: entityType,
      from_url: shareUrl || null,
      to_url: previous.url,
    });
    const stack = readStack().slice(0, -1);
    writeStack(stack);
    router.back();
  };

  const absoluteUrl = () => {
    if (!shareUrl) return "";
    return shareUrl.startsWith("http")
      ? shareUrl
      : `${window.location.origin}${shareUrl}`;
  };

  const shareBody = () => {
    const url = absoluteUrl();
    const text = shareText || (typeof title === "string" ? title : "");
    return { url, text };
  };

  const onShareClick = async () => {
    const { url, text } = shareBody();
    if (typeof navigator !== "undefined" && "share" in navigator) {
      try {
        await navigator.share({ title: typeof title === "string" ? title : undefined, text, url });
        track("share_click", { method: "native", entity_type: entityType, url });
        return;
      } catch {
        /* user cancelled */
      }
    }
    setMenuOpen((v) => !v);
  };

  const copyLink = async () => {
    const { url } = shareBody();
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
      setMenuOpen(false);
      track("share_click", { method: "copy", entity_type: entityType, url });
    } catch {
      /* clipboard blocked */
    }
  };

  const shareOn = (where: "twitter" | "linkedin" | "mail") => {
    const { url, text } = shareBody();
    const enc = encodeURIComponent;
    const href =
      where === "twitter"
        ? `https://twitter.com/intent/tweet?text=${enc(text)}&url=${enc(url)}`
        : where === "linkedin"
          ? `https://www.linkedin.com/sharing/share-offsite/?url=${enc(url)}`
          : `mailto:?subject=${enc(text)}&body=${enc(text + "\n\n" + url)}`;
    track("share_click", { method: where, entity_type: entityType, url });
    window.open(href, "_blank", "noopener,noreferrer");
    setMenuOpen(false);
  };

  return (
    <>
      <div
        className="fx-drawer-backdrop"
        aria-hidden="true"
        onClick={() => close("backdrop")}
      />
      <aside
        className="fx-drawer"
        role="dialog"
        aria-modal="true"
        aria-label={typeof title === "string" ? title : undefined}
      >
        {previous && (
          <div className="fx-drawer-crumb">
            <button
              type="button"
              className="fx-drawer-crumb-btn"
              onClick={goBackToPrevious}
              aria-label={`Revenir à ${previous.label}`}
            >
              ← Retour · <span>{previous.label}</span>
            </button>
          </div>
        )}
        <header className="fx-drawer-head">
          <div className="fx-drawer-head-left">
            {kicker && <div className="fx-drawer-kicker">{kicker}</div>}
            <h2 className="fx-drawer-title">{title}</h2>
          </div>
          <div className="fx-drawer-head-actions" ref={menuRef}>
            {shareUrl && (
              <div style={{ position: "relative" }}>
                <button
                  type="button"
                  className="fx-drawer-iconbtn"
                  onClick={onShareClick}
                  aria-label={t("fx.drawer.share_aria")}
                  aria-expanded={menuOpen}
                >
                  {copied ? t("fx.drawer.copied") : t("fx.drawer.share")}
                </button>
                {menuOpen && (
                  <div className="fx-share-menu" role="menu">
                    <button type="button" role="menuitem" onClick={copyLink}>
                      <span>⧉</span>{t("fx.drawer.copy_link")}
                    </button>
                    <button type="button" role="menuitem" onClick={() => shareOn("twitter")}>
                      <span>𝕏</span>{t("fx.drawer.share_twitter")}
                    </button>
                    <button type="button" role="menuitem" onClick={() => shareOn("linkedin")}>
                      <span>in</span>{t("fx.drawer.share_linkedin")}
                    </button>
                    <button type="button" role="menuitem" onClick={() => shareOn("mail")}>
                      <span>✉</span>{t("fx.drawer.share_email")}
                    </button>
                  </div>
                )}
              </div>
            )}
            <button
              type="button"
              className="fx-drawer-close"
              onClick={() => close("x")}
              aria-label={t("fx.drawer.close_aria")}
              title={t("fx.drawer.close_title")}
            >
              ×
            </button>
          </div>
        </header>
        <div className="fx-drawer-body">{children}</div>
        {footer && <div className="fx-drawer-foot">{footer}</div>}
      </aside>
    </>
  );
}
