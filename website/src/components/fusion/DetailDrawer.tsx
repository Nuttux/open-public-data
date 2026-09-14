"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { useT } from "@/lib/localeContext";
import { useTrack } from "@/lib/analyticsContext";
import { pushDrawer, popDrawer, lockBodyScroll, unlockBodyScroll, getLockedY, setLockedY } from "@/lib/drawerState";

type DrawerReferrer = { url: string; label: string };

const STORAGE_KEY = "fx-drawer-stack";
/** Where the reader was on the page behind the first drawer of a chain. */
const ORIGIN_Y_KEY = "fx-drawer-origin-y";

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

/**
 * Vide la pile de drawers. À appeler quand on atterrit sur une PAGE DE LISTE :
 * on n'est alors dans aucune chaîne de drill-down, donc aucune pastille
 * « ← Retour » ne doit s'afficher au prochain drawer ouvert. Sans ça, la pile
 * survivait à une sortie de drawer non déclenchée par le bouton (retour
 * navigateur…) et la fiche suivante affichait « ← Retour · <fiche périmée> ».
 */
export function clearDrawerStack() {
  try {
    sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    /* storage disabled */
  }
}

/**
 * The section a French city fiche belongs to, read off its URL. It opens the
 * line above the title as a link to the section page (« Subventions ›
 * Association · Culture »). It replaced a « ↗ Subventions » button: ↗ says
 * « leaves the site » everywhere on the web, and the button sat beside
 * « ↗ Partager », which does something else entirely. `path` is set when the
 * section page's URL differs from the fiche's segment: a place lives at
 * /lieu/{slug}, the places page at /lieux.
 */
const SECTIONS: Record<string, { key: string; path?: string }> = {
  investissements: { key: "fx.drawer.hub.invest" },
  subventions: { key: "fx.drawer.hub.subv" },
  marches: { key: "fx.drawer.hub.marches" },
  dette: { key: "fx.drawer.hub.dette" },
  logement: { key: "fx.drawer.hub.logement" },
  budget: { key: "fx.drawer.hub.budget" },
  lieu: { key: "fx.drawer.hub.lieux", path: "lieux" },
};

function sectionOf(shareUrl?: string): { href: string; key: string } | null {
  const m = shareUrl?.match(/^(\/fr\/city\/[^/]+)\/([^/]+)\//);
  if (!m) return null;
  const s = SECTIONS[m[2]];
  return s ? { href: `${m[1]}/${s.path ?? m[2]}`, key: s.key } : null;
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
  /**
   * Parent explicite dans une hiérarchie de drill-down (ex : fiche level 3
   * → sa fiche level 2). Quand fourni, la pastille "← Retour" navigue vers
   * cette URL au lieu de rejouer l'historique via la pile sessionStorage —
   * l'historique et la pile divergent dès qu'on remonte via le breadcrumb
   * (le back "redescendait" alors vers la fiche qu'on venait de quitter).
   */
  parentLink?: {
    url: string;
    label: string;
    /** true → navigation dure (le parent est la page shell : une soft-nav
     *  laisserait le slot @drawer rendre ce drawer périmé). */
    hard?: boolean;
  };
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
  parentLink,
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
  const section = sectionOf(shareUrl);
  const openedAtRef = useRef<number>(Date.now());
  const entityType = (() => {
    if (!shareUrl) return "unknown";
    const seg = shareUrl.split("/").filter(Boolean)[1];
    return seg || "unknown";
  })();

  // Flag "a drawer is open" so the top nav stops highlighting the section the
  // entity URL happens to fall under (the drawer is a modal, not a page).
  useEffect(() => {
    pushDrawer();
    return () => popDrawer();
  }, []);

  // Scroll lock — refcounted in lib/drawerState so a drawer→drawer navigation
  // keeps the ORIGINAL page offset. Locking per-instance used to lose it: the
  // incoming drawer read window.scrollY while the body was still fixed (0).
  useEffect(() => {
    lockBodyScroll();
    return () => unlockBodyScroll();
  }, []);

  // Track the drawer stack across same-tab navigations. If we arrive on this
  // drawer from another one, remember the previous so we can render a back
  // pill. On mount, peek; on unmount (when user keeps navigating), push self.
  useEffect(() => {
    if (!shareUrl) return;
    // Drill-down hiérarchique : le parent est connu statiquement, la pile
    // sessionStorage ne sert à rien (et se désynchronise de l'historique
    // quand on remonte). On ne lit ni n'écrit la pile dans ce mode.
    if (parentLink) {
      openedAtRef.current = Date.now();
      track("drawer_open", {
        entity_type: entityType,
        url: shareUrl,
        has_parent: true,
        parent_url: parentLink.url,
      });
      return;
    }
    const stack = readStack();
    const top = stack[stack.length - 1];
    // First drawer of a chain: remember the page offset the lock captured, so
    // closing the whole chain can put the reader back where they were.
    if (!top) {
      try { sessionStorage.setItem(ORIGIN_Y_KEY, String(getLockedY())); } catch { /* storage disabled */ }
    }
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

  // Section hub derived from the drawer URL — the close target for a
  // drill-down chain that has no explicit backHref (the Paris fiches).
  // Covers /fr|us/city/{city}/{section}/… and /fr|us/national/{section}/….
  const hubFromShareUrl = () => {
    if (!shareUrl) return null;
    if (section) return section.href;
    const m = shareUrl.match(/^(\/(?:fr|us)\/(?:city\/[^/]+|national)\/[^/]+)\//);
    return m ? m[1] : null;
  };

  const close = (method: "x" | "backdrop" | "esc" = "x") => {
    track("drawer_close", {
      entity_type: entityType,
      url: shareUrl || null,
      method,
      dwell_ms: Date.now() - openedAtRef.current,
    });

    // A fiche reached by drilling down from another fiche must CLOSE fully,
    // not merely reveal its parent. router.back() steps back a single history
    // entry, so on a 2+ deep chain it lands on the parent drawer — which reads
    // as "the X went back but didn't close". The "← Retour" crumb is what steps
    // back one level; the × always dismisses the whole chain.
    const inChain = Boolean(previous || parentLink);
    const stackDepth = readStack().length;
    writeStack([]);

    if (inChain && !parentLink && typeof window !== "undefined" && stackDepth > 1) {
      // Drawer opened from another drawer: step back over every drawer entry at
      // once. That lands on the page the reader was browsing, scrolled where
      // they left it. Until 2026-09-13 this hard-navigated to the section page,
      // so closing a drawer threw the reader off the page they were reading.
      let originY = NaN;
      try { originY = Number(sessionStorage.getItem(ORIGIN_Y_KEY)); } catch { /* storage disabled */ }
      if (Number.isFinite(originY)) {
        setLockedY(originY);
        // The page behind re-renders after the back navigation lands, and the
        // scroll lock of the intermediate drawers can leave a stale offset:
        // restore the original one a few times while the page settles.
        // Right after the back navigation the page behind is still short (its
        // content re-renders), so a scrollTo lands clamped: measured 130 px for
        // an origin at 700. Re-apply for two seconds, only once the page is tall
        // enough, and stop as soon as the reader scrolls themselves.
        window.addEventListener("popstate", () => {
          const started = Date.now();
          let stopped = false;
          const stop = () => { stopped = true; };
          window.addEventListener("wheel", stop, { once: true, passive: true });
          window.addEventListener("touchstart", stop, { once: true, passive: true });
          window.addEventListener("keydown", stop, { once: true });
          const tick = () => {
            if (stopped) return;
            const room = document.documentElement.scrollHeight - window.innerHeight;
            if (room >= originY - 2 && Math.abs(window.scrollY - originY) > 2) window.scrollTo(0, originY);
            if (Date.now() - started < 2000) window.setTimeout(tick, 100);
          };
          tick();
        }, { once: true });
      }
      window.history.go(-Math.min(stackDepth, Math.max(1, window.history.length - 1)));
      return;
    }

    if (inChain) {
      // Close every open drawer at once. We can't do this with the soft router:
      // router.back() only pops ONE history entry (revealing the parent drawer,
      // not closing), and router.push/replace to another URL leaves Next's
      // @drawer parallel-route slot rendering the stale drawer (soft nav never
      // re-resolves a sibling slot to its default). A hard navigation to a real
      // (non-intercepted) page is the one thing that reliably tears the whole
      // drawer stack down — the same reason parentLink.hard exists. Prefer the
      // explicit backHref (SF / Marseille / national); else the section hub.
      const target = backHref || hubFromShareUrl();
      if (target && typeof window !== "undefined") {
        window.location.assign(target);
        return;
      }
    }

    // Top-level drawer: a single step back returns to the exact page the
    // drawer was launched from.
    if (typeof window !== "undefined" && window.history.length > 1) {
      router.back();
    } else if (backHref) {
      router.replace(backHref);
    }
  };

  const goBackToPrevious = () => {
    if (parentLink) {
      track("drawer_back", {
        from_type: entityType,
        from_url: shareUrl || null,
        to_url: parentLink.url,
      });
      if (parentLink.hard) {
        window.location.assign(parentLink.url);
      } else {
        router.push(parentLink.url, { scroll: false });
      }
      return;
    }
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
        {(parentLink || previous) && (
          <div className="fx-drawer-crumb">
            <button
              type="button"
              className="fx-drawer-crumb-btn"
              onClick={goBackToPrevious}
              aria-label={t("fx.drawer.crumb.back_aria").replace(
                "{label}",
                (parentLink ?? previous)!.label,
              )}
            >
              {t("fx.drawer.crumb.back")} · <span>{(parentLink ?? previous)!.label}</span>
            </button>
          </div>
        )}
        <header className="fx-drawer-head">
          <div className="fx-drawer-head-left">
            {(section || kicker) && (
              <div className="fx-drawer-kicker">
                {section && (
                  <>
                    <a className="fx-drawer-section" href={section.href}>{t(section.key)}</a>
                    {kicker ? <span className="fx-drawer-kicker-sep" aria-hidden="true"> › </span> : null}
                  </>
                )}
                {kicker}
              </div>
            )}
            <h2 className="fx-drawer-title">{title}</h2>
          </div>
          <div className="fx-drawer-head-actions" ref={menuRef}>
            {shareUrl && (
              <div style={{ position: "relative" }}>
                <button
                  type="button"
                  className="fx-drawer-iconbtn fx-drawer-share"
                  onClick={onShareClick}
                  aria-label={t("fx.drawer.share_aria")}
                  aria-expanded={menuOpen}
                >
                  {copied ? t("fx.drawer.copied") : (
                    <>
                      <svg className="fx-drawer-share-icon" viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <path d="M8 10V2.5M5 5.5l3-3 3 3" />
                        <path d="M3.5 8v5.5h9V8" />
                      </svg>
                      <span className="fx-drawer-share-label">{t("fx.drawer.share")}</span>
                    </>
                  )}
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
